import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function verifyMetaSignature(
  req: Request,
  body: string
): Promise<boolean> {
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    console.warn("META_APP_SECRET not set, skipping signature verification");
    return true;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${hex}`;

  return signature === expected;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function stableId(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

function fileExtFromContentType(
  contentType: string | null | undefined
): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  return "bin";
}

function safeStorageId(id: string): string {
  return (id || "msg").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cleanUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  // Meta URLs sometimes include stray newlines/spaces when logged/truncated
  const cleaned = url.replace(/\s+/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

async function uploadToStoreAssets(
  supabase: any,
  filePath: string,
  bytes: Uint8Array,
  contentType: string | null
): Promise<string | null> {
  // Supabase Storage upload is most reliable with Blob in Deno
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: contentType || "application/octet-stream",
  });

  const { error: uploadErr } = await supabase.storage
    .from("store-assets")
    .upload(filePath, blob, {
      upsert: true,
      contentType: contentType || undefined,
    });

  if (uploadErr) {
    console.error("Storage upload failed:", uploadErr);
    return null;
  }

  const { data } = supabase.storage.from("store-assets").getPublicUrl(filePath);
  return data?.publicUrl || null;
}

async function downloadBytes(
  url: string,
  headers?: Record<string, string>
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn("Failed to download media:", res.status, await res.text());
      return null;
    }
    const ab = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      contentType: res.headers.get("content-type"),
    };
  } catch (e) {
    console.warn("Media download error:", e);
    return null;
  }
}

async function fetchWhatsAppMediaUrl(
  mediaId: string,
  pageAccessToken: string
): Promise<{ url: string; mime_type?: string } | null> {
  try {
    const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      mediaId
    )}`;
    const res = await fetch(metaUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });
    if (!res.ok) {
      console.warn(
        "WhatsApp media lookup failed:",
        res.status,
        await res.text()
      );
      return null;
    }
    const data = await res.json();
    if (!data?.url) return null;
    return { url: data.url, mime_type: data.mime_type };
  } catch (e) {
    console.warn("WhatsApp media lookup error:", e);
    return null;
  }
}

// Auto-detect platform from Meta webhook payload
function detectPlatform(body: any, queryPlatform: string | null): string {
  // Always prefer the payload's object field — it is authoritative from Meta
  const obj = body?.object;
  if (obj === "page") return "facebook";
  if (obj === "instagram") return "instagram";
  if (obj === "whatsapp_business_account") return "whatsapp";

  // Fallback: check entry structure
  if (body?.entry?.[0]?.messaging) return "facebook";
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages) return "whatsapp";

  // Last resort: use query param if provided
  if (queryPlatform) return queryPlatform;

  return "facebook"; // default
}

// Send a Messenger/IG "typing_on" or "typing_off" sender_action so the customer
// sees the human-like typing bubble before our reply lands. Best-effort only.
async function sendTypingIndicator(
  platform: string,
  recipientId: string,
  pageAccessToken: string,
  action: "typing_on" | "typing_off" | "mark_seen" = "typing_on"
) {
  if (platform !== "facebook" && platform !== "instagram") return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/me/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: action,
      }),
    });
  } catch (err) {
    console.warn(`[${platform}] sender_action ${action} failed:`, err);
  }
}

// Split a long AI reply into 2-3 shorter chunks so it lands like a real
// person typing several short messages instead of one wall of text.
// Splits on paragraph breaks first, then sentences, never breaking words.
function splitReplyIntoChunks(text: string, maxChunks = 3): string[] {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  // Short replies stay as one message.
  if (trimmed.length <= 180) return [trimmed];

  // Prefer paragraph splits.
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  let parts: string[] = paragraphs.length > 1 ? paragraphs : [];
  if (parts.length === 0) {
    // Fall back to sentence-based grouping (~150 chars per chunk).
    const sentences = trimmed.match(/[^.!?\n]+[.!?]?(\s+|$)/g) || [trimmed];
    const target = Math.max(120, Math.ceil(trimmed.length / maxChunks));
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > target && buf.length > 0) {
        parts.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
  }

  // Cap at maxChunks by merging the tail.
  if (parts.length > maxChunks) {
    const head = parts.slice(0, maxChunks - 1);
    const tail = parts.slice(maxChunks - 1).join(" ");
    parts = [...head, tail];
  }
  return parts.filter((p) => p && p.trim().length > 0);
}

async function sendMetaReply(
  platform: string,
  recipientId: string,
  text: string,
  pageAccessToken: string,
  pageId?: string
) {
  if (platform === "facebook" || platform === "instagram") {
    const url = `https://graph.facebook.com/v21.0/me/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[${platform}] Send API error:`, JSON.stringify(data));
    } else {
      console.log(`[${platform}] Reply sent to ${recipientId}`);
    }
    return data;
  } else if (platform === "whatsapp") {
    const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientId,
        type: "text",
        text: { body: text },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] Send API error:`, JSON.stringify(data));
    } else {
      console.log(`[whatsapp] Reply sent to ${recipientId}`);
    }
    return data;
  }
}

async function sendMetaImage(
  platform: string,
  recipientId: string,
  imageUrl: string,
  caption: string,
  pageAccessToken: string,
  pageId?: string
) {
  if (platform === "facebook" || platform === "instagram") {
    const url = `https://graph.facebook.com/v21.0/me/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true },
          },
        },
        messaging_type: "RESPONSE",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[${platform}] Image send error:`, JSON.stringify(data));
    } else {
      console.log(`[${platform}] Image sent to ${recipientId}: ${imageUrl}`);
    }
    return data;
  } else if (platform === "whatsapp") {
    const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientId,
        type: "image",
        image: { link: imageUrl, caption },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] Image send error:`, JSON.stringify(data));
    } else {
      console.log(`[whatsapp] Image sent to ${recipientId}: ${imageUrl}`);
    }
    return data;
  }
}

// ─── Phase 1 reliability helpers ───────────────────────────────────────────

/**
 * Detect Arabic vs English from a piece of text.
 * Returns "ar" if any Arabic letter is present, otherwise "en".
 * Falls back to undefined for empty input.
 */
function detectLanguage(text: string | null | undefined): "ar" | "en" | undefined {
  if (!text || typeof text !== "string") return undefined;
  // Strip image URLs / file extensions so they don't bias detection
  const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
  if (!stripped) return undefined;
  // U+0600–U+06FF is the Arabic block; U+0750–U+077F supplementary
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(stripped)) return "ar";
  // Require at least one A–Z letter to call something English
  if (/[A-Za-z]/.test(stripped)) return "en";
  return undefined;
}

/**
 * Determine if the store is currently open based on `working_hours` JSON.
 * Expected shape (best-effort tolerant):
 *   { monday: { open: "09:00", close: "18:00", closed?: false }, ... }
 * Returns { isOpen, todayHours } — when no schedule is set we assume open
 * so we never block legitimate orders.
 */
function isStoreOpenNow(workingHours: any): { isOpen: boolean; hasSchedule: boolean } {
  if (!workingHours || typeof workingHours !== "object") {
    return { isOpen: true, hasSchedule: false };
  }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const now = new Date();
  const dayKey = days[now.getDay()];
  const today = workingHours[dayKey] || workingHours[dayKey?.toLowerCase()];
  if (!today || today.closed === true) {
    // If we have a schedule but today isn't listed → closed
    const hasAnyDay = days.some((d) => workingHours[d]);
    if (hasAnyDay) return { isOpen: false, hasSchedule: true };
    return { isOpen: true, hasSchedule: false };
  }
  const open = String(today.open || today.from || "").trim();
  const close = String(today.close || today.to || "").trim();
  if (!open || !close) return { isOpen: true, hasSchedule: false };
  const [oh, om] = open.split(":").map((n) => parseInt(n, 10));
  const [ch, cm] = close.split(":").map((n) => parseInt(n, 10));
  if (isNaN(oh) || isNaN(ch)) return { isOpen: true, hasSchedule: false };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = oh * 60 + (om || 0);
  const closeMin = ch * 60 + (cm || 0);
  // Handle overnight hours (e.g. 18:00 → 02:00)
  const isOpen = closeMin > openMin
    ? nowMin >= openMin && nowMin < closeMin
    : nowMin >= openMin || nowMin < closeMin;
  return { isOpen, hasSchedule: true };
}

/**
 * Phase 2 — lightweight emotion / abuse detector.
 * Returns one of: neutral | happy | frustrated | abusive | urgent.
 * Pure regex/keyword based so it's free, fast, and works in AR + EN.
 */
function detectEmotion(text: string | null | undefined): "neutral" | "happy" | "frustrated" | "abusive" | "urgent" {
  if (!text || typeof text !== "string") return "neutral";
  const t = text.toLowerCase();

  // Abusive — profanity / insults (EN + AR transliteration + common AR insults)
  const abusiveEn = /\b(fuck|fucking|shit|asshole|bitch|stupid|idiot|moron|dumb|trash|garbage|liar|scam|scammer|fraud|useless)\b/i;
  const abusiveAr = /(احمق|غبي|غبية|كذاب|نصاب|حرامي|قذر|تافه|زباله|كلب|حمار|خرا|تبا|اللعنة|لعنة)/;
  if (abusiveEn.test(t) || abusiveAr.test(text)) return "abusive";

  // Urgent — explicit time pressure
  const urgentEn = /\b(urgent|asap|right now|immediately|hurry|need it today|emergency|quickly please)\b/i;
  const urgentAr = /(عاجل|مستعجل|الحين|بسرعة|ضروري|اليوم لازم|طارئ)/;
  if (urgentEn.test(t) || urgentAr.test(text)) return "urgent";

  // Frustrated — complaints, repeated punctuation, "still waiting"
  const frustratedEn = /(why (is|isn'?t|are)|still waiting|nobody|no one (is|has)|already (asked|told|paid)|this is ridiculous|i('| a)m angry|frustrated|disappointed|terrible|awful|worst|cancel my order|refund|complain|complaint|fed up)/i;
  const frustratedAr = /(ليش|لماذا|الى متى|للحين|ما رد|ما حد|مللت|زهقت|سيء|سيئ|اسوأ|الغي|الغاء|استرداد|شكوى|اشتكي|تعبت)/;
  const exclamationStorm = /[!؟?]{3,}/.test(text) || /[A-Z]{6,}/.test(text);
  if (frustratedEn.test(t) || frustratedAr.test(text) || exclamationStorm) return "frustrated";

  // Happy
  const happyEn = /\b(thanks?|thank you|awesome|great|perfect|love it|amazing|excellent|wonderful|appreciate|🙏|😊|❤️|🥰|👍)\b/i;
  const happyAr = /(شكرا|شكراً|ممتاز|رائع|جميل|تسلم|الله يعطيك العافية|كفو|احسنت|احب)/;
  if (happyEn.test(t) || happyAr.test(text)) return "happy";

  return "neutral";
}

/**
 * Phase 2 — Build a handoff context pack for the human owner.
 * Used when AI escalates (abuse, repeated frustration, explicit human request).
 * Returns a short markdown summary of what happened and what's outstanding.
 */
function buildHandoffSummary(args: {
  customerName: string;
  platform: string;
  history: any[];
  existingOrders: any[];
  reason: string;
  detectedLang?: string;
}): string {
  const { customerName, platform, history, existingOrders, reason, detectedLang } = args;
  const lastMsgs = (history || []).slice(-6).map((m: any) => {
    const who = m.sender === "customer" ? "👤" : m.sender === "ai" ? "🤖" : "🧑‍💼";
    const text = String(m.content || "").slice(0, 140).replace(/\s+/g, " ");
    return `${who} ${text}`;
  }).join("\n");
  const ordersBlock = (existingOrders || []).length
    ? (existingOrders || []).slice(0, 3).map((o: any) =>
        `• ${o.order_number} — ${o.status} — ${o.total} (${(o.items || []).length} item(s))`
      ).join("\n")
    : "_No orders for this conversation._";
  const ar = detectedLang === "ar";
  return [
    ar ? `**يحتاج تدخل بشري — ${customerName || "Customer"}**` : `**Needs human attention — ${customerName || "Customer"}**`,
    ar ? `السبب: ${reason}` : `Reason: ${reason}`,
    `Platform: ${platform}`,
    "",
    ar ? "**آخر الرسائل:**" : "**Recent messages:**",
    lastMsgs || "_(no recent messages)_",
    "",
    ar ? "**الطلبات:**" : "**Orders:**",
    ordersBlock,
  ].join("\n");
}

/**
 * Phase 2 — Compute conversation quality score (0-100).
 * Lazy implementation: weighted blend of resolution, response speed,
 * sentiment shift, order conversion, escalation count.
 */
function computeQualityScore(args: {
  history: any[];
  emotionStart: string;
  emotionEnd: string;
  ordersCount: number;
  escalated: boolean;
  avgReplyMs: number;
}): { score: number; breakdown: Record<string, number> } {
  const { history, emotionStart, emotionEnd, ordersCount, escalated, avgReplyMs } = args;
  // Resolution: did the conversation reach a natural close (last sender = ai or owner, no recent customer follow-up)
  const last = history?.[history.length - 1];
  const resolution = last && last.sender !== "customer" ? 100 : 60;
  // Speed: under 30s is great, over 5min is poor
  const speed = avgReplyMs <= 30_000 ? 100 : avgReplyMs <= 120_000 ? 80 : avgReplyMs <= 300_000 ? 60 : 30;
  // Sentiment shift
  const order = ["abusive", "frustrated", "urgent", "neutral", "happy"];
  const startIdx = Math.max(0, order.indexOf(emotionStart || "neutral"));
  const endIdx = Math.max(0, order.indexOf(emotionEnd || "neutral"));
  const shift = endIdx - startIdx; // positive = improved
  const sentiment = Math.max(0, Math.min(100, 60 + shift * 15));
  // Conversion
  const conversion = ordersCount > 0 ? 100 : 50;
  // Escalation penalty
  const escalation = escalated ? 40 : 100;

  const score = Math.round(
    resolution * 0.25 +
    speed * 0.20 +
    sentiment * 0.20 +
    conversion * 0.20 +
    escalation * 0.15
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { resolution, speed, sentiment, conversion, escalation },
  };
}

/**
 * Wrap a Meta Send call in retry with exponential backoff (2s, 6s, 18s).
 * Returns { ok, data, attempts, lastError }.
 * Logs a `meta_send_failures` row when all retries fail.
 */
async function sendMetaReplyWithRetry(
  supabase: any,
  storeId: string,
  conversationId: string | null,
  platform: string,
  recipientId: string,
  text: string,
  pageAccessToken: string,
  pageId: string,
  retryEnabled: boolean
): Promise<{ ok: boolean; data: any; attempts: number; lastError?: string }> {
  const maxAttempts = retryEnabled ? 3 : 1;
  const backoffsMs = [2000, 6000, 18000];
  let lastError: string | undefined;
  let lastData: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await sendMetaReply(platform, recipientId, text, pageAccessToken, pageId);
      lastData = data;
      // sendMetaReply returns the parsed JSON; Meta errors come back with `error`
      if (data && !data.error && (data.message_id || data.messages?.[0]?.id)) {
        if (attempt > 1) {
          console.log(`[${platform}] Meta send succeeded on retry attempt ${attempt}`);
        }
        return { ok: true, data, attempts: attempt };
      }
      lastError = data?.error?.message || data?.error?.error_user_msg || JSON.stringify(data?.error || data);
      console.warn(`[${platform}] Meta send attempt ${attempt}/${maxAttempts} failed:`, lastError);
    } catch (e: any) {
      lastError = e?.message || String(e);
      console.warn(`[${platform}] Meta send attempt ${attempt}/${maxAttempts} threw:`, lastError);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, backoffsMs[attempt - 1] || 18000));
    }
  }

  // All attempts failed → log + flag conversation
  try {
    await supabase.from("meta_send_failures").insert({
      store_id: storeId,
      conversation_id: conversationId,
      platform,
      recipient_id: recipientId,
      attempt_count: maxAttempts,
      last_error: (lastError || "unknown").slice(0, 1000),
      payload_preview: (text || "").slice(0, 500),
    });
    if (conversationId) {
      await supabase
        .from("conversations")
        .update({
          delivery_status: "delivery_failed",
          delivery_attempts: maxAttempts,
          last_delivery_error: (lastError || "unknown").slice(0, 500),
        })
        .eq("id", conversationId);

      // Real-time alert for the store owner
      const { data: store } = await supabase
        .from("stores")
        .select("user_id, name")
        .eq("id", storeId)
        .single();
      if (store?.user_id) {
        await supabase.from("notifications").insert({
          user_id: store.user_id,
          type: "delivery_failure",
          title: `Reply failed to deliver`,
          description: `Could not send a reply on ${platform} after ${maxAttempts} attempts. Open the inbox to take over manually.`,
        });
      }
    }
  } catch (logErr) {
    console.error(`[${platform}] Failed to log send failure:`, logErr);
  }

  return { ok: false, data: lastData, attempts: maxAttempts, lastError };
}

