const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export async function rehostExternalImages(
  admin: any,
  storeId: string,
  urls: string[],
  folder = "imports",
): Promise<Array<string | null>> {
  const list = Array.from(new Set(urls)).filter(Boolean).slice(0, 200);
  const results = await Promise.all(list.map(async (src) => {
    try {
      if (!/^https?:\/\//i.test(src)) return src;
      const parsed = new URL(src);
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
      const origin = parsed.origin;
      let response = await fetch(src, {
        headers: { "User-Agent": UA, Accept: "image/*,*/*", Referer: `${origin}/` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        response = await fetch(src, {
          headers: { "User-Agent": UA, Accept: "image/*,*/*" },
          signal: AbortSignal.timeout(20_000),
        });
      }
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.startsWith("image/")) return null;
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > 15 * 1024 * 1024) return null;
      const extension = type.split("/")[1].split(";")[0].replace("jpeg", "jpg").replace("svg+xml", "svg") || "jpg";
      const path = `${storeId}/${folder}/${crypto.randomUUID()}.${extension}`;
      const { error } = await admin.storage.from("store-assets").upload(path, buffer, { contentType: type });
      if (error) return null;
      return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
    } catch {
      return null;
    }
  }));
  const bySource = new Map(list.map((url, index) => [url, results[index]]));
  return urls.map((url) => bySource.get(url) || null);
}
