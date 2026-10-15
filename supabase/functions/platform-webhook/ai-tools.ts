import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { findRecentDuplicateOrder, executeCreateOrder, executeCancelOrder, executeUpdateOrder, executeAddOrderNote, executeCheckOrderStatus } from "./order-manager.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

export const ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "create_order",
    description:
      "Create a NEW order in the store database. " +
      "WHEN TO USE: The customer has confirmed they want to buy specific items AND you already collected (across any number of messages) their full name, phone number, and delivery address. Multiple orders per conversation are allowed. " +
      "Examples that justify calling this tool: 'I'll take the black dress', 'بدي أطلب الكنزة الزرقا', 'احجزلي ٢ منهم', 'place the order', 'okay let's do it', once name+phone+address are known. " +
      "DO NOT USE for: modifying an existing order (use update_order), cancelling (use cancel_order), or checking status (use check_order_status). " +
      "VARIATIONS: If the chosen product has sizes/colors/variants, you MUST have confirmed the exact size+color BEFORE calling this tool, and pass them as item.size, item.color and item.variant ('Size L / Black'). " +
      "QUANTITY: Parse from natural language ('I want 3', 'قطعتين' = 2, 'a dozen' = 12). Default to 1 only if no number is mentioned. " +
      "PRODUCT_ID: Each item MUST carry the product_id (UUID) of THAT specific product from the search_products results. " +
      "NEVER reuse the same product_id for two different products — if the customer ordered 2 different items, you need 2 different product_ids. " +
      "If you don't have a product_id for one of the items, call search_products first to obtain it. " +
      "PRICE: item.price MUST equal the price returned by search_products for that exact product_id. Do not invent or carry over prices from other items.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's phone number" },
        address: { type: "string", description: "Customer's delivery address" },
        items: {
          type: "array",
          description:
            "List of ordered items. Always include product_id from search results for accurate stock tracking.",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string", description: "Product UUID from search_products results." },
              product_name: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" },
              size: { type: "string", description: "Selected size (REQUIRED when product has sizes_available or stock_per_size)." },
              color: { type: "string", description: "Selected color (REQUIRED when product has color options)." },
              variant: { type: "string", description: "Combined variation label e.g. 'Size L / Black'." },
              image: { type: "string", description: "Primary image URL of the product from search_products results." },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: { type: "string", description: "Special notes or requests from the customer" },
      },
      required: ["customer_name", "phone", "address", "items"],
    },
  },
};

export const CANCEL_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "cancel_order",
    description:
      "Cancel an EXISTING active order. " +
      "WHEN TO USE: The customer expresses (in any language or dialect) that they no longer want their order, want to abort it, changed their mind, etc. Examples: 'cancel my order', 'I changed my mind', 'الغي الطلب', 'بطلت', 'كنسل', 'ما عاد بدي', 'nevermind'. " +
      "Call this IMMEDIATELY in the same turn — do NOT ask the customer to confirm first, do NOT reply with text only. " +
      "If the customer didn't mention an order number, leave it empty and the most recent pending/confirmed order for this conversation will be cancelled. " +
      "DO NOT USE for: modifying items (use update_order), or for orders already shipped/delivered (those cannot be cancelled).",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number (e.g. ORD-00001). Optional — defaults to most recent active order." },
        reason: { type: "string", description: "Reason for cancellation if the customer provided one." },
      },
      required: [],
    },
  },
};

