import { describe, expect, it } from "vitest";
import { extractVoiceMessages, pcmToWav, isRetryableVoice, shouldPauseVoice } from "../../supabase/functions/platform-webhook/voice-policy";

describe("customer voice messages", () => {
  it("captures Facebook voice attachments with unique caption IDs", () => {
    const result = extractVoiceMessages({ entry: [{ id: "page", messaging: [{ timestamp: 1000, sender: { id: "customer" }, message: { mid: "mid", text: "hello", attachments: [{ type: "audio", payload: { url: "https://cdn.fbsbx.com/voice" } }] } }] }] }, "facebook");
    expect(result[0]).toMatchObject({ platform: "facebook", pageId: "page", platformId: "customer", kind: "audio", audioUrl: "https://cdn.fbsbx.com/voice", platformMessageId: "mid:audio0" });
    expect(result[0].timestamp).toBe(new Date(1001).toISOString());
  });
  it("captures both Instagram webhook formats and excludes echoes", () => {
    const message = { mid: "voice", attachments: [{ type: "audio", payload: { url: "https://cdn.fbsbx.com/voice" } }] };
    const result = extractVoiceMessages({ entry: [{ id: "ig", messaging: [{ message: { ...message, is_echo: true }, sender: { id: "self" } }], changes: [{ field: "messages", value: { message, sender: { id: "customer" }, timestamp: 1000 } }] }] }, "instagram");
    expect(result).toHaveLength(1); expect(result[0].platformMessageId).toBe("voice"); expect(result[0].pageId).toBe("ig");
  });
  it("keeps WhatsApp voice media scoped to the receiving number", () => {
    const result = extractVoiceMessages({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "number" }, messages: [{ type: "audio", from: "customer", id: "wa-voice", timestamp: "1", audio: { id: "media" } }] } }] }] }, "whatsapp");
    expect(result[0]).toMatchObject({ pageId: "number", mediaId: "media", platformMessageId: "wa-voice", kind: "audio" });
  });
  it("produces complete mono WAV recordings", () => {
    const wav = pcmToWav([new Float32Array([0, 1, -1])], 16000); const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF"); expect(view.getUint32(40, true)).toBe(6); expect(view.getUint32(24, true)).toBe(16000); expect(view.getInt16(48, true)).toBe(-32768);
  });
  it("never retries credit/access denials and persists a pause", () => {
    expect(isRetryableVoice(402)).toBe(false); expect(isRetryableVoice(403)).toBe(false); expect(shouldPauseVoice(402)).toBe(true); expect(shouldPauseVoice(403)).toBe(true);
    expect(isRetryableVoice(429)).toBe(true); expect(isRetryableVoice(503)).toBe(true); expect(isRetryableVoice(400)).toBe(false); expect(isRetryableVoice(404)).toBe(false);
  });
});