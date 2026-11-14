export function isReviewPriceEnabled(selectedIds: ReadonlySet<string>, id: string): boolean {
  return selectedIds.has(id);
}

export function parseReviewPrice(value: string): number | null {
  if (!value.trim()) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}