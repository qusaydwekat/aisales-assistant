import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform"); // facebook | instagram | whatsapp

  // Facebook/Instagram webhook verification (GET)
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
    const body = await req.json();
    console.log(`[${platform}] Webhook received:`, JSON.stringify(body).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let messages: { platform: string; sender: string; text: string; platformId: string; timestamp: string }[] = [];

    if (platform === "facebook" || platform === "instagram") {
      // Meta webhook format
      for (const entry of body.entry || []) {
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.text) {
            messages.push({
              platform: platform!,
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(messaging.timestamp || Date.now()).toISOString(),
            });
          }
        }
      }
    } else if (platform === "whatsapp") {
      // WhatsApp Cloud API format
      for (const entry of body.entry || []) {
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
                });
              }
            }
          }
        }
      }
    }

    // Process each incoming message
    for (const msg of messages) {
      // Find or create conversation by platform_conversation_id
      let { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("platform_conversation_id", msg.platformId)
        .eq("platform", msg.platform)
        .maybeSingle();

      if (!conversation) {
        // Find the first store (in production, map by page_id)
        const { data: store } = await supabase
          .from("stores")
          .select("id")
          .limit(1)
          .single();

        if (!store) continue;

        const { data: newConvo } = await supabase
          .from("conversations")
          .insert({
            store_id: store.id,
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
          .update({
            last_message: msg.text,
            last_message_time: msg.timestamp,
            unread: true,
          })
          .eq("id", conversation.id);
      }

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender: "customer",
          content: msg.text,
          platform_message_id: msg.platformId + "_" + Date.now(),
        });
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
