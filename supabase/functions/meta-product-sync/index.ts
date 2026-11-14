import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { discoverCatalogs, MetaApiError, postSourceFor } from "./meta-api.ts";
import { approveImportCandidate, commitSyncRun, runProductSync } from "./sync-engine.ts";

const BodySchema = z.object({
  action: z.enum(["discover", "start", "commit", "sync-source", "set-auto", "approve", "dismiss", "run-background", "run-scheduled", "webhook"]),
  connection_id: z.string().uuid().optional(),
  source_id: z.string().uuid().optional(),
  source_type: z.enum(["shop", "posts"]).optional(),
  external_id: z.string().min(1).max(500).optional(),
  name: z.string().max(500).optional(),
  auto_sync: z.boolean().optional(),
  preview: z.boolean().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  run_id: z.string().uuid().optional(),
  candidate_id: z.string().uuid().optional(),
  edits: z.record(z.unknown()).optional(),
  payload: z.unknown().optional(),
});

type Body = z.infer<typeof BodySchema>;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function background(work: Promise<unknown>): void {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else work.catch((error) => console.error("Background product sync failed:", error));
}

async function authorizeStore(userId: string, storeId: string, requirePaid = true): Promise<void> {
  const { data: store } = await admin.from("stores").select("user_id").eq("id", storeId).maybeSingle();
  if (!store) throw new Error("Store not found");
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin && store.user_id !== userId) {
    const error = new Error("You do not have access to this store");
    (error as any).status = 403;
    throw error;
  }
  if (isAdmin || !requirePaid) return;
  const { data: profile } = await admin.from("profiles").select("status, paid_until").eq("user_id", store.user_id).maybeSingle();
  if (!profile || profile.status !== "active" || !profile.paid_until || new Date(profile.paid_until).getTime() <= Date.now()) {
    const error = new Error("An active paid subscription is required");
    (error as any).status = 403;
    throw error;
  }
}

