import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublishedPosts } from "../../supabase/functions/meta-product-sync/meta-api";
import { canReconcileMissingProducts, normalizePostLimit } from "../../supabase/functions/meta-product-sync/post-limit";

afterEach(() => vi.unstubAllGlobals());

describe("bounded post imports", () => {
  it("imports only the requested count and does not follow further pages", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      data: Array.from({ length: 30 }, (_, id) => ({ id })),
      paging: { next: "https://graph.facebook.com/v21.0/page/published_posts?after=next" },
    }) });
    vi.stubGlobal("fetch", fetch);
    const posts = await fetchPublishedPosts({ platform: "facebook", page_id: "page", credentials: { page_access_token: "test" } }, 10);
    expect(posts).toHaveLength(10);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("limit")).toBe("10");
  });

  it("fetches only the remaining count when Meta returns a smaller page", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 1 }, { id: 2 }], paging: { next: "https://graph.facebook.com/v21.0/page/published_posts?after=next&limit=100" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 3 }, { id: 4 }], paging: { next: "https://graph.facebook.com/v21.0/page/published_posts?after=more" } }) });
    vi.stubGlobal("fetch", fetch);
    const posts = await fetchPublishedPosts({ platform: "facebook", page_id: "page", credentials: { page_access_token: "test" } }, 3);
    expect(posts.map((post) => post.id)).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("limit")).toBe("1");
  });

  it("defaults legacy sources to a bounded window", () => {
    expect(normalizePostLimit(undefined)).toBe(20);
    expect(normalizePostLimit(100)).toBe(100);
    expect(normalizePostLimit(0)).toBe(20);
    expect(normalizePostLimit(101)).toBe(20);
  });

  it("does not deactivate older products outside a limited post window", () => {
    expect(canReconcileMissingProducts("posts")).toBe(false);
    expect(canReconcileMissingProducts("shop")).toBe(true);
  });
});