export const UPDATE_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "update_order",
    description:
      "Modify an EXISTING active order (status: pending, confirmed, or processing). " +
      "WHEN TO USE: The customer wants to change something about an order they already placed — items, quantities, delivery address, phone, name, or notes. Examples: 'change quantity to 3', 'deliver to a different address', 'add another shirt to my order', 'بدي اعدل العنوان', 'خليها قطعتين', 'بدل الأسود بالأحمر'. " +
      "STRICT FIELD ISOLATION: Pass ONLY the fields the customer just asked to change in their CURRENT message. NEVER copy unchanged fields from the existing order. If the customer changed only the address → pass address only. Only quantity → pass items only. Etc. " +
      "DO NOT USE for: cancelling (use cancel_order), creating a new order (use create_order), or for orders already shipped/delivered (in that case call create_order to make a new order for the additional/changed items).",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "Order number to update. Defaults to most recent active order if omitted." },
        customer_name: { type: "string", description: "New customer name (only if changed)." },
        phone: { type: "string", description: "New phone number (only if changed)." },
        address: { type: "string", description: "New delivery address (only if changed)." },
        items: {
          type: "array",
          description: "New full items list (replaces existing). Only provide if items/quantities changed.",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              product_name: { type: "string" },
              quantity: { type: "number" },
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

export const ADD_ORDER_NOTE_TOOL = {
  type: "function" as const,
  function: {
    name: "add_order_note",
    description:
      "Append a note to an existing order WITHOUT modifying its data. " +
      "WHEN TO USE: The customer mentions a special request, delivery preference, or context that's helpful for the store owner but isn't a field change. Examples: 'please gift wrap it', 'leave at the door', 'call me before delivery', 'I'm allergic to nuts — confirm ingredients', 'وصلولي بعد ٤ العصر'. " +
      "Notes are appended (history preserved) and timestamped automatically. " +
      "DO NOT USE for: changing items, address, phone, or name (use update_order for those).",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "Order number. Defaults to most recent active order if omitted." },
        note: { type: "string", description: "Short, informative note text in the customer's language." },
      },
      required: ["note"],
    },
  },
};

export const CHECK_ORDER_STATUS_TOOL = {
  type: "function" as const,
  function: {
    name: "check_order_status",
    description:
      "Look up the current status, items, and details of an existing order. " +
      "WHEN TO USE: The customer asks about their order in ANY way — where it is, current status, when it ships, ETA, tracking, delivery progress, 'did you send it?', 'any update?'. Examples in any language: 'where is my order', 'وين طلبي', 'وين صار الطلب', 'متى يوصل', 'order status', 'tracking', 'تتبع', 'لسا ما وصل'. " +
      "Call this BEFORE replying — never guess the status from chat history. After the tool returns, reply in the customer's language with the order number + current status + ETA if available. " +
      "If no order_number is given, the most recent order for this conversation is returned.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "Order number to look up. Defaults to most recent." },
      },
      required: [],
    },
  },
};

export const SEND_PRODUCT_IMAGES_TOOL = {
  type: "function" as const,
  function: {
    name: "send_product_images",
    description:
      "Send product photo(s) to the customer in the chat. " +
      "WHEN TO USE: Whenever you mention, recommend, or describe a specific product — pair it with its photo. Also when the customer explicitly asks to see something: 'show me', 'send a picture', 'صورة', 'ورجيني'. " +
      "DEFAULT: Send the FIRST image (cover) of each recommended product. " +
      "MULTIPLE ANGLES: If the customer asks for 'more photos / other angles / different sides / colors / variations' of a SPECIFIC product → send ALL remaining images from that product's images array, with captions like 'Front', 'Back', 'Side', 'View 2'. " +
      "Each product in search_products results has an `images` array — those are different photos/angles of the SAME product, NOT different products. " +
      "Use exact image URLs from search results — never invent URLs.",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          description: "List of products (or angles of one product) to send images for.",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string" },
              image_url: { type: "string", description: "Image URL from the product catalog." },
              caption: { type: "string", description: "Short caption (product name + price, or angle label)." },
            },
            required: ["product_name", "image_url"],
          },
        },
      },
      required: ["products"],
    },
  },
};

