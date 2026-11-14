import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rehostExternalImages } from "../_shared/external-images.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const results = await rehostExternalImages(admin, store_id, list);
    return new Response(JSON.stringify({ results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
