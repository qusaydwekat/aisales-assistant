import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";


export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── In-memory caches (per warm instance) for hot, rarely-changing data ───
// Avoids re-fetching store info and AI settings on every incoming webhook.
export const STORE_CACHE_TTL_MS = 30_000;
// Placeholder content for a customer photo that is still being downloaded.
export const IMAGE_PENDING_MARK = "📷 ⏳ (photo uploading)";
export const AI_SETTINGS_CACHE_TTL_MS = 30_000;
export const _storeCache = new Map<string, { value: any; expiresAt: number }>();
export const _aiSettingsCache = new Map<string, { value: any; expiresAt: number }>();

export async function getCachedStore(supabase: any, storeId: string) {
  const now = Date.now();
  const hit = _storeCache.get(storeId);
  if (hit && hit.expiresAt > now) return { data: hit.value, error: null };
  const res = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .single();
  if (!res.error) {
    _storeCache.set(storeId, {
      value: res.data,
      expiresAt: now + STORE_CACHE_TTL_MS,
    });
  }
  return res;
}

export async function getCachedAISettings(supabase: any, storeId: string) {
  const now = Date.now();
  const hit = _aiSettingsCache.get(storeId);
  if (hit && hit.expiresAt > now) return { data: hit.value, error: null };
  const res = await supabase
    .from("ai_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!res.error) {
    _aiSettingsCache.set(storeId, {
      value: res.data,
      expiresAt: now + AI_SETTINGS_CACHE_TTL_MS,
    });
  }
  return res;
}

export async function verifyMetaSignature(
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

export function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function stableId(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

export function fileExtFromContentType(
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

export function safeStorageId(id: string): string {
  return (id || "msg").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function cleanUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  // Meta URLs sometimes include stray newlines/spaces when logged/truncated
  const cleaned = url.replace(/\s+/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export async function uploadToStoreAssets(
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

export async function downloadBytes(
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

export async function fetchWhatsAppMediaUrl(
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
export function detectPlatform(body: any, queryPlatform: string | null): string {
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
