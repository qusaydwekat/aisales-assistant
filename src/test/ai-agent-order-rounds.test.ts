import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/functions/platform-webhook/shared.ts", () => ({}));
vi.mock("../../supabase/functions/_shared/typing-session.ts", () => ({}));
vi.mock("../../supabase/functions/platform-webhook/meta-client.ts", () => ({}));
vi.mock("../../supabase/functions/platform-webhook/conversation-intel.ts", () => ({}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({}));
vi.mock("https://deno.land/std@0.224.0/crypto/mod.ts", () => ({}));
vi.mock("../../supabase/functions/platform-webhook/jev-policy.ts", () => ({}));

const { createOrder, searchProducts } = vi.hoisted(() => ({
  createOrder: vi.fn(), searchProducts: vi.fn(),
}));
vi.mock("../../supabase/functions/platform-webhook/order-manager.ts", () => ({
  executeCreateOrder: createOrder,
}));
vi.mock("../../supabase/functions/platform-webhook/ai-tools.ts", () => {
  const tool = (name: string) => ({ type: "function", function: { name } });
  return {
    ORDER_TOOL: tool("create_order"), CANCEL_ORDER_TOOL: tool("cancel_order"),
    UPDATE_ORDER_TOOL: tool("update_order"), CHECK_ORDER_STATUS_TOOL: tool("check_order_status"),
    ADD_ORDER_NOTE_TOOL: tool("add_order_note"), SEND_PRODUCT_IMAGES_TOOL: tool("send_product_images"),
    SEARCH_PRODUCTS_TOOL: tool("search_products"), LIST_CATEGORIES_TOOL: tool("list_categories"),
    GET_ACTIVE_PROMOTIONS_TOOL: tool("get_active_promotions"), APPLY_DISCOUNT_CODE_TOOL: tool("apply_discount_code"),
    FLAG_KNOWLEDGE_GAP_TOOL: tool("flag_knowledge_gap"), REGISTER_RESTOCK_INTEREST_TOOL: tool("register_restock_interest"),
    GET_STORE_CONTEXT_TOOL: tool("get_store_context"), fetchActivePromotions: async () => [],
    executeSearchProducts: searchProducts,
  };
});
vi.mock("../../supabase/functions/platform-webhook/burst-collector.ts", () => ({
  sanitizeAIResponse: (text: string) => text,
  parseMessageContext: (text: string) => ({ textWithoutCtx: text }),
  parseImageUrlFromMessageContent: () => null,
  collectPendingCustomerBurst: (history: unknown[]) => history,
  extractBurstInput: () => ({ combinedText: "صحيح", latestContext: {}, imageUrls: [] }),
  looksLikeReferentialFollowUp: () => false,
  hasConcreteCustomerQuestion: () => false,
  isFallbackLikeResponse: () => false,
  logPromptInChunks: () => {}, serializeAIMessageForLog: (value: unknown) => value,
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const orderArgs = {
  customer_name: "Test customer", phone: "0500000000", address: "Test address",
  items: [{ product_id: "catalog-jacket", product_name: "Jacket", quantity: 1, price: 120, variant: "L / beige" }],
};

async function runAgent(steps: Array<{ tool?: string; result?: string }>) {
  // Load the Deno worker at runtime so the browser TS project does not compile
  // its server-only URL imports; Vitest supplies the mocks above.
  const workerPath = "../../supabase/functions/platform-webhook/ai-agent.ts";
  const { generateAIReply } = await import(workerPath);
  vi.stubGlobal("Deno", { env: { get: () => "test-key" } });
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    const step = steps[requests.length - 1];
    if (!step) throw new Error("Unexpected extra AI round");
    if (step.tool && !body.tools?.some((t: any) => t.function.name === step.tool)) {
      throw new Error(`Required tool ${step.tool} unavailable`);
    }
    return new Response(JSON.stringify({ choices: [{ message: step.tool ? {
      role: "assistant", content: null,
      tool_calls: [{ id: `call-${requests.length}`, function: {
        name: step.tool, arguments: JSON.stringify(step.tool === "create_order" ? orderArgs : { query: "Jacket" }),
      } }],
    } : { role: "assistant", content: step.result } }] }));
  }));
  const client = { from: () => ({ select: () => ({ limit: () => ({
    maybeSingle: async () => ({ data: { model: "google/gemini-3-flash-preview" } }),
  }) }) }) };
  const result = await generateAIReply("صحيح", { name: "Test store" }, "Jacket", {}, [
    { sender: "ai", content: "Full order summary. Confirm?" }, { sender: "customer", content: "صحيح" },
  ], client, "test-store", "test-conversation", "facebook", []);
  return { result, requests };
}

describe("confirmed order tool execution", () => {
  it("creates the approved order after two catalog searches instead of disabling tools", async () => {
    searchProducts.mockResolvedValue(JSON.stringify({ success: true, products: [{ id: "catalog-jacket", price: 120 }] }));
    createOrder.mockResolvedValue(JSON.stringify({ success: true, order_number: "ORD-00010" }));
    const { result, requests } = await runAgent([
      { tool: "search_products" }, { tool: "search_products" }, { tool: "create_order" },
      { result: "تم تسجيل طلبك ORD-00010" },
    ]);
    expect(createOrder).toHaveBeenCalledExactlyOnceWith(expect.anything(), "test-store", "test-conversation", "facebook", orderArgs);
    expect(result.text).toContain("ORD-00010");
    expect(requests[3].tools).toBeUndefined();
  });

  it("keeps tools available to recover a failed order before confirming success", async () => {
    createOrder.mockResolvedValueOnce(JSON.stringify({ success: false, error: "ITEM_MISMATCH" }))
      .mockResolvedValueOnce(JSON.stringify({ success: true, order_number: "ORD-00011" }));
    searchProducts.mockResolvedValue(JSON.stringify({ success: true, products: [{ id: "catalog-jacket" }] }));
    const { result, requests } = await runAgent([
      { tool: "create_order" }, { tool: "search_products" }, { tool: "create_order" },
      { result: "تم تسجيل طلبك ORD-00011" },
    ]);
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(requests[1].tools.some((t: any) => t.function.name === "create_order")).toBe(true);
    expect(result.text).toContain("ORD-00011");
  });
});