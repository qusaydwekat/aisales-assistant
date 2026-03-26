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

async function generateAIReply(
  customerMessage: string,
  storeInfo: any,
  products: any[],
  aiSettings: any,
  conversationHistory: any[],
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback message");
    return aiSettings?.fallback_message || "Thanks for your message! Our team will get back to you shortly.";
  }

  const productList = products.map(p =>
    `- ${p.name}: ${p.description || "No description"} | Price: ${p.price} | Stock: ${p.stock} | Category: ${p.category || "General"}${p.variants ? ` | Variants: ${JSON.stringify(p.variants)}` : ""}`
  ).join("\n");

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

Instructions:
- Help customers find products, answer questions about the store, and assist with orders.
- When a customer wants to order, ask for: 1) which product(s) and quantity, 2) their full name, 3) phone number, 4) delivery address.
- Once you have ALL required info (items, name, phone, address), use the create_order tool to place the order. Do NOT ask for confirmation again after collecting all details — just create it.
- After creating an order, confirm the order number and details to the customer.
- When a customer wants to cancel an order, use the cancel_order tool. If they mention an order number, pass it. Otherwise, the most recent active order for this conversation will be cancelled.
- If cancellation fails (e.g. order already shipped/delivered), explain why it cannot be cancelled.
- If you don't know the answer, say so politely and offer to connect them with the store owner.
- Keep responses concise and helpful — this is a chat conversation.
- Never make up product information. Only reference products from the catalog above.
- Use the exact product prices from the catalog when creating orders.`;

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
        tools: [ORDER_TOOL, CANCEL_ORDER_TOOL],
      }),
    });

    if (response.status === 429 || response.status === 402) {
      console.warn("AI rate limited or credits exhausted, using fallback");
      return aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.";
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.";
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    // Handle tool calls
    if (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls?.length) {
      const toolCalls = choice.message.tool_calls || [];
      const toolResults: any[] = [];

      for (const tc of toolCalls) {
        if (tc.function?.name === "create_order") {
          const args = typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
          console.log("AI triggered create_order:", JSON.stringify(args));
          const result = await executeCreateOrder(supabase, storeId, conversationId, platform, args);
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
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
        return followData.choices?.[0]?.message?.content || "Your order has been placed! ✅";
      }
      return "Your order has been placed successfully! ✅";
    }

    return choice?.message?.content || aiSettings?.fallback_message || "Thanks for your message!";
  } catch (err) {
    console.error("AI generation error:", err);
    return aiSettings?.fallback_message || "Thanks for your message! We'll get back to you shortly.";
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

    if (platform === "facebook" || platform === "instagram") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;
          if (messaging.message?.text) {
            messages.push({
              platform,
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(messaging.timestamp || Date.now()).toISOString(),
              pageId,
            });
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
      const [storeRes, productsRes, aiSettingsRes, historyRes] = await Promise.all([
        supabase.from("stores").select("*").eq("id", storeId).single(),
        supabase.from("products").select("*").eq("store_id", storeId).eq("active", true),
        supabase.from("ai_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase.from("messages").select("sender, content, created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(20),
      ]);

      const storeInfo = storeRes.data;
      const products = productsRes.data || [];
      const aiSettings = aiSettingsRes.data;
      const history = historyRes.data || [];

      if (aiSettings?.auto_reply === false) {
        console.log("Auto-reply disabled for store:", storeId);
        continue;
      }

      const delay = (aiSettings?.response_delay || 2) * 1000;
      if (delay > 0) await new Promise(r => setTimeout(r, Math.min(delay, 5000)));

      const aiReply = await generateAIReply(msg.text, storeInfo, products, aiSettings, history, supabase, storeId, conversation.id, msg.platform);

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: aiReply,
        platform_message_id: "ai_" + Date.now(),
      });

      await supabase.from("conversations").update({
        last_message: aiReply,
        last_message_time: new Date().toISOString(),
      }).eq("id", conversation.id);

      // Send reply back to customer — only use token from DB (platform_connections)
      if (pageAccessToken) {
        console.log(`[${platform}] Sending reply to ${msg.sender} using stored page token`);
        await sendMetaReply(msg.platform, msg.sender, aiReply, pageAccessToken, connectionPageId || msg.pageId || undefined);
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
