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
  const path = url.pathname.split("/").pop(); // start, callback, or pages

  const META_APP_ID = Deno.env.get("META_APP_ID");
  const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!META_APP_ID || !META_APP_SECRET) {
    return new Response(JSON.stringify({ error: "Meta App credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const callbackUrl = `${SUPABASE_URL}/functions/v1/meta-oauth/callback`;

  // ─── START: Redirect user to Meta OAuth dialog ───
  if (path === "start") {
    const platform = url.searchParams.get("platform") || "facebook"; // facebook | instagram | whatsapp
    const storeId = url.searchParams.get("store_id");
    const redirectUrl = url.searchParams.get("redirect_url") || "";

    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build scopes based on platform
    let scopes = "pages_show_list,pages_messaging,pages_read_engagement";
    if (platform === "instagram") {
      scopes += ",instagram_basic,instagram_manage_messages";
    }
    if (platform === "whatsapp") {
      scopes += ",whatsapp_business_management,whatsapp_business_messaging";
    }

    // State encodes platform + store_id + redirect_url
    const state = btoa(JSON.stringify({ platform, storeId, redirectUrl }));

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`;

    return new Response(null, {
      status: 302,
      headers: { Location: authUrl },
    });
  }

  // ─── CALLBACK: Exchange code for token, fetch pages ───
  if (path === "callback") {
    try {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const stateData = stateParam ? JSON.parse(atob(stateParam)) : {};
        const redirectUrl = stateData.redirectUrl || "/platforms";
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectUrl}?error=${encodeURIComponent(errorParam)}` },
        });
      }

      if (!code || !stateParam) {
        return new Response("Missing code or state", { status: 400, headers: corsHeaders });
      }

      const stateData = JSON.parse(atob(stateParam));
      const { platform, storeId, redirectUrl } = stateData;

      // Exchange code for user access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error("Token exchange failed:", tokenData);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectUrl || "/platforms"}?error=token_exchange_failed` },
        });
      }

      const userToken = tokenData.access_token;

      // Exchange for long-lived token
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${userToken}`
      );
      const longLivedData = await longLivedRes.json();
      const longLivedToken = longLivedData.access_token || userToken;

      // Fetch user's pages
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}&fields=id,name,access_token,instagram_business_account`
      );
      const pagesData = await pagesRes.json();
      const pages = pagesData.data || [];

      if (pages.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectUrl || "/platforms"}?error=no_pages_found` },
        });
      }

      // Store pages temporarily for user selection
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Store the token + pages data in a temporary record
      const sessionId = crypto.randomUUID();
      
      // We'll store in platform_connections with status 'pending_selection'
      // with all pages data in credentials
      await supabase.from("platform_connections").insert({
        store_id: storeId,
        platform: platform as any,
        status: "pending_selection",
        credentials: {
          session_id: sessionId,
          user_token: longLivedToken,
          pages: pages.map((p: any) => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
            instagram_business_account: p.instagram_business_account?.id || null,
          })),
        },
      });

      // Redirect back with session_id for page selection
      const finalRedirect = redirectUrl || "/platforms";
      return new Response(null, {
        status: 302,
        headers: { Location: `${finalRedirect}?session_id=${sessionId}&platform=${platform}` },
      });

    } catch (err) {
      console.error("OAuth callback error:", err);
      return new Response(null, {
        status: 302,
        headers: { Location: `/platforms?error=callback_failed` },
      });
    }
  }

  // ─── SELECT PAGE: Finalize connection with selected page ───
  if (req.method === "POST" && path === "select-page") {
    try {
      const { session_id, page_id } = await req.json();
      if (!session_id || !page_id) {
        return new Response(JSON.stringify({ error: "session_id and page_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Find the pending connection
      const { data: pending } = await supabase
        .from("platform_connections")
        .select("*")
        .eq("status", "pending_selection")
        .single();

      if (!pending || (pending.credentials as any)?.session_id !== session_id) {
        return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const creds = pending.credentials as any;
      const selectedPage = creds.pages?.find((p: any) => p.id === page_id);

      if (!selectedPage) {
        return new Response(JSON.stringify({ error: "Page not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine the correct page_id for the platform
      let finalPageId = selectedPage.id;
      if (pending.platform === "instagram" && selectedPage.instagram_business_account) {
        finalPageId = selectedPage.instagram_business_account;
      }

      // Update the connection to connected status
      await supabase
        .from("platform_connections")
        .update({
          status: "connected",
          page_id: finalPageId,
          page_name: selectedPage.name,
          credentials: {
            page_access_token: selectedPage.access_token,
            user_token: creds.user_token,
          },
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", pending.id);

      return new Response(JSON.stringify({ success: true, page_name: selectedPage.name }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error("Select page error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});
