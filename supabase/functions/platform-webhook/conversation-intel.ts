import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

export function detectLanguage(text: string | null | undefined): "ar" | "en" | undefined {
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
export function isStoreOpenNow(workingHours: any): { isOpen: boolean; hasSchedule: boolean } {
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
export function detectEmotion(text: string | null | undefined): "neutral" | "happy" | "frustrated" | "abusive" | "urgent" {
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
export function buildHandoffSummary(args: {
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
export function computeQualityScore(args: {
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