export const SEARCH_PRODUCTS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_products",
    description:
      "Search the store catalog for products matching the customer's request. " +
      "WHEN TO USE: Whenever the customer asks about, looks for, or describes a product — by name, by visual attributes, by category, by price range, or by sending an image. Examples: 'do you have black dresses?', 'بدي شي تحت ٥٠ شيكل', 'فستان أحمر', 'هاد متوفر؟'. ALSO call this when an image is in the customer's message — the system pre-extracts visual attributes from the image and blends them with whatever you pass. " +
      "Pass any attributes you can infer (type, color, pattern, style, fit, material, occasion) PLUS optional category/price filters. " +
      "Returns ranked matches with `confidence` (high/medium/low/none) and a `note` telling you how to phrase your reply. " +
      "DO NOT USE for: just confirming an order (no search needed), or for general store-info questions (hours, delivery, etc.).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search (e.g. 'red dress', 'puzzle'). Optional when attributes are provided." },
        category: { type: "string", description: "Category prefilter (e.g. 'Dresses')" },
        min_price: { type: "number" },
        max_price: { type: "number" },
        type: { type: "string", description: "dress | top | pants | jacket | skirt | shoes | bag | accessory | ..." },
        color: { type: "array", items: { type: "string" }, description: "Lowercase English color names, e.g. ['red','white']" },
        pattern: { type: "string", description: "solid | floral | striped | checkered | polka | graphic | ..." },
        style: { type: "string", description: "casual | formal | sporty | bohemian | streetwear | ..." },
        fit: { type: "string", description: "slim | regular | oversized | tailored | loose | fitted" },
        material: { type: "string", description: "cotton | chiffon | denim | leather | knit | ..." },
        occasion: { type: "array", items: { type: "string" } },
      },
      required: [],
    },
  },
};

export const LIST_CATEGORIES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_categories",
    description:
      "Return all product categories with their product counts and price ranges (overview, no full product list). " +
      "WHEN TO USE: The customer asks a vague, browse-style question with no specific product in mind. Examples: 'what do you sell?', 'show me your products', 'شو عندكم؟', 'وريني المنتجات', 'what categories do you have?'. " +
      "Use this BEFORE search_products in those vague cases, then let the customer pick a category.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const GET_ACTIVE_PROMOTIONS_TOOL = {
  type: "function" as const,
  function: {
    name: "get_active_promotions",
    description:
      "Return all currently active promotions / discount codes for this store. " +
      "WHEN TO USE: The customer asks about discounts, deals, sales, coupons, promo codes, offers. Examples: 'any discount?', 'فيه خصم؟', 'كوبون', 'عروض', 'is there a sale?'. " +
      "NEVER invent a code that isn't returned by this tool. If nothing is active, tell the customer warmly that prices are fixed right now.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const APPLY_DISCOUNT_CODE_TOOL = {
  type: "function" as const,
  function: {
    name: "apply_discount_code",
    description:
      "Validate and apply a customer-provided discount code to a SPECIFIC existing order. The order total is recomputed and the discount is persisted. " +
      "WHEN TO USE: The customer typed a discount/coupon code AFTER an order has been created (you have its order_number). Examples: 'use code SAVE10', 'هاد الكوبون: WELCOME20'. " +
      "After applying, read back the new total to the customer.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "Order number to apply the code to (e.g. ORD-00042)." },
        code: { type: "string", description: "The discount code the customer typed." },
      },
      required: ["order_number", "code"],
    },
  },
};

export const FLAG_KNOWLEDGE_GAP_TOOL = {
  type: "function" as const,
  function: {
    name: "flag_knowledge_gap",
    description:
      "Log a customer question you genuinely cannot answer from store info, owner knowledge, or the catalog, so the store owner can add an answer for next time. " +
      "WHEN TO USE: ONLY when you would otherwise have to say 'let me check that for you' / 'I'm not sure'. Call AT MOST ONCE per conversation. " +
      "DO NOT USE for things you already know from the store context, or when a different tool would answer it.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The customer's question, in their own words and language." },
      },
      required: ["question"],
    },
  },
};

export const REGISTER_RESTOCK_INTEREST_TOOL = {
  type: "function" as const,
  function: {
    name: "register_restock_interest",
    description:
      "Register a customer to be notified when an out-of-stock product is back. " +
      "WHEN TO USE: ONLY after search_products confirms the item exists but stock is 0, AND the customer agreed to be notified (e.g. 'yes please ping me', 'أكيد خبرني').",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "UUID of the product from search_products results." },
        product_name: { type: "string", description: "Plain-language product name for the confirmation message." },
        variant: { type: "string", description: "Optional size/color/variant the customer wanted." },
      },
      required: ["product_id"],
    },
  },
};

