import { describe, expect, it } from "vitest";
import {
  parseMessageDecision,
  shouldCancelDirectly,
  shouldEmphasizeCancellation,
  shouldRedirectUpdateToCancel,
  type MessageDecision,
} from "../../supabase/functions/platform-webhook/jev-policy";

function decision(overrides: Partial<MessageDecision> = {}): MessageDecision {
  return {
    intent: "order_cancel",
    intentConfidence: 0.95,
    cancellationProbability: 0.95,
    ...overrides,
  };
}

describe("Jev customer message decisions", () => {
  it("accepts only complete typed decisions", () => {
    expect(parseMessageDecision({
      answers: {
        primary_intent: { choice: "order_update", confidence: 0.8 },
        cancellation_requested: { noul: 0.04 },
      },
    })).toEqual({
      intent: "order_update",
      intentConfidence: 0.8,
      cancellationProbability: 0.04,
    });

    expect(() => parseMessageDecision({ answers: { primary_intent: { choice: "order_cancel", confidence: 1 } } }))
      .toThrow("cancellation probability");
  });

  it("cancels directly only at a strong cancellation probability", () => {
    expect(shouldCancelDirectly(decision({ cancellationProbability: 0.85 }))).toBe(true);
    expect(shouldCancelDirectly(decision({ cancellationProbability: 0.84 }))).toBe(false);
    expect(shouldCancelDirectly(null)).toBe(false);
  });

  it("keeps a possible cancellation in front of the main agent", () => {
    expect(shouldEmphasizeCancellation(decision({ cancellationProbability: 0.55 }))).toBe(true);
    expect(shouldEmphasizeCancellation(decision({ cancellationProbability: 0.54 }))).toBe(false);
  });

  it("does not turn a request not to cancel into a cancellation", () => {
    const update = decision({
      intent: "order_update",
      cancellationProbability: 0.03,
    });
    expect(shouldRedirectUpdateToCancel("Please don't cancel my order; change the address", update)).toBe(false);
    expect(shouldRedirectUpdateToCancel("لا تلغي الطلب، غير العنوان", update)).toBe(false);
  });

  it("redirects a mistaken update tool call for an Arabic cancellation", () => {
    expect(shouldRedirectUpdateToCancel("بطلت بدي الطلب", decision())).toBe(true);
  });

  it("retains the keyword fallback when Jev is unavailable", () => {
    expect(shouldRedirectUpdateToCancel("I changed my mind", null)).toBe(true);
    expect(shouldRedirectUpdateToCancel("Change my address", null)).toBe(false);
  });
});