/**
 * Check if a near-duplicate order was created very recently for this conversation.
 * "Near-duplicate" = same conversation_id, same set of (product name, qty),
 * created within `windowSeconds` ago, and not cancelled.
 */
async function findRecentDuplicateOrder(
  supabase: any,
  conversationId: string,
  items: any[],
  windowSeconds: number
): Promise<{ order_number: string; status: string; total: number } | null> {
  if (!conversationId || !Array.isArray(items) || items.length === 0) return null;
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data: recent } = await supabase
    .from("orders")
    .select("order_number, status, total, items, created_at")
    .eq("conversation_id", conversationId)
    .gte("created_at", sinceIso)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!recent?.length) return null;

  const sig = (arr: any[]) =>
    (arr || [])
      .map((i: any) => `${(i.product_name || i.name || "").toLowerCase().trim()}|${Number(i.quantity || 1)}`)
      .sort()
      .join("::");

  const incomingSig = sig(items);
  if (!incomingSig) return null;

  for (const o of recent) {
    if (sig(o.items || []) === incomingSig) {
      return { order_number: o.order_number, status: o.status, total: o.total };
    }
  }
  return null;
}

async function fetchMetaDisplayName(
  platform: string,
  senderId: string,
  pageAccessToken: string | null
): Promise<string | null> {
  if (!pageAccessToken) return null;
  if (!senderId) return null;

  console.log("fetchMetaDisplayName confirm deployed");

  // For Facebook/Instagram, we can often resolve the sender profile name via Graph API.
  // If this fails (permissions/token/etc), we fall back to a short placeholder.
  if (platform !== "facebook" && platform !== "instagram") return null;

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      senderId
    )}?fields=name`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data?.name || "").toString().trim();
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

const ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "create_order",
    description:
      "Create a new order when the customer has confirmed items and you have collected their full name, phone number, and delivery address (possibly across multiple messages). Parse quantities from natural language (e.g. 'I want 3 of X' means quantity=3, 'give me two Y' means quantity=2, if no quantity mentioned assume 1). Call this ONLY after all required info is collected.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's phone number" },
        address: { type: "string", description: "Customer's delivery address" },
        items: {
          type: "array",
          description:
            "List of ordered items. IMPORTANT: Always include product_id from search results for accurate stock tracking.",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description:
                  "The product UUID from search results. MUST be included for stock tracking.",
              },
              product_name: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: {
          type: "string",
          description: "Any special notes or requests from the customer",
        },
      },
      required: ["customer_name", "phone", "address", "items"],
    },
  },
};

const CANCEL_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "cancel_order",
    description:
      "Cancel an existing order when the customer explicitly requests to cancel. Use the order number if provided, otherwise look up the most recent pending order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number (e.g. ORD-00001). Optional — if not provided, the most recent pending order for this conversation will be cancelled.",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation if the customer provides one",
        },
      },
      required: [],
    },
  },
};

const UPDATE_ORDER_TOOL = {
  type: "function" as const,
  function: {
     name: "update_order",
     description:
       "Update an existing order. CRITICAL: Pass ONLY the fields the customer EXPLICITLY mentioned changing in their CURRENT message. Do NOT pass address unless the customer literally gave a new address in this turn. Do NOT pass phone unless they gave a new phone. Do NOT pass items unless they explicitly asked to change items/quantities. NEVER copy values from previous turns or from the existing order — only fields the user just changed. If the user is changing QUANTITY only, pass the full updated items array (with new quantity) and nothing else. If the user only wants to change one field, pass ONLY that field.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number to update (e.g. ORD-00001). If not provided, the most recent active order for this conversation will be updated.",
        },
        customer_name: {
          type: "string",
          description: "Updated customer name (only if changed)",
        },
        phone: {
          type: "string",
          description: "Updated phone number (only if changed)",
        },
        address: {
          type: "string",
          description: "Updated delivery address (only if changed)",
        },
        items: {
          type: "array",
          description:
            "Updated full list of items (replaces existing items). Only provide if items changed. Parse quantities from natural language.",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description:
                  "The product UUID from search results. MUST be included for stock tracking.",
              },
              product_name: { type: "string" },
              quantity: {
                type: "number",
                description:
                  "Quantity parsed from customer message. Default to 1 if not specified.",
              },
              price: { type: "number" },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: { type: "string", description: "Updated notes" },
      },
      required: [],
    },
  },
};

const CHECK_ORDER_STATUS_TOOL = {
  type: "function" as const,
  function: {
    name: "check_order_status",
    description:
      "Look up the current status and details of an order from the database. Use this whenever the customer asks about their order status, delivery progress, or order details. You can search by order number or get the most recent order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number to look up (e.g. ORD-00001). If not provided, returns the most recent order for this conversation.",
        },
      },
      required: [],
    },
  },
};

const SEND_PRODUCT_IMAGES_TOOL = {
  type: "function" as const,
  function: {
    name: "send_product_images",
    description:
      "Send product images to the customer. Use this when the customer asks to see a product, asks what it looks like, or when recommending/discussing products. Always send images alongside your text description.",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          description: "List of products to send images for",
          items: {
            type: "object",
            properties: {
              product_name: {
                type: "string",
                description: "Name of the product",
              },
              image_url: {
                type: "string",
                description: "The image URL from the product catalog",
              },
              caption: {
                type: "string",
                description:
                  "Short caption for the image (e.g. product name and price)",
              },
            },
            required: ["product_name", "image_url"],
          },
        },
      },
      required: ["products"],
    },
  },
};

const SEARCH_PRODUCTS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_products",
    description:
      "Search the product catalog by keyword, category, or price range. Use this whenever the customer asks about specific products, searches for something, or you need product details. Returns up to 10 matching products with full details including images and prices. ALWAYS use this tool before answering product-related questions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search keyword to match against product name or description (e.g. 'shoes', 'red dress', 'laptop')",
        },
        category: {
          type: "string",
          description:
            "Filter by product category (use exact category names from the catalog summary)",
        },
        min_price: { type: "number", description: "Minimum price filter" },
        max_price: { type: "number", description: "Maximum price filter" },
      },
      required: [],
    },
  },
};

const LIST_CATEGORIES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_categories",
    description:
      "List all product categories with their product counts and price ranges. Use this when the customer asks a vague question like 'what do you sell?', 'show me your products', or 'what categories do you have?'. This gives an overview without loading all products.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

async function executeCreateOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string,
  args: any
): Promise<string> {
  const total = (args.items || []).reduce(
    (sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

  // ─── Fix 5: Duplicate-order prevention ───
  // Look up store's settings + working hours in one go.
  const [aiSettingsRes, storeRes] = await Promise.all([
    supabase
      .from("ai_settings")
      .select("duplicate_order_guard_enabled, duplicate_order_window_seconds, out_of_hours_enabled")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabase
      .from("stores")
      .select("user_id, name, working_hours")
      .eq("id", storeId)
      .single(),
  ]);

  const dupGuardEnabled = aiSettingsRes?.data?.duplicate_order_guard_enabled !== false;
  const dupWindow = Math.max(30, Number(aiSettingsRes?.data?.duplicate_order_window_seconds) || 300);

  if (dupGuardEnabled) {
    const dup = await findRecentDuplicateOrder(supabase, conversationId, args.items || [], dupWindow);
    if (dup) {
      console.log(`Duplicate order skipped — existing ${dup.order_number} (${dup.status})`);
      return JSON.stringify({
        success: true,
        order_number: dup.order_number,
        total: dup.total,
        items_count: (args.items || []).length,
        duplicate_of: dup.order_number,
        message: `An identical order was just created (${dup.order_number}) — confirming that one instead of creating a duplicate.`,
      });
    }
  }

  // ─── Fix 9: Out-of-hours flagging ───
  const ooEnabled = aiSettingsRes?.data?.out_of_hours_enabled !== false;
  const { isOpen, hasSchedule } = isStoreOpenNow(storeRes?.data?.working_hours);
  const outsideHours = ooEnabled && hasSchedule && !isOpen;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      store_id: storeId,
      conversation_id: conversationId,
      customer_name: args.customer_name,
      phone: args.phone || "",
      address: args.address || "",
      items: args.items || [],
      total,
      notes: args.notes || "",
      platform,
      status: "pending",
      out_of_hours: outsideHours,
      pending_confirmation: outsideHours,
    })
    .select("order_number")
    .single();

  if (error) {
    console.error("Order creation error:", error);
    return JSON.stringify({ success: false, error: error.message });
  }

  // Update conversation with customer details and status
  await supabase
    .from("conversations")
    .update({
      customer_name: args.customer_name,
      customer_phone: args.phone || null,
      customer_address: args.address || null,
      status: "pending_order",
    })
    .eq("id", conversationId);

  const store = storeRes?.data;
  if (store?.user_id) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `New order ${order.order_number}${outsideHours ? " (after-hours)" : ""}`,
      description: outsideHours
        ? `${args.customer_name} placed an after-hours order — needs your confirmation. Total: ${total}`
        : `${args.customer_name} placed an order for ${args.items.length} item(s) — Total: ${total}`,
      type: "order",
    });
  }

  console.log(`Order created: ${order.order_number}, total: ${total}, outside_hours: ${outsideHours}`);
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    total,
    items_count: args.items.length,
    pending_confirmation: outsideHours,
  });
}

async function executeCancelOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Cancel order lookup error:", fetchErr);
    return JSON.stringify({
      success: false,
      error: "No active order found to cancel.",
    });
  }

  const order = orders[0];
  if (order.status === "cancelled") {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is already cancelled.`,
    });
  }
  if (order.status === "delivered" || order.status === "shipped") {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} has already been ${order.status} and cannot be cancelled.`,
    });
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id);

  if (updateErr) {
    console.error("Cancel order update error:", updateErr);
    return JSON.stringify({ success: false, error: updateErr.message });
  }

  // Update conversation status back to open
  await supabase
    .from("conversations")
    .update({ status: "open" })
    .eq("id", conversationId);

  // Notify store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();

  if (store) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `Order ${order.order_number} cancelled`,
      description: `${order.customer_name} cancelled their order.${
        args.reason ? ` Reason: ${args.reason}` : ""
      }`,
      type: "order",
    });
  }

  console.log(`Order cancelled: ${order.order_number}`);
  return JSON.stringify({ success: true, order_number: order.order_number });
}

async function executeUpdateOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Update order lookup error:", fetchErr);
    return JSON.stringify({
      success: false,
      error: "No active order found to update.",
    });
  }

  const order = orders[0];
  if (["cancelled", "delivered", "shipped"].includes(order.status)) {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is ${order.status} and cannot be updated.`,
    });
  }

  const updateData: any = {};
  if (args.customer_name) updateData.customer_name = args.customer_name;
  if (args.phone) updateData.phone = args.phone;
  if (args.address) updateData.address = args.address;
  if (args.notes !== undefined) updateData.notes = args.notes;
  if (args.items && args.items.length > 0) {
    updateData.items = args.items;
    updateData.total = args.items.reduce(
      (sum: number, item: any) =>
        sum + (item.price || 0) * (item.quantity || 1),
      0
    );
  }

  if (Object.keys(updateData).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update." });
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", order.id);

  if (updateErr) {
    console.error("Update order error:", updateErr);
    return JSON.stringify({ success: false, error: updateErr.message });
  }

  // Update conversation customer details if changed
  const convoUpdate: any = {};
  if (args.customer_name) convoUpdate.customer_name = args.customer_name;
  if (args.phone) convoUpdate.customer_phone = args.phone;
  if (args.address) convoUpdate.customer_address = args.address;
  if (Object.keys(convoUpdate).length > 0) {
    await supabase
      .from("conversations")
      .update(convoUpdate)
      .eq("id", conversationId);
  }

  // Notify store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();
  if (store) {
    const changes = Object.keys(updateData).join(", ");
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `Order ${order.order_number} updated`,
      description: `${order.customer_name} updated their order. Changed: ${changes}`,
      type: "order",
    });
  }

  console.log(
    `Order updated: ${order.order_number}, fields: ${Object.keys(
      updateData
    ).join(", ")}`
  );
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    updated_fields: Object.keys(updateData),
    new_total: updateData.total ?? order.total,
  });
}

async function executeCheckOrderStatus(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(5);
  }

  const { data: orders, error } = await query;
  if (error || !orders?.length) {
    console.error("Check order status error:", error);
    return JSON.stringify({ success: false, error: "No orders found." });
  }

  const result = orders.map((o: any) => ({
    order_number: o.order_number,
    status: o.status,
    customer_name: o.customer_name,
    phone: o.phone,
    address: o.address,
    items: o.items,
    total: o.total,
    notes: o.notes,
    created_at: o.created_at,
    updated_at: o.updated_at,
  }));

  console.log(
    `Order status checked: ${result.map((o: any) => o.order_number).join(", ")}`
  );
  return JSON.stringify({ success: true, orders: result });
}

// ─── Visual attribute scoring (nameless-product mode) ───
// Weights from the build spec: type 30, color 25, pattern 15, style 10,
// fit 8, material 7, occasion 5  (total = 100)
const ATTR_WEIGHTS: Record<string, number> = {
  type: 0.30,
  color: 0.25,
  pattern: 0.15,
  style: 0.10,
  fit: 0.08,
  material: 0.07,
  occasion: 0.05,
};

function scoreProductAttributes(product: any, q: any): { score: number; matched: number } {
  let score = 0;
  let matched = 0;
  const norm = (v: any) => (typeof v === "string" ? v.toLowerCase().trim() : v);
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase().trim()) : []);

  // Single-value fields
  for (const key of ["type", "pattern", "style", "fit", "material"]) {
    const want = norm(q[key]);
    const have = norm(product[key]);
    if (want && have && want === have) {
      score += ATTR_WEIGHTS[key];
      matched++;
    }
  }
  // Array fields — partial overlap counts proportionally
  for (const key of ["color", "occasion"]) {
    const wants = arr(q[key]);
    const haves = arr(product[key]);
    if (wants.length === 0 || haves.length === 0) continue;
    const overlap = wants.filter((w) => haves.includes(w)).length;
    if (overlap > 0) {
      score += ATTR_WEIGHTS[key] * (overlap / Math.max(wants.length, 1));
      matched++;
    }
  }
  return { score, matched };
}

