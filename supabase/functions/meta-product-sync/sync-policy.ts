export type Availability = "in_stock" | "out_of_stock" | "unknown";

export interface NormalizedProduct {
  externalId: string;
  externalKey: string;
  externalGroupId?: string | null;
  name: string;
  description: string;
  category: string;
  brand: string;
  price: number | null;
  comparePrice: number | null;
  currency: string | null;
  images: string[];
  stock: number;
  stockTracked: boolean;
  availability: Availability;
  active: boolean;
  sku: string;
  variants: Array<Record<string, unknown>>;
  sizesAvailable: string[];
  colors: string[];
  permalink?: string | null;
  multiProduct?: boolean;
  variantPricesDiffer?: boolean;
  raw: unknown;
}

export function parseMetaPrice(value: unknown): { amount: number | null; currency: string | null } {
  if (value == null || value === "") return { amount: null, currency: null };
  if (typeof value === "number") {
    return { amount: Number.isFinite(value) && value >= 0 ? value : null, currency: null };
  }
  const text = String(value).trim();
  const match = text.match(/(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z]{3})?/);
  if (!match) return { amount: null, currency: null };
  const amount = Number(match[1].replace(/,/g, ""));
  return {
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    currency: match[2]?.toUpperCase() || null,
  };
}

export function normalizeAvailability(value: unknown): Availability {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["in_stock", "available", "available_for_order", "preorder", "pre_order"].includes(normalized)) return "in_stock";
  if (["out_of_stock", "sold_out", "unavailable", "discontinued"].includes(normalized)) return "out_of_stock";
  return "unknown";
}

export function productIssues(item: NormalizedProduct, storeCurrency: string, sourceType: "shop" | "posts"): string[] {
  const issues: string[] = [];
  if (!item.name.trim()) issues.push("missing_name");
  if (item.price == null || !Number.isFinite(item.price) || item.price < 0) issues.push("missing_price");
  if (!item.currency) issues.push("missing_currency");
  else if (item.currency.toUpperCase() !== storeCurrency.toUpperCase()) issues.push("currency_mismatch");
  if (item.multiProduct) issues.push("multiple_products");
  if (item.variantPricesDiffer) issues.push("variant_prices_differ");
  if (item.availability === "unknown") issues.push("availability_review_required");
  if (sourceType === "posts" && item.stockTracked && (!Number.isInteger(item.stock) || item.stock < 0)) issues.push("invalid_stock");
  return Array.from(new Set(issues));
}

export const SYNCED_FIELDS = [
  "name", "description", "category", "price", "compare_price", "currency", "images",
  "stock", "stock_tracked", "availability", "sku", "variants", "sizes_available", "color", "brand",
] as const;

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, comparable(entry)]));
  }
  if (typeof value === "number") return Number(value);
  return value ?? null;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

export function detectLocalConflicts(
  product: Record<string, unknown>,
  lastSnapshot: Record<string, unknown>,
): string[] {
  return SYNCED_FIELDS.filter((field) =>
    lastSnapshot[field] !== undefined && !valuesEqual(product[field], lastSnapshot[field])
  );
}

export function nextMissingCount(previous: number, seen: boolean): number {
  return seen ? 0 : Math.max(0, previous) + 1;
}

export function shouldDeactivateAfterMissing(missingCount: number): boolean {
  return missingCount >= 2;
}

export function canSellProduct(product: {
  active?: boolean;
  stock?: number;
  stock_tracked?: boolean;
  availability?: string;
}): boolean {
  if (product.active === false) return false;
  if (product.stock_tracked === false) return product.availability === "in_stock";
  return Number(product.stock || 0) > 0;
}

export function groupCatalogItems(rows: any[], catalogId: string): NormalizedProduct[] {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const retailerId = String(row.retailer_id || row.id || "").trim();
    if (!retailerId) continue;
    const groupId = String(row.item_group_id || "").trim();
    const key = groupId || retailerId;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([groupKey, items]) => {
    const first = items[0];
    const parsedPrice = parseMetaPrice(first.price);
    const parsedSale = parseMetaPrice(first.sale_price);
    const pricesDiffer = items.some((row) => {
      const parsed = parseMetaPrice(row.price);
      return parsed.amount !== parsedPrice.amount || (parsed.currency || parsedPrice.currency) !== parsedPrice.currency;
    });
    const inventories = items.map((row) => row.inventory).filter((value) => Number.isFinite(Number(value)));
    const stockTracked = inventories.length === items.length && items.length > 0;
    const stock = stockTracked
      ? inventories.reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value))), 0)
      : 0;
    const sizes = Array.from(new Set(items.map((row) => String(row.size || "").trim()).filter(Boolean)));
    const colors = Array.from(new Set(items.map((row) => String(row.color || "").trim()).filter(Boolean)));
    const variants = items.map((row) => ({
      name: [row.size, row.color].filter(Boolean).join(" / ") || String(row.retailer_id || row.id),
      size: row.size || null,
      color: row.color || null,
      sku: row.retailer_id || null,
      stock: Number.isFinite(Number(row.inventory)) ? Math.max(0, Math.floor(Number(row.inventory))) : null,
      external_id: String(row.retailer_id || row.id || ""),
    }));
    const images = Array.from(new Set(items.flatMap((row) => [
      row.image_url,
      ...(Array.isArray(row.additional_image_urls) ? row.additional_image_urls : []),
    ]).filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))));
    const availabilities = items.map((row) => normalizeAvailability(row.availability));
    const availability = availabilities.some((value) => value === "in_stock")
      ? "in_stock"
      : availabilities.every((value) => value === "out_of_stock") ? "out_of_stock" : "unknown";

    return {
      externalId: groupKey,
      externalKey: `catalog:${catalogId}:${groupKey}`,
      externalGroupId: first.item_group_id || null,
      name: String(first.name || "").trim(),
      description: String(first.description || "").trim(),
      category: String(first.product_type || first.category || "").trim(),
      brand: String(first.brand || "").trim(),
      price: parsedSale.amount ?? parsedPrice.amount,
      comparePrice: parsedSale.amount != null ? parsedPrice.amount : null,
      currency: (parsedSale.currency || parsedPrice.currency || "").toUpperCase() || null,
      images,
      stock,
      stockTracked,
      availability,
      active: availability === "in_stock" || availability === "out_of_stock",
      sku: String(first.retailer_id || "").trim(),
      variants: variants.length > 1 ? variants : [],
      sizesAvailable: sizes,
      colors,
      permalink: first.url || null,
      variantPricesDiffer: pricesDiffer,
      raw: items,
    };
  });
}
