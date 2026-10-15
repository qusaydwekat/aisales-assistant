import { describe, expect, it } from "vitest";
import { getConversationOrderStatus } from "@/lib/conversation-order-status";

const conversation = { id: "chat-1", store_id: "store-1", status: "pending_order" };
const order = { conversation_id: "chat-1", store_id: "store-1", status: "confirmed" as const, created_at: "2026-10-15T11:00:00Z" };

describe("conversation order status", () => {
  it("shows confirmed instead of a stale pending conversation status", () => {
    expect(getConversationOrderStatus(conversation, [order])).toBe("confirmed");
  });
  it("reflects every subsequent order status", () => {
    for (const status of ["pending", "processing", "shipped", "delivered", "cancelled"] as const) {
      expect(getConversationOrderStatus(conversation, [{ ...order, status }])).toBe(status);
    }
  });
  it("uses the newest linked order rather than an older confirmed order", () => {
    expect(getConversationOrderStatus(conversation, [order, { ...order, status: "pending", created_at: "2026-10-15T12:00:00Z" }])).toBe("pending");
  });
  it("does not use orders from another conversation or store", () => {
    expect(getConversationOrderStatus({ ...conversation, status: "open" }, [
      { ...order, conversation_id: "chat-2" }, { ...order, store_id: "store-2" },
    ])).toBeNull();
  });
  it("preserves explicitly resolved conversations", () => {
    expect(getConversationOrderStatus({ ...conversation, status: "resolved" }, [order])).toBe("resolved");
  });
});