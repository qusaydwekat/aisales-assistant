import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

export async function sendTypingIndicator(
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
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`[${platform}] sender_action ${action} failed:`, err);
  }
}

// Split a long AI reply into 2-3 shorter chunks so it lands like a real
// person typing several short messages instead of one wall of text.
// Splits on paragraph breaks first, then sentences, never breaking words.
export function splitReplyIntoChunks(text: string, maxChunks = 3): string[] {
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

export async function sendMetaReply(
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
      console.log(`[${platform}] Sent text to ${recipientId}: ${JSON.stringify(text)}`);
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
      console.log(`[whatsapp] Sent text to ${recipientId}: ${JSON.stringify(text)}`);
    }
    return data;
  }
}

export async function sendMetaImage(
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
export async function sendMetaReplyWithRetry(
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
export async function fetchMetaDisplayName(
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

