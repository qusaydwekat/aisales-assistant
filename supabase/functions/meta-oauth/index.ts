import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function subscribeAppToInstagramWebhook(
  appId: string,
  appSecret: string,
  webhookCallbackUrl: string,
  verifyToken: string
): Promise<void> {
  try {
    const appToken = `${appId}|${appSecret}`;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${appId}/subscriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object: "instagram",
          callback_url: webhookCallbackUrl,
          fields: "messages,messaging_postbacks",
          verify_token: verifyToken,
          access_token: appToken,
        }),
      }
    );
    const data = await res.json();
    if (data.success) {
      console.log(
        "[meta-oauth] App successfully subscribed to Instagram webhook object"
      );
    } else {
      console.error(
        "[meta-oauth] Failed to subscribe app to Instagram webhook object:",
        JSON.stringify(data)
      );
    }
  } catch (err) {
    console.error(
      "[meta-oauth] Error subscribing app to Instagram webhook:",
      err
    );
  }
}

async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string,
  platform: string = "facebook",
  appId?: string,
  appSecret?: string,
  webhookCallbackUrl?: string,
  verifyToken?: string
): Promise<boolean> {
  try {
    // Per Meta docs, /{page-id}/subscribed_apps does NOT support Instagram webhook fields.
    // Instagram DM webhooks are subscribed at the app level via /{app-id}/subscriptions.
    // For both Facebook and Instagram, the page subscription uses the same messaging fields.
    const fields = "messages,messaging_postbacks";

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: fields,
          access_token: pageAccessToken,
        }),
      }
    );
    const data = await res.json();
    if (data.success) {
      console.log(
        `[meta-oauth] Page ${pageId} subscribed to webhooks (${fields})`
      );
    } else {
      console.error(
        `[meta-oauth] Failed to subscribe page ${pageId}:`,
        JSON.stringify(data)
      );
      // Retry with messages only as fallback
      const retryRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribed_fields: "messages",
            access_token: pageAccessToken,
          }),
        }
      );
      const retryData = await retryRes.json();
      if (retryData.success) {
        console.log(
          `[meta-oauth] Page ${pageId} subscribed (retry with messages only)`
        );
      } else {
        console.error(
          `[meta-oauth] Retry also failed for page ${pageId}:`,
          JSON.stringify(retryData)
        );
        return false;
      }
    }

    // For Instagram: also subscribe the app to the instagram webhook object at the app level
    if (platform === "instagram" && appId && appSecret && webhookCallbackUrl) {
      await subscribeAppToInstagramWebhook(
        appId,
        appSecret,
        webhookCallbackUrl,
        verifyToken || "aisales_verify_2024"
      );
    }

    return true;
  } catch (err) {
    console.error(`[meta-oauth] Error subscribing page ${pageId}:`, err);
    return false;
  }
}

