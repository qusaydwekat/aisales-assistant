import { afterEach, describe, expect, it, vi } from "vitest";
import { startTypingSession } from "../../supabase/functions/_shared/typing-session";

afterEach(() => { vi.useRealTimers(); });

describe("customer typing session", () => {
  it("keeps renewing while a reply is pending and stops only after delivery", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const session = startTypingSession(send);
    await vi.advanceTimersByTimeAsync(24000);
    expect(send.mock.calls.map(([action]) => action)).toEqual(Array(7).fill("typing_on"));
    await session.stop();
    expect(send).toHaveBeenLastCalledWith("typing_off");
    await vi.advanceTimersByTimeAsync(8000);
    expect(send).toHaveBeenCalledTimes(8);
  });

  it("waits for an in-flight refresh before clearing typing", async () => {
    vi.useFakeTimers();
    let resolveSend: (() => void) | undefined;
    const send = vi.fn((action: string) => action === "typing_on"
      ? new Promise<void>((resolve) => { resolveSend = resolve; })
      : Promise.resolve());
    const session = startTypingSession(send);
    await vi.advanceTimersByTimeAsync(12000);
    expect(send).toHaveBeenCalledTimes(1);
    const stopping = session.stop();
    expect(send).not.toHaveBeenCalledWith("typing_off");
    resolveSend?.();
    await stopping;
    expect(send).toHaveBeenLastCalledWith("typing_off");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not clear another worker's indicator when yielding a duplicate", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const session = startTypingSession(send);
    await vi.advanceTimersByTimeAsync(0);
    await session.stop(false);
    await vi.advanceTimersByTimeAsync(8000);
    expect(send.mock.calls).toEqual([["typing_on"]]);
    expect(vi.getTimerCount()).toBe(0);
  });
});