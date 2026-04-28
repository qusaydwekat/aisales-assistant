// Silence follow-up worker.
// Runs on a cron schedule. For each conversation where:
//   - the store has ai_settings.silence_followup_enabled = true
//   - the LAST message was from the AI (sender = "ai") 10–60 min ago
//   - the conversation has not yet received a follow-up nudge for this silence
// it sends ONE soft follow-up message via the platform and stores it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOLLOWUP_MIN_MINUTES = 10;
const FOLLOWUP_MAX_MINUTES = 60; // don't follow up on very stale conversations
const FOLLOWUP_MARKER = "[silence_followup_v1]";

const FOLLOWUP_TEMPLATES = {
  en: [
    "Just checking in 🙂 — is there anything else I can help you with?",
    "Hey! Did you get a chance to look at what I sent? Happy to help if you have any questions.",
    "Still here whenever you're ready — let me know if you'd like to continue.",
  ],
  ar: [
    "مرحبا 🙂 حابة أتأكد إذا في إشي ثاني بقدر أساعدك فيه؟",
    "شفت اللي بعتلك إياه؟ أنا موجودة لأي استفسار 😊",
    "لما تكون جاهز كمل معي، أنا هون.",
  ],
};

function pickTemplate(language: string, customerName: string): string {
  const isAr = language === "ar" || language === "arabic";
  const list = isAr ? FOLLOWUP_TEMPLATES.ar : FOLLOWUP_TEMPLATES.en;
  const tpl = list[Math.floor(Math.random() * list.length)];
  const firstName = (customerName || "").trim().split(/\s+/)[0];
  if (firstName && Math.random() < 0.5) {
    return isAr ? `${firstName}، ${tpl}` : `${firstName}, ${tpl}`;
  }
  return tpl;
}

async function sendPlatformReply(
  platform: string,
  recipientId: string,
  pageAccessToken: string,
  text: string
): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
    const body =
      platform === "instagram"
        ? { recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" }
        : { recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`[silence-followup] send failed (${platform}): ${res.status} ${t}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[silence-followup] send error:`, e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = Date.now();
  const minCutoff = new Date(now - FOLLOWUP_MAX_MINUTES * 60_000).toISOString();
  const maxCutoff = new Date(now - FOLLOWUP_MIN_MINUTES * 60_000).toISOString();

  // 1) Find candidate conversations.
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id, store_id, platform, customer_name, last_message_time, ai_auto_reply, page_id, platform_conversation_id")
    .eq("ai_auto_reply", true)
    .gte("last_message_time", minCutoff)
    .lte("last_message_time", maxCutoff)
    .limit(200);

  if (convErr) {
    return new Response(JSON.stringify({ error: convErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;

  for (const conv of convs || []) {
    try {
      // Per-store toggle
      const { data: settings } = await supabase
        .from("ai_settings")
        .select("silence_followup_enabled, language")
        .eq("store_id", conv.store_id)
        .maybeSingle();
      if (!settings?.silence_followup_enabled) {
        skipped++;
        continue;
      }

      // Fetch last 5 messages to verify the last one is from AI and no follow-up was already sent.
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!lastMsgs || lastMsgs.length === 0) {
        skipped++;
        continue;
      }
      const last = lastMsgs[0];
      if (last.sender !== "ai") {
        skipped++;
        continue;
      }
      // Already followed up?
      const alreadyFollowedUp = lastMsgs.some(
        (m: any) => typeof m.content === "string" && m.content.includes(FOLLOWUP_MARKER)
      );
      if (alreadyFollowedUp) {
        skipped++;
        continue;
      }

      // Get page token
      const { data: conn } = await supabase
        .from("platform_connections")
        .select("credentials, page_id")
        .eq("store_id", conv.store_id)
        .eq("platform", conv.platform)
        .eq("page_id", conv.page_id || "")
        .maybeSingle();

      const pageAccessToken = conn?.credentials?.page_access_token;
      const recipientId = conv.platform_conversation_id;
      if (!pageAccessToken || !recipientId) {
        skipped++;
        continue;
      }

      const text = pickTemplate(settings.language || "both", conv.customer_name);
      const ok = await sendPlatformReply(conv.platform, recipientId, pageAccessToken, text);
      if (!ok) {
        skipped++;
        continue;
      }

      // Persist message (with hidden marker so we don't re-trigger).
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        sender: "ai",
        content: `${text}\n\n${FOLLOWUP_MARKER}`,
        platform_message_id: null,
      });

      await supabase
        .from("conversations")
        .update({ last_message: text, last_message_time: new Date().toISOString() })
        .eq("id", conv.id);

      sent++;
    } catch (e) {
      console.error(`[silence-followup] conv ${conv.id} error:`, e);
      skipped++;
    }
  }

  return new Response(
    JSON.stringify({ checked: (convs || []).length, sent, skipped }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
