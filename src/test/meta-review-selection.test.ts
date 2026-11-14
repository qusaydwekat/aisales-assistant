import { describe, expect, it } from "vitest";
import { isReviewPriceEnabled, parseReviewPrice } from "../lib/meta-review-selection";

describe("product review selection", () => {
  it("enables prices only for selected products", () => {
    expect(isReviewPriceEnabled(new Set(["selected"]), "selected")).toBe(true);
    expect(isReviewPriceEnabled(new Set(["selected"]), "other")).toBe(false);
  });
  it("preserves entered prices and rejects missing or invalid prices", () => {
    expect(parseReviewPrice("49.50")).toBe(49.5);
    expect(parseReviewPrice("0")).toBe(0);
    expect(parseReviewPrice("")).toBeNull();
    expect(parseReviewPrice("-1")).toBeNull();
  });
});