export const GET_STORE_CONTEXT_TOOL = {
  type: "function" as const,
  function: {
    name: "get_store_context",
    description:
      "Re-fetch the latest store info: working hours, delivery info, return policy, payment methods, active promotions. " +
      "WHEN TO USE: ONLY when the customer asks an operational question (hours, delivery cost, returns, payment) AND the Store Information block in your prompt is missing/outdated. Otherwise just answer from the store context already in your prompt — do NOT call this tool unnecessarily.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const ATTR_WEIGHTS: Record<string, number> = {
  type: 0.30,
  color: 0.25,
  pattern: 0.15,
  style: 0.10,
  fit: 0.08,
  material: 0.07,
  occasion: 0.05,
};

export function scoreProductAttributes(product: any, q: any): { score: number; matched: number } {
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

export async function executeSearchProducts(
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

  scored.sort((a: any, b: any) => b.final - a.final);

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
    resultsToReturn = scored.slice(0, 3).filter((s: any) => s.final > 0).map((s: any) => s.p);
  } else if (confidence === "low") {
    resultsToReturn = scored.slice(0, 3).filter((s: any) => s.final > 0).map((s: any) => s.p);
    fallbackUsed = "low_confidence";
  } else {
    // No signal at all → return up to 5 most-recent active products as alternatives
    resultsToReturn = pool.slice(0, 5);
    fallbackUsed = "no_match";
  }

  resultsToReturn = resultsToReturn.slice(0, 10);

  const formatted = resultsToReturn.map((p: any) => {
    const sc = scored.find((s: any) => s.p.id === p.id);
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


export async function executeListCategories(
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

// ─── Promotions ───────────────────────────────────────────────────────────
export async function fetchActivePromotions(supabase: any, storeId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("store_id", storeId)
    .eq("active", true);
  if (error) {
    console.warn("fetchActivePromotions error:", error.message);
    return [];
  }
  return (data || []).filter((p: any) => {
    if (p.starts_at && p.starts_at > nowIso) return false;
    if (p.ends_at && p.ends_at < nowIso) return false;
    if (p.max_uses && p.uses >= p.max_uses) return false;
    return true;
  });
}

export async function executeGetActivePromotions(
  supabase: any,
  storeId: string
): Promise<string> {
  const promos = await fetchActivePromotions(supabase, storeId);
  return JSON.stringify({
    success: true,
    promotions: promos.map((p: any) => ({
      code: p.code,
      label: p.label,
      type: p.type,
      value: p.value,
      min_order: p.min_order,
      ends_at: p.ends_at,
    })),
  });
}

export async function executeApplyDiscountCode(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: { order_number?: string; code?: string }
): Promise<string> {
  const code = (args.code || "").trim();
  const orderNumber = (args.order_number || "").trim();
  if (!code || !orderNumber) {
    return JSON.stringify({ success: false, error: "Missing code or order_number." });
  }
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("store_id", storeId)
    .eq("conversation_id", conversationId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return JSON.stringify({ success: false, error: "Order not found." });

  const { data: promo } = await supabase
    .from("promotions")
    .select("*")
    .eq("store_id", storeId)
    .ilike("code", code)
    .eq("active", true)
    .maybeSingle();
  if (!promo) return JSON.stringify({ success: false, error: "Invalid code." });

  const nowIso = new Date().toISOString();
  if (promo.starts_at && promo.starts_at > nowIso)
    return JSON.stringify({ success: false, error: "Code is not active yet." });
  if (promo.ends_at && promo.ends_at < nowIso)
    return JSON.stringify({ success: false, error: "Code has expired." });
  if (promo.max_uses && promo.uses >= promo.max_uses)
    return JSON.stringify({ success: false, error: "Code usage limit reached." });

  const subtotal = Number(order.total) + Number(order.discount_amount || 0);
  if (promo.min_order && subtotal < Number(promo.min_order)) {
    return JSON.stringify({
      success: false,
      error: `Minimum order ${promo.min_order} required for this code.`,
    });
  }

  let discount = 0;
  if (promo.type === "percent") discount = Math.round(subtotal * (Number(promo.value) / 100) * 100) / 100;
  else if (promo.type === "fixed") discount = Math.min(subtotal, Number(promo.value));
  else if (promo.type === "free_shipping") discount = 0;
  const newTotal = Math.max(0, subtotal - discount);

  await supabase
    .from("orders")
    .update({
      discount_code: promo.code,
      discount_amount: discount,
      total: newTotal,
    })
    .eq("id", order.id);

  await supabase
    .from("promotions")
    .update({ uses: (promo.uses || 0) + 1 })
    .eq("id", promo.id);

  return JSON.stringify({
    success: true,
    order_number: orderNumber,
    code: promo.code,
    discount_amount: discount,
    new_total: newTotal,
  });
}

export async function executeFlagKnowledgeGap(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: { question?: string }
): Promise<string> {
  const q = (args.question || "").trim();
  if (!q) return JSON.stringify({ success: false, error: "Empty question." });
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("knowledge_gaps")
    .select("id")
    .eq("store_id", storeId)
    .eq("status", "open")
    .ilike("customer_question", q.slice(0, 80))
    .gte("created_at", since)
    .maybeSingle();
  if (existing?.id) return JSON.stringify({ success: true, id: existing.id, deduped: true });

  const { data, error } = await supabase
    .from("knowledge_gaps")
    .insert({
      store_id: storeId,
      conversation_id: conversationId,
      customer_question: q,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("flag_knowledge_gap insert error:", error.message);
    return JSON.stringify({ success: false, error: error.message });
  }
  return JSON.stringify({ success: true, id: data?.id });
}

export async function executeRegisterRestockInterest(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: { product_id?: string; product_name?: string; variant?: string }
): Promise<string> {
  if (!args.product_id) return JSON.stringify({ success: false, error: "Missing product_id." });
  const { data: convo } = await supabase
    .from("conversations")
    .select("customer_name, customer_phone, platform_conversation_id, platform")
    .eq("id", conversationId)
    .maybeSingle();
  const contact = convo?.customer_phone || convo?.platform_conversation_id || "";
  if (!contact) return JSON.stringify({ success: false, error: "No contact info on conversation." });

  const { data: existing } = await supabase
    .from("restock_signups")
    .select("id")
    .eq("store_id", storeId)
    .eq("product_id", args.product_id)
    .eq("contact", contact)
    .eq("status", "pending")
    .maybeSingle();
  if (existing?.id) {
    return JSON.stringify({ success: true, id: existing.id, deduped: true, product_name: args.product_name });
  }

  const { data, error } = await supabase
    .from("restock_signups")
    .insert({
      store_id: storeId,
      conversation_id: conversationId,
      customer_name: convo?.customer_name || "",
      contact,
      platform: convo?.platform || null,
      product_id: args.product_id,
      variant: args.variant || null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("register_restock_interest insert error:", error.message);
    return JSON.stringify({ success: false, error: error.message });
  }
  return JSON.stringify({ success: true, id: data?.id, product_name: args.product_name });
}

export async function executeGetStoreContext(
  supabase: any,
  storeId: string
): Promise<string> {
  const { data: store } = await supabase
    .from("stores")
    .select("name, working_hours, delivery_info, return_policy, payment_methods, custom_ai_instructions")
    .eq("id", storeId)
    .maybeSingle();
  const promos = await fetchActivePromotions(supabase, storeId);
  return JSON.stringify({
    success: true,
    store: store || {},
    promotions: promos.map((p: any) => ({
      code: p.code, label: p.label, type: p.type, value: p.value, ends_at: p.ends_at,
    })),
  });
}

// Sanitize AI output: strip code blocks, excessive emojis, and technical artifacts.
// When `allowEmpty` is true the function returns an empty string instead of
// the greeting fallback — used when the turn already includes images and a
// generic "Hi! How can I help?" would be jarring mid-conversation.
