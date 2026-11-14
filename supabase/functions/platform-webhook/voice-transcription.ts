import { OggOpusDecoder } from "npm:ogg-opus-decoder@1.7.5";
import { createParser } from "npm:eventsource-parser@4.1.3";
import { MAX_AUDIO_BYTES, VOICE_MODEL, VOICE_FAILED, pcmToWav, shouldPauseVoice, isRetryableVoice } from "./voice-policy.ts";

class VoiceError extends Error {
  constructor(message: string, public status = 400, public kind = "audio") { super(message); }
}

async function boundedBytes(response: Response): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new VoiceError("The voice recording could not be downloaded.");
  if (Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) throw new VoiceError("This voice recording is too large. Please send shorter recordings.");
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_AUDIO_BYTES) { await reader.cancel(); throw new VoiceError("This voice recording is too large. Please send shorter recordings."); }
    parts.push(value);
  }
  if (!size) throw new VoiceError("The voice recording is empty.");
  const bytes = new Uint8Array(size); let at = 0; for (const part of parts) { bytes.set(part, at); at += part.length; } return bytes;
}

export async function prepareVoiceFiles(bytes: Uint8Array, mime: string): Promise<File[]> {
  const signature = new TextDecoder().decode(bytes.slice(0, 4));
  if (signature === "OggS" && new TextDecoder().decode(bytes).includes("OpusHead")) {
    const decoder = new OggOpusDecoder({ sampleRate: 16000 });
    try {
      await decoder.ready;
      const decoded = await decoder.decodeFile(bytes);
      if (decoded.errors.length || !decoded.samplesDecoded) throw new VoiceError("The voice recording is damaged. Please send it again.");
      // Complete WAV segments with no dropped tail; bounded compressed input and decoded voice memory.
      const segmentSamples = 16000 * 120;
      if (decoded.samplesDecoded > 16000 * 600) throw new VoiceError("This voice recording is too long. Please send recordings under ten minutes.");
      const files: File[] = [];
      for (let start = 0; start < decoded.samplesDecoded; start += segmentSamples) {
        const wav = pcmToWav(decoded.channelData.map(ch => ch.subarray(start, start + segmentSamples)), decoded.sampleRate);
        files.push(new File([wav as unknown as BlobPart], `voice-${files.length}.wav`, { type: "audio/wav" }));
      }
      return files;
    } finally { decoder.free(); }
  }
  const type = mime.split(";")[0].toLowerCase();
  const extensions: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "video/mp4": "mp4", "audio/ogg": "ogg", "application/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm", "video/webm": "webm", "audio/flac": "flac" };
  const ext = signature === "RIFF" ? "wav" : extensions[type];
  if (!ext) throw new VoiceError("This voice recording format is not supported. Please send a new voice message.");
  return [new File([bytes as unknown as BlobPart], `voice.${ext}`, { type: type.startsWith("audio/") || type.startsWith("video/") ? type : `audio/${ext}` })];
}

export async function readTranscript(response: Response): Promise<string> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json();
    if (data.error || data.refusal) throw new VoiceError(data.message || data.error?.message || data.refusal || "Voice transcription was refused.", 200, "refusal");
    if (!data.text?.trim()) throw new VoiceError("No speech could be understood. Please send the message again.");
    return data.text.trim();
  }
  if (!response.body) throw new VoiceError("Voice transcription did not finish.");
  let text = ""; let done = false; let failure: VoiceError | undefined;
  const parser = createParser({ onEvent(event) {
    if (event.data === "[DONE]") return;
    const data = JSON.parse(event.data);
    if (data.type === "transcript.text.done") { text = data.text || ""; done = true; }
    if (data.type === "error" || data.error || data.refusal) failure = new VoiceError(data.message || data.error?.message || data.refusal || "Voice transcription was refused.", data.status || 200, "refusal");
  }});
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  while (true) { const part = await reader.read(); if (part.done) break; parser.feed(decoder.decode(part.value, { stream: true })); }
  parser.feed(decoder.decode());
  if (failure) throw failure;
  if (!done || !text.trim()) throw new VoiceError("Voice transcription did not finish. Please send the message again.");
  return text.trim();
}