async function executeRun(runId: string): Promise<void> {
  try {
    await runProductSync(admin, runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { data: run } = await admin.from("product_sync_runs").select("source_id, store_id").eq("id", runId).maybeSingle();
    await admin.from("product_sync_runs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", runId);
    if (run) {
      const paused = error instanceof MetaApiError && [401, 403].includes(error.status);
      await admin.from("meta_product_sources").update({ status: paused ? "paused" : "error", last_error: message }).eq("id", run.source_id);
      const { data: store } = await admin.from("stores").select("user_id").eq("id", run.store_id).maybeSingle();
      if (store?.user_id) {
        await admin.from("notifications").insert({
          user_id: store.user_id,
          type: "product_sync",
          title: "Meta product sync needs attention",
          description: message.slice(0, 500),
        });
      }
    }
    console.error(`Product sync ${runId} failed:`, error);
  }
}

async function executeCommit(runId: string): Promise<void> {
  try {
    await commitSyncRun(admin, runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("product_sync_runs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", runId);
    console.error(`Product import commit ${runId} failed:`, error);
  }
}

async function createRun(source: any, preview: boolean, currency: string, trigger = "manual"): Promise<string> {
  const { data: running } = await admin.from("product_sync_runs").select("id").eq("source_id", source.id).eq("status", "running").limit(1).maybeSingle();
  if (running) {
    const error = new Error("This source already has a sync in progress");
    (error as any).status = 409;
    (error as any).run_id = running.id;
    throw error;
  }
  const { data: run, error } = await admin.from("product_sync_runs").insert({
    store_id: source.store_id,
    source_id: source.id,
    trigger_type: trigger,
    status: "running",
    checkpoint: { mode: preview ? "preview" : "commit", currency },
  }).select("id").single();
  if (error || !run) throw new Error(error?.message || "Could not start sync");
  background(executeRun(run.id));
  return run.id;
}

async function scheduledSources(payload?: any): Promise<number> {
  let sourcesQuery = admin.from("meta_product_sources").select("*").eq("auto_sync", true).eq("status", "active");
  if (payload?.object === "catalog") {
    const catalogIds = new Set<string>();
    for (const entry of payload.entry || []) {
      if (entry.id) catalogIds.add(String(entry.id));
      for (const change of entry.changes || []) if (change.value?.catalog_id) catalogIds.add(String(change.value.catalog_id));
    }
    if (!catalogIds.size) return 0;
    sourcesQuery = sourcesQuery.eq("source_type", "shop").in("external_id", Array.from(catalogIds));
  } else if (payload) {
    const ids = (payload.entry || []).map((entry: any) => String(entry.id)).filter(Boolean);
    if (!ids.length) return 0;
    sourcesQuery = sourcesQuery.eq("source_type", "posts").in("external_id", ids);
  }
  const { data: sources } = await sourcesQuery;
  let started = 0;
  for (const source of sources || []) {
    const { data: store } = await admin.from("stores").select("currency").eq("id", source.store_id).maybeSingle();
    if (!store?.currency) continue;
    try {
      await createRun(source, false, store.currency, payload ? "webhook" : "scheduled");
      started++;
    } catch (error) {
      if ((error as any).status !== 409) console.error("Could not queue source sync:", error);
    }
  }
  return started;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const body: Body = parsed.data;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internal = token && token === serviceKey;
    if (internal && body.action === "run-background" && body.run_id) {
      background(executeRun(body.run_id));
      return json({ ok: true });
    }
    if (internal && body.action === "run-scheduled") return json({ started: await scheduledSources() });
    if (internal && body.action === "webhook") return json({ started: await scheduledSources(body.payload) });

    if (!token) return json({ error: "Sign in required" }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Sign in required" }, 401);

    if (body.action === "discover") {
      if (!body.connection_id || !body.source_type) return json({ error: "connection_id and source_type are required" }, 400);
      const { data: connection } = await admin.from("platform_connections").select("*").eq("id", body.connection_id).eq("status", "connected").maybeSingle();
      if (!connection) return json({ error: "Connected account not found" }, 404);
      await authorizeStore(user.id, connection.store_id);
      const sources = body.source_type === "shop" ? await discoverCatalogs(connection) : [postSourceFor(connection)];
      return json({ sources });
    }

    if (body.action === "start") {
      if (!body.connection_id || !body.source_type || !body.external_id || !body.currency) return json({ error: "Account, source and currency are required" }, 400);
      const { data: connection } = await admin.from("platform_connections").select("*").eq("id", body.connection_id).eq("status", "connected").maybeSingle();
      if (!connection) return json({ error: "Connected account not found" }, 404);
      await authorizeStore(user.id, connection.store_id);
      const currency = body.currency.toUpperCase();
      const { data: store } = await admin.from("stores").select("currency").eq("id", connection.store_id).maybeSingle();
      if (store?.currency && store.currency.toUpperCase() !== currency) return json({ error: `This store uses ${store.currency}; mismatched items must be reviewed` }, 400);
      if (!store?.currency) {
        const { error } = await admin.from("stores").update({ currency }).eq("id", connection.store_id);
        if (error) throw error;
      }
      const { data: source, error } = await admin.from("meta_product_sources").upsert({
        store_id: connection.store_id,
        connection_id: connection.id,
        source_type: body.source_type,
        external_id: body.external_id,
        name: body.name || body.external_id,
        auto_sync: body.auto_sync === true,
        status: "active",
        last_error: null,
      }, { onConflict: "connection_id,source_type,external_id" }).select("*").single();
      if (error || !source) throw new Error(error?.message || "Could not save source");
      const runId = await createRun(source, body.preview !== false, currency);
      return json({ run_id: runId, source_id: source.id });
    }

    if (body.action === "sync-source") {
      if (!body.source_id) return json({ error: "source_id is required" }, 400);
      const { data: source } = await admin.from("meta_product_sources").select("*").eq("id", body.source_id).maybeSingle();
      if (!source) return json({ error: "Import source not found" }, 404);
      await authorizeStore(user.id, source.store_id);
      const { data: store } = await admin.from("stores").select("currency").eq("id", source.store_id).maybeSingle();
      if (!store?.currency) return json({ error: "Confirm the store currency first" }, 400);
      await admin.from("meta_product_sources").update({ status: "active", last_error: null }).eq("id", source.id);
      const runId = await createRun({ ...source, status: "active" }, false, store.currency);
      return json({ run_id: runId });
    }

    if (body.action === "commit" && body.run_id) {
      const { data: run } = await admin.from("product_sync_runs").select("*").eq("id", body.run_id).maybeSingle();
      if (!run) return json({ error: "Preview not found" }, 404);
      await authorizeStore(user.id, run.store_id);
      if (run.status !== "completed" || run.checkpoint?.mode !== "preview") return json({ error: "Preview is not ready to import" }, 400);
      await admin.from("product_sync_runs").update({ status: "running", completed_at: null, error: null }).eq("id", run.id);
      background(executeCommit(run.id));
      return json({ ok: true });
    }

    if (body.action === "set-auto" && body.source_id) {
      const { data: source } = await admin.from("meta_product_sources").select("store_id").eq("id", body.source_id).maybeSingle();
      if (!source) return json({ error: "Import source not found" }, 404);
      await authorizeStore(user.id, source.store_id);
      const { error } = await admin.from("meta_product_sources").update({ auto_sync: body.auto_sync === true }).eq("id", body.source_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "approve" && body.candidate_id) {
      const { data: candidate } = await admin.from("product_import_candidates").select("store_id").eq("id", body.candidate_id).maybeSingle();
      if (!candidate) return json({ error: "Review item not found" }, 404);
      await authorizeStore(user.id, candidate.store_id);
      return json({ result: await approveImportCandidate(admin, body.candidate_id, body.edits || {}) });
    }

    if (body.action === "dismiss" && body.candidate_id) {
      const { data: candidate } = await admin.from("product_import_candidates").select("store_id").eq("id", body.candidate_id).maybeSingle();
      if (!candidate) return json({ error: "Review item not found" }, 404);
      await authorizeStore(user.id, candidate.store_id);
      const { error } = await admin.from("product_import_candidates").update({ status: "dismissed" }).eq("id", body.candidate_id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || (error instanceof MetaApiError ? error.status : 500);
    const message = error instanceof Error ? error.message : String(error);
    console.error("meta-product-sync request failed:", error);
    return json({ error: message, run_id: (error as any)?.run_id }, status >= 400 && status < 600 ? status : 500);
  }
});
