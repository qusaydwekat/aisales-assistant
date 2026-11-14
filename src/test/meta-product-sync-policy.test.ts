import { describe, expect, it } from "vitest";
import {
  canSellProduct,
  detectLocalConflicts,
  groupCatalogItems,
  nextMissingCount,
  normalizeAvailability,
  parseMetaPrice,
  productIssues,
  shouldDeactivateAfterMissing,
} from "../../supabase/functions/meta-product-sync/sync-policy";
import { formatProductPrice } from "@/lib/product-availability";

describe("Meta product import policy", () => {
  it("parses the exact amount and currency", () => {
    expect(parseMetaPrice("1,250.50 JOD")).toEqual({ amount: 1250.5, currency: "JOD" });
  });

  it("groups Meta variants into one product and sums supplied inventory", () => {
    const [product] = groupCatalogItems([
      { id: "1", retailer_id: "RED-S", item_group_id: "DRESS", name: "Dress", price: "30 ILS", availability: "in stock", inventory: 2, size: "S", color: "Red" },
      { id: "2", retailer_id: "RED-M", item_group_id: "DRESS", name: "Dress", price: "30 ILS", availability: "in stock", inventory: 3, size: "M", color: "Red" },
    ], "CAT");
    expect(product.externalKey).toBe("catalog:CAT:DRESS");
    expect(product.variants).toHaveLength(2);
    expect(product.stock).toBe(5);
    expect(product.stockTracked).toBe(true);
    expect(product.sizesAvailable).toEqual(["S", "M"]);
  });

  it("does not invent quantity when only Shop availability is supplied", () => {
    const [product] = groupCatalogItems([
      { id: "1", retailer_id: "BAG", name: "Bag", price: "25.00 ILS", availability: "in stock" },
    ], "CAT");
    expect(product.stock).toBe(0);
    expect(product.stockTracked).toBe(false);
    expect(canSellProduct({ active: true, ...product })).toBe(true);
  });

  it("keeps unknown post availability out of sale", () => {
    const [product] = groupCatalogItems([
      { id: "1", retailer_id: "BAG", name: "Bag", price: "25 ILS" },
    ], "CAT");
    expect(productIssues(product, "ILS", "posts")).toContain("availability_review_required");
    expect(canSellProduct({ active: true, stock_tracked: false, availability: "unknown" })).toBe(false);
  });

  it("holds mismatched currencies for review instead of converting", () => {
    const [product] = groupCatalogItems([
      { id: "1", retailer_id: "BAG", name: "Bag", price: "25 USD", availability: "in stock" },
    ], "CAT");
    expect(productIssues(product, "ILS", "shop")).toContain("currency_mismatch");
  });

  it("holds variant groups with different prices for review", () => {
    const [product] = groupCatalogItems([
      { id: "1", retailer_id: "S", item_group_id: "SHIRT", name: "Shirt", price: "20 ILS", availability: "in stock" },
      { id: "2", retailer_id: "M", item_group_id: "SHIRT", name: "Shirt", price: "25 ILS", availability: "in stock" },
    ], "CAT");
    expect(productIssues(product, "ILS", "shop")).toContain("variant_prices_differ");
  });

  it("detects owner edits without treating untouched fields as conflicts", () => {
    const snapshot = { name: "Imported", price: 20, stock: 4 };
    expect(detectLocalConflicts({ name: "My title", price: 20, stock: 4 }, snapshot)).toEqual(["name"]);
  });

  it("requires two confirmed absences before deactivation", () => {
    expect(nextMissingCount(0, false)).toBe(1);
    expect(shouldDeactivateAfterMissing(1)).toBe(false);
    expect(nextMissingCount(1, false)).toBe(2);
    expect(shouldDeactivateAfterMissing(2)).toBe(true);
    expect(nextMissingCount(1, true)).toBe(0);
  });

  it("recognizes Meta availability spellings", () => {
    expect(normalizeAvailability("in stock")).toBe("in_stock");
    expect(normalizeAvailability("out of stock")).toBe("out_of_stock");
    expect(normalizeAvailability("perhaps")).toBe("unknown");
  });

  it("formats imported currency without silently converting it", () => {
    expect(formatProductPrice(25, "ILS", "en")).toContain("25");
    expect(formatProductPrice(25, "ILS", "en")).not.toContain("$");
  });
});
