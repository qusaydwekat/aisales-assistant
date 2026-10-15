// Durable webhook queue: Meta gets 200 as soon as the payload is stored, the
// reply work runs in the background, and failures retry with backoff.
// No polling cron: work is woken on enqueue, retries self-invoke with a
// cooldown, and every new webhook also drains a few overdue/stuck items.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ATTEMPTS = 5;
const DRAIN_ON_ARRIVAL = 3;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Handler = (req: Request) => Promise<Response>;
type Verify = (req: Request, body: string) => Promise<boolean>;

const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

export function backoffMs(attempts: number): number {
  // 30s, 1m, 2m, 4m ... capped at 10m
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 600_000);
}

async function processItem(supabase: any, handler: Handler, id?: string): Promise<boolean> {
  const { data } = await supabase.rpc("claim_webhook_item", { _id: id ?? null });
  const item = Array.isArray(data) ? data[0] : data;
  if (!item) return false;

  let ok = false;
  let err = "";
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (item.signature) headers.set("x-hub-signature-256", item.signature);
    const url = `https://internal/platform-webhook${item.query_string ? `?${item.query_string}` : ""}`;
    const res = await handler(new Request(url, { method: "POST", headers, body: item.body }));
    ok = res.ok;
    if (!ok) err = `status ${res.status}: ${(await res.text().catch(() => "")).slice(0, 500)}`;
  } catch (e) {
    err = String((e as any)?.stack || e).slice(0, 2000);
  }

  if (ok) {
    await supabase.from("webhook_queue")
      .update({ status: "done", processed_at: new Date().toISOString(), locked_until: null, last_error: null })
      .eq("id", item.id);
    return true;
  }

  const dead = item.attempts >= MAX_ATTEMPTS;
  const delay = backoffMs(item.attempts);
  await supabase.from("webhook_queue").update({
    status: dead ? "dead" : "failed",
    last_error: err,
    locked_until: null,
    next_attempt_at: new Date(Date.now() + delay).toISOString(),
  }).eq("id", item.id);
  console.error(`[queue] item ${item.id} attempt ${item.attempts} failed${dead ? " (dead)" : ""}: ${err}`);

  if (!dead) {
    // Cooldown, then wake a fresh worker for just this item.
    background((async () => {
      await new Promise((r) => setTimeout(r, Math.min(delay, 60_000)));
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/platform-webhook?worker=1&item=${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
        body: "{}",
      }).catch((e) => console.error("[queue] retry wake failed:", e));
    })());
  }
  return true;
}

export async function serveWithQueue(req: Request, handler: Handler, verify: Verify): Promise<Response> {
  if (req.method === "OPTIONS" || req.method === "GET") return handler(req);
  const url = new URL(req.url);
  const supabase = db();

  // Retry wake-up: process one specific item (bounded by MAX_ATTEMPTS).
  if (url.searchParams.get("worker") === "1") {
    const id = url.searchParams.get("item") || undefined;
    background(processItem(supabase, handler, id).catch((e) => console.error("[queue] worker error:", e)));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const body = await req.text();
  if (!(await verify(req, body))) {
    return new Response("Invalid signature", { status: 401, headers: cors });
  }

  const qs = new URLSearchParams(url.searchParams);
  const { data: row, error } = await supabase.from("webhook_queue").insert({
    body,
    signature: req.headers.get("x-hub-signature-256"),
    query_string: qs.toString() || null,
  }).select("id").single();

  if (error || !row) {
    // Queue unavailable: fall back to processing inline so no message is lost.
    console.error("[queue] enqueue failed, processing inline:", error);
    const headers = new Headers(req.headers);
    return handler(new Request(req.url, { method: "POST", headers, body }));
  }

  background((async () => {
    await processItem(supabase, handler, row.id);
    // Also pick up a few overdue or stuck items (runtime killed mid-run).
    for (let i = 0; i < DRAIN_ON_ARRIVAL; i++) {
      if (!(await processItem(supabase, handler))) break;
    }
  })().catch((e) => console.error("[queue] background error:", e)));

  return new Response(JSON.stringify({ success: true, queued: row.id }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
