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

export function formatProductPrice(value: number, currency?: string | null, language = "en"): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(language === "ar" ? "ar" : "en", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(Number(value));
    } catch {
      return `${Number(value).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }
  return `$${Number(value).toFixed(2)}`;
}
