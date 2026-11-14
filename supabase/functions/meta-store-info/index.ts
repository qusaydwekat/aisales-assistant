import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { rehostExternalImages } from "../_shared/external-images.ts";
import { canImportConnection, mapProfile } from "./profile.ts";

const bodySchema = z.object({ store_id: z.string().uuid(), connection_id: z.string().uuid() }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Sign in required", code: "auth" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Sign in required", code: "auth" }, 401);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid store or connection", code: "input" }, 400);
    const { store_id, connection_id } = parsed.data;
    const [{ data: store }, { data: connection }] = await Promise.all([
      admin.from("stores").select("user_id").eq("id", store_id).maybeSingle(),
      admin.from("platform_connections").select("store_id, platform, page_id, credentials").eq("id", connection_id).eq("store_id", store_id).eq("status", "connected").maybeSingle(),
    ]);
    if (!store || !connection || !canImportConnection(store.user_id, user.id, store_id, connection.store_id)) return json({ error: "Connected page not found", code: "access" }, 403);
    if (connection.platform !== "facebook" && connection.platform !== "instagram") return json({ error: "Unsupported platform", code: "input" }, 400);
    const credentials = connection.credentials || {};
    const pageToken = credentials.page_access_token;
    const pageId = connection.platform === "instagram" ? credentials.instagram_business_account_id || connection.page_id : connection.page_id;
    if (!pageToken || !pageId) return json({ error: "Reconnect this page", code: "reconnect" }, 409);
    const read = async (fields: string) => {
      const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}`);
      url.searchParams.set("fields", fields);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${pageToken}` }, signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || data.error) {
        // Never log tokens, profile payloads or provider error text containing credentials.
        console.warn("Meta profile field unavailable", { fields, status: response.status, code: data.error?.code });
        return { data: {}, code: data.error?.code, failed: true };
      }
      return { data, failed: false, code: undefined };
    };
    const base = await read(connection.platform === "instagram" ? "id,name,username" : "id,name");
    if (base.failed) return json({ error: "Page access is unavailable; reconnect and approve profile access", code: "reconnect" }, 409);
    const fields = connection.platform === "instagram" ? ["biography", "profile_picture_url"] : ["about,description", "category", "phone", "emails", "location", "picture.type(large)", "cover"];
    const optional = await Promise.all(fields.map(read));
    const profile = mapProfile(connection.platform, Object.assign({}, base.data, ...optional.map(result => result.data)));
    const imageKeys = (["logo_url", "cover_image_url"] as const).filter(key => profile[key]);
    if (imageKeys.length) {
      const hosted = await rehostExternalImages(admin, user.id, imageKeys.map(key => profile[key] || ""), "page-branding");
      imageKeys.forEach((key, index) => { if (hosted[index]) profile[key] = hosted[index]; else delete profile[key]; });
    }
    return json({ profile, partial: optional.some(result => result.failed), source_name: base.data.name || base.data.username, platform: connection.platform });
  } catch (error) {
    console.error("Store profile import failed", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Could not read page information. Please try again.", code: "unavailable" }, 502);
  }
});