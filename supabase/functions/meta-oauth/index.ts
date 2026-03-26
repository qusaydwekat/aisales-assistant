import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function subscribePageToWebhooks(pageId: string, pageAccessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: "messages,messaging_postbacks",
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.success) {
      console.log(`[meta-oauth] Page ${pageId} subscribed to webhooks`);
      return true;
    }
    console.error(`[meta-oauth] Failed to subscribe page ${pageId}:`, JSON.stringify(data));
    return false;
  } catch (err) {
    console.error(`[meta-oauth] Error subscribing page ${pageId}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

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
    const platform = url.searchParams.get("platform") || "facebook";
    const storeId = url.searchParams.get("store_id");
    const redirectUrl = url.searchParams.get("redirect_url") || "";

    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let scopes = "pages_show_list,pages_messaging";
    if (platform === "instagram") {
      scopes += ",instagram_basic,instagram_manage_messages";
    }
    if (platform === "whatsapp") {
      scopes += ",whatsapp_business_management,whatsapp_business_messaging";
    }

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

      // Exchange for long-lived user token
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${userToken}`
      );
      const longLivedData = await longLivedRes.json();
      const longLivedToken = longLivedData.access_token || userToken;

      // Fetch user's pages (each page comes with its own page access token)
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

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Store pages temporarily for user selection
      const sessionId = crypto.randomUUID();
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

  // ─── SELECT PAGES: Connect multiple pages at once ───
  if (req.method === "POST" && path === "select-pages") {
    try {
      const { session_id, page_ids } = await req.json();
      console.log(`[meta-oauth] select-pages called with session_id=${session_id}, page_ids=${JSON.stringify(page_ids)}`);

      if (!session_id || !page_ids || !Array.isArray(page_ids) || page_ids.length === 0) {
        return new Response(JSON.stringify({ error: "session_id and page_ids[] required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Find ALL pending_selection records and match by session_id in credentials
      const { data: pendingList } = await supabase
        .from("platform_connections")
        .select("*")
        .eq("status", "pending_selection")
        .order("created_at", { ascending: false });

      const pending = (pendingList || []).find(
        (r: any) => (r.credentials as any)?.session_id === session_id
      );

      if (!pending) {
        console.error(`[meta-oauth] No pending record found for session_id=${session_id}. Found ${pendingList?.length || 0} pending records.`);
        return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const creds = pending.credentials as any;
      const storeId = pending.store_id;
      const platform = pending.platform;
      const connectedPages: string[] = [];
      const failedPages: string[] = [];

      // Get already connected page IDs for this store to avoid duplicates
      const { data: existingConns } = await supabase
        .from("platform_connections")
        .select("page_id")
        .eq("store_id", storeId)
        .eq("platform", platform)
        .eq("status", "connected");
      const existingPageIds = new Set((existingConns || []).map(c => c.page_id));

      for (const pageId of page_ids) {
        const page = creds.pages?.find((p: any) => p.id === pageId);
        if (!page) {
          failedPages.push(pageId);
          continue;
        }

        let finalPageId = page.id;
        if (platform === "instagram" && page.instagram_business_account) {
          finalPageId = page.instagram_business_account;
        }

        // Skip if already connected
        if (existingPageIds.has(finalPageId)) {
          connectedPages.push(page.name);
          continue;
        }

        // Subscribe page to app webhooks automatically
        const subscribed = await subscribePageToWebhooks(page.id, page.access_token);
        if (!subscribed) {
          console.warn(`[meta-oauth] Could not subscribe page ${page.id}, connecting anyway`);
        }

        // Create a connection row for each page
        await supabase.from("platform_connections").insert({
          store_id: storeId,
          platform: platform as any,
          status: "connected",
          page_id: finalPageId,
          page_name: page.name,
          credentials: {
            page_access_token: page.access_token,
            user_token: creds.user_token,
          },
          last_synced_at: new Date().toISOString(),
        });

        connectedPages.push(page.name);
      }

      // Delete the pending_selection record
      await supabase
        .from("platform_connections")
        .delete()
        .eq("id", pending.id);

      return new Response(JSON.stringify({
        success: true,
        connected: connectedPages,
        failed: failedPages,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error("Select pages error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── Legacy single page select (keep for backwards compat) ───
  if (req.method === "POST" && path === "select-page") {
    try {
      const { session_id, page_id } = await req.json();
      // Redirect to select-pages logic
      const body = JSON.stringify({ session_id, page_ids: [page_id] });
      const newReq = new Request(req.url.replace("select-page", "select-pages"), {
        method: "POST",
        headers: req.headers,
        body,
      });
      // Just call select-pages inline
      return new Response(JSON.stringify({ error: "Please use select-pages endpoint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});
