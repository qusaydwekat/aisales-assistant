import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

export function sanitizeAIResponse(text: string, allowEmpty = false): string {
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

export function parseImageUrlFromMessageContent(content: string): string | null {
  if (!content) return null;
  const main = content.split("\n\n[CTX]")[0];
  if (!main.startsWith("📷 ")) return null;
  const url = main.replace("📷 ", "").trim();
  return url.length > 0 ? url : null;
}

// Parse the [CTX] block appended by the webhook with ad/reply context.
export function parseMessageContext(content: string): {
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

export function stripMessageContext(content: string): string {
  return typeof content === "string" ? content.split("\n\n[CTX]")[0] : "";
}

export function collectPendingCustomerBurst(conversationHistory: any[]): any[] {
  const burst: any[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry?.sender !== "customer") break;
    burst.unshift(entry);
  }

  return burst;
}

export function collectUnansweredCustomerMessages(conversationHistory: any[]): any[] {
  let lastAiIndex = -1;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    if (conversationHistory[i]?.sender === "ai") {
      lastAiIndex = i;
      break;
    }
  }

  return conversationHistory
    .slice(lastAiIndex + 1)
    .filter((entry) => entry?.sender === "customer");
}

export function normalizeForQuestionDetection(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

export function hasConcreteCustomerQuestion(text: string): boolean {
  const normalized = normalizeForQuestionDetection(text);
  if (!normalized) return false;

  return /[?؟]/.test(text || "") ||
    /(شو|ايش|ايه|كم|قديش|بكم|وين|متى|كيف|هل|في |يوجد|بتوصل|توصلوا|سعر|توصيل|شحن|دفع|استرجاع|دوام|العنوان|what|when|where|how|do you|can you|delivery|shipping|price|cost|hours|address|payment|return)/i.test(normalized);
}

export function isGenericGreetingOnlyResponse(text: string): boolean {
  const normalized = normalizeForQuestionDetection(text);
  if (!normalized) return true;

  const asksToHelp = /(كيف.*(اساعدك|اخدمك)|كيف.*ممكن.*اساعدك|how can i help|how may i help|how can we help|can i help|how can i assist|how may i assist)/i.test(normalized);
  const mostlyGreeting = /(مرحبا|اهلا|هلا|الله يعافيك|يعطيك العافيه|hello|hi|thanks|thank you)/i.test(normalized);

  return asksToHelp && (mostlyGreeting || normalized.length < 120);
}

export function buildStoreInfoQuestionReply(customerText: string, storeInfo: any): string | null {
  const normalized = normalizeForQuestionDetection(customerText);
  if (!normalized) return null;

  const isArabic = /[\u0600-\u06FF]/.test(customerText || "");
  const valueOrNull = (value: any) => {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    const str = String(value || "").trim();
    return str && str.toLowerCase() !== "n/a" ? str : null;
  };

  const parts: string[] = [];
  if (/(يعطيك العافيه|الله يعطيك|يسعد|مرحبا|اهلا|هلا|hello|hi)/i.test(normalized)) {
    parts.push(isArabic ? "الله يعافيك 😊" : "Hi 😊");
  }

  const asksDelivery = /(توصيل|توصل|بتوصل|شحن|الشحن|delivery|deliver|shipping|ship)/i.test(normalized);
  const asksHours = /(دوام|ساعات|مفتوح|بتفتح|بتسكر|working hours|hours|open|close)/i.test(normalized);
  const asksPayment = /(دفع|الدفع|كاش|فيزا|بطاقه|payment|pay|cash|card)/i.test(normalized);
  const asksReturn = /(استرجاع|ارجاع|تبديل|سياسه|return|refund|exchange)/i.test(normalized);
  const asksAddress = /(عنوان|مكانكم|وينكم|location|address|where are you)/i.test(normalized);
  const asksPhone = /(رقمكم|تلفون|هاتف|اتواصل|phone|mobile|contact)/i.test(normalized);

  if (asksDelivery) {
    const delivery = valueOrNull(storeInfo?.delivery_info);
    parts.push(
      delivery
        ? isArabic
          ? `بالنسبة للتوصيل وسعره: ${delivery}`
          : `Delivery and shipping cost: ${delivery}`
        : isArabic
          ? "معلومات التوصيل وسعره غير محددة عندي حالياً."
          : "Delivery areas and shipping cost are not specified yet."
    );
  }
  if (asksHours) {
    const hours = valueOrNull(storeInfo?.working_hours);
    parts.push(hours ? (isArabic ? `ساعات العمل: ${hours}` : `Working hours: ${hours}`) : (isArabic ? "ساعات العمل غير محددة حالياً." : "Working hours are not specified yet."));
  }
  if (asksPayment) {
    const payment = valueOrNull(storeInfo?.payment_methods);
    parts.push(payment ? (isArabic ? `طرق الدفع: ${payment}` : `Payment methods: ${payment}`) : (isArabic ? "طرق الدفع غير محددة حالياً." : "Payment methods are not specified yet."));
  }
  if (asksReturn) {
    const returns = valueOrNull(storeInfo?.return_policy);
    parts.push(returns ? (isArabic ? `سياسة الإرجاع/التبديل: ${returns}` : `Return/exchange policy: ${returns}`) : (isArabic ? "سياسة الإرجاع غير محددة حالياً." : "Return policy is not specified yet."));
  }
  if (asksAddress) {
    const address = valueOrNull(storeInfo?.address);
    parts.push(address ? (isArabic ? `العنوان: ${address}` : `Address: ${address}`) : (isArabic ? "العنوان غير محدد حالياً." : "Address is not specified yet."));
  }
  if (asksPhone) {
    const phone = valueOrNull(storeInfo?.phone);
    parts.push(phone ? (isArabic ? `رقم التواصل: ${phone}` : `Contact number: ${phone}`) : (isArabic ? "رقم التواصل غير محدد حالياً." : "Contact number is not specified yet."));
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

export function hasLaterMessageInSameConversation(
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

export function compareIncomingMessages(a: any, b: any): number {
  const timeDiff =
    new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime();
  if (timeDiff !== 0) return timeDiff;

  const aKey = `${a?.platform || ""}:${a?.platformId || ""}:${a?.pageId || ""}:${a?.platformMessageId || ""}`;
  const bKey = `${b?.platform || ""}:${b?.platformId || ""}:${b?.pageId || ""}:${b?.platformMessageId || ""}`;
  return aKey.localeCompare(bKey);
}

export function extractBurstInput(burstMessages: any[]): {
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

export function looksLikeCancelOrderRequest(text: string): boolean {
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

export function buildCancelOrderReply(rawResult: string, customerText: string): string {
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

export function isFallbackLikeResponse(text: string, fallbackMessage?: string | null): boolean {
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

export function logPromptInChunks(label: string, payload: unknown) {
  try {
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    const maxChunkSize = 3000;
    for (let i = 0; i < serialized.length; i += maxChunkSize) {
      const chunk = serialized.slice(i, i + maxChunkSize);
      console.log(`${label} [chunk ${Math.floor(i / maxChunkSize) + 1}/${Math.ceil(serialized.length / maxChunkSize)}]\n${chunk}`);
    }
  } catch (err) {
    console.warn(`${label} logging failed:`, err);
  }
}

export function serializeAIMessageForLog(message: any) {
  const content = message?.content;
  const normalizedContent = Array.isArray(content)
    ? content.map((part: any) =>
        part?.type === "image_url"
          ? { type: "image_url", image_url: part.image_url?.url || part.image_url }
          : part
      )
    : content;

  return {
    role: message?.role,
    name: message?.name,
    tool_call_id: message?.tool_call_id,
    content: normalizedContent,
    tool_calls: message?.tool_calls?.map((toolCall: any) => ({
      id: toolCall?.id,
      type: toolCall?.type,
      function: {
        name: toolCall?.function?.name,
        arguments: toolCall?.function?.arguments,
      },
    })),
  };
}

export function looksLikeReferentialFollowUp(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return false;

  return /^(this|that|it|these|those|price\??|how much\??|details\??|same one\??|which one\??|what about this\??|كم|بكم|سعرها|سعره|هاي|هاد|هذا|هذه|هذي|هاذي|شو سعرها|شو سعره|بدّي هاي|بدي هاي|يعني هاي|هاي قديش|هاي بكم|تفاصيلها|تفاصيله|أبغى هذا|ابي هذا|أبي هذا)/i.test(
    normalized
  );
}

export function collectRecentReferenceImages(conversationHistory: any[]): string[] {
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

