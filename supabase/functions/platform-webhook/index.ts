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
      // Find store by page_id from platform_connections
      let storeId: string | null = null;
      if (msg.pageId) {
        const { data: conn } = await supabase
          .from("platform_connections")
          .select("store_id")
          .eq("page_id", msg.pageId)
          .eq("platform", msg.platform)
          .eq("status", "connected")
          .maybeSingle();
        storeId = conn?.store_id || null;
      }

      if (!storeId) {
        // Fallback: first store
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

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender: "customer",
          content: msg.text,
          platform_message_id: msg.platformId + "_" + Date.now(),
        });

        // Update message count on platform connection
        if (msg.pageId) {
          await supabase.rpc("increment_message_count" as any, { _page_id: msg.pageId, _platform: msg.platform });
        }
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
