// OpenAI Webhook receiver
// Public endpoint (no JWT) — verifies the OpenAI webhook signature instead.
// Docs: https://platform.openai.com/docs/guides/webhooks

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const OPENAI_WEBHOOK_SECRET = Deno.env.get("OPENAI_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Constant-time string compare
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  // base64
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Verifies the OpenAI webhook signature.
 * OpenAI sends headers:
 *   webhook-id, webhook-timestamp, webhook-signature: "v1,<base64sig> v1,<base64sig>"
 * Signed payload = `${id}.${timestamp}.${rawBody}`
 */
async function verifySignature(
  secret: string,
  rawBody: string,
  headers: Headers,
): Promise<{ ok: boolean; reason?: string }> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing webhook headers" };

  // Reject events older than 5 minutes
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return { ok: false, reason: "stale timestamp" };
  }

  // Strip "whsec_" prefix if present, then base64-decode the secret
  const secretClean = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretRaw: string;
  try {
    secretRaw = atob(secretClean);
  } catch {
    secretRaw = secretClean; // fall back to raw secret
  }

  const expected = await hmacSha256Base64(secretRaw, `${id}.${ts}.${rawBody}`);

  // Header may contain multiple space-separated "v1,sig" entries
  const provided = sigHeader.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  for (const p of provided) {
    if (timingSafeEqual(p, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  // Verify signature when secret configured
  if (OPENAI_WEBHOOK_SECRET) {
    const result = await verifySignature(OPENAI_WEBHOOK_SECRET, rawBody, req.headers);
    if (!result.ok) {
      console.warn("openai-webhook: signature verification failed:", result.reason);
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("openai-webhook: OPENAI_WEBHOOK_SECRET not set — skipping signature verification");
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventId = event?.id ?? req.headers.get("webhook-id") ?? null;
  const eventType: string = event?.type ?? "unknown";
  console.log("openai-webhook: received", { eventId, eventType });

  // Persist event for audit / later processing. Idempotent on event_id.
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.from("openai_webhook_events").upsert(
      {
        event_id: eventId,
        event_type: eventType,
        payload: event,
        received_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    );
    if (error) console.error("openai-webhook: failed to store event:", error);
  } catch (e) {
    console.error("openai-webhook: storage error:", e);
  }

  // Dispatch by event type — extend as needed.
  switch (eventType) {
    case "response.completed":
    case "response.failed":
    case "response.cancelled":
    case "batch.completed":
    case "batch.failed":
    case "batch.cancelled":
    case "batch.expired":
    case "fine_tuning.job.succeeded":
    case "fine_tuning.job.failed":
    case "fine_tuning.job.cancelled":
    case "eval.run.succeeded":
    case "eval.run.failed":
    case "eval.run.canceled":
      // TODO: add per-type handling
      break;
    default:
      // Unknown event types are still acknowledged so OpenAI does not retry.
      break;
  }

  // Respond fast with 2xx so OpenAI marks the delivery as successful.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
