import Papa from "papaparse";

export type ProductCsvRow = {
  name: string;
  description?: string;
  category?: string;
  price: number;
  compare_price?: number;
  stock: number;
  sku?: string;
  active?: boolean;
  images?: string[];
};

export const CSV_HEADERS = [
  "name",
  "description",
  "category",
  "price",
  "compare_price",
  "stock",
  "sku",
  "active",
  "image_url",
] as const;

export function buildTemplateCsv(): string {
  return Papa.unparse({
    fields: [...CSV_HEADERS],
    data: [
      [
        "Sample T-Shirt",
        "Soft cotton tee",
        "Apparel",
        "19.99",
        "24.99",
        "50",
        "TEE-001",
        "true",
        "https://example.com/image.jpg",
      ],
    ],
  });
}

export function exportProductsCsv(
  products: Array<{
    name: string;
    description?: string | null;
    category?: string | null;
    price: number | string;
    compare_price?: number | string | null;
    stock: number;
    sku?: string | null;
    active: boolean;
    images?: string[] | null;
  }>,
): string {
  const rows = products.map((p) => ({
    name: p.name,
    description: p.description || "",
    category: p.category || "",
    price: Number(p.price),
    compare_price: p.compare_price ? Number(p.compare_price) : "",
    stock: p.stock,
    sku: p.sku || "",
    active: p.active ? "true" : "false",
    image_url: p.images?.[0] || "",
  }));
  return Papa.unparse({ fields: [...CSV_HEADERS], data: rows.map((r) => CSV_HEADERS.map((h) => (r as any)[h])) });
}

export type ParsedRow = {
  raw: Record<string, string>;
  product: ProductCsvRow | null;
  errors: string[];
};

export function parseProductsCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  return (result.data || []).map((row) => {
    const errors: string[] = [];
    const name = (row.name || "").trim();
    if (!name) errors.push("name required");
    const priceNum = Number(row.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) errors.push("price invalid");
    const stockNum = row.stock ? Number(row.stock) : 0;
    if (!Number.isFinite(stockNum) || stockNum < 0) errors.push("stock invalid");
    const compare = row.compare_price ? Number(row.compare_price) : undefined;
    if (compare !== undefined && (!Number.isFinite(compare) || compare < 0)) errors.push("compare_price invalid");
    const activeRaw = (row.active || "true").toString().toLowerCase().trim();
    const active = !["false", "0", "no", "off"].includes(activeRaw);
    const imageUrl = (row.image_url || "").trim();

    const product: ProductCsvRow | null = errors.length === 0
      ? {
          name,
          description: (row.description || "").trim(),
          category: (row.category || "").trim(),
          price: priceNum,
          compare_price: compare,
          stock: stockNum,
          sku: (row.sku || "").trim(),
          active,
          images: imageUrl ? [imageUrl] : [],
        }
      : null;

    return { raw: row, product, errors };
  });
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
