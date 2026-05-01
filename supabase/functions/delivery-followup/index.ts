// Cron: sends 24h post-delivery follow-up messages for satisfaction check
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  let sent = 0;
  let errors = 0;

  try {
    // Orders delivered >= 24h ago, no follow-up sent yet
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, store_id, conversation_id, customer_name, items, updated_at")
      .eq("status", "delivered")
      .is("followup_sent_at", null)
      .lte("updated_at", cutoff)
      .limit(100);

    if (error) throw error;

    for (const o of orders ?? []) {
      try {
        if (o.conversation_id) {
          const firstItem = Array.isArray(o.items) && o.items[0]?.product_name ? o.items[0].product_name : "your order";
          const msg = `Hi ${o.customer_name || ""} 👋 Just checking in — how are you finding ${firstItem}? We'd love to hear your feedback! 😊`;
          await fetch(`${SUPABASE_URL}/functions/v1/send-owner-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANON_KEY}`,
              "apikey": ANON_KEY,
            },
            body: JSON.stringify({
              conversation_id: o.conversation_id,
              message: msg,
              from_system: true,
            }),
          }).catch(() => {});
        }

        await supabase
          .from("orders")
          .update({ followup_sent_at: new Date().toISOString() })
          .eq("id", o.id);

        sent++;
      } catch (e) {
        errors++;
        console.error("delivery-followup item error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors, scanned: orders?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delivery-followup fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
