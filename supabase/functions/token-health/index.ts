// Daily cron: checks every connected Meta page token, records its health, and
// alerts the store owner before an expiring or revoked token breaks replies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const WARN_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const appToken = `${Deno.env.get("META_APP_ID")}|${Deno.env.get("META_APP_SECRET")}`;
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: conns, error } = await supabase
    .from("platform_connections")
    .select("id, store_id, platform, page_name, credentials, token_status")
    .eq("status", "connected")
    .limit(500);
  if (error) return json({ ok: false, error: error.message }, 500);

  const results = { checked: 0, valid: 0, expiring: 0, invalid: 0 };
  for (const c of conns ?? []) {
    const token = (c.credentials as any)?.page_access_token || (c.credentials as any)?.access_token;
    let status = "invalid";
    let expiresAt: string | null = null;
    let errMsg: string | null = null;
    if (!token) {
      errMsg = "No access token stored";
    } else {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
        );
        const d = (await r.json())?.data;
        if (d?.is_valid) {
          const exp = Number(d.expires_at || 0) * 1000;
          expiresAt = exp > 0 ? new Date(exp).toISOString() : null;
          status = exp > 0 && exp - Date.now() < WARN_MS ? "expiring" : "valid";
        } else {
          errMsg = d?.error?.message || "Token is no longer valid";
        }
      } catch (e) {
        // Network issue: keep previous status, try again tomorrow.
        console.error("token-health check failed:", e);
        continue;
      }
    }
    results.checked++;
    (results as any)[status]++;

    await supabase.from("platform_connections").update({
      token_status: status,
      token_expires_at: expiresAt,
      token_checked_at: new Date().toISOString(),
      token_error: errMsg,
    }).eq("id", c.id);

    // Alert once per status change.
    if (status !== "valid" && c.token_status !== status) {
      const { data: store } = await supabase.from("stores").select("user_id").eq("id", c.store_id).maybeSingle();
      if (store?.user_id) {
        await supabase.from("notifications").insert({
          user_id: store.user_id,
          type: "token_health",
          title: status === "expiring" ? `${c.page_name || c.platform} connection expires soon` : `${c.page_name || c.platform} disconnected`,
          description: "Reconnect your page from the Platforms page so customer replies keep working.",
        });
      }
    }
  }
  return json({ ok: true, ...results });
});