async function executeSearchProducts(
  supabase: any,
  storeId: string,
  args: any
): Promise<string> {
  // ─── Visual-first path: customer image attributes were extracted upstream ───
  // The webhook injects `image_attributes` and optionally `image_embedding`
  // when the customer sent a photo. We score visual fields and blend cosine
  // similarity 60/40 (attribute_score 0.6 + visual_score 0.4) per spec.
  const imgAttrs = args.image_attributes || null;
  const imgEmbedding = args.image_embedding || null;

  // Pull all active products for this store (catalogs are typically <1000 items)
  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id, name, description, price, compare_price, stock, category, images, variants, sku, " +
        "type, color, pattern, style, material, fit, occasion, sleeve, neckline, length, " +
        "sizes_available, stock_per_size, auto_description"
    )
    .eq("store_id", storeId)
    .eq("active", true)
    .limit(500);

  if (error) {
    console.error("Search products error:", error);
    return JSON.stringify({ success: false, error: "Failed to search products." });
  }

  let pool = products || [];

  // Optional category prefilter from the AI
  if (args.category) {
    const cat = String(args.category).toLowerCase();
    const filtered = pool.filter((p: any) => (p.category || "").toLowerCase().includes(cat));
    if (filtered.length > 0) pool = filtered;
  }
  if (args.min_price !== undefined) pool = pool.filter((p: any) => Number(p.price) >= Number(args.min_price));
  if (args.max_price !== undefined) pool = pool.filter((p: any) => Number(p.price) <= Number(args.max_price));

  // Build the attribute query — merge what the AI passed AND what vision extracted
  // from the customer photo (if any). AI-passed values take precedence.
  const attrQuery: any = {
    type: args.type || imgAttrs?.type || null,
    color: args.color || imgAttrs?.color || [],
    pattern: args.pattern || imgAttrs?.pattern || null,
    style: args.style || imgAttrs?.style || null,
    fit: args.fit || imgAttrs?.fit || null,
    material: args.material || imgAttrs?.material || null,
    occasion: args.occasion || imgAttrs?.occasion || [],
  };
  const hasAttrQuery = Object.values(attrQuery).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v
  );

  // Visual similarity scores (cosine) when we have an embedding
  let visualScores: Record<string, number> = {};
  if (Array.isArray(imgEmbedding) && imgEmbedding.length === 1536) {
    try {
      const { data: matches } = await supabase.rpc("match_products_by_image", {
        _store_id: storeId,
        _query_embedding: imgEmbedding,
        _match_count: 20,
      });
      for (const m of matches || []) {
        visualScores[m.id] = Math.max(0, Math.min(1, m.similarity || 0));
      }
    } catch (e) {
      console.warn("match_products_by_image rpc failed:", e);
    }
  }

  // ─── Token search fallback (legacy text query) ───
  // Combines into the unified scoring below.
  const tokens =
    typeof args.query === "string" && args.query.trim()
      ? args.query
          .toLowerCase()
          .split(/[\s,،\-_/]+/)
          .filter((t: string) => t && t.length >= 2)
      : [];
  const tokenScore = (p: any) => {
    if (tokens.length === 0) return 0;
    const hay = `${p.name || ""} ${p.description || ""} ${p.auto_description || ""} ${p.category || ""} ${(p.color || []).join(" ")} ${p.type || ""} ${p.pattern || ""} ${p.style || ""}`.toLowerCase();
    let s = 0;
    for (const t of tokens) if (hay.includes(t)) s++;
    return s / tokens.length; // 0..1
  };

  // ─── Unified scoring ───
  const scored = pool.map((p: any) => {
    const attr = hasAttrQuery ? scoreProductAttributes(p, attrQuery) : { score: 0, matched: 0 };
    const tok = tokenScore(p);
    const vis = visualScores[p.id] || 0;

    // attribute_score is normalized to [0,1] (sum of weights = 1.0)
    let final: number;
    if (Array.isArray(imgEmbedding) && imgEmbedding.length === 1536) {
      // Customer sent an image: 60% attributes (or token fallback), 40% visual
      const semantic = hasAttrQuery ? attr.score : tok;
      final = semantic * 0.6 + vis * 0.4;
    } else if (hasAttrQuery) {
      // Pure attribute search (text-described item)
      final = attr.score;
    } else {
      // Plain keyword search
      final = tok;
    }
    return { p, final, attr_matched: attr.matched, attr_score: attr.score, visual: vis, token: tok };
  });

  scored.sort((a, b) => b.final - a.final);

  // Confidence buckets per spec: ≥0.80 strong, 0.55–0.79 medium, <0.55 weak
  const top = scored[0];
  const topScore = top?.final || 0;
  let confidence: "high" | "medium" | "low" | "none" = "none";
  if (topScore >= 0.8) confidence = "high";
  else if (topScore >= 0.55) confidence = "medium";
  else if (topScore > 0) confidence = "low";

  // Decide how many to return based on confidence
  let resultsToReturn: any[];
  let fallbackUsed: string | null = null;
  if (confidence === "high") {
    resultsToReturn = [top.p];
  } else if (confidence === "medium") {
    resultsToReturn = scored.slice(0, 3).filter((s) => s.final > 0).map((s) => s.p);
  } else if (confidence === "low") {
    resultsToReturn = scored.slice(0, 3).filter((s) => s.final > 0).map((s) => s.p);
    fallbackUsed = "low_confidence";
  } else {
    // No signal at all → return up to 5 most-recent active products as alternatives
    resultsToReturn = pool.slice(0, 5);
    fallbackUsed = "no_match";
  }

  resultsToReturn = resultsToReturn.slice(0, 10);

  const formatted = resultsToReturn.map((p: any) => {
    const sc = scored.find((s) => s.p.id === p.id);
    return {
      id: p.id,
      // For nameless mode the customer-facing label is auto_description.
      // Keep `name` populated as a fallback for legacy stores that did fill it.
      name: p.name || p.auto_description || "Item",
      auto_description: p.auto_description || p.name || "",
      description: p.description || "",
      price: p.price,
      compare_price: p.compare_price,
      stock: p.stock,
      category: p.category || "General",
      images: p.images || [],
      variants: p.variants || [],
      sku: p.sku || "",
      // Visual attributes the AI uses to talk about the item
      type: p.type,
      color: p.color || [],
      pattern: p.pattern,
      style: p.style,
      material: p.material,
      fit: p.fit,
      sleeve: p.sleeve,
      neckline: p.neckline,
      length: p.length,
      occasion: p.occasion || [],
      sizes_available: p.sizes_available || [],
      stock_per_size: p.stock_per_size || {},
      // Internal scoring (the AI uses this to decide its reply pattern)
      _match_score: Number(sc?.final.toFixed(3) || 0),
    };
  });

  console.log(
    `Visual search: query="${args.query || ""}" attrs=${JSON.stringify(attrQuery)} ` +
      `embedding=${!!imgEmbedding} → ${formatted.length} results, top_score=${topScore.toFixed(3)}, confidence=${confidence}`
  );

  return JSON.stringify({
    success: true,
    products: formatted,
    total_results: formatted.length,
    confidence,
    top_match_score: Number(topScore.toFixed(3)),
    fallback: fallbackUsed,
    note:
      confidence === "high"
        ? "Strong match — present this single item as the answer with its auto_description and image."
        : confidence === "medium"
        ? "Multiple plausible matches — show up to 3 with their visual descriptions and ask which one the customer means."
        : confidence === "low"
        ? "No confident match — ask ONE targeted clarifying question (about type if unknown, then color, then style). Do NOT show products yet."
        : "No real match — be honest, show 2 closest alternatives with their visual descriptions.",
  });
}


async function executeListCategories(
  supabase: any,
  storeId: string
): Promise<string> {
  const { data: products, error } = await supabase
    .from("products")
    .select("category, price")
    .eq("store_id", storeId)
    .eq("active", true);

  if (error) {
    console.error("List categories error:", error);
    return JSON.stringify({
      success: false,
      error: "Failed to list categories.",
    });
  }

  const categoryMap: Record<
    string,
    { count: number; min_price: number; max_price: number }
  > = {};
  for (const p of products || []) {
    const cat = p.category || "General";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, min_price: p.price, max_price: p.price };
    }
    categoryMap[cat].count++;
    categoryMap[cat].min_price = Math.min(categoryMap[cat].min_price, p.price);
    categoryMap[cat].max_price = Math.max(categoryMap[cat].max_price, p.price);
  }

  const categories = Object.entries(categoryMap).map(([name, info]) => ({
    category: name,
    product_count: info.count,
    price_range: `${info.min_price} - ${info.max_price}`,
  }));

  const totalProducts = (products || []).length;
  console.log(
    `List categories: ${categories.length} categories, ${totalProducts} total products`
  );
  return JSON.stringify({
    success: true,
    categories,
    total_products: totalProducts,
  });
}

// Sanitize AI output: strip code blocks, excessive emojis, and technical artifacts.
// When `allowEmpty` is true the function returns an empty string instead of
// the greeting fallback — used when the turn already includes images and a
// generic "Hi! How can I help?" would be jarring mid-conversation.
function sanitizeAIResponse(text: string, allowEmpty = false): string {
  console.log("sanitizeAIResponse confirm deployed");

  // Remove markdown code blocks
  let clean = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  // Remove HTML tags
  clean = clean.replace(/<[^>]+>/g, "");
  // Collapse repeated emojis (more than 2 of the same emoji in a row)
  clean = clean.replace(/([\u{1F000}-\u{1FFFF}])\1{2,}/gu, "$1");
  // Remove lines that look like code (starting with //, #!, import, const, let, var, function, return, etc.)
  clean = clean
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("#!") &&
        !trimmed.startsWith("import ") &&
        !trimmed.startsWith("export ") &&
        !/^(const |let |var |function |return |if |for |while |class )/.test(
          trimmed
        )
      );
    })
    .join("\n");
  // Collapse excessive whitespace
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  // If after cleaning the response is empty or too short, return a fallback
  // (or empty string when the caller has images to deliver).
  if (clean.length < 3) {
    if (allowEmpty) return "";
    return "مرحباً! كيف أقدر أساعدك؟ 😊";
  }
  // Truncate to Meta's 2000 char limit
  if (clean.length > 1900) {
    clean = clean.substring(0, 1900) + "...";
  }
  return clean;
}

interface AIReplyResult {
  text: string;
  images: { url: string; caption: string }[];
}

function parseImageUrlFromMessageContent(content: string): string | null {
  if (!content) return null;
  const main = content.split("\n\n[CTX]")[0];
  if (!main.startsWith("📷 ")) return null;
  const url = main.replace("📷 ", "").trim();
  return url.length > 0 ? url : null;
}

// Parse the [CTX] block appended by the webhook with ad/reply context.
function parseMessageContext(content: string): {
  contextImageUrl: string | null;
  replyToText: string | null;
  replyToMid: string | null;
  adTitle: string | null;
  adId: string | null;
  adUrl: string | null;
  textWithoutCtx: string;
} {
  const result = {
    contextImageUrl: null as string | null,
    replyToText: null as string | null,
    replyToMid: null as string | null,
    adTitle: null as string | null,
    adId: null as string | null,
    adUrl: null as string | null,
    textWithoutCtx: content || "",
  };
  if (!content) return result;
  const idx = content.indexOf("\n\n[CTX] ");
  if (idx === -1) return result;
  result.textWithoutCtx = content.slice(0, idx);
  const ctxLine = content.slice(idx + "\n\n[CTX] ".length);
  for (const part of ctxLine.split(" | ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "context_image") result.contextImageUrl = val;
    else if (key === "reply_to_text") result.replyToText = val;
    else if (key === "reply_to_mid") result.replyToMid = val;
    else if (key === "ad_title") result.adTitle = val;
    else if (key === "ad_id") result.adId = val;
    else if (key === "ad_url") result.adUrl = val;
  }
  return result;
}

function stripMessageContext(content: string): string {
  return typeof content === "string" ? content.split("\n\n[CTX]")[0] : "";
}

function collectPendingCustomerBurst(conversationHistory: any[]): any[] {
  const burst: any[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry?.sender !== "customer") break;
    burst.unshift(entry);
  }

  return burst;
}

function hasLaterMessageInSameConversation(
  parsedMessages: any[],
  currentIndex: number
): boolean {
  const current = parsedMessages[currentIndex];
  if (!current) return false;

  for (let i = currentIndex + 1; i < parsedMessages.length; i++) {
    const candidate = parsedMessages[i];
    if (!candidate) continue;

    if (
      candidate.platform === current.platform &&
      candidate.platformId === current.platformId &&
      (candidate.pageId || "") === (current.pageId || "")
    ) {
      return true;
    }
  }

  return false;
}

function compareIncomingMessages(a: any, b: any): number {
  const timeDiff =
    new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime();
  if (timeDiff !== 0) return timeDiff;

  const aKey = `${a?.platform || ""}:${a?.platformId || ""}:${a?.pageId || ""}:${a?.platformMessageId || ""}`;
  const bKey = `${b?.platform || ""}:${b?.platformId || ""}:${b?.pageId || ""}:${b?.platformMessageId || ""}`;
  return aKey.localeCompare(bKey);
}

function extractBurstInput(burstMessages: any[]): {
  combinedText: string;
  imageUrls: string[];
  latestContext: ReturnType<typeof parseMessageContext>;
} {
  const seen = new Set<string>();
  const textParts: string[] = [];
  let latestContext = parseMessageContext("");

  for (const msg of burstMessages) {
    const rawContent = typeof msg?.content === "string" ? msg.content : "";
    if (!rawContent) continue;

    const ctx = parseMessageContext(rawContent);
    latestContext = ctx;

    const visibleText = ctx.textWithoutCtx.trim();
    if (
      visibleText &&
      visibleText !== "[Image]" &&
      !visibleText.startsWith("📷 ")
    ) {
      textParts.push(visibleText);
    }
  }

  const imageUrls = burstMessages.flatMap((msg) => {
    const rawContent = typeof msg?.content === "string" ? msg.content : "";
    if (!rawContent) return [] as string[];

    const ctx = parseMessageContext(rawContent);
    const directImage = parseImageUrlFromMessageContent(ctx.textWithoutCtx);
    return [directImage, ctx.contextImageUrl].filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  });

  return {
    combinedText: textParts.join("\n"),
    imageUrls,
    latestContext,
  };
}

function looksLikeCancelOrderRequest(text: string): boolean {
  const normalized = (text || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();

  if (!normalized) return false;

  return /\b(cancel|cancelled|canceled|abort|nevermind)\b/.test(normalized) ||
    /(الغي|الغاء|بدي الغي|بدي الغاء|كنسل|كانسل|بطل الطلب|ما بدي الطلب|مش بدي الطلب|لغي الطلب|الغي الطلب|الغى الطلب|الغاء الطلب)/.test(normalized);
}

function buildCancelOrderReply(rawResult: string, customerText: string): string {
  const isArabic = /[\u0600-\u06FF]/.test(customerText || "");
  let result: any = null;

  try {
    result = JSON.parse(rawResult);
  } catch {
    result = { success: false, error: "Unable to cancel the order." };
  }

  if (result?.success) {
    return isArabic
      ? `تم إلغاء طلبك ${result.order_number} ✅`
      : `Your order ${result.order_number} has been cancelled ✅`;
  }

  const error = result?.error || "No active order found to cancel.";
  return isArabic
    ? `ما قدرت ألغي الطلب: ${error}`
    : `I couldn't cancel the order: ${error}`;
}

function isFallbackLikeResponse(text: string, fallbackMessage?: string | null): boolean {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return true;

  const knownFallbacks = [
    fallbackMessage,
    "i'm not sure about that. let me connect you with our team!",
    "i’m not sure about that. let me connect you with our team!",
    "thanks for your message! our team will get back to you shortly.",
    "thanks for your message! we'll get back to you shortly.",
  ]
    .filter(Boolean)
    .map((entry) => entry!.trim().toLowerCase());

  return knownFallbacks.includes(normalized);
}

function looksLikeReferentialFollowUp(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return false;

  return /^(this|that|it|these|those|price\??|how much\??|details\??|same one\??|which one\??|what about this\??|كم|بكم|سعرها|سعره|هاي|هاد|هذا|هذه|هذي|هاذي|شو سعرها|شو سعره|بدّي هاي|بدي هاي|يعني هاي|هاي قديش|هاي بكم|تفاصيلها|تفاصيله|أبغى هذا|ابي هذا|أبي هذا)/i.test(
    normalized
  );
}

function collectRecentReferenceImages(conversationHistory: any[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const rawContent = typeof conversationHistory[i]?.content === "string"
      ? conversationHistory[i].content
      : "";
    if (!rawContent) continue;

    const ctx = parseMessageContext(rawContent);
    const mainImage = parseImageUrlFromMessageContent(ctx.textWithoutCtx);
    const candidates = [mainImage, ctx.contextImageUrl].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      urls.push(candidate);
      if (urls.length >= 3) return urls;
    }
  }

  return urls;
}

