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

// Get Page Access Token from a User Access Token
async function getPageAccessToken(pageId: string, userAccessToken: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${userAccessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.access_token) {
      console.log(`[meta] Got page access token for page ${pageId}`);
      return data.access_token;
    }
    console.error(`[meta] Failed to get page token:`, JSON.stringify(data));
    return null;
  } catch (err) {
    console.error(`[meta] Error getting page token:`, err);
    return null;
  }
}

// Send a message back via Meta Send API
async function sendMetaReply(platform: string, recipientId: string, text: string, pageAccessToken: string, pageId?: string) {
  // If we have a user token (starts with EAAM) and a pageId, exchange for page token
  if (pageId && pageAccessToken.startsWith("EAAM")) {
    const pageToken = await getPageAccessToken(pageId, pageAccessToken);
    if (pageToken) {
      pageAccessToken = pageToken;
    }
  }

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

// Generate AI reply using Lovable AI Gateway
async function generateAIReply(
  customerMessage: string,
  storeInfo: any,
  products: any[],
  aiSettings: any,
  conversationHistory: any[]
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback message");
    return aiSettings?.fallback_message || "Thanks for your message! Our team will get back to you shortly.";
  }

  // Build product catalog for AI context
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
- If a customer wants to order, collect their name, phone number, and delivery address, then confirm the order details.
- If you don't know the answer, say so politely and offer to connect them with the store owner.
- Keep responses concise and helpful — this is a chat conversation.
- Never make up product information. Only reference products from the catalog above.`;

  // Build messages array with conversation history
  const messages: any[] = [{ role: "system", content: systemPrompt }];
  for (const msg of conversationHistory.slice(-10)) {
    messages.push({
      role: msg.sender === "customer" ? "user" : "assistant",
      content: msg.content,
    });
  }
  messages.push({ role: "user", content: customerMessage });

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
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
    return data.choices?.[0]?.message?.content || aiSettings?.fallback_message || "Thanks for your message!";
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
  const platform = url.searchParams.get("platform");

  // Facebook/Instagram/WhatsApp webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified for platform:", platform);
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
    console.log(`[${platform}] Webhook received:`, JSON.stringify(body).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let messages: { platform: string; sender: string; text: string; platformId: string; timestamp: string; pageId?: string }[] = [];

    if (platform === "facebook" || platform === "instagram") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        for (const messaging of entry.messaging || []) {
          // Skip echo messages (messages sent BY the page)
          if (messaging.message?.is_echo) continue;
          if (messaging.message?.text) {
            messages.push({
              platform: platform!,
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

    // Process each incoming message
    for (const msg of messages) {
      // Find store + connection by page_id
      let storeId: string | null = null;
      let pageAccessToken: string | null = null;
      let connectionPageId: string | null = null;

      if (msg.pageId) {
        const { data: conn } = await supabase
          .from("platform_connections")
          .select("store_id, credentials, page_id")
          .eq("page_id", msg.pageId)
          .eq("platform", msg.platform)
          .eq("status", "connected")
          .maybeSingle();

        if (conn) {
          storeId = conn.store_id;
          pageAccessToken = (conn.credentials as any)?.page_access_token || null;
          connectionPageId = conn.page_id;
        }
      }

      if (!storeId) {
        const { data: store } = await supabase.from("stores").select("id").limit(1).single();
        if (!store) continue;
        storeId = store.id;
      }

      // Find or create conversation
      let { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("platform_conversation_id", msg.platformId)
        .eq("platform", msg.platform)
        .maybeSingle();

      if (!conversation) {
        const { data: newConvo } = await supabase
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
          })
          .select()
          .single();
        conversation = newConvo;
      } else {
        await supabase
          .from("conversations")
          .update({ last_message: msg.text, last_message_time: msg.timestamp, unread: true })
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
      // Fetch store info, products, AI settings, and conversation history
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

      // Check if auto_reply is enabled (default true)
      if (aiSettings?.auto_reply === false) {
        console.log("Auto-reply disabled for store:", storeId);
        continue;
      }

      // Add response delay
      const delay = (aiSettings?.response_delay || 2) * 1000;
      if (delay > 0) await new Promise(r => setTimeout(r, Math.min(delay, 5000)));

      // Generate AI reply
      const aiReply = await generateAIReply(msg.text, storeInfo, products, aiSettings, history);

      // Store AI reply in database
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: aiReply,
        platform_message_id: "ai_" + Date.now(),
      });

      // Update conversation last message
      await supabase.from("conversations").update({
        last_message: aiReply,
        last_message_time: new Date().toISOString(),
      }).eq("id", conversation.id);

      // Send reply back to customer via Meta API
      const tokenToUse = pageAccessToken || Deno.env.get("META_PAGE_ACCESS_TOKEN");
      if (tokenToUse) {
        await sendMetaReply(msg.platform, msg.sender, aiReply, tokenToUse, connectionPageId || msg.pageId || undefined);
      } else {
        console.warn(`No page_access_token for platform ${msg.platform}, cannot send reply`);
      }

      // Update message count
      if (msg.pageId) {
        try {
          const { data: connData } = await supabase
            .from("platform_connections")
            .select("message_count")
            .eq("page_id", msg.pageId)
            .eq("platform", msg.platform)
            .single();
          if (connData) {
            await supabase
              .from("platform_connections")
              .update({ message_count: (connData.message_count || 0) + 1 })
              .eq("page_id", msg.pageId)
              .eq("platform", msg.platform);
          }
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
