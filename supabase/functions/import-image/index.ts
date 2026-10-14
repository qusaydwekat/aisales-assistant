import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

    const { urls, store_id } = await req.json();
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: store } = await admin.from("stores").select("id").eq("id", store_id).eq("user_id", user.id).maybeSingle();
    if (!store) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });

    const list: string[] = (Array.isArray(urls) ? urls : []).slice(0, 200);
    const results = await Promise.all(list.map(async (src) => {
      try {
        if (!/^https?:\/\//i.test(src)) return src;
        const origin = new URL(src).origin;
        let r = await fetch(src, { headers: { "User-Agent": UA, Accept: "image/*,*/*", Referer: origin + "/" } });
        if (!r.ok) r = await fetch(src, { headers: { "User-Agent": UA, Accept: "image/*,*/*" } });
        const type = r.headers.get("content-type") || "";
        if (!r.ok || !type.startsWith("image/")) return null;
        const buf = new Uint8Array(await r.arrayBuffer());
        const ext = type.split("/")[1].split(";")[0].replace("jpeg", "jpg").replace("svg+xml", "svg") || "jpg";
        const path = `${store_id}/imports/${crypto.randomUUID()}.${ext}`;
        const { error } = await admin.storage.from("store-assets").upload(path, buf, { contentType: type });
        if (error) return null;
        return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
      } catch { return null; }
    }));
    return new Response(JSON.stringify({ results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
