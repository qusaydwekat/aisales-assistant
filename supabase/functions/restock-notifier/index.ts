// Cron: notifies customers who signed up for restock alerts when products are back in stock
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

  let notified = 0;
  let errors = 0;

  try {
    const { data: signups, error } = await supabase
      .from("restock_signups")
      .select("id, store_id, product_id, contact, customer_name, platform, conversation_id, variant")
      .eq("status", "pending")
      .limit(200);

    if (error) throw error;

    for (const s of signups ?? []) {
      try {
        const { data: product } = await supabase
          .from("products")
          .select("id, name, stock, active")
          .eq("id", s.product_id)
          .maybeSingle();

        if (!product || !product.active) continue;
        if ((product.stock ?? 0) <= 0) continue;

        // Try to send via meta if conversation exists
        if (s.conversation_id && s.platform) {
          const message = `Good news ${s.customer_name || ""}! 🎉 "${product.name}" is back in stock. Want me to reserve one for you?`.trim();
          await fetch(`${SUPABASE_URL}/functions/v1/send-owner-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANON_KEY}`,
              "apikey": ANON_KEY,
            },
            body: JSON.stringify({
              conversation_id: s.conversation_id,
              message,
              from_system: true,
            }),
          }).catch(() => {});
        }

        await supabase
          .from("restock_signups")
          .update({ status: "notified", notified_at: new Date().toISOString() })
          .eq("id", s.id);

        notified++;
      } catch (e) {
        errors++;
        console.error("restock-notifier item error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, notified, errors, scanned: signups?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("restock-notifier fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
