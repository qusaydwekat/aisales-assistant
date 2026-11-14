import { afterEach, describe, expect, it, vi } from "vitest";
import { OggOpusDecoder } from "ogg-opus-decoder";
import { createParser } from "eventsource-parser";
vi.mock("npm:ogg-opus-decoder@1.7.5", () => ({ OggOpusDecoder }));
vi.mock("npm:eventsource-parser@4.1.3", () => ({ createParser }));
afterEach(() => vi.unstubAllGlobals());
async function worker() { const path = "../../supabase/functions/platform-webhook/voice-transcription.ts"; return import(path); }

describe("voice transcription", () => {
  it("reads the final transcript across split stream chunks", async () => {
    const { readTranscript } = await worker();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(c) { c.enqueue(encoder.encode('data: {"type":"transcript.text.done","text":"بدي ألغي ')); c.enqueue(encoder.encode('الطلب"}\n\ndata: [DONE]\n\n')); c.close(); } });
    expect(await readTranscript(new Response(stream, { headers: { "content-type": "text/event-stream" } }))).toBe("بدي ألغي الطلب");
  });
  it("rejects an incomplete or refused transcript", async () => {
    const { readTranscript } = await worker();
    await expect(readTranscript(new Response('data: {"type":"transcript.text.delta","delta":"hello"}\n\n', { headers: { "content-type": "text/event-stream" } }))).rejects.toThrow("did not finish");
    await expect(readTranscript(new Response(JSON.stringify({ refusal: "Access denied" }), { headers: { "content-type": "application/json" } }))).rejects.toThrow("Access denied");
  });
  it("does not replay a credit or provider denial", async () => {
    const { transcribeVoiceFile } = await worker();
    for (const status of [402, 403, 404]) {
      const request = vi.fn(async () => new Response(JSON.stringify({ message: "Access unavailable" }), { status })); vi.stubGlobal("fetch", request);
      await expect(transcribeVoiceFile(new File(["audio"], "voice.wav", { type: "audio/wav" }), "test-key")).rejects.toThrow("Access unavailable");
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects unsupported audio without a gateway call", async () => {
    const { prepareVoiceFiles } = await worker();
    await expect(prepareVoiceFiles(new Uint8Array([1, 2, 3]), "application/octet-stream")).rejects.toThrow("not supported");
  });
});