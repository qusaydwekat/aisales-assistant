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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Find active users whose paid_until has passed (exclude admins)
    const { data: expiredUsers, error: fetchError } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, paid_until")
      .eq("status", "active")
      .not("paid_until", "is", null)
      .lt("paid_until", now);

    if (fetchError) throw fetchError;

    if (!expiredUsers || expiredUsers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired subscriptions found", suspended: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out admin users
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = new Set((adminRoles || []).map((r) => r.user_id));
    const usersToSuspend = expiredUsers.filter((u) => !adminIds.has(u.user_id));

    let suspendedCount = 0;

    for (const user of usersToSuspend) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ status: "suspended" })
        .eq("user_id", user.user_id);

      if (!updateError) {
        suspendedCount++;
        console.log(`Suspended user ${user.full_name} (${user.email}) - subscription expired at ${user.paid_until}`);
      } else {
        console.error(`Failed to suspend ${user.email}:`, updateError.message);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Checked subscriptions. Suspended ${suspendedCount} expired accounts.`,
        suspended: suspendedCount,
        checked: expiredUsers.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Subscription check error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
