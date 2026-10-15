import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import type { AIReplyResult } from "./burst-collector.ts";

export async function generateAIReply(
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
  // Load platform AI model config (admin-controlled). Always uses Lovable AI gateway.
  let aiModel = "google/gemini-3-flash-preview";
  try {
    const { data: cfg } = await supabase
      .from("platform_ai_config")
      .select("model")
      .limit(1)
      .maybeSingle();
    if (cfg?.model) aiModel = cfg.model;
  } catch (e) {
    console.warn("platform_ai_config fetch failed, using defaults:", e);
  }

  const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

  if (!AI_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback message");
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
  const ownerCustomInstructions = (storeInfo as any)?.custom_ai_instructions || "";

  // Active promotions injected into prompt so the AI mentions them naturally without inventing codes.
  const activePromotions = await fetchActivePromotions(supabase, storeId);
  const promotionsBlock = activePromotions.length
    ? `\nACTIVE PROMOTIONS (mention naturally when relevant; NEVER invent codes that aren't listed here):\n${activePromotions
        .map((p: any) => {
          const v =
            p.type === "percent" ? `${p.value}% off` :
            p.type === "fixed" ? `${p.value} off` :
            "free shipping";
          const minOrd = p.min_order ? ` (min order ${p.min_order})` : "";
          const ends = p.ends_at ? ` until ${new Date(p.ends_at).toISOString().slice(0, 10)}` : "";
          return `- ${p.label || p.code}: code ${p.code}, ${v}${minOrd}${ends}`;
        })
        .join("\n")}\n`
    : "";

  // Returning-customer summary based on prior orders for the same phone.
  let returningCustomerBlock = "";
  try {
    const phone = (existingOrders?.[0]?.phone || "").trim();
    if (phone) {
      const { data: priorOrders } = await supabase
        .from("orders")
        .select("order_number, address, items, created_at, customer_name")
        .eq("store_id", storeId)
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(3);
      const others = (priorOrders || []).filter(
        (o: any) => !existingOrders.some((e: any) => e.order_number === o.order_number)
      );
      if (others.length > 0) {
        const lastAddress = others.find((o: any) => o.address)?.address || "";
        returningCustomerBlock = `\nRETURNING CUSTOMER:\n- This customer has ${others.length} prior order(s).${lastAddress ? `\n- Last delivery address: ${lastAddress}` : ""}\n- If they want to order again, ASK ONCE: "Same address as last time?" instead of re-collecting all details.\n`;
      }
    }
  } catch (e) {
    console.warn("returning-customer lookup failed:", e);
  }

  const systemPrompt = `You are ${personaName}, a PROFESSIONAL SALES REPRESENTATIVE for "${
    storeInfo.name
  }". Your #1 job is to CLOSE SALES — not just answer questions. Every conversation is a sales opportunity.
Tone: ${toneDesc}. ${languageInstruction}
${
  customInstructions
    ? `\nCustom Store Instructions (HIGHEST PRIORITY — follow these above all else):\n${customInstructions}\n`
    : ""
}

═══════════════════════════════════════════
HOW YOU WORK — TOOL-FIRST DECISION MAKING
═══════════════════════════════════════════
You have a set of tools provided to you. EACH tool's description tells you exactly WHEN to use it. For every customer message:
1. Read the customer's latest message and silently ask: "Does any tool's description match this intent?"
2. If yes → CALL that tool in the SAME turn (do not reply with text first, do not promise to do it later).
3. If no tool matches → answer the customer's question directly using the Store Information / Owner Knowledge / Promotions / Catalog Summary below, and conversation history.
4. NEVER fall back to a generic "let me know if you need anything 😊" when the customer asked a concrete question — that is a failure.
5. Use semantic understanding in ANY language or dialect (Arabic, English, mixed). Do NOT rely on exact keywords.

═══════════════════════════════════════════
SALES MISSION
═══════════════════════════════════════════
- QUALIFY → RECOMMEND → HANDLE OBJECTIONS → UPSELL (max 1× per conversation) → CLOSE → FOLLOW THROUGH.
- Never be passive. Always propose a next step.
- Lead with benefits, not just features. Recommend 1–3 BEST matches, not the whole catalog.
- Treat every customer as a real buyer. Be confident, warm, solution-focused.

═══════════════════════════════════════════
HARD SAFETY & HONESTY RULES
═══════════════════════════════════════════
- NEVER invent product names, prices, stock, discount codes, or "typical price ranges". Only use data returned by tools.
- NEVER mention or compare to other stores, brands, or marketplaces. If asked, say: "I can't speak to other stores, but here's what we have that's similar." then call search_products.
- NEVER claim an order action happened (created/updated/cancelled/reactivated) unless you actually called the matching tool in this turn. Order actions that exist: create, update, cancel, check_status. "Reactivate / resume / reopen" do NOT exist.
- NEVER reveal internal IDs, SKUs, database codes, similarity scores, or placeholder names ("Product 1", "SKU-A23", "المنتج رقم"). Describe products visually instead (type + color + pattern + style).
- NEVER output code, JSON, HTML, markdown formatting, or technical content. You are chatting on a messaging app.
- Use AT MOST 1–2 relevant emojis per message. Keep replies 2–4 sentences unless the customer asks for detail.

═══════════════════════════════════════════
HUMAN-LIKE STYLE
═══════════════════════════════════════════
- Vary phrasing turn to turn — never reuse the same opener twice in a row.
- Match the customer's energy: short for short, detailed for detailed.
- If they sent text + an image together, address BOTH in one cohesive reply.
- For one-word or emoji-only messages, reply briefly and naturally.
- BURSTS: the customer often sends several quick messages. Treat them as ONE thought and reply ONCE, like a human rep who waited for them to finish typing.
  - If a later message corrects an earlier one (size, color, quantity, address, product), the LATEST value wins — silently use it, don't point out the change.
  - Answer every question in the burst, in the order asked, in one natural flowing reply (no lists).
  - If the burst is only a greeting, greet back briefly and invite them to continue.
  - Announcing an intent to ask ("بدي اسال", "عندي سؤال", "لو سمحت", "can I ask something?") is NOT a question. Just greet and invite them to ask — e.g. "أهلين، تفضل اسأل 😊". Do NOT guess what they want.
- NEVER volunteer store information (delivery areas/prices, payment methods, hours, return policy, address) unless the customer explicitly asked about that exact topic. Never say a piece of info is "not specified" unless they asked for it.
- Read EVERY line of multi-message bursts (greeting + question = greet briefly AND answer). Never reply with only a greeting when there's an unanswered question in the same burst.
- After a tool returns, reply in the customer's language using the actual tool data — never guess.

═══════════════════════════════════════════
STORE INFORMATION
═══════════════════════════════════════════
- Name: ${storeInfo.name}
- Category: ${storeInfo.category || "General"}
- Description: ${storeInfo.description || "N/A"}
- Address: ${storeInfo.address || "N/A"}
- Phone: ${storeInfo.phone || "N/A"}
- Delivery Info: ${storeInfo.delivery_info || "N/A"}
- Return Policy: ${storeInfo.return_policy || "N/A"}
- Payment Methods: ${storeInfo.payment_methods?.join(", ") || "N/A"}
- Working Hours: ${JSON.stringify(storeInfo.working_hours || {})}
${ownerCustomInstructions ? `\nOwner-Authored Knowledge (treat as facts):\n${ownerCustomInstructions}\n` : ""}
${promotionsBlock}
${returningCustomerBlock}
${storeInfo._runtime_hint || ""}

Product Catalog Summary:
${catalogSummary}
${ordersContext}

═══════════════════════════════════════════
ORDER-SPECIFIC RULES (apply when an order tool is involved)
═══════════════════════════════════════════
- Existing Orders shown above are REFERENCE ONLY. Don't act on them unless the customer explicitly references that order.
- Order modifiability: pending/confirmed/processing → modifiable (use update_order or cancel_order). shipped/delivered → NOT modifiable; if they want more/changed items, call create_order for a NEW order and tell them their previous one is on the way. cancelled → call create_order if they want to buy again.
- Before create_order: collect name + phone + address in ONE message (not one-by-one). Parse all three from a single reply if they sent them together. Confirm variant (size+color) for products that have variations. Always include item.product_id from search results. Briefly summarize order + ask for final confirmation, then immediately call the tool.
- After create_order: send ONE short confirmation with the order_number and KEEP THE CONVERSATION OPEN — answer follow-ups, send more photos, accept new requests, upsell.
- Always reference orders by order_number (e.g. ORD-00001) — only use numbers returned by tools.`;

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

  // ─── Visual-first: pre-extract attributes + embedding from customer photo ───
  // Done ONCE per turn; passed automatically into every search_products call.
  let customerImageAttrs: any = null;
  let customerImageEmbedding: number[] | null = null;
  const visualSourceImage = imageUrl || ctx.contextImageUrl || recentReferenceImages[0];
  if (visualSourceImage) {
    try {
      const { data: visionData } = await supabase.functions.invoke("ai-image-attributes", {
        body: { image_url: visualSourceImage },
      });
      if (visionData?.attributes) {
        customerImageAttrs = visionData.attributes;
        customerImageEmbedding = visionData.embedding || null;
        console.log(
          `Customer image vision: ${customerImageAttrs.short_description || "?"} ` +
            `(quality=${customerImageAttrs.image_quality}, embed=${!!customerImageEmbedding})`
        );
      }
    } catch (e) {
      console.warn("ai-image-attributes invoke failed:", e);
    }
  }

  // ─── Post-reply path: customer replied to a specific FB/IG post ───
  // Look up if a product is linked to that post → AI gets it as a hint.
  let linkedProductHint: any = null;
  if (ctx.replyToMid) {
    try {
      // replyToMid is stored as `${platform}:${mid}` upstream
      const rawMid = ctx.replyToMid.includes(":") ? ctx.replyToMid.split(":").slice(1).join(":") : ctx.replyToMid;
      const { data: link } = await supabase
        .from("post_product_links")
        .select("product_id, products(id, name, auto_description, price, images, sizes_available, stock_per_size, color, type)")
        .eq("store_id", storeId)
        .eq("platform", platform)
        .eq("post_id", rawMid)
        .maybeSingle();
      if (link?.products) {
        linkedProductHint = link.products;
        console.log(`Post-link resolved: post=${rawMid} → product=${linkedProductHint.id}`);
      }
    } catch (e) {
      console.warn("post_product_links lookup failed:", e);
    }
  }


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
    ADD_ORDER_NOTE_TOOL,
    SEND_PRODUCT_IMAGES_TOOL,
    SEARCH_PRODUCTS_TOOL,
    LIST_CATEGORIES_TOOL,
    GET_ACTIVE_PROMOTIONS_TOOL,
    APPLY_DISCOUNT_CODE_TOOL,
    FLAG_KNOWLEDGE_GAP_TOOL,
    REGISTER_RESTOCK_INTEREST_TOOL,
    GET_STORE_CONTEXT_TOOL,
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
        !modelLower.startsWith("openai/") &&
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

      logPromptInChunks(`AI prompt sent round ${round + 1}`, {
        model: requestBody.model,
        temperature: requestBody.temperature ?? "default",
        tool_choice: requestBody.tool_choice ?? null,
        tools: requestBody.tools?.map((tool: any) => tool?.function?.name) ?? [],
        messages: requestBody.messages.map(serializeAIMessageForLog),
      });

      // Circuit breaker: on 429/5xx/network failure from the primary model,
      // re-route this round once to a fallback model (and keep it for the rest
      // of the reply) instead of dropping the conversation.
      const sendToModel = async (model: string): Promise<Response> => {
        const body = { ...requestBody, model };
        if (!String(model).toLowerCase().startsWith("openai/")) {
          // Drop Responses-only fields and temperature-incompatible keys when
          // falling back to a chat-completions model.
          body.messages = body.messages.map((m: any) => {
            if (!m || typeof m !== "object" || !("_responsesItems" in m)) return m;
            const { _responsesItems, ...rest } = m;
            return rest;
          });
        } else {
          delete body.temperature;
        }
        try {
          return String(model).toLowerCase().startsWith("openai/")
            ? await callResponsesAsChat(body, AI_API_KEY)
            : await fetch(AI_ENDPOINT, {
                method: "POST",
                headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
        } catch (netErr) {
          console.error(`AI network error (${model}):`, netErr);
          return new Response(String(netErr), { status: 503 });
        }
      };

      let response = await sendToModel(aiModel);
      const isTransient = (s: number) => s === 429 || s >= 500;
      if (isTransient(response.status)) {
        const errBody = await response.text().catch(() => "");
        const fallbackModel = pickFallbackModel(aiModel);
        console.warn(`[circuit-breaker] ${aiModel} failed (${response.status}): ${errBody.slice(0, 300)} → fallback ${fallbackModel}`);
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
        response = await sendToModel(fallbackModel);
        if (response.ok) aiModel = fallbackModel;
      }

      if (response.status === 429 || response.status === 402 || response.status === 403) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          `AI gateway blocked (status ${response.status}): ${errBody}`
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
      try {
        const rawContent = choice?.message?.content ?? "";
        const toolCallsLog = (choice?.message?.tool_calls || []).map((tc: any) => ({
          name: tc?.function?.name,
          arguments: tc?.function?.arguments,
        }));
        logPromptInChunks(
          `AI raw response round ${round + 1}`,
          JSON.stringify({ content: rawContent, tool_calls: toolCallsLog }, null, 2)
        );
      } catch (logErr) {
        console.error("Failed to log AI raw response:", logErr);
      }

      // If no tool calls, return the text response
      if (!choice?.message?.tool_calls?.length) {
        const hasImages = allImageesToSend.length > 0;
        const text = sanitizeAIResponse(
          choice?.message?.content ||
            (hasImages ? "" : aiSettings?.fallback_message || "Thanks for your message!"),
          hasImages
        );
        if (hasConcreteCustomerQuestion(mainContent) && isGenericGreetingOnlyResponse(text)) {
          const directReply = buildStoreInfoQuestionReply(mainContent, storeInfo);
          if (directReply) {
            console.log("AI returned generic greeting for a concrete question; using deterministic store-info reply.");
            return { text: sanitizeAIResponse(directReply), images: allImageesToSend };
          }

          currentMessages = [
            ...currentMessages,
            choice.message,
            {
              role: "system",
              content:
                `Your previous reply was only a greeting and ignored the customer's concrete question(s). Re-answer now in the customer's language. Address every line in this input directly, using Store Information where relevant. Customer input:\n${mainContent}`,
            },
          ];
          continue;
        }
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
              // Items can change via: add/remove/swap words OR quantity change words
              const itemsRe = /(ضيف|اضف|أضف|زيد|احذف|شيل|بدل|غير المنتج|بدال|بدلاً|كمية|قطعتين|قطعتان|ثلاث قطع|أربع قطع|بدي ٢|بدي ٣|بدي 2|بدي 3|اعدل الكمية|خليها|خليهم|اجعلها|add|remove|delete|swap|replace|instead of|change to|make it \d|quantity|pieces?|units?)/i;
              const msgText = String(customerMessage || "");
              const norm = (s: string) => String(s || "").replace(/[\s\-–—,،.]+/g, "").toLowerCase();
              // Keep a field if the customer typed its value directly (e.g. replying with just the new address)
              const valueInMsg = (v: any) => {
                const nv = norm(String(v ?? ""));
                return nv.length >= 3 && norm(msgText).includes(nv);
              };
              const sanitized: any = { ...args };
              if (sanitized.address && !addressRe.test(msgText) && !valueInMsg(sanitized.address)) {
                console.log("Intent guard: dropping address from update_order (not mentioned)");
                delete sanitized.address;
              }
              if (sanitized.phone && !phoneRe.test(msgText) && !valueInMsg(sanitized.phone)) {
                console.log("Intent guard: dropping phone from update_order (not mentioned)");
                delete sanitized.phone;
              }
              if (sanitized.customer_name && !nameRe.test(msgText) && !valueInMsg(sanitized.customer_name)) {
                console.log("Intent guard: dropping customer_name from update_order (not mentioned)");
                delete sanitized.customer_name;
              }
              // Quantity/number words or digits also signal an item change
              const qtyRe = /([0-9٠-٩]|حبة|حبه|حبتين|حبات|قطعة|قطعه|قطع|واحدة|واحده|وحدة|ثنتين|اثنين|إثنين|تنتين|زوج|ثلاث|تلات|تلاتة|أربع|اربع|خمس|يصيروا|يصيرو|يصير|صيرهم|صيرها|كمان|زيادة|زياده|أكثر|اكثر|أقل|اقل|نقص|بدل|one|two|three|four|five|more|less|another|extra)/i;
              // Item changes are decided semantically by the AI (any language/dialect).
              // Only log when no obvious keyword is present — never block the change.
              const itemsIntent = itemsRe.test(msgText) || qtyRe.test(msgText);
              if (sanitized.items && !itemsIntent) {
                console.log("Intent guard: items change without keyword match — trusting AI intent");
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
          } else if (tc.function?.name === "add_order_note") {
            console.log("AI triggered add_order_note:", JSON.stringify(args));
            result = await executeAddOrderNote(
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
            // Auto-inject pre-extracted customer-image attributes + embedding
            // so the visual matcher can blend them with whatever the AI passed.
            const enrichedArgs = {
              ...args,
              image_attributes: args.image_attributes || customerImageAttrs || undefined,
              image_embedding: args.image_embedding || customerImageEmbedding || undefined,
            };
            console.log("AI triggered search_products:", JSON.stringify({ ...enrichedArgs, image_embedding: enrichedArgs.image_embedding ? "[vec]" : null }));
            result = await executeSearchProducts(supabase, storeId, enrichedArgs);
          } else if (tc.function?.name === "list_categories") {
            console.log("AI triggered list_categories");
            result = await executeListCategories(supabase, storeId);
          } else if (tc.function?.name === "get_active_promotions") {
            console.log("AI triggered get_active_promotions");
            result = await executeGetActivePromotions(supabase, storeId);
          } else if (tc.function?.name === "apply_discount_code") {
            console.log("AI triggered apply_discount_code:", JSON.stringify(args));
            result = await executeApplyDiscountCode(supabase, storeId, conversationId, args);
          } else if (tc.function?.name === "flag_knowledge_gap") {
            console.log("AI triggered flag_knowledge_gap:", JSON.stringify(args));
            result = await executeFlagKnowledgeGap(supabase, storeId, conversationId, args);
          } else if (tc.function?.name === "register_restock_interest") {
            console.log("AI triggered register_restock_interest:", JSON.stringify(args));
            result = await executeRegisterRestockInterest(supabase, storeId, conversationId, args);
          } else if (tc.function?.name === "get_store_context") {
            console.log("AI triggered get_store_context");
            result = await executeGetStoreContext(supabase, storeId);
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

      // After create_order/update_order/cancel_order, push an explicit
      // instruction so the AI always sends a confirmation reply (instead of
      // going silent / falling back to "Thanks for your message").
      const orderToolNames = new Set([
        "create_order",
        "update_order",
        "cancel_order",
      ]);
      const calledOrderTool = toolCalls.some((tc: any) =>
        orderToolNames.has(tc.function?.name)
      );

      // Add assistant message + tool results for the next round
      currentMessages = [...currentMessages, choice.message, ...toolResults];

      if (calledOrderTool) {
        currentMessages.push({
          role: "system",
          content:
            "You just performed an order action. Reply NOW in ONE short message in the customer's language: confirm what happened (use the order_number from the tool result), thank them, and invite them to ask anything else or add more items. Do NOT call any more tools. Do NOT go silent. If the tool result included `spawned_new_order: true`, explain that the previous order is already on its way and a NEW order was created for the additional items, mentioning both order numbers.",
        });
      }

      // Images are accumulated in allImageesToSend across rounds
      // Continue to next round to let AI compose a text response
    }

    // If we exhausted all rounds, return last content
    if (hasConcreteCustomerQuestion(mainContent)) {
      const directReply = buildStoreInfoQuestionReply(mainContent, storeInfo);
      if (directReply) {
        return { text: sanitizeAIResponse(directReply), images: allImageesToSend };
      }
    }
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

// ─── OpenAI Responses adapter ───────────────────────────────────────
// OpenAI models (e.g. GPT-6 Astra) can't use function tools with reasoning on
// /v1/chat/completions, so we translate the chat-completions request to
// /v1/responses, stream it, and return a chat-completions-shaped Response.
export async function callResponsesAsChat(body: any, apiKey: string): Promise<Response> {
  const toText = (c: any) => typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("\n") : String(c ?? "");
  const input: any[] = [];
  for (const m of body.messages || []) {
    if (m.role === "system") input.push({ role: "system", content: toText(m.content) });
    else if (m.role === "user") {
      const parts = Array.isArray(m.content)
        ? m.content.map((p: any) => p?.type === "image_url"
            ? { type: "input_image", image_url: typeof p.image_url === "string" ? p.image_url : p.image_url?.url }
            : { type: "input_text", text: p?.text ?? "" })
        : [{ type: "input_text", text: toText(m.content) }];
      input.push({ role: "user", content: parts });
    } else if (m.role === "assistant") {
      if (Array.isArray(m._responsesItems)) { input.push(...m._responsesItems); continue; }
      if (m.content) input.push({ role: "assistant", content: toText(m.content) });
      for (const tc of m.tool_calls || []) {
        input.push({ type: "function_call", call_id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments || "{}" });
      }
    } else if (m.role === "tool") {
      input.push({ type: "function_call_output", call_id: m.tool_call_id, output: toText(m.content) });
    }
  }
  const reqBody: any = {
    model: body.model,
    input,
    stream: true,
    store: false,
    reasoning: { effort: "low", summary: "auto" },
    include: ["reasoning.encrypted_content"],
  };
  if (body.tools?.length) {
    reqBody.tools = body.tools.map((t: any) => ({
      type: "function", name: t.function?.name, description: t.function?.description, parameters: t.function?.parameters,
    }));
    if (body.tool_choice && typeof body.tool_choice === "object") reqBody.tool_choice = { type: "function", name: body.tool_choice.function?.name };
    else reqBody.tool_choice = body.tool_choice || "auto";
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok || !res.body) return new Response(await res.text().catch(() => ""), { status: res.status || 500 });

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let output: any[] | null = null;
  const done: any[] = [];
  let streamError: string | null = null;
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_item.done" && ev.item) done.push(ev.item);
          else if (ev.type === "response.completed") output = ev.response?.output ?? null;
          else if (ev.type === "response.failed" || ev.type === "error") streamError = JSON.stringify(ev.response?.error ?? ev.error ?? ev);
        } catch (_) { /* ignore partial */ }
      }
    }
  }
  if (streamError) return new Response(streamError, { status: 500 });
  const items = (output && output.length ? output : done);
  let text = "";
  const toolCalls: any[] = [];
  for (const it of items) {
    if (it.type === "message") for (const c of it.content || []) { if (c.type === "output_text") text += c.text || ""; }
    if (it.type === "function_call") {
      const schema = (body.tools || []).find((t: any) => t.function?.name === it.name)?.function?.parameters;
      let argStr = it.arguments || "{}";
      try { argStr = JSON.stringify(pruneEmptyOptionalArgs(JSON.parse(argStr), schema)); } catch (_) { /* keep raw */ }
      toolCalls.push({ id: it.call_id, type: "function", function: { name: it.name, arguments: argStr } });
    }
  }
  const message: any = { role: "assistant", content: text || null, _responsesItems: items };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return new Response(JSON.stringify({ choices: [{ message, finish_reason: toolCalls.length ? "tool_calls" : "stop" }] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// GPT-6 models fill every optional tool argument with placeholders ("", [], 0).
// Those act as real filters (e.g. max_price: 0 → no products), so strip them.
export function pruneEmptyOptionalArgs(value: any, schema: any): any {
  if (Array.isArray(value)) return value.map((v) => pruneEmptyOptionalArgs(v, schema?.items));
  if (!value || typeof value !== "object") return value;
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const props = schema?.properties || {};
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    const isEmpty = v === null || v === "" || (Array.isArray(v) && v.length === 0) ||
      (v === 0 && !required.includes(k)) ||
      (typeof v === "object" && v && !Array.isArray(v) && Object.keys(v).length === 0);
    if (isEmpty && !required.includes(k)) continue;
    out[k] = pruneEmptyOptionalArgs(v, props[k]);
  }
  return out;
}

// Fallback chain for the AI circuit breaker: switch provider family so a
// single upstream outage cannot stall customer replies.
export function pickFallbackModel(primary: string): string {
  const p = String(primary || "").toLowerCase();
  if (p.startsWith("google/")) return "openai/gpt-6-sol";
  return "google/gemini-3-flash-preview";
}