async function generateAIReply(
  customerMessage: string,
  storeInfo: any,
  catalogSummary: string,
  aiSettings: any,
  conversationHistory: any[],
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string,
  existingOrders: any[]
): Promise<AIReplyResult> {
  const emptyResult = (text: string): AIReplyResult => ({
    text: sanitizeAIResponse(text),
    images: [],
  });
  // Load platform AI provider config (admin-controlled). Falls back to OpenAI/gpt-4o.
  let aiProvider = "openai";
  let aiModel = "gpt-4o";
  try {
    const { data: cfg } = await supabase
      .from("platform_ai_config")
      .select("provider, model")
      .limit(1)
      .maybeSingle();
    if (cfg?.provider) aiProvider = cfg.provider;
    if (cfg?.model) aiModel = cfg.model;
  } catch (e) {
    console.warn("platform_ai_config fetch failed, using defaults:", e);
  }

  const isLovable = aiProvider === "lovable";
  const AI_API_KEY = isLovable
    ? Deno.env.get("LOVABLE_API_KEY")
    : Deno.env.get("OPENAI_API_KEY");
  const AI_ENDPOINT = isLovable
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  if (!AI_API_KEY) {
    console.warn(`${isLovable ? "LOVABLE_API_KEY" : "OPENAI_API_KEY"} not set, using fallback message`);
    return emptyResult(
      aiSettings?.fallback_message ||
        "Thanks for your message! Our team will get back to you shortly."
    );
  }

  const toneMap: Record<string, string> = {
    friendly: "warm, friendly, and conversational",
    professional: "professional and polished",
    casual: "casual and relaxed",
    formal: "formal and respectful",
  };

  const toneDesc = toneMap[aiSettings?.tone || "friendly"] || "friendly";
  const personaName = aiSettings?.persona_name || "Sara";
  const language = aiSettings?.language || "both";

  let languageInstruction = "";
  if (language === "ar") languageInstruction = "Always respond in Arabic.";
  else if (language === "en")
    languageInstruction = "Always respond in English.";
  else
    languageInstruction =
      "Detect the customer's language and respond in the same language (Arabic or English).";

  const ordersContext =
    existingOrders.length > 0
      ? `\n\nExisting Orders for this conversation:\n${existingOrders
          .map(
            (o) =>
              `- ${o.order_number} | Status: ${o.status} | Customer: ${
                o.customer_name
              } | Items: ${JSON.stringify(o.items)} | Total: ${
                o.total
              } | Phone: ${o.phone || "N/A"} | Address: ${
                o.address || "N/A"
              } | Notes: ${o.notes || "N/A"}`
          )
          .join("\n")}`
      : "\n\nNo existing orders for this conversation.";

  const customInstructions = aiSettings?.ai_instructions || "";

  const systemPrompt = `You are ${personaName}, a PROFESSIONAL SALES REPRESENTATIVE for "${
    storeInfo.name
  }". Your #1 job is to CLOSE SALES — not just answer questions. Every conversation is a sales opportunity.
Your tone is ${toneDesc}. ${languageInstruction}
${
  customInstructions
    ? `\nCustom Store Instructions (HIGHEST PRIORITY — follow these above all else):\n${customInstructions}\n`
    : ""
}
SALES MISSION — YOUR CORE JOB:
1. **QUALIFY**: Quickly understand what the customer needs (use case, budget, preference) — ask 1-2 smart questions max, never an interrogation.
2. **RECOMMEND**: Match them to the BEST products using search_products. Lead with benefits, not just features.
3. **HANDLE OBJECTIONS**: If the customer hesitates on price, quality, or delivery — address it confidently using store info (return policy, delivery, payment methods). Never argue, never pressure.
4. **UPSELL & CROSS-SELL**: When relevant, suggest ONE complementary product or higher-value option ("Many customers pair this with..."). Once per conversation, never pushy.
5. **CLOSE**: Always move toward an order. After 1-2 exchanges of interest, ask for the sale clearly: "Would you like me to place the order for you now?"
6. **FOLLOW THROUGH**: The moment the customer agrees — IMMEDIATELY collect missing details and call create_order. Do not stall.

SALES BEHAVIOR RULES — STRICTLY ENFORCED:
- NEVER be passive ("let me know if you need anything"). Always propose a next step.
- NEVER list every product — recommend 1-3 BEST matches and explain WHY.
- NEVER lie about stock, price, or availability. Use only tool results.
- NEVER offer discounts or promises not in store info / custom instructions.
- If the customer is just browsing, nudge gently: "Want me to show you our bestsellers?"
- If the customer goes quiet on details, re-engage with a helpful question — don't drop the lead.
- Treat every customer as a real buyer. Be confident, warm, and solution-focused.

HUMAN-LIKE REPLY STYLE — IMPORTANT:
- Vary your phrasing turn to turn. Do NOT reuse the same opener ("Hi there!", "Sure thing!", "Of course!") on consecutive replies.
- Match the customer's energy: short and casual for short messages, more detailed for detailed asks.
- If the customer sent text AND an image in the same burst, address BOTH in one cohesive reply (acknowledge what's in the image, then answer their text).
- For one-word or emoji-only messages, reply naturally and briefly — don't over-explain.
- If you receive an image but cannot tell what product it is (blurry, dark, partial, or no close match in catalog), politely ask for a clearer photo or a hint about what they're looking for. Never reply with nothing.
- When you ARE confident about an image match, say something like "this looks like our [Product Name]" rather than asserting it as fact.

Store Information:
- Name: ${storeInfo.name}
- Category: ${storeInfo.category || "General"}
- Description: ${storeInfo.description || "N/A"}
- Address: ${storeInfo.address || "N/A"}
- Phone: ${storeInfo.phone || "N/A"}
- Delivery Info: ${storeInfo.delivery_info || "N/A"}
- Return Policy: ${storeInfo.return_policy || "N/A"}
- Payment Methods: ${storeInfo.payment_methods?.join(", ") || "N/A"}
- Working Hours: ${JSON.stringify(storeInfo.working_hours || {})}
${storeInfo._runtime_hint || ""}

Product Catalog Summary:
${catalogSummary}
${ordersContext}

PRODUCT SEARCH RULES — CRITICAL:
- You do NOT have the full product catalog in this prompt. You MUST use the search_products tool to find specific products.
- When a customer asks about products (e.g. "do you have shoes?", "show me something under 50"), ALWAYS call search_products with relevant keywords, category, or price filters.
- When a customer asks a vague question like "what do you sell?" or "show me your products", call list_categories first to give them an overview, then let them pick a category.
- After getting search results, use send_product_images to show products that have images.
- NEVER make up product names, prices, or details. Only use data returned by the tools.

CRITICAL ORDER RULES — READ CAREFULLY:
**MOST IMPORTANT**: You MUST call the create_order / update_order / cancel_order tool to perform any order action. NEVER just say "your order has been created" without actually calling the tool. If you do not call the tool, the order DOES NOT EXIST in our system and the store owner will never see it.

**ORDER STATUS QUERIES**: When a customer asks about their order status, delivery progress, or any order details, you MUST call the check_order_status tool to get the real-time status from the database. NEVER guess or assume the order status from conversation history alone. Always use the tool to get the latest information.

**QUANTITY DETECTION — CRITICAL**:
- Parse product quantities from natural language. Examples:
  - "I want 3 shirts" → quantity: 3
  - "give me two of those" → quantity: 2  
  - "I'll take a dozen eggs" → quantity: 12
  - "أبي 5 قطع" → quantity: 5
  - If the customer says just "I want this" or "أبي هذا" with no number → quantity: 1
- Always confirm the detected quantity with the customer before creating the order.
- Include the correct quantity in the order items — do NOT default everything to 1.

**SMART DATA COLLECTION — CRITICAL**:
- ALWAYS ask for ALL missing customer details (full name, phone number, AND delivery address) in ONE SINGLE message. Do NOT ask for them one by one across multiple turns.
- Example (good): "To confirm your order I just need: your full name, phone number, and delivery address. 🙂"
- Example (BAD — never do this): asking only for name, then only for phone, then only for address in separate messages.
- When the customer replies, EXTRACT ALL pieces of info from their message at once (name + phone + address can all appear in a single message — parse them intelligently even if unlabeled).
- If the customer's reply is missing one or two fields, ask ONLY for the specific missing field(s) in a single short message — never re-ask for fields already provided.
- Track and remember every detail shared across the entire conversation history. NEVER ask for information already provided.
- Before calling create_order, briefly summarize the full order (items + quantities + prices + customer info) and ask for final confirmation in ONE message.
- Once the customer confirms, you MUST immediately call the create_order tool — do not just say "order created" without calling it.

1. **Existing orders are REFERENCE ONLY**: The "Existing Orders" section above is background context so you remember what the customer already bought. It does NOT mean every new message is about that order. Only act on an existing order when the customer EXPLICITLY references it (uses cancel/update/change/status trigger words OR mentions the order number / its specific items). If the customer asks about a DIFFERENT product, sends a greeting, asks a general question, or starts a NEW shopping inquiry → treat it as a normal conversation. Do NOT call update_order, do NOT call create_order, do NOT mention the existing order at all unless asked. Just answer their actual question (use search_products if they're asking about products).
2. **NEVER invent order actions or statuses**: Do NOT say things like "your order has been reactivated", "تم إعادة تفعيل طلبك", "order resumed", "order reopened", "I reactivated your order" — these actions DO NOT EXIST in this system. The only real order actions are: create, update, cancel, check_status. If you did not call one of those tools in this turn, do NOT claim any order action happened. Never re-confirm or re-announce an old order unless the customer just asked about its status (then call check_order_status).
3. **Create order**: Use create_order when the customer wants to buy a NEW product (even if they have a previous active order — multiple orders per conversation are allowed) AND you have collected: items with quantities, full name, phone, and address. YOU MUST CALL THE TOOL.
4. **Update order**: Use update_order ONLY when the customer EXPLICITLY wants to change items, address, phone, name, or notes on a SPECIFIC existing active order (they used update trigger words and clearly referenced that order, not a new product inquiry).

   **STRICT FIELD ISOLATION — READ THIS TWICE**:
   When calling update_order, pass ONLY the field(s) the customer LITERALLY mentioned in their CURRENT latest message. Forbidden: passing address when the user talked about quantity. Forbidden: passing items when the user only changed address. Forbidden: re-passing values that were already saved on the order. The existing order in "Existing Orders" above is REFERENCE ONLY — never echo its address/phone/name/items into update_order unless the user just asked to change that exact field in this turn.

   **INTENT MAPPING — match the customer's words to the right field BEFORE calling the tool**:
   - QUANTITY/AMOUNT/NUMBER words ("كمية", "قطعتين", "٢", "اثنين", "ثلاثة", "بدي ٣", "اعدل الكمية", "quantity", "make it 2", "change to 3 pieces") → update_order with items ONLY (rebuild the items array using the existing order's items but with the new quantity). DO NOT pass address/phone/name.
   - ADDRESS/LOCATION words ("عنوان", "مكان التوصيل", "وصلولي ع", "address", "deliver to", "location") → update_order with address ONLY.
   - PHONE words ("رقمي", "تلفوني", "phone", "number") → update_order with phone ONLY.
   - NAME words ("اسمي", "my name") → update_order with customer_name ONLY.
   - ITEM SWAP words ("بدل المنتج", "زيد", "احذف", "add", "remove", "swap", "instead of") → update_order with items ONLY.

   Arabic update triggers: "بدي اعدل", "اعدل", "بدي اغير", "غير", "تعديل", "بدل", "بدي يكون", "خليه", "ممكن اعدل", "اعدل الكمية".
   English update triggers: "change", "update", "modify", "edit", "make it", "switch to", "I want to change", "can you update".
   Trigger AND there is an active order in "Existing Orders" above → CALL update_order IMMEDIATELY with ONLY the matching field. Do NOT ask for confirmation first. Do NOT just reply with text — you MUST call the tool.

5. **Cancel order**: CALL cancel_order IMMEDIATELY when the customer wants to cancel an active order or no longer wants to buy. **TRIGGER WORDS** (in any language) that REQUIRE you to immediately call cancel_order — never just reply with text, never ask for confirmation first:
   - Arabic: "الغي", "إلغاء", "بدي الغي", "بدي إلغاء", "ألغي الطلب", "الغي الطلب", "كنسل", "بطل الطلب", "بطلت", "بطلت اشتري", "ما بدي الطلب", "ما عاد بدي", "ما بقا بدي", "تراجعت", "الغاء"
   - English: "cancel", "cancel order", "cancel my order", "I want to cancel", "abort", "stop the order", "nevermind the order", "I changed my mind", "don't want it anymore", "no longer want"
   When ANY of these appear AND there is an active order in "Existing Orders" above → CALL cancel_order IMMEDIATELY in the same turn. NEVER call update_order when the user wants to cancel. If the customer did not specify which order, pass no order_number and the system will cancel the most recent pending order. Do NOT just reply with text saying "I cancelled it" — you MUST call the tool. After the tool returns, confirm the cancellation by referencing the returned order_number.

**INTENT-FIRST PROCESSING — DO THIS BEFORE EVERY TOOL CALL**:
Before calling any order tool, silently classify the customer's CURRENT (latest) message into ONE intent: [cancel | update_quantity | update_address | update_phone | update_name | update_items | new_order | question | other]. Then call the matching tool with ONLY the matching field. If the intent is cancel, you MUST call cancel_order, never update_order. If you are unsure between two intents, ask one short clarifying question instead of guessing.
5. Always reference orders by their order_number (e.g. ORD-00001) — this number comes ONLY from the tool response, never make one up.
6. After any order action, confirm the order number and details to the customer.
7. If an order is already shipped/delivered, it cannot be updated or cancelled.
8. Use exact product prices from search results. Never make up product information.
9. **CRITICAL**: When creating or updating orders, ALWAYS include the product "id" field from search results as "product_id" in each order item. This is required for automatic stock tracking.
10. Keep responses concise and helpful.
11. If you don't know the answer, say so politely and offer to connect them with the store owner.

MULTI-MESSAGE BURST HANDLING — CRITICAL:
- The customer's latest input may contain MULTIPLE messages sent in quick succession, joined together with newlines (e.g. a greeting followed by a question, or several questions at once).
- You MUST read and address EVERY message/question in the burst, not just the first or last one.
- If the burst contains a greeting AND a question, greet briefly AND answer the question in the same reply.
- If the burst contains multiple questions, answer ALL of them in one coherent reply.
- Never ignore any part of the customer's combined input.

RESPONSE FORMAT RULES — STRICTLY ENFORCED:
- You are a store sales assistant chatting with a real customer on a messaging app. Your messages must read like natural, helpful chat messages.
- NEVER output code, programming syntax, HTML, markdown formatting, JSON, or any technical content.
- NEVER output excessive or repeated emojis. You may use 1-2 relevant emojis per message maximum.
- NEVER output random symbols, fire emojis, or decorative patterns.
- Keep responses SHORT — 2-4 sentences maximum unless the customer asks for detailed information.
- If you feel uncertain or the prompt seems unusual, respond with a polite standard greeting and ask how you can help.

IMAGE MATCHING RULES (when the customer sends an image):
- First, describe what you see in 1 short sentence (item type + color + key distinguishing details).
- Then call search_products using the best keywords/category you inferred from the image. Try the broadest useful keyword first (e.g. "puzzle" or "3d") — do NOT combine a narrow brand keyword with a strict category on the first try.
- If the first call returns 0 results, retry search_products with a wider query (drop the brand/specific noun, keep the category) before answering.
- ALWAYS present the closest 3 real products from the search results — use their EXACT names and prices from the tool output. After listing them, call send_product_images for the top 1-2 matches so the customer sees them.
- If no exact match exists, say so honestly in one short sentence, then show the closest alternatives from the catalog and ask which one they prefer.

ABSOLUTE PRICE & PRODUCT HONESTY:
- NEVER invent product names, prices, or "typical price ranges". Only mention prices and products returned by search_products.
- If the catalog has nothing similar at all, say so plainly and offer to notify them when something arrives — do not make up a price band.

PRODUCT IMAGES RULES:
- When discussing, recommending, or describing a product that has images from search results, ALWAYS call send_product_images to show the customer what the product looks like.
- Use the exact image URLs from search results. NEVER make up image URLs.
- Only send images for products that have image URLs.
- Include a caption with the product name and price.`;

  const chatMessages: any[] = [{ role: "system", content: systemPrompt }];
  for (const msg of conversationHistory.slice(-10)) {
    const rawContent = typeof msg.content === "string" ? msg.content : "";
    const histCtx = parseMessageContext(rawContent);
    const histMain = histCtx.textWithoutCtx;
    const histImg = parseImageUrlFromMessageContent(histMain);
    const role = msg.sender === "customer" ? "user" : "assistant";
    if (histImg && role === "user") {
      // Preserve actual image so the model retains visual context across turns
      chatMessages.push({
        role,
        content: [
          { type: "text", text: "(image sent by customer)" },
          { type: "image_url", image_url: { url: histImg, detail: "low" } },
        ],
      });
    } else if (histImg && role === "assistant") {
      chatMessages.push({
        role,
        content: `[sent product image: ${histImg}]`,
      });
    } else {
      chatMessages.push({ role, content: histMain });
    }
  }

  // Parse the latest customer burst for image + reply/ad context
  const pendingBurst = collectPendingCustomerBurst(conversationHistory);
  const burstInput = extractBurstInput(pendingBurst);
  const ctx = burstInput.latestContext;
  const mainContent = (burstInput.combinedText || customerMessage || "").trim();
  const imageUrl = burstInput.imageUrls[0] || parseImageUrlFromMessageContent(mainContent);
  const recentReferenceImages =
    burstInput.imageUrls.length > 1
      ? burstInput.imageUrls.slice(1, 4)
      : !imageUrl && !ctx.contextImageUrl && looksLikeReferentialFollowUp(mainContent)
        ? collectRecentReferenceImages(conversationHistory)
        : [];

  const ctxHints: string[] = [];
  if (ctx.adTitle || ctx.adId) {
    ctxHints.push(
      `The customer started this chat by clicking a Facebook/Instagram ad${
        ctx.adTitle ? ` titled "${ctx.adTitle}"` : ""
      }${ctx.adId ? ` (ad_id=${ctx.adId})` : ""}. Treat the ad creative image as the product they are interested in.`
    );
  } else if (ctx.contextImageUrl) {
    ctxHints.push(
      "The customer is replying to an image they were sent (a product photo, ad creative, or story). Treat that image as the product they are asking about."
    );
  } else if (ctx.replyToText) {
    ctxHints.push(
      `The customer is replying to this exact previous message: "${ctx.replyToText}". Use that replied-to message as primary context when deciding what product or detail they mean.`
    );
  }

  if (recentReferenceImages.length > 0) {
    ctxHints.push(
      "The customer's message is a short follow-up like 'this' or 'how much'. Use the referenced product image(s) below as the primary context for identifying which product they mean."
    );
  }

  if (imageUrl || ctx.contextImageUrl || recentReferenceImages.length > 0) {
    const userParts: any[] = [];
    const textHint =
      (imageUrl
        ? "The customer sent an image. "
        : "The customer is asking about the image below (replied-to, ad creative, or recent referenced product image). ") +
      (ctxHints.length > 0 ? ctxHints.join(" ") + " " : "") +
      "Identify the product: describe the visible item briefly (type, brand if visible, color, material, category). " +
      "Then call search_products with the best keywords and/or category. " +
      "After results return, suggest up to 3 closest matches and ask the customer to confirm." +
      (mainContent && mainContent !== "[Image]" && !mainContent.startsWith("📷 ")
        ? `\n\nThe customer also wrote: "${mainContent}"`
        : "");
    userParts.push({ type: "text", text: textHint });
    if (imageUrl) {
      userParts.push({
        type: "image_url",
        image_url: { url: imageUrl, detail: "auto" },
      });
    }
    if (ctx.contextImageUrl) {
      userParts.push({
        type: "image_url",
        image_url: { url: ctx.contextImageUrl, detail: "auto" },
      });
    }
    for (const refUrl of recentReferenceImages) {
      userParts.push({
        type: "image_url",
        image_url: { url: refUrl, detail: "auto" },
      });
    }
    chatMessages.push({ role: "user", content: userParts });
  } else {
      const finalText =
      ctxHints.length > 0
          ? `${ctxHints.join(" ")}\n\nCustomer message: ${mainContent || customerMessage}`
          : mainContent || customerMessage;
    chatMessages.push({ role: "user", content: finalText });
  }

  const allTools = [
    ORDER_TOOL,
    CANCEL_ORDER_TOOL,
    UPDATE_ORDER_TOOL,
    CHECK_ORDER_STATUS_TOOL,
    SEND_PRODUCT_IMAGES_TOOL,
    SEARCH_PRODUCTS_TOOL,
    LIST_CATEGORIES_TOOL,
  ];

  // Support multiple rounds of tool calls (e.g. search_products -> send_product_images)
  // Reduced from 5 -> 3 rounds for latency. Most flows finish in 1-2 rounds; the
  // short-circuit below also removes the extra "compose text" round when the AI
  // only calls send_product_images.
  let currentMessages = [...chatMessages];
  const maxRounds = 3;
  const allImageesToSend: { url: string; caption: string }[] = [];

  try {
    for (let round = 0; round < maxRounds; round++) {
      const isFinalRound = round === maxRounds - 1;
      // On the final round, force a text-only response (no more tool calls)
      // Some newer OpenAI models (gpt-5.x, o1/o3, etc.) only support the
      // default temperature (1). Only send a custom temperature for models
      // that accept it, otherwise the gateway returns 400 and we fall back
      // to the canned "let me connect you with our team" message.
      const modelLower = String(aiModel || "").toLowerCase();
      const supportsCustomTemperature =
        !modelLower.startsWith("gpt-5") &&
        !modelLower.startsWith("o1") &&
        !modelLower.startsWith("o3") &&
        !modelLower.startsWith("o4");
      const requestBody: any = {
        model: aiModel,
        ...(supportsCustomTemperature ? { temperature: 0.3 } : {}),
        messages: isFinalRound
          ? [
              ...currentMessages,
              {
                role: "system",
                content:
                  "You have gathered enough information. Now respond to the customer in natural language. Do NOT call any more tools.",
              },
            ]
          : currentMessages,
      };
      if (!isFinalRound) {
        requestBody.tools = allTools;
        // Force product search on round 0 when an image is present so the AI
        // identifies the product from the catalog instead of guessing.
        const hasImageContext =
          !!imageUrl || !!ctx.contextImageUrl || recentReferenceImages.length > 0;
        if (round === 0 && hasImageContext) {
          requestBody.tool_choice = {
            type: "function",
            function: { name: "search_products" },
          };
        } else {
          requestBody.tool_choice = "auto";
        }
      }

      const response = await fetch(
        AI_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );


      if (response.status === 429 || response.status === 402) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          `OpenAI rate limited / quota exhausted (status ${response.status}): ${errBody}`
        );
        return emptyResult(
          aiSettings?.fallback_message ||
            "Thanks for your message! We'll get back to you shortly."
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        return emptyResult(
          aiSettings?.fallback_message ||
            "Thanks for your message! We'll get back to you shortly."
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      console.log(
        `AI response round ${round + 1} - finish_reason: ${
          choice?.finish_reason
        }, tool_calls: ${choice?.message?.tool_calls?.length || 0}`
      );

      // If no tool calls, return the text response
      if (!choice?.message?.tool_calls?.length) {
        const hasImages = allImageesToSend.length > 0;
        const text = sanitizeAIResponse(
          choice?.message?.content ||
            (hasImages ? "" : aiSettings?.fallback_message || "Thanks for your message!"),
          hasImages
        );
        if (isFallbackLikeResponse(text, aiSettings?.fallback_message)) {
          const retryPrompt =
            "Reply naturally as a store assistant in the customer's language. Do not say you are unsure, do not escalate to the team, and do not use fallback wording. If the customer asked for product photos, answer briefly and use send_product_images when you already have products from previous tool results.";

          currentMessages = [
            ...currentMessages,
            choice.message,
            { role: "system", content: retryPrompt },
          ];
          continue;
        }
        return { text, images: allImageesToSend };
      }

      // Process tool calls in parallel for lower latency
      const toolCalls = choice.message.tool_calls;
      const toolResults = await Promise.all(
        toolCalls.map(async (tc: any) => {
          const args =
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;

          let result: string;
          if (tc.function?.name === "create_order") {
            console.log("AI triggered create_order:", JSON.stringify(args));
            result = await executeCreateOrder(
              supabase,
              storeId,
              conversationId,
              platform,
              args
            );
          } else if (tc.function?.name === "cancel_order") {
            console.log("AI triggered cancel_order:", JSON.stringify(args));
            result = await executeCancelOrder(
              supabase,
              storeId,
              conversationId,
              args
            );
          } else if (tc.function?.name === "update_order") {
            // Server-side intent guard: prevent the model from misclassifying
            // intent or hallucinating fields the user didn't actually mention.
            const cancelRe = /(الغي|إلغاء|الغاء|كنسل|بطل|بطلت|ما بدي الطلب|ما عاد بدي|ما بقا بدي|تراجعت|cancel|abort|nevermind|changed my mind|don'?t want it|no longer want)/i;
            if (cancelRe.test(customerMessage || "")) {
              console.log(
                "Intent guard: cancel intent detected in latest message; redirecting update_order -> cancel_order"
              );
              result = await executeCancelOrder(
                supabase,
                storeId,
                conversationId,
                {}
              );
            } else {
              const addressRe = /(عنوان|مكان التوصيل|وصلولي|address|deliver to|location|street)/i;
              const phoneRe = /(رقمي|تلفوني|موبايل|هاتف|phone|mobile|number)/i;
              const nameRe = /(اسمي|my name|i am called|name is)/i;
              const sanitized: any = { ...args };
              if (sanitized.address && !addressRe.test(customerMessage || "")) {
                console.log("Intent guard: dropping address from update_order (not mentioned)");
                delete sanitized.address;
              }
              if (sanitized.phone && !phoneRe.test(customerMessage || "")) {
                console.log("Intent guard: dropping phone from update_order (not mentioned)");
                delete sanitized.phone;
              }
              if (sanitized.customer_name && !nameRe.test(customerMessage || "")) {
                console.log("Intent guard: dropping customer_name from update_order (not mentioned)");
                delete sanitized.customer_name;
              }
              const hasUpdate = Object.keys(sanitized).some(
                (k) => k !== "order_number" && sanitized[k] !== undefined
              );
              if (!hasUpdate) {
                console.log("Intent guard: update_order has no valid fields after sanitization");
                result = JSON.stringify({
                  success: false,
                  error: "Could not determine which field to update. Ask the customer to clarify what exactly they want to change.",
                });
              } else {
                console.log("AI triggered update_order:", JSON.stringify(sanitized));
                result = await executeUpdateOrder(
                  supabase,
                  storeId,
                  conversationId,
                  sanitized
                );
              }
            }
          } else if (tc.function?.name === "check_order_status") {
            console.log("AI triggered check_order_status:", JSON.stringify(args));
            result = await executeCheckOrderStatus(
              supabase,
              storeId,
              conversationId,
              args
            );
          } else if (tc.function?.name === "send_product_images") {
            console.log(
              "AI triggered send_product_images:",
              JSON.stringify(args)
            );
            for (const p of args.products || []) {
              if (p.image_url) {
                allImageesToSend.push({
                  url: p.image_url,
                  caption: p.caption || p.product_name || "",
                });
              }
            }
            result = JSON.stringify({
              success: true,
              images_queued: allImageesToSend.length,
            });
          } else if (tc.function?.name === "search_products") {
            console.log("AI triggered search_products:", JSON.stringify(args));
            result = await executeSearchProducts(supabase, storeId, args);
          } else if (tc.function?.name === "list_categories") {
            console.log("AI triggered list_categories");
            result = await executeListCategories(supabase, storeId);
          } else {
            result = JSON.stringify({ error: "Unknown tool" });
          }

          return {
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          };
        })
      );

      // Short-circuit: if AI ONLY called send_product_images and already provided
      // text content, skip the extra round to compose a follow-up message. The
      // image captions + assistant content are enough to reply.
      const onlySendImages =
        toolCalls.length > 0 &&
        toolCalls.every((tc: any) => tc.function?.name === "send_product_images");
      if (onlySendImages) {
        const existingText = sanitizeAIResponse(
          choice?.message?.content || "",
          true
        );
        if (existingText && existingText.trim().length > 0) {
          return { text: existingText, images: allImageesToSend };
        }
        // No text yet — nudge the model to write a brief one-line caption in the
        // customer's language instead of falling through to a generic greeting.
        currentMessages = [
          ...currentMessages,
          choice.message,
          ...toolResults,
          {
            role: "system",
            content:
              "You just queued product images. Now write ONE short sentence in the customer's language that introduces those images (e.g. 'تفضل الصور 👇' or 'Here you go 👇'). Do NOT greet the customer, do NOT say 'hi/hello/مرحبا', do NOT ask 'how can I help'. Do NOT call any more tools.",
          },
        ];
        continue;
      }

      // Add assistant message + tool results for the next round
      currentMessages = [...currentMessages, choice.message, ...toolResults];

      // Images are accumulated in allImageesToSend across rounds
      // Continue to next round to let AI compose a text response
    }

    // If we exhausted all rounds, return last content
    return {
      text: sanitizeAIResponse("Thanks for your message! How can I help you?"),
      images: allImageesToSend,
    };
  } catch (err) {
    console.error("AI generation error:", err);
    return emptyResult(
      aiSettings?.fallback_message ||
        "Thanks for your message! We'll get back to you shortly."
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const queryPlatform = url.searchParams.get("platform");

  // Facebook/Instagram/WhatsApp webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN =
      Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified for platform:", queryPlatform);
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST: incoming message webhook
  try {
    const bodyText = await req.text();

    // Verify Meta signature
    const isValid = await verifyMetaSignature(req, bodyText);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = JSON.parse(bodyText);

    // Auto-detect platform from payload
    const platform = detectPlatform(body, queryPlatform);
    console.log(
      `[${platform}] Webhook received (object: ${body?.object}):`,
      JSON.stringify(body).slice(0, 500)
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const messages: {
      platform: string;
      sender: string;
      text: string;
      platformId: string;
      timestamp: string;
      pageId?: string;
      platformMessageId?: string;
      displayName?: string;
      kind: "text" | "image";
      imageUrl?: string;
      mediaId?: string;
      // Context: image the customer is replying to (e.g. an ad creative or a previous message image)
      contextImageUrl?: string;
      // Platform message id (mid) of the message the customer replied to
      replyToMid?: string;
      // Context: Facebook ad referral info (when message originates from clicking an ad)
      adContext?: {
        adId?: string;
        adTitle?: string;
        adSourceUrl?: string;
        adImageUrl?: string;
        ref?: string;
      };
    }[] = [];

    if (platform === "facebook") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;

          // Facebook Ad referral context (CTM ads / m.me ad clicks)
          // Can appear at messaging.referral OR messaging.message.referral
          const ref = messaging.referral || messaging.message?.referral;
          let adContext: any = undefined;
          if (ref && (ref.ad_id || ref.source === "ADS" || ref.ref || ref.source_url)) {
            adContext = {
              adId: ref.ad_id,
              adTitle: ref.ads_context_data?.ad_title,
              adSourceUrl: ref.source_url,
              adImageUrl: cleanUrl(ref.ads_context_data?.photo_url),
              ref: ref.ref,
            };
          }

          // Reply-to context: customer replying to a specific message (could be an image)
          let contextImageUrl: string | undefined;
          let replyToMid: string | undefined;
          const replyTo = messaging.message?.reply_to;
          if (replyTo) {
            replyToMid = replyTo.mid || undefined;
            const replyImg = (replyTo.attachments || []).find(
              (a: any) => a?.type === "image"
            );
            if (replyImg) contextImageUrl = cleanUrl(replyImg?.payload?.url);
          }

          // A single Facebook payload can carry BOTH text AND attachments (e.g.
          // a photo with a caption). Emit each part as its own burst message so
          // the AI sees the image even when text is also present.
          const fbHasText = !!messaging.message?.text;
          const fbAttachments = messaging.message?.attachments || [];
          const fbImageAttachments = fbAttachments.filter(
            (a: any) => a?.type === "image"
          );
          const fbBaseTimestamp = messaging.timestamp || Date.now();
          const fbBaseMid = messaging.message?.mid;

          if (fbHasText) {
            messages.push({
              platform: "facebook",
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(fbBaseTimestamp).toISOString(),
              pageId,
              platformMessageId: fbBaseMid || undefined,
              kind: "text",
              contextImageUrl,
              replyToMid,
              adContext,
            });
          }

          if (fbImageAttachments.length > 0) {
            fbImageAttachments.forEach((imgAtt: any, idx: number) => {
              messages.push({
                platform: "facebook",
                sender: messaging.sender?.id || "unknown",
                text: "[Image]",
                platformId: messaging.sender?.id || "",
                // Bump timestamp by idx (and by +1ms when text exists) so the
                // image is ordered after the caption text in the burst.
                timestamp: new Date(
                  fbBaseTimestamp + (fbHasText ? 1 : 0) + idx
                ).toISOString(),
                pageId,
                platformMessageId: fbBaseMid
                  ? fbImageAttachments.length > 1 || fbHasText
                    ? `${fbBaseMid}:img${idx}`
                    : fbBaseMid
                  : undefined,
                kind: "image",
                imageUrl: cleanUrl(imgAtt?.payload?.url),
                contextImageUrl,
                replyToMid,
                adContext,
              });
            });
          } else if (!fbHasText && (adContext || contextImageUrl || replyToMid)) {
            // Pure referral / reply with no text — still create an entry so AI can react
            messages.push({
              platform: "facebook",
              sender: messaging.sender?.id || "unknown",
              text: adContext ? "[Started chat from ad]" : "[Reply]",
              platformId: messaging.sender?.id || "",
              timestamp: new Date(fbBaseTimestamp).toISOString(),
              pageId,
              platformMessageId: fbBaseMid || `ref-${Date.now()}`,
              kind: "text",
              contextImageUrl,
              replyToMid,
              adContext,
            });
          }
        }
      }
    } else if (platform === "instagram") {
      // Instagram DMs: entry.id is the Instagram Business Account ID (IGBA)
      // Messages arrive via entry.messaging[] similar to Facebook
      for (const entry of body.entry || []) {
        const igbaId = entry.id; // Instagram Business Account ID — matches stored page_id
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;

          let text: string = messaging.message?.text || "";
          let kind: "text" | "image" = "text";
          let imageUrl: string | undefined;
          let contextImageUrl: string | undefined;
          let replyToMid: string | undefined;
          let adContext: any = undefined;

          // Instagram Ad referral (CTM Instagram ads)
          const ref = messaging.referral || messaging.message?.referral;
          if (ref && (ref.ad_id || ref.source === "ADS" || ref.ref || ref.source_url)) {
            adContext = {
              adId: ref.ad_id,
              adTitle: ref.ads_context_data?.ad_title,
              adSourceUrl: ref.source_url,
              adImageUrl: cleanUrl(ref.ads_context_data?.photo_url),
              ref: ref.ref,
            };
          }

          // Reply-to context (customer replying to a story / image / post)
          const replyTo = messaging.message?.reply_to;
          if (replyTo) {
            replyToMid = replyTo.mid || undefined;
            const replyImg = (replyTo.attachments || []).find(
              (a: any) => a?.type === "image"
            );
            if (replyImg) contextImageUrl = cleanUrl(replyImg?.payload?.url);
            if (!contextImageUrl && replyTo.story?.url) {
              contextImageUrl = cleanUrl(replyTo.story.url);
            }
          }

          // Collect image attachments separately so we can emit them as their
          // own image-kind message even when text (caption) is also present.
          const igAttachments = messaging.message?.attachments || [];
          const igImageAttachments = igAttachments.filter(
            (a: any) => a?.type === "image"
          );

          // For non-image attachments with no text, fall back to a placeholder label
          if (!text && igAttachments.length > 0 && igImageAttachments.length === 0) {
            const att = igAttachments[0];
            if (att.type === "video") text = "[Video]";
            else if (att.type === "audio") text = "[Audio]";
            else if (att.type === "file") text = "[File]";
            else if (att.type === "sticker") text = "[Sticker]";
            else text = `[${att.type || "Attachment"}]`;
          }

          if (!text && replyTo && igImageAttachments.length === 0) text = "[Story Reply]";
          if (!text && adContext && igImageAttachments.length === 0) text = "[Started chat from ad]";

          if (!text && igImageAttachments.length === 0) continue;

          const igBaseTimestamp = messaging.timestamp || Date.now();
          const igBaseMid = messaging.message?.mid;

          // Emit text (caption / standalone) first
          if (text) {
            messages.push({
              platform: "instagram",
              sender: messaging.sender?.id || "unknown",
              text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(igBaseTimestamp).toISOString(),
              pageId: igbaId,
              platformMessageId: igBaseMid || undefined,
              kind: "text",
              contextImageUrl,
              replyToMid,
              adContext,
            });
          }

          // Then emit each image attachment as its own image-kind entry
          igImageAttachments.forEach((att: any, idx: number) => {
            messages.push({
              platform: "instagram",
              sender: messaging.sender?.id || "unknown",
              text: "[Image]",
              platformId: messaging.sender?.id || "",
              timestamp: new Date(
                igBaseTimestamp + (text ? 1 : 0) + idx
              ).toISOString(),
              pageId: igbaId,
              platformMessageId: igBaseMid
                ? igImageAttachments.length > 1 || text
                  ? `${igBaseMid}:img${idx}`
                  : igBaseMid
                : undefined,
              kind: "image",
              imageUrl: cleanUrl(att?.payload?.url),
              contextImageUrl,
              replyToMid,
              adContext,
            });
          });
        }
        // Also handle Instagram changes-based format (some API versions)
        for (const change of entry.changes || []) {
          if (change.field === "messages" && change.value?.message) {
            const val = change.value;
            let text: string = val.message?.text || "";
            let kind: "text" | "image" = "text";
            let imageUrl: string | undefined;

            if (!text && val.message?.attachments?.length > 0) {
              const att = val.message.attachments[0];
              if (att.type === "image") {
                text = "[Image]";
                kind = "image";
                imageUrl = cleanUrl(att?.payload?.url);
              } else {
                text = att.type
                  ? `[${att.type.charAt(0).toUpperCase() + att.type.slice(1)}]`
                  : "[Attachment]";
              }
            }

            if (!text) continue;

            messages.push({
              platform: "instagram",
              sender: val.sender?.id || "unknown",
              text,
              platformId: val.sender?.id || "",
              timestamp: new Date(val.timestamp || Date.now()).toISOString(),
              pageId: igbaId,
              platformMessageId: val.message?.mid || undefined,
              kind,
              imageUrl,
            });
          }
        }
      }
    } else if (platform === "whatsapp") {
      for (const entry of body.entry || []) {
        const phoneNumberId =
          entry.changes?.[0]?.value?.metadata?.phone_number_id;
        for (const change of entry.changes || []) {
          const waDisplayName =
            change.value?.contacts?.[0]?.profile?.name ||
            change.value?.contacts?.[0]?.wa_id ||
            null;
          if (change.value?.messages) {
            for (const msg of change.value.messages) {
              if (msg.type === "text") {
                messages.push({
                  platform: "whatsapp",
                  sender: msg.from || "unknown",
                  text: msg.text?.body || "",
                  platformId: msg.from || "",
                  timestamp: new Date(
                    parseInt(msg.timestamp || "0") * 1000
                  ).toISOString(),
                  pageId: phoneNumberId,
                  platformMessageId: msg.id || undefined,
                  displayName: waDisplayName || undefined,
                  kind: "text",
                });
              } else if (msg.type === "image") {
                messages.push({
                  platform: "whatsapp",
                  sender: msg.from || "unknown",
                  text: "[Image]",
                  platformId: msg.from || "",
                  timestamp: new Date(
                    parseInt(msg.timestamp || "0") * 1000
                  ).toISOString(),
                  pageId: phoneNumberId,
                  platformMessageId: msg.id || undefined,
                  displayName: waDisplayName || undefined,
                  kind: "image",
                  mediaId: msg.image?.id || undefined,
                });
              }
            }
          }
        }
      }
    }

    messages.sort(compareIncomingMessages);

    console.log(`[${platform}] Parsed ${messages.length} message(s)`);

    // Process each incoming message
    for (const [msgIndex, msg] of messages.entries()) {
      // Find store + connection by page_id
      let storeId: string | null = null;
      let pageAccessToken: string | null = null;
      let connectionPageId: string | null = null;
      let connectionId: string | null = null;

      if (msg.pageId) {
        const { data: directConns, error: directConnError } = await supabase
          .from("platform_connections")
          .select("id, store_id, credentials, page_id, platform")
          .eq("platform", msg.platform as any)
          .eq("page_id", msg.pageId)
          .eq("status", "connected")
          .limit(2);

        if (directConnError) {
          console.error(
            `[${platform}] Failed to look up connection for page ${msg.pageId}:`,
            directConnError
          );
          continue;
        }

        if ((directConns?.length || 0) === 1) {
          const conn = directConns![0];
          connectionId = conn.id;
          storeId = conn.store_id;
          pageAccessToken =
            (conn.credentials as any)?.page_access_token || null;
          connectionPageId = conn.page_id;
          console.log(
            `[${platform}] Found connection for page ${msg.pageId} (platform: ${conn.platform}), store: ${storeId}`
          );
        } else if ((directConns?.length || 0) > 1) {
          console.error(
            `[${platform}] Multiple connected stores found for page ${msg.pageId}. Ignoring message to prevent cross-store routing.`
          );
          continue;
        } else if (platform === "instagram") {
          // Instagram webhooks may use either IG business account ID or the linked Facebook page ID.
          const { data: igConns, error: igConnError } = await supabase
            .from("platform_connections")
            .select("id, store_id, credentials, page_id, platform")
            .eq("platform", "instagram")
            .eq("status", "connected");

          if (igConnError) {
            console.error(
              `[${platform}] Failed Instagram fallback lookup for page ${msg.pageId}:`,
              igConnError
            );
            continue;
          }

          const matchingIgConns = (igConns || []).filter((c) => {
            const creds = c.credentials as any;
            return (
              creds?.facebook_page_id === msg.pageId ||
              creds?.instagram_business_account_id === msg.pageId ||
              c.page_id === msg.pageId
            );
          });

          if (matchingIgConns.length === 1) {
            const igConn = matchingIgConns[0];
            connectionId = igConn.id;
            storeId = igConn.store_id;
            pageAccessToken =
              (igConn.credentials as any)?.page_access_token || null;
            connectionPageId = igConn.page_id;
            console.log(
              `[${platform}] Found Instagram connection via fallback lookup, store: ${storeId}`
            );
          } else if (matchingIgConns.length > 1) {
            console.error(
              `[${platform}] Multiple Instagram stores matched page ${msg.pageId}. Ignoring message to prevent cross-store routing.`
            );
            continue;
          } else {
            console.warn(
              `[${platform}] No connected page found for page_id: ${msg.pageId}`
            );
          }
        } else {
          console.warn(
            `[${platform}] No connected page found for page_id: ${msg.pageId}`
          );
        }
      }

      if (!storeId) {
        console.warn(
          `[${platform}] Ignoring incoming message for unconnected page ${
            msg.pageId || "unknown"
          }`
        );
        continue;
      }

      // Find or create conversation within the resolved store only
      const { data: existingConversations, error: conversationLookupError } =
        await supabase
          .from("conversations")
          .select("*")
          .eq("store_id", storeId)
          .eq("platform_conversation_id", msg.platformId)
          .eq("platform", msg.platform)
          .order("created_at", { ascending: false })
          .limit(5);

      if (conversationLookupError) {
        console.error(
          `[${platform}] Error looking up conversation for store ${storeId}:`,
          conversationLookupError
        );
        continue;
      }

      let conversation =
        (existingConversations || []).find(
          (c: any) => msg.pageId && c.page_id === msg.pageId
        ) ||
        (existingConversations || []).find((c: any) => !c.page_id) ||
        (existingConversations || [])[0];

      if (!conversation) {
        const displayName =
          msg.displayName ||
          (msg.platform === "whatsapp" && msg.sender && msg.sender !== "unknown"
            ? msg.sender
            : null) ||
          (await fetchMetaDisplayName(
            msg.platform,
            msg.sender,
            pageAccessToken
          )) ||
          `Customer ${msg.platformId.slice(-4)}`;

        const { data: newConvo, error: convoErr } = await supabase
          .from("conversations")
          .insert({
            store_id: storeId,
            platform: msg.platform as any,
            platform_conversation_id: msg.platformId,
            customer_name: displayName,
            customer_phone: msg.platform === "whatsapp" ? msg.sender : null,
            last_message: msg.text,
            last_message_time: msg.timestamp,
            status: "open",
            unread: true,
            page_id: msg.pageId || "",
          })
          .select()
          .single();
        if (convoErr) {
          console.error("Error creating conversation:", convoErr);
          continue;
        }
        conversation = newConvo;
      } else {
        // Update page_id if missing, and improve placeholder customer_name if we can
        const updateData: any = {
          last_message: msg.text,
          last_message_time: msg.timestamp,
          unread: true,
        };
        if (msg.pageId && !conversation.page_id) {
          updateData.page_id = msg.pageId;
        }

        const currentName = (conversation.customer_name || "")
          .toString()
          .trim();
        const looksLikePlaceholder =
          currentName.length === 0 ||
          /^Customer\s+\w{1,10}$/i.test(currentName) ||
          currentName.toLowerCase() === "unknown";

        if (looksLikePlaceholder) {
          const betterName =
            msg.displayName ||
            (msg.platform === "whatsapp" &&
            msg.sender &&
            msg.sender !== "unknown"
              ? msg.sender
              : null) ||
            (await fetchMetaDisplayName(
              msg.platform,
              msg.sender,
              pageAccessToken
            ));
          if (betterName) updateData.customer_name = betterName;
        }

        await supabase
          .from("conversations")
          .update(updateData)
          .eq("id", conversation.id);
      }

      if (!conversation) continue;

      // Store customer message (idempotent) — compute ID early (used for storage path too)
      const inferredPlatformMessageId = msg.platformMessageId
        ? `${msg.platform}:${msg.platformMessageId}`
        : `${msg.platform}:fallback:${await stableId(
            JSON.stringify({
              platform: msg.platform,
              sender: msg.sender,
              platformId: msg.platformId,
              pageId: msg.pageId || "",
              timestamp: msg.timestamp,
              kind: msg.kind || "text",
              text: msg.text,
              mediaId: msg.mediaId || "",
              imageUrl: msg.imageUrl || "",
            })
          )}`;

      const { data: alreadySeen, error: seenErr } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("platform_message_id", inferredPlatformMessageId)
        .maybeSingle();

      if (seenErr) {
        console.error(`[${platform}] Failed dedupe lookup:`, seenErr);
        continue;
      }

      if (alreadySeen?.id) {
        console.log(
          `[${platform}] Duplicate webhook delivery ignored: ${inferredPlatformMessageId}`
        );
        continue;
      }

      // Prepare content to store + use for AI
      let storedContent = msg.text;
      if (msg.kind === "image") {
        let publicUrl: string | null = null;
        const safeId = safeStorageId(inferredPlatformMessageId);

        // Prefer re-hosting to Supabase Storage for reliable AI access
        if (msg.imageUrl) {
          const downloaded = await downloadBytes(msg.imageUrl);
          if (downloaded) {
            const ext = fileExtFromContentType(downloaded.contentType);
            const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
            publicUrl = await uploadToStoreAssets(
              supabase,
              filePath,
              downloaded.bytes,
              downloaded.contentType
            );
          }
        } else if (msg.mediaId && pageAccessToken) {
          const wa = await fetchWhatsAppMediaUrl(msg.mediaId, pageAccessToken);
          if (wa?.url) {
            const downloaded = await downloadBytes(wa.url, {
              Authorization: `Bearer ${pageAccessToken}`,
            });
            if (downloaded) {
              const ext = fileExtFromContentType(
                wa.mime_type || downloaded.contentType
              );
              const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
              publicUrl = await uploadToStoreAssets(
                supabase,
                filePath,
                downloaded.bytes,
                wa.mime_type || downloaded.contentType
              );
            }
          }
        }

        if (publicUrl) {
          storedContent = `📷 ${publicUrl}`;
        } else {
          storedContent = "[Image]";
        }
      }

      // ─── Extra context: replied-to image OR Facebook/Instagram ad referral ───
      // Re-host so the AI vision pipeline can fetch them reliably.
      let contextImagePublicUrl: string | null = null;
      let resolvedReplyText: string | null = null;
      let resolvedReplyImageUrl: string | null = null;

      // If customer replied to a previous message (Meta only sends mid, not the content),
      // look it up in our DB and pull its image / text for context.
      if (msg.replyToMid) {
        try {
          const lookupId = `${msg.platform}:${msg.replyToMid}`;
          const { data: original } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", conversation.id)
            .eq("platform_message_id", lookupId)
            .maybeSingle();
          if (original?.content) {
            const visible = String(original.content).split("\n\n[CTX]")[0];
            if (visible.startsWith("📷 ")) {
              resolvedReplyImageUrl = visible.replace("📷 ", "").trim();
            } else {
              resolvedReplyText = visible.slice(0, 200);
            }
            // Also check if the original had its own context_image attached
            if (!resolvedReplyImageUrl) {
              const ctxMatch = String(original.content).match(
                /context_image=(\S+)/
              );
              if (ctxMatch) resolvedReplyImageUrl = ctxMatch[1];
            }
          }
        } catch (e) {
          console.error(`[${platform}] Reply-to lookup failed:`, e);
        }
      }

      const candidateContextUrl =
        msg.contextImageUrl || resolvedReplyImageUrl || msg.adContext?.adImageUrl;
      if (candidateContextUrl) {
        // If it's already a hosted store-assets URL (from our DB lookup), reuse it.
        if (
          resolvedReplyImageUrl &&
          candidateContextUrl === resolvedReplyImageUrl &&
          /\/storage\/v1\/object\/public\/store-assets\//.test(
            candidateContextUrl
          )
        ) {
          contextImagePublicUrl = candidateContextUrl;
        } else {
          try {
            const safeId = safeStorageId(inferredPlatformMessageId) + "-ctx";
            const downloaded = await downloadBytes(candidateContextUrl);
            if (downloaded) {
              const ext = fileExtFromContentType(downloaded.contentType);
              const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
              contextImagePublicUrl = await uploadToStoreAssets(
                supabase,
                filePath,
                downloaded.bytes,
                downloaded.contentType
              );
            }
          } catch (e) {
            console.error(`[${platform}] Failed to rehost context image:`, e);
          }
        }
      }

      // Append a hidden context block parsed by generateAIReply() and the inbox UI.
      const ctxParts: string[] = [];
      if (contextImagePublicUrl)
        ctxParts.push(`context_image=${contextImagePublicUrl}`);
      if (msg.replyToMid)
        ctxParts.push(`reply_to_mid=${msg.platform}:${msg.replyToMid}`);
      if (resolvedReplyText)
        ctxParts.push(
          `reply_to_text=${resolvedReplyText.replace(/[|\n\r]/g, " ")}`
        );
      if (msg.adContext?.adTitle)
        ctxParts.push(`ad_title=${msg.adContext.adTitle}`);
      if (msg.adContext?.adId) ctxParts.push(`ad_id=${msg.adContext.adId}`);
      if (msg.adContext?.adSourceUrl)
        ctxParts.push(`ad_url=${msg.adContext.adSourceUrl}`);
      if (ctxParts.length > 0) {
        storedContent = `${storedContent}\n\n[CTX] ${ctxParts.join(" | ")}`;
      }

      const { data: insertedMsg, error: insertCustomerErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender: "customer",
          content: storedContent,
          created_at: msg.timestamp,
          platform_message_id: inferredPlatformMessageId,
        })
        .select("id, created_at")
        .single();

      if (insertCustomerErr) {
        console.error(
          `[${platform}] Failed to insert customer message:`,
          insertCustomerErr
        );
        continue;
      }

      if (hasLaterMessageInSameConversation(messages, msgIndex)) {
        console.log(
          `[${platform}] Deferring AI reply for ${msg.sender}; a later message in the same burst is still being processed.`
        );
        continue;
      }

      // Ensure conversation list reflects images (not just "[Image]")
      await supabase
        .from("conversations")
        .update({
          last_message: msg.kind === "image" ? storedContent : msg.text,
          last_message_time: msg.timestamp,
          unread: true,
        })
        .eq("id", conversation.id);

      // ─── AI Auto-Reply ───
      const [storeRes, catalogRes, aiSettingsRes, historyRes, ordersRes] =
        await Promise.all([
          supabase.from("stores").select("*").eq("id", storeId).single(),
          supabase
            .from("products")
            .select("category, price")
            .eq("store_id", storeId)
            .eq("active", true),
          supabase
            .from("ai_settings")
            .select("*")
            .eq("store_id", storeId)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("sender, content, created_at")
            .eq("conversation_id", conversation.id)
            .order("created_at", { ascending: true })
            .limit(20),
          supabase
            .from("orders")
            .select(
              "order_number, status, customer_name, items, total, phone, address, notes"
            )
            .eq("conversation_id", conversation.id)
            .in("status", ["pending", "confirmed", "processing"])
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      const storeInfo = storeRes.data;
      const aiSettings = aiSettingsRes.data;
      const history = historyRes.data || [];
      const existingOrders = ordersRes.data || [];
      const initialBurstDepth = collectPendingCustomerBurst(history).length;

      // Build lightweight catalog summary (categories + counts) instead of full product list
      const catalogProducts = catalogRes.data || [];
      const catMap: Record<
        string,
        { count: number; min: number; max: number }
      > = {};
      for (const p of catalogProducts) {
        const cat = p.category || "General";
        if (!catMap[cat])
          catMap[cat] = { count: 0, min: p.price, max: p.price };
        catMap[cat].count++;
        catMap[cat].min = Math.min(catMap[cat].min, p.price);
        catMap[cat].max = Math.max(catMap[cat].max, p.price);
      }
      const catalogSummary =
        catalogProducts.length === 0
          ? "No products available yet."
          : `Total products: ${
              catalogProducts.length
            }\nCategories:\n${Object.entries(catMap)
              .map(
                ([cat, info]) =>
                  `- ${cat}: ${info.count} products (${info.min} - ${info.max})`
              )
              .join(
                "\n"
              )}\n\nIMPORTANT: Use search_products tool to get specific product details. Do NOT guess product names or prices.`;

      if (aiSettings?.auto_reply === false) {
        console.log("Auto-reply disabled for store:", storeId);
        continue;
      }

      // Check per-conversation AI auto-reply toggle
      if (conversation.ai_auto_reply === false) {
        console.log(
          "AI auto-reply disabled for conversation:",
          conversation.id
        );
        continue;
      }

      // ─── Per-customer ROLLING collection window ───
      // When the FIRST unanswered message arrives we start a window. Each new
      // customer message that lands during the window RESETS the timer. After
      // N seconds of silence we process the whole batch as ONE reply.
      // Window duration is configurable per store via ai_settings (3-10s, default 5).
      const configuredWindowSec = Math.min(
        10,
        Math.max(3, Number(aiSettings?.collection_window_seconds) || 5)
      );
      const QUIET_MS = configuredWindowSec * 1000;
      // Meta sometimes delivers webhooks for a single customer burst out of
      // order; keep a small extra grace for FB/IG so reply-attachments aren't
      // missed, but never less than the configured quiet window.
      const DELIVERY_GRACE_MS =
        platform === "facebook" || platform === "instagram"
          ? Math.max(QUIET_MS, 6000)
          : QUIET_MS;
      const MAX_TOTAL_WAIT_MS = 60000;
      const POLL_MS = 400;
      const myMsgId = insertedMsg?.id;
      const myReceivedAtMs = Date.now();

      // Find the earliest unanswered customer message in this conversation.
      // "Unanswered" = created after the last AI message (or all of them if none).
      const { data: lastAiBefore } = await supabase
        .from("messages")
        .select("created_at")
        .eq("conversation_id", conversation.id)
        .eq("sender", "ai")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let earliestQuery = supabase
        .from("messages")
        .select("id, created_at")
        .eq("conversation_id", conversation.id)
        .eq("sender", "customer")
        .order("created_at", { ascending: true })
        .limit(1);
      if (lastAiBefore?.created_at) {
        earliestQuery = earliestQuery.gt("created_at", lastAiBefore.created_at);
      }
      const { data: earliestUnansweredArr } = await earliestQuery;
      const earliestUnanswered = earliestUnansweredArr?.[0];

      // Only the worker that owns the earliest unanswered message handles the
      // window. Later messages' workers yield immediately — their content will
      // simply extend the active worker's rolling timer via DB polling.
      if (!earliestUnanswered?.id || earliestUnanswered.id !== myMsgId) {
        console.log(
          `[${platform}] Not the earliest unanswered worker (earliest=${earliestUnanswered?.id}, mine=${myMsgId}) — yielding to active batcher.`
        );
        continue;
      }

      // Track the latest customer message timestamp we've seen; the rolling
      // window expires QUIET_MS after this value, and we extend it whenever a
      // new customer message lands.
      let latestCustomerMs = earliestUnanswered.created_at
        ? new Date(earliestUnanswered.created_at).getTime()
        : myReceivedAtMs;
      let windowEndsAt = latestCustomerMs + Math.max(QUIET_MS, DELIVERY_GRACE_MS);

      let shouldProceed = true;
      const startedAt = Date.now();

      // ─── Burst Abuse Guard (Fix 1) ───
      // If the customer sends more than `burst_guard_max_messages` within the
      // current quiet window we STOP resetting the timer and process what's
      // collected. Prevents spammers / accidental loops from holding the
      // batch open forever.
      const burstGuardEnabled = aiSettings?.burst_guard_enabled !== false;
      const burstMax = Math.max(3, Number(aiSettings?.burst_guard_max_messages) || 10);
      let burstCount = 1;
      let highVolumeFlagged = false;

      // Best-effort: show typing bubble while we batch.
      if (pageAccessToken) {
        sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "mark_seen");
        sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "typing_on");
      }

      while (Date.now() < windowEndsAt && Date.now() - startedAt < MAX_TOTAL_WAIT_MS) {
        // 1) Bail if another worker already replied for this burst.
        const { data: latestAi } = await supabase
          .from("messages")
          .select("id, created_at")
          .eq("conversation_id", conversation.id)
          .eq("sender", "ai")
          .gte(
            "created_at",
            new Date(latestCustomerMs - 1000).toISOString()
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestAi?.id) {
          shouldProceed = false;
          console.log(
            `[${platform}] AI reply already sent for this burst; skipping duplicate response.`
          );
          break;
        }

        // 2) Check for newer customer messages — they extend (reset) the window
        //    UNLESS the burst guard has tripped, in which case we stop extending.
        const { data: newerCustomer } = await supabase
          .from("messages")
          .select("created_at")
          .eq("conversation_id", conversation.id)
          .eq("sender", "customer")
          .gt("created_at", new Date(latestCustomerMs).toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newerCustomer?.created_at) {
          // Count total customer messages since the earliest unanswered one.
          const { count: totalCustomerSince } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversation.id)
            .eq("sender", "customer")
            .gte("created_at", new Date(earliestUnanswered.created_at!).toISOString());
          burstCount = Math.max(burstCount, totalCustomerSince || burstCount);

          if (burstGuardEnabled && burstCount > burstMax) {
            highVolumeFlagged = true;
            console.warn(
              `[${platform}] Burst guard tripped (${burstCount} messages in window) — flushing reply, no more timer resets.`
            );
            // Do NOT reset windowEndsAt; let the loop exit naturally.
            latestCustomerMs = new Date(newerCustomer.created_at).getTime();
          } else {
            const newerMs = new Date(newerCustomer.created_at).getTime();
            if (newerMs > latestCustomerMs) {
              latestCustomerMs = newerMs;
              windowEndsAt = latestCustomerMs + QUIET_MS;
              console.log(
                `[${platform}] Rolling window reset — new customer message at ${new Date(newerMs).toISOString()}, waiting another ${QUIET_MS}ms of silence.`
              );
              if (pageAccessToken) {
                sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "typing_on");
              }
            }
          }
        }

        const remaining = windowEndsAt - Date.now();
        if (remaining <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(POLL_MS, remaining)));
      }

      if (!shouldProceed) continue;


      // Re-fetch conversation history after debounce to include all batched messages
      const { data: freshHistory } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(20);

      // Combine the latest consecutive customer messages into one prompt.
      const allHistory = freshHistory || history;
      const pendingBurst = collectPendingCustomerBurst(allHistory);
      const burstInput = extractBurstInput(pendingBurst);
      const combinedCustomerMessage =
        burstInput.combinedText ||
        pendingBurst
          .map((entry) => stripMessageContext(entry.content))
          .filter((entry) => entry && entry.trim().length > 0)
          .join("\n");

      // ─── Fix 8: Per-message language auto-detection ───
      const autoLangEnabled = aiSettings?.auto_language_detect_enabled !== false;
      const detectedLang = autoLangEnabled ? detectLanguage(combinedCustomerMessage) : undefined;

      // ─── Fix 9: Out-of-hours awareness ───
      const ooHoursEnabled = aiSettings?.out_of_hours_enabled !== false;
      const { isOpen: storeOpen, hasSchedule } = isStoreOpenNow(storeInfo?.working_hours);
      const isOutsideHours = ooHoursEnabled && hasSchedule && !storeOpen;

      // Build runtime hint block injected into the AI system prompt
      const runtimeHints: string[] = [];
      if (detectedLang) {
        runtimeHints.push(
          detectedLang === "ar"
            ? "RUNTIME LANGUAGE: The customer is writing in Arabic. You MUST reply in Arabic for this turn, regardless of the store's default language. If the customer switches language mid-conversation, follow the switch from the next reply."
            : "RUNTIME LANGUAGE: The customer is writing in English. You MUST reply in English for this turn, regardless of the store's default language. If the customer switches language mid-conversation, follow the switch from the next reply."
        );
      }
      if (isOutsideHours) {
        const ooMsg =
          detectedLang === "ar"
            ? aiSettings?.out_of_hours_message_ar || "متجرنا مغلق حالياً، لكن يمكنني تسجيل طلبك وسنؤكده فور فتح المتجر صباحاً."
            : aiSettings?.out_of_hours_message_en || "We're currently closed but I can still take your order and confirm it first thing tomorrow.";
        runtimeHints.push(
          `RUNTIME OUT-OF-HOURS: The store is currently CLOSED based on its working hours. You MUST acknowledge this at the START of your reply using a phrase like: "${ooMsg}". You may still take orders, but never claim the store is open right now. Any order created during off-hours will be flagged as pending_confirmation for a human to review at opening.`
        );
      }
      if (highVolumeFlagged) {
        runtimeHints.push(
          "RUNTIME HIGH-VOLUME: The customer just sent a very high burst of messages. Be calm, brief, and ask them to slow down so you can help properly."
        );
      }

      // ─── Phase 2 Fix 2: Emotion & urgency detection ───
      const emotionEnabled = aiSettings?.emotion_detection_enabled !== false;
      const detectedEmotion = emotionEnabled ? detectEmotion(combinedCustomerMessage) : "neutral";
      const abuseEscalateEnabled = aiSettings?.abuse_auto_escalate_enabled !== false;
      const shouldAutoEscalate = abuseEscalateEnabled && detectedEmotion === "abusive";

      if (emotionEnabled) {
        if (detectedEmotion === "frustrated") {
          runtimeHints.push(
            "RUNTIME EMOTION (frustrated): The customer sounds frustrated or impatient. Open with a brief, sincere acknowledgment of how they feel BEFORE answering. Be warm, concise, solution-focused. Do NOT be defensive."
          );
        } else if (detectedEmotion === "urgent") {
          runtimeHints.push(
            "RUNTIME EMOTION (urgent): The customer is in a hurry. Skip pleasantries, give the answer in 1-2 short sentences, and offer to place the order immediately."
          );
        } else if (detectedEmotion === "abusive") {
          runtimeHints.push(
            "RUNTIME EMOTION (abusive): The customer used insulting or hostile language. Reply ONCE, calmly and politely, telling them a human teammate will follow up. Do NOT engage further. Do NOT match the tone. Keep it under 25 words."
          );
        } else if (detectedEmotion === "happy") {
          runtimeHints.push(
            "RUNTIME EMOTION (happy): The customer is in a good mood. Match the warmth briefly, then keep moving the sale forward."
          );
        }
      }

      // ─── Phase 2 Fix 3: Image confidence threshold ───
      const imgThreshold = aiSettings?.image_confidence_threshold ?? 65;
      const burstHasImage = pendingBurst.some((entry: any) =>
        typeof entry.content === "string" &&
        (entry.content.includes("📷 ") || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(entry.content))
      );
      if (burstHasImage) {
        runtimeHints.push(
          `RUNTIME IMAGE: The customer sent an image. Internally rate your confidence (0-100) that you can identify the product from the catalog. If your confidence is BELOW ${imgThreshold}%, do NOT guess — politely ask for a clearer photo, the brand/model, or which specific item they mean. If your confidence is at or above ${imgThreshold}%, hedge with phrases like "this looks like our [Product Name]" rather than asserting it as fact.`
        );
      }

      // ─── Phase 2 Fix 7: Proactive upsell ───
      const upsellEnabled = aiSettings?.upsell_enabled !== false;
      if (upsellEnabled && detectedEmotion !== "abusive" && detectedEmotion !== "frustrated") {
        runtimeHints.push(
          "RUNTIME UPSELL: When the customer shows clear interest in a specific product, you MAY suggest ONE genuinely complementary item or a higher-value option — at most once per conversation. Never push, never invent products, never offer discounts you don't have."
        );
      }

      const enrichedStoreInfo = runtimeHints.length
        ? { ...storeInfo, _runtime_hint: `\nRUNTIME CONTEXT (must obey for THIS reply only):\n- ${runtimeHints.join("\n- ")}\n` }
        : storeInfo;

      const isCancelRequest = looksLikeCancelOrderRequest(combinedCustomerMessage);
      const cancellableOrders = (existingOrders || []).filter((order: any) =>
        ["pending", "confirmed", "processing"].includes(order?.status)
      );
      const aiResult = isCancelRequest && cancellableOrders.length > 0
        ? {
            text: buildCancelOrderReply(
              await executeCancelOrder(supabase, storeId, conversation.id, {}),
              combinedCustomerMessage
            ),
            images: [],
          }
        : await generateAIReply(
            combinedCustomerMessage,
            enrichedStoreInfo,
            catalogSummary,
            { ...aiSettings, _is_outside_hours: isOutsideHours },
            allHistory,
            supabase,
            storeId,
            conversation.id,
            msg.platform,
            existingOrders
          );

      // Lightly personalize: prepend customer first name on the first chunk
      // when the AI didn't already greet them by name. Keeps tone human.
      const customerFirstName = (() => {
        const raw = (conversation.customer_name || "").trim();
        if (!raw) return "";
        const first = raw.split(/\s+/)[0];
        if (!first || first.length < 2) return "";
        if (/^Customer\s*$/i.test(first) || first.toLowerCase() === "unknown") return "";
        return first;
      })();

      let personalizedReply = (aiResult.text || "").trim();
      if (
        customerFirstName &&
        personalizedReply &&
        !new RegExp(`\\b${customerFirstName}\\b`, "i").test(personalizedReply.slice(0, 80))
      ) {
        // Only prepend on the first reply in a conversation, or roughly every
        // ~6 messages, so we don't spam the name on every turn.
        const aiCount = (allHistory || []).filter((m: any) => m.sender === "ai").length;
        if (aiCount === 0 || aiCount % 6 === 0) {
          personalizedReply = `${customerFirstName}, ${personalizedReply.charAt(0).toLowerCase()}${personalizedReply.slice(1)}`;
        }
      }

      // Split long replies into 2-3 short chunks for a more human cadence.
      const replyChunks = splitReplyIntoChunks(personalizedReply, 3);
      const finalCombinedReply = replyChunks.join("\n\n") || personalizedReply;

      const { data: insertedAiText, error: insertedAiTextError } = await supabase
        .from("messages")
        .insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: finalCombinedReply,
        platform_message_id: null,
      })
        .select("id")
        .maybeSingle();

      if (insertedAiTextError) {
        console.error(`[${platform}] Failed to store AI text message:`, insertedAiTextError);
      }

      // ─── Phase 2: handoff context pack & escalation ───
      let handoffSummary: string | null = null;
      let escalationReason: string | null = null;
      if (shouldAutoEscalate) {
        escalationReason = "Abusive language detected";
        handoffSummary = buildHandoffSummary({
          customerName: conversation.customer_name,
          platform: msg.platform,
          history: allHistory,
          existingOrders: existingOrders || [],
          reason: escalationReason,
          detectedLang,
        });
      }

      // ─── Phase 2: lazy quality score recompute ───
      let qualityScore: number | null = null;
      let qualityBreakdown: any = null;
      const qualityEnabled = aiSettings?.quality_score_enabled !== false;
      if (qualityEnabled) {
        // Find emotion at start (first customer msg) by reusing detector
        const firstCustomer = (allHistory || []).find((m: any) => m.sender === "customer");
        const emotionStart = firstCustomer ? detectEmotion(firstCustomer.content) : "neutral";
        // Average reply ms between consecutive (customer → ai) pairs
        let totalMs = 0; let pairs = 0; let prev: any = null;
        for (const m of allHistory || []) {
          if (prev && prev.sender === "customer" && m.sender === "ai") {
            totalMs += new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
            pairs++;
          }
          prev = m;
        }
        const avgReplyMs = pairs ? totalMs / pairs : 0;
        const q = computeQualityScore({
          history: allHistory,
          emotionStart,
          emotionEnd: detectedEmotion,
          ordersCount: (existingOrders || []).length,
          escalated: shouldAutoEscalate || conversation.escalated || false,
          avgReplyMs,
        });
        qualityScore = q.score;
        qualityBreakdown = q.breakdown;
      }

      const convoUpdate: any = {
        last_message: finalCombinedReply,
        last_message_time: new Date().toISOString(),
        last_customer_activity_at: new Date().toISOString(),
        current_emotion: detectedEmotion,
      };
      if (qualityScore !== null) {
        convoUpdate.quality_score = qualityScore;
        convoUpdate.quality_breakdown = qualityBreakdown;
      }
      if (shouldAutoEscalate) {
        convoUpdate.escalated = true;
        convoUpdate.escalated_at = new Date().toISOString();
        convoUpdate.escalation_reason = escalationReason;
        convoUpdate.handoff_summary = handoffSummary;
        convoUpdate.ai_auto_reply = false; // pause AI after handoff
      }

      await supabase
        .from("conversations")
        .update(convoUpdate)
        .eq("id", conversation.id);

      // Notify owner of escalation
      if (shouldAutoEscalate) {
        try {
          const { data: storeRow } = await supabase
            .from("stores").select("user_id, name").eq("id", storeId).maybeSingle();
          if (storeRow?.user_id) {
            await supabase.from("notifications").insert({
              user_id: storeRow.user_id,
              type: "escalation",
              title: `Conversation needs you — ${conversation.customer_name || "Customer"}`,
              description: escalationReason || "Human handoff requested",
            });
          }
        } catch (notifyErr) {
          console.warn(`[${platform}] Failed to write escalation notification:`, notifyErr);
        }
      }

      // Write the admin-visible batch log (best-effort, never blocks reply).
      try {
        await supabase.from("ai_message_batch_log").insert({
          store_id: storeId,
          conversation_id: conversation.id,
          platform: msg.platform,
          customer_messages: pendingBurst.map((entry: any) => ({
            content: entry.content,
            created_at: entry.created_at,
          })),
          ai_reply: finalCombinedReply,
          image_count: pendingBurst.filter((entry: any) =>
            typeof entry.content === "string" &&
            (entry.content.includes("📷 ") || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(entry.content))
          ).length,
          window_seconds: configuredWindowSec,
          detected_language: detectedLang || null,
          flagged_high_volume: highVolumeFlagged,
          detected_emotion: detectedEmotion,
          image_confidence: burstHasImage ? imgThreshold : null,
        });
      } catch (logErr) {
        console.warn(`[${platform}] Failed to write batch log:`, logErr);
      }

      // Send reply back to customer — only use token from DB (platform_connections)
      if (pageAccessToken) {
        console.log(
          `[${platform}] Sending reply to ${msg.sender} (${replyChunks.length} chunk(s)) using stored page token`
        );

        // Fix 4: wrap each chunk send in retry-with-backoff
        const metaRetryEnabled = aiSettings?.meta_retry_enabled !== false;
        let lastSendResult: any = null;
        let anyChunkFailed = false;
        for (let i = 0; i < replyChunks.length; i++) {
          const chunk = replyChunks[i];
          const typingMs = Math.max(
            900,
            Math.min(3000, Math.round(chunk.length * 22))
          );
          sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "typing_on");
          await new Promise((r) => setTimeout(r, typingMs));

          const sendOutcome = await sendMetaReplyWithRetry(
            supabase,
            storeId,
            conversation.id,
            msg.platform,
            msg.sender,
            chunk,
            pageAccessToken,
            connectionPageId || msg.pageId || "",
            metaRetryEnabled
          );
          lastSendResult = sendOutcome.data;
          if (!sendOutcome.ok) {
            anyChunkFailed = true;
            console.error(
              `[${platform}] Reply chunk ${i + 1}/${replyChunks.length} failed after ${sendOutcome.attempts} attempts: ${sendOutcome.lastError}`
            );
            break;
          }
        }
        sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "typing_off");
        const replySendResult = lastSendResult;

        // Clear delivery_failed flag if reply landed cleanly
        if (!anyChunkFailed) {
          await supabase
            .from("conversations")
            .update({ delivery_status: "ok", delivery_attempts: 0, last_delivery_error: null })
            .eq("id", conversation.id)
            .neq("delivery_status", "ok");
        }


        const sentTextPlatformMessageId =
          replySendResult?.message_id || replySendResult?.messages?.[0]?.id || null;

        if (insertedAiText?.id && sentTextPlatformMessageId) {
          const { error: aiUpdateError } = await supabase
            .from("messages")
            .update({
              platform_message_id: `${msg.platform}:${sentTextPlatformMessageId}`,
            })
            .eq("id", insertedAiText.id);

          if (aiUpdateError) {
            console.error(`[${platform}] Failed to persist AI text platform message id:`, aiUpdateError);
          }
        }

        // Send product images if any
        for (const img of aiResult.images) {
          try {
            const imageSendResult = await sendMetaImage(
              msg.platform,
              msg.sender,
              img.url,
              img.caption,
              pageAccessToken,
              connectionPageId || msg.pageId || ""
            );

            const sentImagePlatformMessageId =
              imageSendResult?.message_id || imageSendResult?.messages?.[0]?.id || null;

            const { error: imageInsertError } = await supabase.from("messages").insert({
              conversation_id: conversation.id,
              sender: "ai",
              content: `📷 ${img.url}`,
              platform_message_id: sentImagePlatformMessageId
                ? `${msg.platform}:${sentImagePlatformMessageId}`
                : null,
            });

            if (imageInsertError) {
              console.error(`[${platform}] Failed to store AI image message:`, imageInsertError);
            }
          } catch (imgErr) {
            console.error(`[${platform}] Failed to send image:`, imgErr);
          }
        }
      } else {
        console.warn(
          `[${platform}] No page access token found in platform_connections for page ${msg.pageId}, cannot send reply`
        );
      }

      // Update message count and last_synced_at
      if (connectionId || connectionPageId || msg.pageId) {
        try {
          let currentCount = 0;

          if (connectionId) {
            currentCount = await supabase
              .from("platform_connections")
              .select("message_count")
              .eq("id", connectionId)
              .eq("status", "connected")
              .single()
              .then((r) => r.data?.message_count || 0);

            await supabase
              .from("platform_connections")
              .update({
                message_count: currentCount + 1,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", connectionId)
              .eq("status", "connected");
          } else {
            const lookupPageId = connectionPageId || msg.pageId;
            currentCount = await supabase
              .from("platform_connections")
              .select("message_count")
              .eq("store_id", storeId)
              .eq("platform", msg.platform as any)
              .eq("page_id", lookupPageId)
              .eq("status", "connected")
              .single()
              .then((r) => r.data?.message_count || 0);

            await supabase
              .from("platform_connections")
              .update({
                message_count: currentCount + 1,
                last_synced_at: new Date().toISOString(),
              })
              .eq("store_id", storeId)
              .eq("platform", msg.platform as any)
              .eq("page_id", lookupPageId)
              .eq("status", "connected");
          }
        } catch (countErr) {
          console.warn(
            `[${platform}] Failed to update platform_connections stats:`,
            countErr
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: messages.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
