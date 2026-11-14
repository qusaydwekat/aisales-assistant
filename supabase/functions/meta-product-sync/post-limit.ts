export const DEFAULT_POST_LIMIT = 20;
export const MAX_POST_LIMIT = 100;

export function normalizePostLimit(value: unknown): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_POST_LIMIT
    ? count : DEFAULT_POST_LIMIT;
}

export function canReconcileMissingProducts(sourceType: string): boolean {
  // Older posts outside a bounded window are not evidence of deletion.
  return sourceType === "shop";
}