import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyMetaSignature(req: Request, body: string): Promise<boolean> {
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
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${hex}`;

  return signature === expected;
}

// Auto-detect platform from Meta webhook payload
function detectPlatform(body: any, queryPlatform: string | null): string {
  // If explicitly provided via query param, use it
  if (queryPlatform) return queryPlatform;

  // Auto-detect from Meta webhook object field
  const obj = body?.object;
  if (obj === "page") return "facebook";
  if (obj === "instagram") return "instagram";
  if (obj === "whatsapp_business_account") return "whatsapp";

  // Fallback: check entry structure
  if (body?.entry?.[0]?.messaging) return "facebook";
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages) return "whatsapp";

  return "facebook"; // default
}

async function sendMetaReply(platform: string, recipientId: string, text: string, pageAccessToken: string, pageId?: string) {
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

async function sendMetaImage(platform: string, recipientId: string, imageUrl: string, caption: string, pageAccessToken: string, pageId?: string) {
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

const ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "create_order",
    description: "Create a new order when the customer has confirmed items and provided their full name, phone number, and delivery address. Call this ONLY after the customer explicitly confirms all details.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's phone number" },
        address: { type: "string", description: "Customer's delivery address" },
        items: {
          type: "array",
          description: "List of ordered items",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: { type: "string", description: "Any special notes or requests from the customer" },
      },
      required: ["customer_name", "phone", "address", "items"],
    },
  },
};

const CANCEL_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "cancel_order",
    description: "Cancel an existing order when the customer explicitly requests to cancel. Use the order number if provided, otherwise look up the most recent pending order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number (e.g. ORD-00001). Optional — if not provided, the most recent pending order for this conversation will be cancelled." },
        reason: { type: "string", description: "Reason for cancellation if the customer provides one" },
      },
      required: [],
    },
  },
};

const UPDATE_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "update_order",
    description: "Update an existing order. Use this to modify items, address, phone, name, or notes on an order that is still pending, confirmed, or processing. Always prefer updating an existing order over creating a new one when the customer wants to change something about their current order.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number to update (e.g. ORD-00001). If not provided, the most recent active order for this conversation will be updated." },
        customer_name: { type: "string", description: "Updated customer name (only if changed)" },
        phone: { type: "string", description: "Updated phone number (only if changed)" },
        address: { type: "string", description: "Updated delivery address (only if changed)" },
        items: {
          type: "array",
          description: "Updated full list of items (replaces existing items). Only provide if items changed.",
          items: {
            type: "object",
            properties: {
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

const CHECK_ORDER_STATUS_TOOL = {
  type: "function" as const,
  function: {
    name: "check_order_status",
    description: "Look up the current status and details of an order from the database. Use this whenever the customer asks about their order status, delivery progress, or order details. You can search by order number or get the most recent order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number to look up (e.g. ORD-00001). If not provided, returns the most recent order for this conversation." },
      },
      required: [],
    },
  },
};

const SEND_PRODUCT_IMAGES_TOOL = {
  type: "function" as const,
  function: {
    name: "send_product_images",
    description: "Send product images to the customer. Use this when the customer asks to see a product, asks what it looks like, or when recommending/discussing products. Always send images alongside your text description.",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          description: "List of products to send images for",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string", description: "Name of the product" },
              image_url: { type: "string", description: "The image URL from the product catalog" },
              caption: { type: "string", description: "Short caption for the image (e.g. product name and price)" },
            },
            required: ["product_name", "image_url"],
          },
        },
      },
      required: ["products"],
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

  // Create notification for store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id, name")
    .eq("id", storeId)
    .single();

  if (store) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `New order ${order.order_number}`,
      description: `${args.customer_name} placed an order for ${args.items.length} item(s) — Total: ${total}`,
      type: "order",
    });
  }

  console.log(`Order created: ${order.order_number}, total: ${total}`);
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    total,
    items_count: args.items.length,
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
    query = query.eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Cancel order lookup error:", fetchErr);
    return JSON.stringify({ success: false, error: "No active order found to cancel." });
  }

  const order = orders[0];
  if (order.status === "cancelled") {
    return JSON.stringify({ success: false, error: `Order ${order.order_number} is already cancelled.` });
  }
  if (order.status === "delivered" || order.status === "shipped") {
    return JSON.stringify({ success: false, error: `Order ${order.order_number} has already been ${order.status} and cannot be cancelled.` });
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
      description: `${order.customer_name} cancelled their order.${args.reason ? ` Reason: ${args.reason}` : ""}`,
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
    query = query.eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Update order lookup error:", fetchErr);
    return JSON.stringify({ success: false, error: "No active order found to update." });
  }

  const order = orders[0];
  if (["cancelled", "delivered", "shipped"].includes(order.status)) {
    return JSON.stringify({ success: false, error: `Order ${order.order_number} is ${order.status} and cannot be updated.` });
  }

  const updateData: any = {};
  if (args.customer_name) updateData.customer_name = args.customer_name;
  if (args.phone) updateData.phone = args.phone;
  if (args.address) updateData.address = args.address;
  if (args.notes !== undefined) updateData.notes = args.notes;
  if (args.items && args.items.length > 0) {
    updateData.items = args.items;
    updateData.total = args.items.reduce(
      (sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1), 0
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
    await supabase.from("conversations").update(convoUpdate).eq("id", conversationId);
  }

  // Notify store owner
  const { data: store } = await supabase.from("stores").select("user_id").eq("id", storeId).single();
  if (store) {
    const changes = Object.keys(updateData).join(", ");
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `Order ${order.order_number} updated`,
      description: `${order.customer_name} updated their order. Changed: ${changes}`,
      type: "order",
    });
  }

  console.log(`Order updated: ${order.order_number}, fields: ${Object.keys(updateData).join(", ")}`);
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
    query = query.eq("conversation_id", conversationId)
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

  console.log(`Order status checked: ${result.map((o: any) => o.order_number).join(", ")}`);
  return JSON.stringify({ success: true, orders: result });
}

// Sanitize AI output: strip code blocks, excessive emojis, and technical artifacts
function sanitizeAIResponse(text: string): string {
  // Remove markdown code blocks
  let clean = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  // Remove HTML tags
  clean = clean.replace(/<[^>]+>/g, "");
  // Collapse repeated emojis (more than 2 of the same emoji in a row)
  clean = clean.replace(/([\u{1F000}-\u{1FFFF}])\1{2,}/gu, "$1");
  // Remove lines that look like code (starting with //, #!, import, const, let, var, function, return, etc.)
  clean = clean.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("//") && !trimmed.startsWith("#!") &&
      !trimmed.startsWith("import ") && !trimmed.startsWith("export ") &&
      !/^(const |let |var |function |return |if |for |while |class )/.test(trimmed);
  }).join("\n");
  // Collapse excessive whitespace
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  // If after cleaning the response is empty or too short, return a fallback
  if (clean.length < 3) {
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

async function generateAIReply(
  customerMessage: string,
  storeInfo: any,
  products: any[],
  aiSettings: any,
  conversationHistory: any[],
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string,
  existingOrders: any[]
): Promise<AIReplyResult> {
  const emptyResult = (text: string): AIReplyResult => ({ text: sanitizeAIResponse(text), images: [] });
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback message");
    return emptyResult(aiSettings?.fallback_message || "Thanks for your message! Our team will get back to you shortly.");
  }

  const productList = products.map(p => {
    const imageInfo = p.images?.length ? ` | Images: ${p.images.join(", ")}` : " | Images: none";
    return `- ${p.name}: ${p.description || "No description"} | Price: ${p.price} | Stock: ${p.stock} | Category: ${p.category || "General"}${p.variants ? ` | Variants: ${JSON.stringify(p.variants)}` : ""}${imageInfo}`;
  }).join("\n");

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
  else if (language === "en") languageInstruction = "Always respond in English.";
  else languageInstruction = "Detect the customer's language and respond in the same language (Arabic or English).";

  const ordersContext = existingOrders.length > 0
    ? `\n\nExisting Orders for this conversation:\n${existingOrders.map(o => `- ${o.order_number} | Status: ${o.status} | Customer: ${o.customer_name} | Items: ${JSON.stringify(o.items)} | Total: ${o.total} | Phone: ${o.phone || "N/A"} | Address: ${o.address || "N/A"} | Notes: ${o.notes || "N/A"}`).join("\n")}`
    : "\n\nNo existing orders for this conversation.";

  const systemPrompt = `You are ${personaName}, an AI sales assistant for "${storeInfo.name}".
Your tone is ${toneDesc}. ${languageInstruction}

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

Product Catalog:
${productList || "No products available yet."}
${ordersContext}

CRITICAL ORDER RULES — READ CAREFULLY:
**MOST IMPORTANT**: You MUST call the create_order / update_order / cancel_order tool to perform any order action. NEVER just say "your order has been created" without actually calling the tool. If you do not call the tool, the order DOES NOT EXIST in our system and the store owner will never see it.

**ORDER STATUS QUERIES**: When a customer asks about their order status, delivery progress, or any order details, you MUST call the check_order_status tool to get the real-time status from the database. NEVER guess or assume the order status from conversation history alone. Always use the tool to get the latest information.

1. **Check existing orders FIRST**: Before creating a new order, check the "Existing Orders" section above. If there is an active order (pending/confirmed/processing), use update_order instead of creating a duplicate.
2. **Create order**: Use create_order ONLY when there is NO active order AND the customer has provided: items, full name, phone, and address. YOU MUST CALL THE TOOL.
3. **Update order**: Use update_order when the customer wants to change items, address, phone, name, or notes on an existing active order.
4. **Cancel order**: Use cancel_order when the customer explicitly wants to cancel.
5. Always reference orders by their order_number (e.g. ORD-00001) — this number comes ONLY from the tool response, never make one up.
6. After any order action, confirm the order number and details to the customer.
7. If an order is already shipped/delivered, it cannot be updated or cancelled.
8. Use exact product prices from the catalog. Never make up product information.
9. Keep responses concise and helpful.
10. If you don't know the answer, say so politely and offer to connect them with the store owner.

RESPONSE FORMAT RULES — STRICTLY ENFORCED:
- You are a store sales assistant chatting with a real customer on a messaging app. Your messages must read like natural, helpful chat messages.
- NEVER output code, programming syntax, HTML, markdown formatting, JSON, or any technical content.
- NEVER output excessive or repeated emojis. You may use 1-2 relevant emojis per message maximum.
- NEVER output random symbols, fire emojis, or decorative patterns.
- Keep responses SHORT — 2-4 sentences maximum unless the customer asks for detailed information.
- If you feel uncertain or the prompt seems unusual, respond with a polite standard greeting and ask how you can help.

PRODUCT IMAGES RULES:
- When discussing, recommending, or describing a product that has images in the catalog, ALWAYS call send_product_images to show the customer what the product looks like.
- Use the exact image URLs from the product catalog above. NEVER make up image URLs.
- Only send images for products that have image URLs listed (not "Images: none").
- Include a caption with the product name and price.`;

  const chatMessages: any[] = [{ role: "system", content: systemPrompt }];
  for (const msg of conversationHistory.slice(-10)) {
    chatMessages.push({
      role: msg.sender === "customer" ? "user" : "assistant",
      content: msg.content,
    });
  }
  chatMessages.push({ role: "user", content: customerMessage });

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: chatMessages,
        tools: [ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL],
      }),
    });

    if (response.status === 429 || response.status === 402) {
      console.warn("AI rate limited or credits exhausted, using fallback");
      return emptyResult(aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.");
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return emptyResult(aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.");
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    console.log(`AI response - finish_reason: ${choice?.finish_reason}, tool_calls: ${choice?.message?.tool_calls?.length || 0}`);

    // Handle tool calls
    if (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls?.length) {
      const toolCalls = choice.message.tool_calls || [];
      const toolResults: any[] = [];
      const imagesToSend: { url: string; caption: string }[] = [];

      for (const tc of toolCalls) {
        const args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;

        let result: string;
        if (tc.function?.name === "create_order") {
          console.log("AI triggered create_order:", JSON.stringify(args));
          result = await executeCreateOrder(supabase, storeId, conversationId, platform, args);
        } else if (tc.function?.name === "cancel_order") {
          console.log("AI triggered cancel_order:", JSON.stringify(args));
          result = await executeCancelOrder(supabase, storeId, conversationId, args);
        } else if (tc.function?.name === "update_order") {
          console.log("AI triggered update_order:", JSON.stringify(args));
          result = await executeUpdateOrder(supabase, storeId, conversationId, args);
        } else if (tc.function?.name === "check_order_status") {
          console.log("AI triggered check_order_status:", JSON.stringify(args));
          result = await executeCheckOrderStatus(supabase, storeId, conversationId, args);
        } else if (tc.function?.name === "send_product_images") {
          console.log("AI triggered send_product_images:", JSON.stringify(args));
          for (const p of args.products || []) {
            if (p.image_url) {
              imagesToSend.push({ url: p.image_url, caption: p.caption || p.product_name || "" });
            }
          }
          result = JSON.stringify({ success: true, images_queued: imagesToSend.length });
        } else {
          result = JSON.stringify({ error: "Unknown tool" });
        }

        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Send tool results back to get final reply
      const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            ...chatMessages,
            choice.message,
            ...toolResults,
          ],
        }),
      });

      if (followUp.ok) {
        const followData = await followUp.json();
        const text = sanitizeAIResponse(followData.choices?.[0]?.message?.content || "Here you go! ✅");
        return { text, images: imagesToSend };
      }
      return { text: sanitizeAIResponse("Your order has been placed successfully! ✅"), images: imagesToSend };
    }

    return emptyResult(choice?.message?.content || aiSettings?.fallback_message || "Thanks for your message!");
  } catch (err) {
    console.error("AI generation error:", err);
    return emptyResult(aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.");
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

    const VERIFY_TOKEN = Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";

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
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }

    const body = JSON.parse(bodyText);

    // Auto-detect platform from payload
    const platform = detectPlatform(body, queryPlatform);
    console.log(`[${platform}] Webhook received (object: ${body?.object}):`, JSON.stringify(body).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let messages: { platform: string; sender: string; text: string; platformId: string; timestamp: string; pageId?: string }[] = [];

    if (platform === "facebook") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;
          if (messaging.message?.text) {
            messages.push({
              platform: "facebook",
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(messaging.timestamp || Date.now()).toISOString(),
              pageId,
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
          if (messaging.message?.text) {
            messages.push({
              platform: "instagram",
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(messaging.timestamp || Date.now()).toISOString(),
              pageId: igbaId,
            });
          }
        }
        // Also handle Instagram changes-based format (some API versions)
        for (const change of entry.changes || []) {
          if (change.field === "messages" && change.value?.message) {
            const val = change.value;
            if (val.message?.text) {
              messages.push({
                platform: "instagram",
                sender: val.sender?.id || "unknown",
                text: val.message.text,
                platformId: val.sender?.id || "",
                timestamp: new Date(val.timestamp || Date.now()).toISOString(),
                pageId: igbaId,
              });
            }
          }
        }
      }
    } else if (platform === "whatsapp") {
      for (const entry of body.entry || []) {
        const phoneNumberId = entry.changes?.[0]?.value?.metadata?.phone_number_id;
        for (const change of entry.changes || []) {
          if (change.value?.messages) {
            for (const msg of change.value.messages) {
              if (msg.type === "text") {
                messages.push({
                  platform: "whatsapp",
                  sender: msg.from || "unknown",
                  text: msg.text?.body || "",
                  platformId: msg.from || "",
                  timestamp: new Date(parseInt(msg.timestamp || "0") * 1000).toISOString(),
                  pageId: phoneNumberId,
                });
              }
            }
          }
        }
      }
    }

    console.log(`[${platform}] Parsed ${messages.length} message(s)`);

    // Process each incoming message
    for (const msg of messages) {
      // Find store + connection by page_id — try multiple platforms since Instagram pages map to FB page IDs
      let storeId: string | null = null;
      let pageAccessToken: string | null = null;
      let connectionPageId: string | null = null;

      if (msg.pageId) {
        // Look for connection by page_id across all platform types
        const { data: conn } = await supabase
          .from("platform_connections")
          .select("store_id, credentials, page_id, platform")
          .eq("page_id", msg.pageId)
          .eq("status", "connected")
          .maybeSingle();

        if (conn) {
          storeId = conn.store_id;
          pageAccessToken = (conn.credentials as any)?.page_access_token || null;
          connectionPageId = conn.page_id;
          console.log(`[${platform}] Found connection for page ${msg.pageId}, store: ${storeId}`);
        } else {
          console.warn(`[${platform}] No connected page found for page_id: ${msg.pageId}`);
        }
      }

      if (!storeId) {
        // Fallback: find any store (for testing)
        const { data: store } = await supabase.from("stores").select("id").limit(1).single();
        if (!store) {
          console.error("No stores found in database");
          continue;
        }
        storeId = store.id;
        console.warn(`[${platform}] Using fallback store: ${storeId}`);
      }

      // Find or create conversation
      let { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("platform_conversation_id", msg.platformId)
        .eq("platform", msg.platform)
        .maybeSingle();

      if (!conversation) {
        const { data: newConvo, error: convoErr } = await supabase
          .from("conversations")
          .insert({
            store_id: storeId,
            platform: msg.platform as any,
            platform_conversation_id: msg.platformId,
            customer_name: `Customer ${msg.platformId.slice(-4)}`,
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
        // Update page_id if missing
        const updateData: any = { last_message: msg.text, last_message_time: msg.timestamp, unread: true };
        if (msg.pageId && !conversation.page_id) {
          updateData.page_id = msg.pageId;
        }
        await supabase
          .from("conversations")
          .update(updateData)
          .eq("id", conversation.id);
      }

      if (!conversation) continue;

      // Store customer message
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "customer",
        content: msg.text,
        platform_message_id: msg.platformId + "_" + Date.now(),
      });

      // ─── AI Auto-Reply ───
      const [storeRes, productsRes, aiSettingsRes, historyRes, ordersRes] = await Promise.all([
        supabase.from("stores").select("*").eq("id", storeId).single(),
        supabase.from("products").select("*").eq("store_id", storeId).eq("active", true),
        supabase.from("ai_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase.from("messages").select("sender, content, created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(20),
        supabase.from("orders").select("order_number, status, customer_name, items, total, phone, address, notes")
          .eq("conversation_id", conversation.id)
          .in("status", ["pending", "confirmed", "processing"])
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const storeInfo = storeRes.data;
      const products = productsRes.data || [];
      const aiSettings = aiSettingsRes.data;
      const history = historyRes.data || [];
      const existingOrders = ordersRes.data || [];

      if (aiSettings?.auto_reply === false) {
        console.log("Auto-reply disabled for store:", storeId);
        continue;
      }

      const delay = (aiSettings?.response_delay || 2) * 1000;
      if (delay > 0) await new Promise(r => setTimeout(r, Math.min(delay, 5000)));

      const aiResult = await generateAIReply(msg.text, storeInfo, products, aiSettings, history, supabase, storeId, conversation.id, msg.platform, existingOrders);

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: aiResult.text,
        platform_message_id: "ai_" + Date.now(),
      });

      await supabase.from("conversations").update({
        last_message: aiResult.text,
        last_message_time: new Date().toISOString(),
      }).eq("id", conversation.id);

      // Send reply back to customer — only use token from DB (platform_connections)
      if (pageAccessToken) {
        console.log(`[${platform}] Sending reply to ${msg.sender} using stored page token`);
        await sendMetaReply(msg.platform, msg.sender, aiResult.text, pageAccessToken, connectionPageId || msg.pageId || undefined);

        // Send product images if any
        for (const img of aiResult.images) {
          try {
            await sendMetaImage(msg.platform, msg.sender, img.url, img.caption, pageAccessToken, connectionPageId || msg.pageId || undefined);
          } catch (imgErr) {
            console.error(`[${platform}] Failed to send image:`, imgErr);
          }
        }
      } else {
        console.warn(`[${platform}] No page access token found in platform_connections for page ${msg.pageId}, cannot send reply`);
      }

      // Update message count and last_synced_at
      if (msg.pageId) {
        try {
          await supabase
            .from("platform_connections")
            .update({
              message_count: (await supabase
                .from("platform_connections")
                .select("message_count")
                .eq("page_id", msg.pageId)
                .eq("status", "connected")
                .single()
                .then(r => r.data?.message_count || 0)) + 1,
              last_synced_at: new Date().toISOString(),
            })
            .eq("page_id", msg.pageId)
            .eq("status", "connected");
        } catch {}
      }
    }

    return new Response(JSON.stringify({ success: true, processed: messages.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