export async function transcribeVoiceFile(file: File, apiKey: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData(); form.append("file", file, file.name); form.append("model", VOICE_MODEL); form.append("stream", "true"); form.append("response_format", "json");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    if (response.ok) return readTranscript(response);
    const data = await response.json().catch(() => ({}));
    const message = data.message || data.error?.message || "Voice transcription is unavailable.";
    if (attempt === 0 && isRetryableVoice(response.status) && data.props?.retryable !== false) {
      const delay = Number(response.headers.get("retry-after"));
      // Do not hold a customer worker for a long rate-limit cooldown.
      if (delay > 10) throw new VoiceError(message, response.status, "rate_limit");
      await new Promise(r => setTimeout(r, Math.max(1500, delay * 1000) + Math.random() * 500)); continue;
    }
    throw new VoiceError(message, response.status, shouldPauseVoice(response.status) ? "access" : "gateway");
  }
  throw new VoiceError("Voice transcription is unavailable.");
}

export async function processConversationVoices(db: any, conversationId: string, pageToken: string): Promise<void> {
  const { data: jobs } = await db.from("voice_transcription_jobs").select("*").eq("conversation_id", conversationId).in("status", ["pending", "processing"]).order("created_at").limit(10);
  for (const candidate of jobs || []) {
    const { data: claimed } = await db.rpc("claim_voice_transcription", { _id: candidate.id });
    const job = claimed?.[0]; if (!job) continue;
    try {
      const { data: control, error: controlError } = await db.from("voice_transcription_control").select("paused,pause_reason").eq("id", true).maybeSingle();
      if (controlError) throw new VoiceError("Voice transcription settings are unavailable.");
      if (control?.paused) throw new VoiceError(control.pause_reason || "Voice transcription is paused.", 403, "paused");
      const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) throw new VoiceError("Voice transcription is not configured.", 401, "configuration");
      let url = job.audio_url; let mime = "";
      if (job.media_id) {
        const lookup = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(job.media_id)}`, { headers: { Authorization: `Bearer ${pageToken}` } });
        if (!lookup.ok) throw new VoiceError("The voice recording is unavailable. Please send it again.");
        const media = await lookup.json(); url = media.url; mime = media.mime_type || "";
      }
      if (!url) throw new VoiceError("The voice recording is missing.");
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !/(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com|cdninstagram\.com)$/.test(parsed.hostname)) throw new VoiceError("The voice recording source is invalid.");
      const download = await fetch(url, { headers: job.media_id ? { Authorization: `Bearer ${pageToken}` } : {}, redirect: "error" });
      mime ||= download.headers.get("content-type") || "";
      const files = await prepareVoiceFiles(await boundedBytes(download), mime);
      const transcripts: string[] = [];
      for (const file of files) {
        const { data: latestControl, error: latestControlError } = await db.from("voice_transcription_control").select("paused,pause_reason").eq("id", true).maybeSingle();
        if (latestControlError) throw new VoiceError("Voice transcription settings are unavailable.");
        if (latestControl?.paused) throw new VoiceError(latestControl.pause_reason || "Voice transcription is paused.", 403, "paused");
        transcripts.push(await transcribeVoiceFile(file, key));
      }
      const transcript = transcripts.join(" ");
      const { error: saveError } = await db.rpc("complete_voice_transcription", { _id: job.id, _transcript: transcript });
      if (saveError) throw new VoiceError("Voice transcript could not be saved.");
    } catch (error) {
      const e = error instanceof VoiceError ? error : new VoiceError("The voice recording could not be understood. Please send it again.");
      if (shouldPauseVoice(e.status) && e.kind !== "paused") await db.from("voice_transcription_control").upsert({ id: true, paused: true, pause_reason: e.message, pause_kind: e.kind, updated_at: new Date().toISOString() });
      await db.from("voice_transcription_jobs").update({ status: "failed", error: e.message, locked_until: null }).eq("id", job.id);
      await db.from("messages").update({ content: VOICE_FAILED }).eq("id", job.message_id).eq("conversation_id", conversationId);
      const { data: store } = await db.from("stores").select("user_id").eq("id", job.store_id).maybeSingle();
      if (store?.user_id) await db.from("notifications").insert({ user_id: store.user_id, type: "voice_transcription", title: "Voice message needs attention", description: e.message });
    }
  }
}