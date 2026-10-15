import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { metaMessagingFields } from "../_shared/meta-messaging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_MESSAGES: Record<string, string> = {
  confirmed: "Great news! ✅ Your order {order_number} has been confirmed. We're getting it ready for you!",
  processing: "🔄 Your order {order_number} is now being prepared. We'll update you when it ships!",
  shipped: "🚚 Your order {order_number} has been shipped! It's on its way to you.",
  delivered: "📦 Your order {order_number} has been delivered! Thank you for shopping with us. We hope you enjoy it!",
  cancelled: "❌ Your order {order_number} has been cancelled. If you have questions, feel free to message us.",
};

const STATUS_MESSAGES_AR: Record<string, string> = {
  confirmed: "أخبار حلوة! ✅ تم تأكيد طلبك {order_number}، وعم نجهزه إلك هلأ!",
  processing: "🔄 طلبك {order_number} قيد التجهيز هلأ، رح نخبرك أول ما ينشحن!",
  shipped: "🚚 طلبك {order_number} انشحن وهو بالطريق إلك!",
  delivered: "📦 تم توصيل طلبك {order_number}! شكراً لتسوقك معنا، ونتمنى يعجبك!",
  cancelled: "❌ تم إلغاء طلبك {order_number}. إذا عندك أي سؤال، راسلنا بأي وقت.",
};

async function sendMetaMessage(platform: string, recipientId: string, text: string, pageAccessToken: string, pageId?: string, lastCustomerAt?: string | null) {
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
        ...metaMessagingFields(platform, lastCustomerAt, "POST_PURCHASE_UPDATE"),
      }),
    });
    const data = await res.json();
    if (!res.ok) console.error(`[${platform}] Send error:`, JSON.stringify(data));
    else console.log(`[${platform}] Status notification sent to ${recipientId}`);
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
    if (!res.ok) console.error(`[whatsapp] Send error:`, JSON.stringify(data));
    else console.log(`[whatsapp] Status notification sent to ${recipientId}`);
    return data;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id, new_status } = await req.json();

    if (!order_id || !new_status) {
      return new Response(JSON.stringify({ error: "order_id and new_status required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip notification for "pending" status (initial state)
    if (new_status === "pending" || !STATUS_MESSAGES[new_status]) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "No notification for this status" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order with conversation
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, conversations(*)")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      console.error("Order lookup error:", orderErr);
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversation = order.conversations;
    if (!conversation || !conversation.platform_conversation_id) {
      console.log("No conversation linked to order, skipping notification");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "No conversation linked" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get page access token
    const { data: connection } = await supabase
      .from("platform_connections")
      .select("credentials, page_id")
      .eq("store_id", order.store_id)
      .eq("platform", conversation.platform)
      .eq("page_id", conversation.page_id || "")
      .single();

    if (!connection?.credentials) {
      console.error("No platform connection found for this conversation");
      return new Response(JSON.stringify({ success: false, error: "No platform credentials" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creds = connection.credentials as any;
    const pageAccessToken = creds.page_access_token || creds.access_token;

    if (!pageAccessToken) {
      console.error("No access token in credentials");
      return new Response(JSON.stringify({ success: false, error: "No access token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect customer language from their recent messages
    const { data: recent } = await supabase
      .from("messages")
      .select("content, created_at")
      .eq("conversation_id", conversation.id)
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(10);
    const arabicRe = /[\u0600-\u06FF]/;
    const isArabic = (recent || []).some((m: any) => arabicRe.test(m.content || "")) ||
      arabicRe.test(order.customer_name || "");

    // Build message
    const template = (isArabic ? STATUS_MESSAGES_AR : STATUS_MESSAGES)[new_status];
    const message = template.replace("{order_number}", order.order_number);

    // Send via platform
    const recipientId = conversation.platform_conversation_id;
    await sendMetaMessage(conversation.platform, recipientId, message, pageAccessToken, connection.page_id || undefined, recent?.[0]?.created_at ?? null);

    // Save message in DB
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender: "ai",
      content: message,
    });

    // Update conversation last_message
    await supabase.from("conversations").update({
      last_message: message,
      last_message_time: new Date().toISOString(),
    }).eq("id", conversation.id);

    console.log(`Status notification sent for order ${order.order_number}: ${new_status}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("order-status-notify error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
