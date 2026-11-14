export const VOICE_PENDING = "🎤 ⏳ (voice message processing)";
export const VOICE_FAILED = "[Voice message could not be understood]";
export const VOICE_MODEL = "openai/gpt-transcribe";
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export function extractVoiceMessages(body: any, platform: string): any[] {
  const result: any[] = [];
  const add = (message: any, sender: string, pageId: string, timestamp: number, displayName?: string) => {
    if (message?.is_echo) return;
    const attachments = message?.attachments || [];
    const audio = attachments.filter((a: any) => a.type === "audio");
    audio.forEach((a: any, index: number) => result.push({ platform, sender, platformId: sender, pageId,
      kind: "audio", text: VOICE_PENDING, audioUrl: a.payload?.url,
      platformMessageId: message.mid ? (message.text || attachments.length > 1 ? `${message.mid}:audio${index}` : message.mid) : undefined,
      timestamp: new Date(timestamp + (message.text ? 1 : 0) + index).toISOString(), displayName,
      replyToMid: message.reply_to?.mid,
    }));
  };
  for (const entry of body.entry || []) {
    if (platform === "whatsapp") {
      for (const change of entry.changes || []) for (const msg of change.value?.messages || []) {
        if (msg.type !== "audio") continue;
        result.push({ platform, sender: msg.from, platformId: msg.from, pageId: change.value?.metadata?.phone_number_id,
          kind: "audio", text: VOICE_PENDING, mediaId: msg.audio?.id, platformMessageId: msg.id,
          timestamp: new Date(Number(msg.timestamp || 0) * 1000).toISOString(), displayName: change.value?.contacts?.[0]?.profile?.name,
        });
      }
    } else {
      for (const m of entry.messaging || []) add(m.message, m.sender?.id, entry.id, m.timestamp || Date.now());
      if (platform === "instagram") for (const change of entry.changes || []) {
        if (change.field === "messages") add(change.value?.message, change.value?.sender?.id, entry.id, change.value?.timestamp || Date.now());
      }
    }
  }
  return result;
}

export function pcmToWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const samples = channels[0]?.length || 0;
  if (!samples || !channels.length) throw new Error("Empty audio");
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const value = Math.max(-1, Math.min(1, channels.reduce((sum, ch) => sum + (ch[i] || 0), 0) / channels.length));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Uint8Array(buffer);
}

export function shouldPauseVoice(status: number): boolean { return status === 402 || status === 403; }
export function isRetryableVoice(status: number): boolean { return status === 429 || status >= 500; }