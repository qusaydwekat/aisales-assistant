import { normalizePostLimit } from "./post-limit.ts";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const GRAPH_VERSION = "v21.0";

export class MetaApiError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isMetaAuthFailure(error: unknown): boolean {
  if (!(error instanceof MetaApiError)) return false;
  return [401, 403].includes(error.status) || error.code === 283 || /permission|not been approved|requires .*access/i.test(error.message);
}

async function requestMeta(url: string, token: string): Promise<any> {
  const target = new URL(url);
  if (target.origin !== GRAPH_ORIGIN) throw new MetaApiError("Unexpected Meta API URL", 400);
  target.searchParams.set("access_token", token);

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(25_000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && !body.error) return body;
      const message = body?.error?.message || `Meta request failed (${response.status})`;
      lastError = message;
      if (response.status !== 429 && response.status < 500) {
        throw new MetaApiError(message, response.status, body?.error?.code);
      }
    } catch (error) {
      if (error instanceof MetaApiError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt + Math.random() * 300));
  }
  throw new MetaApiError(lastError || "Meta request failed", 502);
}

function graph(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`${GRAPH_ORIGIN}/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

export async function fetchAllPages(initialUrl: string, token: string, maxPages = 1000, maxRows = Infinity): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = initialUrl;
  let pages = 0;
  const visited = new Set<string>();
  while (next && pages < maxPages) {
    const withoutToken = new URL(next);
    withoutToken.searchParams.delete("access_token");
    const fingerprint = withoutToken.toString();
    if (visited.has(fingerprint)) throw new MetaApiError("Meta pagination loop detected", 502);
    visited.add(fingerprint);
    const target = new URL(next);
    if (Number.isFinite(maxRows)) target.searchParams.set("limit", String(Math.min(100, maxRows - rows.length)));
    const body = await requestMeta(target.toString(), token);
    if (Array.isArray(body.data)) rows.push(...body.data.slice(0, maxRows - rows.length));
    if (rows.length >= maxRows) return rows;
    next = body.paging?.next || null;
    pages++;
  }
  if (next) throw new MetaApiError("Catalog is too large for one sync checkpoint; rerun to continue", 502);
  return rows;
}

function pageIdFor(connection: any): string {
  const credentials = connection.credentials || {};
  return connection.platform === "instagram"
    ? credentials.facebook_page_id || connection.page_id
    : connection.page_id;
}

function instagramIdFor(connection: any): string | null {
  const credentials = connection.credentials || {};
  return connection.platform === "instagram"
    ? credentials.instagram_business_account_id || connection.page_id
    : credentials.instagram_business_account_id || null;
}

export async function discoverCatalogs(connection: any): Promise<Array<{ id: string; name: string; product_count?: number }>> {
  const credentials = connection.credentials || {};
  const userToken = credentials.user_token || credentials.page_access_token;
  const pageToken = credentials.page_access_token || userToken;
  if (!userToken) throw new MetaApiError("Reconnect this account to grant catalog access", 401);
  const catalogs = new Map<string, { id: string; name: string; product_count?: number }>();
  const add = (rows: any[]) => rows.forEach((row) => {
    if (row.id) catalogs.set(String(row.id), { id: String(row.id), name: row.name || `Catalog ${row.id}`, product_count: row.product_count });
  });

  const pageId = pageIdFor(connection);
  if (pageId && pageToken) {
    try {
      add(await fetchAllPages(graph(`${pageId}/product_catalogs`, { fields: "id,name,product_count", limit: 100 }), pageToken));
    } catch (error) {
      console.warn("Page catalog discovery unavailable:", error);
    }
  }

  const businesses = await fetchAllPages(graph("me/businesses", { fields: "id,name", limit: 100 }), userToken);
  for (const business of businesses) {
    try {
      const [owned, client] = await Promise.all([
        fetchAllPages(graph(`${business.id}/owned_product_catalogs`, { fields: "id,name,product_count", limit: 100 }), userToken),
        fetchAllPages(graph(`${business.id}/client_product_catalogs`, { fields: "id,name,product_count", limit: 100 }), userToken),
      ]);
      add([...owned, ...client]);
    } catch (error) {
      console.warn(`Business catalog discovery failed for ${business.id}:`, error);
      // This permission belongs to the user token; checking every other business repeats the same failure.
      if (error instanceof Error && error.message.includes("business_management permission")) break;
    }
  }
  return Array.from(catalogs.values());
}

export function postSourceFor(connection: any): { id: string; name: string } {
  const isInstagram = connection.platform === "instagram";
  const id = isInstagram ? instagramIdFor(connection) : pageIdFor(connection);
  if (!id) throw new MetaApiError("No readable Instagram professional account is linked", 400);
  return { id: String(id), name: `${connection.page_name || connection.platform} posts` };
}

export async function fetchCatalogProducts(catalogId: string, connection: any): Promise<any[]> {
  const token = connection.credentials?.user_token || connection.credentials?.page_access_token;
  if (!token) throw new MetaApiError("Reconnect this account to grant catalog access", 401);
  return fetchAllPages(graph(`${catalogId}/products`, {
    fields: "id,retailer_id,name,description,price,sale_price,currency,availability,inventory,image_url,additional_image_urls,brand,product_type,category,item_group_id,url,color,size,material,pattern",
    limit: 100,
  }), token);
}

export async function fetchPublishedPosts(connection: any, postLimit?: number): Promise<any[]> {
  const limit = normalizePostLimit(postLimit);
  const token = connection.credentials?.page_access_token || connection.credentials?.user_token;
  if (!token) throw new MetaApiError("Reconnect this account to grant post access", 401);
  if (connection.platform === "instagram") {
    const igId = instagramIdFor(connection);
    if (!igId) throw new MetaApiError("No Instagram professional account is linked", 400);
    return fetchAllPages(graph(`${igId}/media`, {
      fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}",
      limit,
    }), token, 1000, limit);
  }
  const pageId = pageIdFor(connection);
  return fetchAllPages(graph(`${pageId}/published_posts`, {
    fields: "id,message,created_time,permalink_url,full_picture,attachments{media,type,subattachments}",
    limit,
  }), token, 1000, limit);
}
