import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

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

    // Group by customer conversation so different customers (same or different
    // stores) are processed IN PARALLEL, while each customer's own messages stay ordered.
    const groups = new Map<string, typeof messages>();
    for (const m of messages) {
      const key = `${m.platform}|${m.pageId || ""}|${m.platformId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    const processGroup = async (groupMessages: typeof messages) => {
    for (const [msgIndex, msg] of groupMessages.entries()) {
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
      // For photos, save a placeholder row IMMEDIATELY (in arrival order) so the
      // burst collector knows a photo is on its way and waits for it, instead of
      // replying to the text first while the photo is still downloading.
      let placeholderMsgId: string | null = null;
      if (msg.kind === "image") {
        const { data: ph } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            sender: "customer",
            content: IMAGE_PENDING_MARK,
            created_at: new Date().toISOString(),
            platform_message_id: inferredPlatformMessageId,
          })
          .select("id")
          .single();
        placeholderMsgId = ph?.id || null;
      }
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

      // Use server receipt time for message ordering. Meta platform timestamps can
      // arrive late/out-of-order; using them as created_at made late burst messages
      // look older than the AI reply and therefore "already answered".
      const receivedAt = new Date().toISOString();
      const { data: insertedMsg, error: insertCustomerErr } = placeholderMsgId
        ? await supabase
            .from("messages")
            .update({ content: storedContent })
            .eq("id", placeholderMsgId)
            .select("id, created_at")
            .single()
        : await supabase
            .from("messages")
            .insert({
              conversation_id: conversation.id,
              sender: "customer",
              content: storedContent,
              created_at: receivedAt,
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

      if (hasLaterMessageInSameConversation(groupMessages, msgIndex)) {
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
          last_message_time: receivedAt,
          unread: true,
        })
        .eq("id", conversation.id);

      // ─── AI Auto-Reply ───
      const [storeRes, catalogRes, aiSettingsRes, historyRes, ordersRes] =
        await Promise.all([
          getCachedStore(supabase, storeId),
          supabase
            .from("products")
            .select("name, auto_description, category, price, sizes_available, color, stock_per_size, variants, stock")
            .eq("store_id", storeId)
            .eq("active", true),
          getCachedAISettings(supabase, storeId),
          supabase
            .from("messages")
            .select("sender, content, created_at")
            .eq("conversation_id", conversation.id)
            .order("created_at", { ascending: false })
            .limit(30),
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
      // Fetched newest-first so long chats keep the latest messages; flip to chronological.
      const history = [...(historyRes.data || [])].reverse();
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
      // Identify products that have variations so the AI knows to confirm size/color
      const productsWithVariations = catalogProducts
        .filter((p: any) => {
          const sizes = Array.isArray(p.sizes_available) ? p.sizes_available.length : 0;
          const colors = Array.isArray(p.color) ? p.color.length : 0;
          const variants = Array.isArray(p.variants) ? p.variants.length : 0;
          const stockPerSize = p.stock_per_size && typeof p.stock_per_size === "object"
            ? Object.keys(p.stock_per_size).length
            : 0;
          return sizes > 0 || colors > 0 || variants > 0 || stockPerSize > 0;
        })
        .slice(0, 30)
        .map((p: any) => {
          const label = p.name || p.auto_description || "Item";
          const parts: string[] = [];
          if (Array.isArray(p.sizes_available) && p.sizes_available.length) {
            const sizeBits = p.sizes_available.map((s: string) => {
              const stk = p.stock_per_size?.[s];
              return stk != null ? `${s}(${stk})` : s;
            });
            parts.push(`sizes: ${sizeBits.join("/")}`);
          }
          if (Array.isArray(p.color) && p.color.length) {
            parts.push(`colors: ${p.color.join("/")}`);
          }
          if (Array.isArray(p.variants) && p.variants.length) {
            const vNames = p.variants
              .map((v: any) => (typeof v === "string" ? v : v?.name || v?.title))
              .filter(Boolean)
              .slice(0, 6);
            if (vNames.length) parts.push(`variants: ${vNames.join("/")}`);
          }
          return `- ${label} → ${parts.join("; ")}`;
        });

      const variationsSection = productsWithVariations.length
        ? `\n\nProducts with variations (you MUST confirm the exact size/color BEFORE creating an order; numbers in parentheses = stock per size, skip out-of-stock options):\n${productsWithVariations.join("\n")}`
        : "";

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
              )}${variationsSection}\n\nIMPORTANT: Use search_products tool to get full product details. Do NOT guess product names or prices.`;

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
        Math.max(2, Number(aiSettings?.collection_window_seconds) || 3)
      );
      const QUIET_MS = configuredWindowSec * 1000;
      // Meta can deliver separate messages from the same user burst very late
      // even when their platform timestamps are only 1-2s apart. Keep a longer
      // FB/IG grace period so greeting + question bursts are answered once.
      const DELIVERY_GRACE_MS =
        platform === "facebook" || platform === "instagram"
          ? Math.max(QUIET_MS, 6000)
          : QUIET_MS;
      // Human-like pacing: if the latest message looks unfinished (only a
      // greeting, trailing "...", a dangling connector), give the customer a
      // little extra time to finish their thought before replying.
      const INCOMPLETE_EXTRA_MS = 3000;
      const looksIncomplete = (t: string) => {
        const x = (t || "").trim().toLowerCase();
        if (!x) return false;
        if (/(\.\.\.|…|,|،|:)$/.test(x)) return true;
        if (/(^|\s)(و|او|أو|بس|and|or|but|also|كمان)$/.test(x)) return true;
        return /^(hi|hello|hey|salam|مرحبا|مرحباً|هلا|السلام عليكم|سلام|اهلا|أهلا|مساء الخير|صباح الخير)[!.\s]*$/.test(x);
      };
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
      // If the earliest worker died (deploy/shutdown), its message is "stale" —
      // take over instead of yielding forever.
      const earliestAgeMs = earliestUnanswered?.created_at
        ? Date.now() - new Date(earliestUnanswered.created_at).getTime()
        : 0;
      const earliestIsStale = earliestAgeMs > MAX_TOTAL_WAIT_MS + 15000;
      if (earliestUnanswered?.id && earliestUnanswered.id !== myMsgId && !earliestIsStale) {
        console.log(
          `[${platform}] Not the earliest unanswered worker (earliest=${earliestUnanswered?.id}, mine=${myMsgId}) — yielding to active batcher.`
        );
        continue;
      }
      if (earliestIsStale && earliestUnanswered?.id !== myMsgId) {
        console.log(`[${platform}] Earliest worker is stale (${earliestAgeMs}ms) — taking over the batch.`);
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

      // Renew Meta's expiring typing action while collecting, thinking, and sending.
      if (pageAccessToken) {
        await sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, "mark_seen");
      }
      const typingSession = pageAccessToken &&
        (msg.platform === "facebook" || msg.platform === "instagram")
        ? startTypingSession((action) =>
            sendTypingIndicator(msg.platform, msg.sender, pageAccessToken, action))
        : undefined;

      try {
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
          .select("created_at, content")
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
              windowEndsAt = latestCustomerMs + QUIET_MS +
                (looksIncomplete(String(newerCustomer.content || "")) ? INCOMPLETE_EXTRA_MS : 0);
              console.log(
                `[${platform}] Rolling window reset — new customer message at ${new Date(newerMs).toISOString()}, waiting another ${QUIET_MS}ms of silence.`
              );
              typingSession?.refresh();
            }
          }
        }

        const remaining = windowEndsAt - Date.now();
        if (remaining <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(POLL_MS, remaining)));
      }

      if (!shouldProceed) {
        // The winning worker owns the visible indicator; don't switch it off.
        await typingSession?.stop(false);
        continue;
      }

      // Wait for any photo in this burst that is still downloading (max 20s),
      // so text + photo are answered together in one reply.
      {
        const imgWaitStart = Date.now();
        while (Date.now() - imgWaitStart < 20000) {
          const { count: pendingImgs } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversation.id)
            .eq("sender", "customer")
            .eq("content", IMAGE_PENDING_MARK)
            .gte("created_at", new Date(earliestUnanswered.created_at!).toISOString());
          if (!pendingImgs) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        // Give a just-finished photo a brief moment, then a final short quiet check.
        if (Date.now() - imgWaitStart > 0) {
          await supabase
            .from("messages")
            .update({ content: "[Image]" })
            .eq("conversation_id", conversation.id)
            .eq("content", IMAGE_PENDING_MARK)
            .lt("created_at", new Date(Date.now() - 60000).toISOString());
        }
      }


      // Re-fetch conversation history after debounce to include all batched messages
      const { data: freshHistory } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(30);
      freshHistory?.reverse();

      // Combine the latest consecutive customer messages into one prompt.
      const allHistory = freshHistory || history;
      const pendingBurst = collectUnansweredCustomerMessages(allHistory);
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

      const giftRe = /(\bgift\b|\bpresent\b|هدية|هديه|كادو|للهدية)/i;
      if (giftRe.test(combinedCustomerMessage)) {
        runtimeHints.push(
          "RUNTIME GIFT MODE: The customer mentioned this is a gift. Ask ONCE about the recipient and offer a gift note. After create_order succeeds, append 'GIFT: <details>' via add_order_note."
        );
      }
      try {
        const aiReplyCount = (history || []).filter((m: any) => m.sender === "ai").length;
        if (aiReplyCount === 0 && (existingOrders || []).length === 0) {
          runtimeHints.push(
            "RUNTIME FIRST-TIME CUSTOMER: First interaction with the store. Be slightly warmer. After answering, mention ONCE in a single sentence the delivery info and accepted payment methods so they feel oriented."
          );
        }
      } catch {}

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

      // Send one combined customer-facing reply per collected burst. Splitting
      // made multi-question bursts look like separate AI answers.
      const replyChunks = personalizedReply ? [personalizedReply] : [];
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
          // Short typing pause only — the AI call already took time.
          const typingMs = i === 0 ? 0 : Math.min(800, Math.round(chunk.length * 6));
          typingSession?.refresh();
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
        await typingSession?.stop();
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
      } finally {
        // Also release the heartbeat on failures and early exits.
        await typingSession?.stop();
      }
    }
    };

    const allWork = Promise.allSettled(
      [...groups.values()].map((g) =>
        processGroup(g).catch(async (e) => {
          console.error(`[${platform}] Group processing error:`, e);
          // Dead-letter log so failed customer chats are visible instead of silently lost.
          try {
            await supabase.from("webhook_failures").insert({
              platform,
              page_id: g[0]?.pageId || null,
              sender_id: g[0]?.platformId || null,
              error: String((e as any)?.stack || e).slice(0, 4000),
              payload: g.map((m: any) => ({ text: m.text ?? null, imageUrl: m.imageUrl ?? null, platformMessageId: m.platformMessageId ?? null })),
            });
          } catch (_) { /* never let logging break the webhook */ }
        })
      )
    );
    // Acknowledge Meta immediately; finish replies in the background so slow
    // customers never block or delay others (and Meta doesn't retry on timeout).
    const runtime = (globalThis as any).EdgeRuntime;
    void runtime;
    // Await so the runtime never kills in-flight replies; groups still run in parallel.
    await allWork;

    return new Response(
      JSON.stringify({ success: true, processed: messages.length, conversations: groups.size }),
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