async function subscribeWhatsAppToWebhooks(
  wabaId: string,
  accessToken: string,
  appId?: string,
  appSecret?: string,
  webhookCallbackUrl?: string,
  verifyToken: string = "aisales_verify_2024"
): Promise<boolean> {
  try {
    if (appId && appSecret && webhookCallbackUrl) {
      const appToken = `${appId}|${appSecret}`;
      await fetch(`https://graph.facebook.com/v21.0/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          callback_url: webhookCallbackUrl,
          fields: "messages",
          verify_token: verifyToken,
          access_token: appToken,
        }),
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      }
    );
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      console.error(`[meta-oauth] Failed to subscribe WhatsApp WABA ${wabaId}:`, JSON.stringify(data));
      return false;
    }
    console.log(`[meta-oauth] WhatsApp WABA ${wabaId} subscribed to webhooks`);
    return true;
  } catch (err) {
    console.error(`[meta-oauth] Error subscribing WhatsApp WABA ${wabaId}:`, err);
    return false;
  }
}

async function fetchInstagramBusinessAccountId(
  pageId: string,
  pageAccessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(
        pageAccessToken
      )}`
    );
    const data = await res.json();

    const igbaId = data?.instagram_business_account?.id || null;
    if (igbaId) {
      console.log(
        `[meta-oauth] Resolved IG business account for page ${pageId}: ${igbaId}`
      );
    } else {
      console.warn(
        `[meta-oauth] No IG business account linked to page ${pageId}`
      );
    }
    return igbaId;
  } catch (err) {
    console.error(
      `[meta-oauth] Failed to resolve IG business account for page ${pageId}:`,
      err
    );
    return null;
  }
}

async function refreshPageTokenFromUserToken(conn: any, creds: any): Promise<{
  pageId: string | null;
  token: string | null;
  credentials: any;
  reason?: string;
}> {
  const fallbackPageId = conn.platform === "instagram"
    ? creds?.facebook_page_id || conn.page_id
    : conn.page_id;

  if (!creds?.user_token) {
    return {
      pageId: fallbackPageId || null,
      token: creds?.page_access_token || null,
      credentials: creds || {},
      reason: "Missing Meta user token — reconnect this account.",
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
        creds.user_token
      )}`
    );
    const data = await res.json();
    const pages = data?.data || [];
    const match = pages.find((p: any) =>
      p.id === conn.page_id ||
      p.id === creds?.facebook_page_id ||
      p.instagram_business_account?.id === conn.page_id ||
      p.instagram_business_account?.id === creds?.instagram_business_account_id
    );

    if (!res.ok || !match?.access_token) {
      return {
        pageId: fallbackPageId || null,
        token: creds?.page_access_token || null,
        credentials: creds || {},
        reason: data?.error?.message || "Could not refresh page token — reconnect this account.",
      };
    }

    const refreshedCreds: any = {
      ...creds,
      page_access_token: match.access_token,
      facebook_page_id: conn.platform === "instagram" ? match.id : creds?.facebook_page_id,
    };
    if (conn.platform === "instagram" && match.instagram_business_account?.id) {
      refreshedCreds.instagram_business_account_id = match.instagram_business_account.id;
    }

    return {
      pageId: match.id,
      token: match.access_token,
      credentials: refreshedCreds,
    };
  } catch (err: any) {
    return {
      pageId: fallbackPageId || null,
      token: creds?.page_access_token || null,
      credentials: creds || {},
      reason: err?.message || "Could not refresh page token — reconnect this account.",
    };
  }
}

// Fetch WhatsApp Business phone numbers from the user's businesses
async function fetchWhatsAppPhoneNumbers(userToken: string): Promise<
  Array<{
    id: string;
    name: string;
    display_phone_number: string;
    waba_id: string;
  }>
> {
  const phones: Array<{
    id: string;
    name: string;
    display_phone_number: string;
    waba_id: string;
  }> = [];

  try {
    // Step 1: Get user's businesses
    const bizRes = await fetch(
      `https://graph.facebook.com/v21.0/me/businesses?access_token=${encodeURIComponent(
        userToken
      )}`
    );
    const bizData = await bizRes.json();
    const businesses = bizData.data || [];
    console.log(
      `[meta-oauth] Found ${businesses.length} businesses for WhatsApp`
    );

    for (const biz of businesses) {
      // Step 2: Get WABAs for each business
      const wabaRes = await fetch(
        `https://graph.facebook.com/v21.0/${
          biz.id
        }/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(
          userToken
        )}`
      );
      const wabaData = await wabaRes.json();
      const wabas = wabaData.data || [];
      console.log(`[meta-oauth] Business ${biz.id} has ${wabas.length} WABAs`);

      for (const waba of wabas) {
        // Step 3: Get phone numbers for each WABA
        const phoneRes = await fetch(
          `https://graph.facebook.com/v21.0/${
            waba.id
          }/phone_numbers?access_token=${encodeURIComponent(userToken)}`
        );
        const phoneData = await phoneRes.json();
        const phoneNumbers = phoneData.data || [];
        console.log(
          `[meta-oauth] WABA ${waba.id} has ${phoneNumbers.length} phone numbers`
        );

        for (const phone of phoneNumbers) {
          phones.push({
            id: phone.id, // This is the phone_number_id used for API calls
            name:
              phone.verified_name ||
              phone.display_phone_number ||
              `WhatsApp ${phone.id}`,
            display_phone_number: phone.display_phone_number || "",
            waba_id: waba.id,
          });
        }
      }
    }
  } catch (err) {
    console.error("[meta-oauth] Error fetching WhatsApp phone numbers:", err);
  }

  return phones;
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
    return new Response(
      JSON.stringify({ error: "Meta App credentials not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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

    // Build scopes based on platform
    // pages_manage_metadata is required for /{page-id}/subscribed_apps to succeed (all platforms)
    let scopes = "pages_show_list,pages_messaging,pages_manage_metadata";
    if (platform === "instagram") {
      scopes += ",instagram_manage_messages";
    }
    if (platform === "whatsapp") {
      scopes =
        "business_management,whatsapp_business_management,whatsapp_business_messaging";
    }

    const state = btoa(JSON.stringify({ platform, storeId, redirectUrl }));

    const authUrl =
      `https://www.facebook.com/v21.0/dialog/oauth?` +
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

  // ─── CALLBACK: Exchange code for token, fetch pages/phones ───
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
          headers: {
            Location: `${redirectUrl}?error=${encodeURIComponent(errorParam)}`,
          },
        });
      }

      if (!code || !stateParam) {
        return new Response("Missing code or state", {
          status: 400,
          headers: corsHeaders,
        });
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
          headers: {
            Location: `${
              redirectUrl || "/platforms"
            }?error=token_exchange_failed`,
          },
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

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Clean up old pending_selection AND disconnected records for this store+platform
      await supabase
        .from("platform_connections")
        .delete()
        .eq("store_id", storeId)
        .eq("platform", platform)
        .in("status", ["pending_selection", "disconnected"]);

      let pages: Array<{
        id: string;
        name: string;
        access_token?: string;
        instagram_business_account?: string | null;
      }> = [];

      if (platform === "whatsapp") {
        // ─── WhatsApp: Fetch phone numbers from WABAs ───
        const phoneNumbers = await fetchWhatsAppPhoneNumbers(longLivedToken);

        if (phoneNumbers.length === 0) {
          console.error("[meta-oauth] No WhatsApp phone numbers found");
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${
                redirectUrl || "/platforms"
              }?error=no_whatsapp_numbers_found`,
            },
          });
        }

        // Map phone numbers to the "pages" format for selection UI
        pages = phoneNumbers.map((phone) => ({
          id: phone.id, // phone_number_id
          name: `${phone.name} (${phone.display_phone_number})`,
          access_token: longLivedToken, // WhatsApp uses the user/system token
          waba_id: phone.waba_id,
        }));
      } else {
        // ─── Facebook/Instagram: Fetch user's pages ───
        const pagesRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}&fields=id,name,access_token,instagram_business_account`
        );
        const pagesData = await pagesRes.json();
        let fetchedPages = pagesData.data || [];

        // For Instagram, resolve IG business account IDs
        if (platform === "instagram") {
          fetchedPages = await Promise.all(
            fetchedPages.map(async (p: any) => {
              const igbaId =
                p.instagram_business_account?.id ||
                (await fetchInstagramBusinessAccountId(p.id, p.access_token));
              return {
                ...p,
                instagram_business_account: igbaId ? { id: igbaId } : null,
              };
            })
          );
        }

        if (fetchedPages.length === 0) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${redirectUrl || "/platforms"}?error=no_pages_found`,
            },
          });
        }

        pages = fetchedPages.map((p: any) => ({
          id: p.id,
          name: p.name,
          access_token: p.access_token,
          instagram_business_account: p.instagram_business_account?.id || null,
        }));
      }

      // Store pages/phones temporarily for user selection
      const sessionId = crypto.randomUUID();
      console.log(
        `[meta-oauth] Storing ${pages.length} options for selection, session_id=${sessionId}, store_id=${storeId}, platform=${platform}`
      );
      const { error: insertErr } = await supabase
        .from("platform_connections")
        .insert({
          store_id: storeId,
          platform: platform as any,
          status: "pending_selection",
          credentials: {
            session_id: sessionId,
            user_token: longLivedToken,
            pages: pages,
          },
        });
      if (insertErr) {
        console.error(
          "[meta-oauth] Failed to insert pending record:",
          insertErr
        );
      }

      const finalRedirect = redirectUrl || "/platforms";
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${finalRedirect}?session_id=${sessionId}&platform=${platform}`,
        },
      });
    } catch (err) {
      console.error("OAuth callback error:", err);
      return new Response(null, {
        status: 302,
        headers: { Location: `/platforms?error=callback_failed` },
      });
    }
  }

  // ─── SELECT PAGES: Connect multiple pages/phones at once ───
  if (req.method === "POST" && path === "select-pages") {
    try {
      const { session_id, page_ids } = await req.json();
      console.log(
        `[meta-oauth] select-pages called with session_id=${session_id}, page_ids=${JSON.stringify(
          page_ids
        )}`
      );

      if (
        !session_id ||
        !page_ids ||
        !Array.isArray(page_ids) ||
        page_ids.length === 0
      ) {
        return new Response(
          JSON.stringify({ error: "session_id and page_ids[] required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Find pending_selection record matching session_id
      const { data: pendingList } = await supabase
        .from("platform_connections")
        .select("*")
        .eq("status", "pending_selection")
        .order("created_at", { ascending: false });

      const pending = (pendingList || []).find(
        (r: any) => (r.credentials as any)?.session_id === session_id
      );

      if (!pending) {
        console.error(
          `[meta-oauth] No pending record found for session_id=${session_id}`
        );
        return new Response(
          JSON.stringify({ error: "Invalid or expired session" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const creds = pending.credentials as any;
      const storeId = pending.store_id;
      const platform = pending.platform;
      const connectedPages: string[] = [];
      const failedPages: string[] = [];
      const conflictPages: string[] = [];

      // Get existing connected rows to avoid duplicates
      const { data: existingConns } = await supabase
        .from("platform_connections")
        .select("id, page_id, credentials")
        .eq("store_id", storeId)
        .eq("platform", platform)
        .eq("status", "connected");

      for (const pageId of page_ids) {
        const page = creds.pages?.find((p: any) => p.id === pageId);
        if (!page) {
          failedPages.push(pageId);
          continue;
        }

        if (platform === "whatsapp") {
          // ─── WhatsApp: Connect phone number ───
          const existingConn = (existingConns || []).find(
            (c: any) => c.page_id === page.id
          );

          const { data: conflictingConns, error: conflictErr } = await supabase
            .from("platform_connections")
            .select("id")
            .eq("platform", "whatsapp")
            .eq("page_id", page.id)
            .eq("status", "connected")
            .neq("store_id", storeId)
            .limit(1);

          if (conflictErr) {
            console.error(`[meta-oauth] Failed to check WhatsApp connection ownership for ${page.id}:`, conflictErr);
            failedPages.push(page.name);
            continue;
          }

          if ((conflictingConns?.length || 0) > 0) {
            console.warn(`[meta-oauth] WhatsApp phone ${page.id} is already connected to another store`);
            conflictPages.push(page.name);
            continue;
          }

          const connectionCredentials = {
            page_access_token: page.access_token, // User's long-lived token
            user_token: creds.user_token,
            waba_id: (page as any).waba_id,
            phone_number_id: page.id,
          };

          if (existingConn?.id) {
            await supabase
              .from("platform_connections")
              .update({
                status: "connected",
                page_id: page.id, // phone_number_id
                page_name: page.name,
                credentials: connectionCredentials,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", existingConn.id);
            console.log(
              `[meta-oauth] Updated existing WhatsApp connection for phone ${page.id}`
            );
          } else {
            await supabase.from("platform_connections").insert({
              store_id: storeId,
              platform: "whatsapp" as any,
              status: "connected",
              page_id: page.id, // phone_number_id
              page_name: page.name,
              credentials: connectionCredentials,
              last_synced_at: new Date().toISOString(),
            });
            console.log(
              `[meta-oauth] Inserted new WhatsApp connection for phone ${page.id}`
            );
          }

          connectedPages.push(page.name);
        } else {
          // ─── Facebook / Instagram: Connect page ───
          let instagramBusinessAccountId: string | null =
            page.instagram_business_account || null;
          if (platform === "instagram" && !instagramBusinessAccountId) {
            instagramBusinessAccountId = await fetchInstagramBusinessAccountId(
              page.id,
              page.access_token
            );
          }

          let finalPageId = page.id;
          if (platform === "instagram" && instagramBusinessAccountId) {
            finalPageId = instagramBusinessAccountId;
          }

          const { data: conflictingConns, error: conflictErr } = await supabase
            .from("platform_connections")
            .select("id")
            .eq("platform", platform)
            .eq("page_id", finalPageId)
            .eq("status", "connected")
            .neq("store_id", storeId)
            .limit(1);

          if (conflictErr) {
            console.error(`[meta-oauth] Failed to check ${platform} connection ownership for ${finalPageId}:`, conflictErr);
            failedPages.push(page.name);
            continue;
          }

          if ((conflictingConns?.length || 0) > 0) {
            console.warn(`[meta-oauth] ${platform} page ${finalPageId} is already connected to another store`);
            conflictPages.push(page.name);
            continue;
          }

          const existingConn = (existingConns || []).find((c: any) => {
            const cCreds = c.credentials as any;
            return (
              c.page_id === finalPageId ||
              c.page_id === page.id ||
              cCreds?.facebook_page_id === page.id ||
              (instagramBusinessAccountId &&
                cCreds?.instagram_business_account_id ===
                  instagramBusinessAccountId)
            );
          });

          // Subscribe page to app webhooks (Messenger + Instagram)
          const webhookCallbackUrl = `${SUPABASE_URL}/functions/v1/platform-webhook`;
          const verifyToken =
            Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";
          const subscribed = await subscribePageToWebhooks(
            page.id,
            page.access_token,
            platform,
            META_APP_ID,
            META_APP_SECRET,
            webhookCallbackUrl,
            verifyToken
          );
          if (!subscribed) {
            console.warn(
              `[meta-oauth] Could not subscribe page ${page.id}, connecting anyway`
            );
          }

          const connectionCredentials: any = {
            page_access_token: page.access_token,
            user_token: creds.user_token,
          };
          if (platform === "instagram") {
            connectionCredentials.facebook_page_id = page.id;
            if (instagramBusinessAccountId) {
              connectionCredentials.instagram_business_account_id =
                instagramBusinessAccountId;
            }
          }

          if (existingConn?.id) {
            await supabase
              .from("platform_connections")
              .update({
                status: "connected",
                page_id: finalPageId,
                page_name:
                  page.name + (platform === "instagram" ? " (IG)" : ""),
                credentials: connectionCredentials,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", existingConn.id);
            console.log(
              `[meta-oauth] Updated existing ${platform} connection for page ${page.id} -> ${finalPageId}`
            );
          } else {
            await supabase.from("platform_connections").insert({
              store_id: storeId,
              platform: platform as any,
              status: "connected",
              page_id: finalPageId,
              page_name: page.name + (platform === "instagram" ? " (IG)" : ""),
              credentials: connectionCredentials,
              last_synced_at: new Date().toISOString(),
            });
            console.log(
              `[meta-oauth] Inserted new ${platform} connection for page ${page.id} -> ${finalPageId}`
            );
          }

          connectedPages.push(page.name);
        }
      }

      // Delete the pending_selection record
      await supabase.from("platform_connections").delete().eq("id", pending.id);

      return new Response(
        JSON.stringify({
          success: true,
          connected: connectedPages,
          failed: failedPages,
          conflicts: conflictPages,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      console.error("Select pages error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── Legacy single page select ───
  if (req.method === "POST" && path === "select-page") {
    return new Response(
      JSON.stringify({ error: "Please use select-pages endpoint" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ─── REPAIR: Re-subscribe all connected pages to webhooks ───
  // Used when AI is not responding to incoming customer messages — usually
  // because the page was never (re)subscribed to the app's webhooks.
  if (req.method === "POST" && path === "repair-subscriptions") {
    try {
      const { store_id } = await req.json();
      if (!store_id) {
        return new Response(
          JSON.stringify({ error: "store_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: conns, error: connErr } = await supabase
        .from("platform_connections")
        .select("id, platform, page_id, page_name, credentials")
        .eq("store_id", store_id)
        .eq("status", "connected");

      if (connErr) throw connErr;
      if (!conns || conns.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, repaired: [], failed: [], message: "No connected pages" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const webhookCallbackUrl = `${SUPABASE_URL}/functions/v1/platform-webhook`;
      const verifyToken = Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";
      const repaired: string[] = [];
      const failed: { name: string; reason: string }[] = [];

      for (const c of conns) {
        let creds: any = c.credentials || {};
        let token = creds.page_access_token;

        if (c.platform === "whatsapp") {
          // WhatsApp doesn't use page-level subscribed_apps; verify the phone is reachable instead.
          if (!token) {
            failed.push({ name: c.page_name || c.page_id, reason: "Missing WhatsApp token — please reconnect." });
            continue;
          }
          try {
            const r = await fetch(
              `https://graph.facebook.com/v21.0/${c.page_id}?fields=display_phone_number,verified_name&access_token=${token}`
            );
            const d = await r.json();
            if (r.ok && d?.id) {
              repaired.push(c.page_name || c.page_id);
              await supabase
                .from("platform_connections")
                .update({ last_synced_at: new Date().toISOString() })
                .eq("id", c.id);
            } else {
              failed.push({ name: c.page_name || c.page_id, reason: d?.error?.message || "Phone not reachable" });
            }
          } catch (e: any) {
            failed.push({ name: c.page_name || c.page_id, reason: e?.message || "Network error" });
          }
          continue;
        }

        const refreshed = await refreshPageTokenFromUserToken(c, creds);
        if (refreshed.token && refreshed.token !== token) {
          token = refreshed.token;
          creds = refreshed.credentials;
          await supabase.from("platform_connections").update({ credentials: creds }).eq("id", c.id);
        }
        if (!token) {
          failed.push({ name: c.page_name || c.page_id, reason: refreshed.reason || "Missing page access token — please reconnect." });
          continue;
        }

        // Facebook / Instagram pages — re-POST subscribed_apps using the Facebook Page ID
        const ok = await subscribePageToWebhooks(
          refreshed.pageId || c.page_id!,
          token,
          c.platform,
          META_APP_ID,
          META_APP_SECRET,
          webhookCallbackUrl,
          verifyToken
        );

        if (ok) {
          repaired.push(c.page_name || c.page_id!);
          await supabase
            .from("platform_connections")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", c.id);
        } else {
          failed.push({
            name: c.page_name || c.page_id!,
            reason: "Meta refused subscription. Reconnect this page to refresh permissions.",
          });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, repaired, failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      console.error("[meta-oauth] repair-subscriptions error:", err);
      return new Response(
        JSON.stringify({ error: err?.message || "Failed to repair subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});
