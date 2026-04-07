import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { conversation_id, content } = await req.json();
    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get conversation details
    const { data: conversation, error: convoErr } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (convoErr || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platform = conversation.platform;
    const recipientId = conversation.platform_conversation_id;
    const pageId = conversation.page_id;

    if (!recipientId) {
      return new Response(JSON.stringify({ error: "No recipient ID found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find platform connection to get page access token
    let pageAccessToken: string | null = null;
    let connectionPageId: string | null = pageId;

    if (pageId) {
      const { data: conn } = await supabase
        .from("platform_connections")
        .select("credentials, page_id")
        .eq("page_id", pageId)
        .eq("status", "connected")
        .maybeSingle();

      if (conn) {
        pageAccessToken = (conn.credentials as any)?.page_access_token || null;
        connectionPageId = conn.page_id;
      } else if (platform === "instagram") {
        // Fallback for Instagram
        const { data: igConns } = await supabase
          .from("platform_connections")
          .select("credentials, page_id")
          .eq("platform", "instagram")
          .eq("status", "connected");

        const igConn = (igConns || []).find((c: any) => {
          const creds = c.credentials as any;
          return creds?.facebook_page_id === pageId ||
            creds?.instagram_business_account_id === pageId ||
            c.page_id === pageId;
        });

        if (igConn) {
          pageAccessToken = (igConn.credentials as any)?.page_access_token || null;
          connectionPageId = igConn.page_id;
        }
      }
    }

    if (!pageAccessToken) {
      // Try finding any connected platform connection for this store
      const { data: conn } = await supabase
        .from("platform_connections")
        .select("credentials, page_id")
        .eq("store_id", conversation.store_id)
        .eq("platform", platform)
        .eq("status", "connected")
        .maybeSingle();

      if (conn) {
        pageAccessToken = (conn.credentials as any)?.page_access_token || null;
        connectionPageId = conn.page_id;
      }
    }

    if (!pageAccessToken) {
      console.error(`No page access token found for conversation ${conversation_id}`);
      return new Response(JSON.stringify({ error: "No platform access token available", sent: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if content is an image
    const isImage = content.startsWith("📷 ");
    let sendResult: any;

    if (isImage) {
      const imageUrl = content.replace("📷 ", "");
      if (platform === "facebook" || platform === "instagram") {
        const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: {
              attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } },
            },
            messaging_type: "RESPONSE",
          }),
        });
        sendResult = await res.json();
        if (!res.ok) console.error(`[${platform}] Image send error:`, JSON.stringify(sendResult));
      } else if (platform === "whatsapp") {
        const res = await fetch(`https://graph.facebook.com/v21.0/${connectionPageId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipientId,
            type: "image",
            image: { link: imageUrl },
          }),
        });
        sendResult = await res.json();
        if (!res.ok) console.error(`[whatsapp] Image send error:`, JSON.stringify(sendResult));
      }
    } else {
      // Send text message
      if (platform === "facebook" || platform === "instagram") {
        const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: content },
            messaging_type: "RESPONSE",
          }),
        });
        sendResult = await res.json();
        if (!res.ok) console.error(`[${platform}] Send error:`, JSON.stringify(sendResult));
        else console.log(`[${platform}] Owner message sent to ${recipientId}`);
      } else if (platform === "whatsapp") {
        const res = await fetch(`https://graph.facebook.com/v21.0/${connectionPageId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipientId,
            type: "text",
            text: { body: content },
          }),
        });
        sendResult = await res.json();
        if (!res.ok) console.error(`[whatsapp] Send error:`, JSON.stringify(sendResult));
        else console.log(`[whatsapp] Owner message sent to ${recipientId}`);
      }
    }

    return new Response(JSON.stringify({ success: true, result: sendResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-owner-message error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
