import { createOpenAI } from "npm:@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "npm:ai";
import { z } from "npm:zod@3";
import { normalizeAvailability, parseMetaPrice, type NormalizedProduct } from "./sync-policy.ts";
import { createLovableAiGatewayRunIdFetch } from "./run-id.ts";

const JEV_ENDPOINT = "https://ai.gateway.lovable.dev/v1/systemone";

const extractedProductSchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
  stock: z.number().int().nullable(),
  sizes: z.array(z.string()),
  colors: z.array(z.string()),
  multi_product: z.boolean(),
});

function postText(post: any, platform: string): string {
  return String(platform === "instagram" ? post.caption || "" : post.message || "").trim();
}

export function postPhotos(post: any, platform: string): string[] {
  if (platform === "instagram") {
    const children = Array.isArray(post.children?.data) ? post.children.data : [];
    const urls = [
      post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url,
      ...children.map((child: any) => child.media_type === "VIDEO" ? child.thumbnail_url : child.media_url),
    ];
    return Array.from(new Set(urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))));
  }
  const attachments = Array.isArray(post.attachments?.data) ? post.attachments.data : [];
  const urls = [
    post.full_picture,
    ...attachments.map((attachment: any) => attachment.media?.image?.src || attachment.media?.source),
    ...attachments.flatMap((attachment: any) => (attachment.subattachments?.data || []).map((child: any) => child.media?.image?.src || child.media?.source)),
  ];
  return Array.from(new Set(urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))));
}

export function emptyPostProduct(post: any, connection: any): NormalizedProduct {
  const platform = connection.platform;
  const id = String(post.id);
  return {
    externalId: id,
    externalKey: `post:${platform}:${id}`,
    name: "",
    description: postText(post, platform),
    category: "",
    brand: "",
    price: null,
    comparePrice: null,
    currency: null,
    images: postPhotos(post, platform),
    stock: 0,
    stockTracked: false,
    availability: "unknown",
    active: false,
    sku: "",
    variants: [],
    sizesAvailable: [],
    colors: [],
    permalink: post.permalink || post.permalink_url || null,
    raw: post,
  };
}

async function classifyWithJev(posts: any[], connection: any): Promise<Record<string, boolean> | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || posts.length === 0) return null;
  const questions: Record<string, unknown> = {};
  posts.forEach((post, index) => {
    questions[`post_${index}`] = {
      type: "choice",
      instructions: "Does this business-owned social post offer one identifiable product for sale? General announcements, delivery information, greetings, contests and unrelated content are not product posts.",
      criteria: {
        product: "The caption offers or presents a product that a customer could ask to buy, even if its price is missing.",
        other: "The caption is not presenting a purchasable product, or it only discusses store policies or general news.",
      },
    };
  });
  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state: {
          posts: posts.map((post) => ({
            id: post.id,
            text: postText(post, connection.platform) || "Photo-only post",
            has_photo: postPhotos(post, connection.platform).length > 0,
          })),
        },
        questions,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Jev post classification unavailable (${response.status})`);
      return null;
    }
    const payload = await response.json();
    const result: Record<string, boolean> = {};
    posts.forEach((post, index) => {
      const answer = payload?.answers?.[`post_${index}`];
      if (!answer || !["product", "other"].includes(answer.choice)) throw new Error("Invalid Jev post classification");
      result[String(post.id)] = answer.choice === "product";
    });
    return result;
  } catch (error) {
    console.warn("Jev post classification failed; using cautious fallback:", error);
    return null;
  }
}

async function extractWithAI(post: any, connection: any): Promise<NormalizedProduct | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const base = emptyPostProduct(post, connection);
  const caption = postText(post, connection.platform);
  const photos = base.images.slice(0, 4);
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const content: any[] = [{
    type: "text",
    text: `Extract one product from this ${connection.platform} business post. Caption:\n${caption || "(no caption)"}\n\nReturn only facts supported by the caption or visible photos. Never infer a price, currency, stock quantity, size, color or availability. A visual generic name such as 'red dress' is allowed only when clearly visible. Set multi_product true when the post offers several distinct products. Currency must be an ISO code such as ILS, JOD, USD or EUR when explicitly identifiable; otherwise null. Availability is in_stock or out_of_stock only when the caption explicitly says so; otherwise unknown.`,
  }];
  for (const url of photos) content.push({ type: "image", image: url });

  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      instructions: "You convert social posts into accurate product records. You never guess missing commercial facts.",
      messages: [{ role: "user", content }],
      output: Output.object({ schema: extractedProductSchema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const extracted = await result.output;
    if (!extracted) return null;
    const parsedPrice = parseMetaPrice(extracted.price);
    const currency = String(extracted.currency || "").toUpperCase().match(/^[A-Z]{3}$/)?.[0] || null;
    const stockTracked = extracted.stock != null && extracted.stock >= 0;
    const availability = normalizeAvailability(extracted.availability);
    return {
      ...base,
      name: String(extracted.name || "").trim(),
      description: String(extracted.description || caption || "").trim(),
      category: String(extracted.category || "").trim(),
      price: parsedPrice.amount,
      currency,
      stock: stockTracked ? Math.max(0, extracted.stock!) : 0,
      stockTracked,
      availability,
      active: availability !== "unknown",
      sizesAvailable: extracted.sizes.map(String).filter(Boolean).slice(0, 50),
      colors: extracted.colors.map(String).filter(Boolean).slice(0, 50),
      multiProduct: extracted.multi_product,
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.warn("Post extraction returned no valid product object:", error.text?.slice(0, 300));
    } else {
      console.warn("Post extraction failed:", error);
    }
    return null;
  }
}

export async function extractProductPosts(posts: any[], connection: any): Promise<NormalizedProduct[]> {
  const output: NormalizedProduct[] = [];
  for (let offset = 0; offset < posts.length; offset += 20) {
    const batch = posts.slice(offset, offset + 20);
    const decisions = await classifyWithJev(batch, connection);
    for (const post of batch) {
      const base = emptyPostProduct(post, connection);
      const caption = postText(post, connection.platform);
      const hasStrongPriceSignal = /(?:\d[\d,.]*\s*(?:ils|jod|usd|eur|aed|sar|jd|₪|\$|€)|(?:price|السعر|بسعر|الثمن)\s*[::]?)/i.test(caption);
      const isProduct = !caption && base.images.length > 0
        ? true
        : decisions?.[String(post.id)] ?? hasStrongPriceSignal;
      if (!isProduct) continue;
      const extracted = await extractWithAI(post, connection);
      if (extracted) output.push(extracted);
      else output.push({ ...base, multiProduct: false, raw: { post: base.raw, extraction_failed: true } });
    }
  }
  return output;
}
