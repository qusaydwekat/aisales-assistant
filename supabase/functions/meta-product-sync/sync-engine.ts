import { rehostExternalImages } from "../_shared/external-images.ts";
import { fetchCatalogProducts, fetchPublishedPosts } from "./meta-api.ts";
import { emptyPostProduct, extractProductPosts } from "./post-extractor.ts";
import {
  detectLocalConflicts,
  groupCatalogItems,
  nextMissingCount,
  productIssues,
  shouldDeactivateAfterMissing,
  SYNCED_FIELDS,
  valuesEqual,
  type NormalizedProduct,
} from "./sync-policy.ts";

async function hashContent(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractedItem(item: NormalizedProduct, contentHash: string): Record<string, unknown> {
  return {
    externalId: item.externalId,
    externalKey: item.externalKey,
    externalGroupId: item.externalGroupId || null,
    name: item.name,
    description: item.description,
    category: item.category,
    brand: item.brand,
    price: item.price,
    comparePrice: item.comparePrice,
    currency: item.currency,
    images: item.images,
    stock: item.stock,
    stockTracked: item.stockTracked,
    availability: item.availability,
    active: item.active,
    sku: item.sku,
    variants: item.variants,
    sizesAvailable: item.sizesAvailable,
    colors: item.colors,
    permalink: item.permalink || null,
    multiProduct: item.multiProduct === true,
    variantPricesDiffer: item.variantPricesDiffer === true,
    _contentHash: contentHash,
  };
}

function itemFromExtracted(extracted: any): NormalizedProduct {
  return {
    externalId: String(extracted.externalId || ""),
    externalKey: String(extracted.externalKey || ""),
    externalGroupId: extracted.externalGroupId || null,
    name: String(extracted.name || ""),
    description: String(extracted.description || ""),
    category: String(extracted.category || ""),
    brand: String(extracted.brand || ""),
    price: extracted.price == null ? null : Number(extracted.price),
    comparePrice: extracted.comparePrice == null ? null : Number(extracted.comparePrice),
    currency: extracted.currency ? String(extracted.currency).toUpperCase() : null,
    images: Array.isArray(extracted.images) ? extracted.images.filter((url: unknown) => typeof url === "string") : [],
    stock: Math.max(0, Math.floor(Number(extracted.stock) || 0)),
    stockTracked: extracted.stockTracked === true,
    availability: ["in_stock", "out_of_stock"].includes(extracted.availability) ? extracted.availability : "unknown",
    active: extracted.active !== false,
    sku: String(extracted.sku || ""),
    variants: Array.isArray(extracted.variants) ? extracted.variants : [],
    sizesAvailable: Array.isArray(extracted.sizesAvailable) ? extracted.sizesAvailable : [],
    colors: Array.isArray(extracted.colors) ? extracted.colors : [],
    permalink: extracted.permalink || null,
    multiProduct: extracted.multiProduct === true,
    variantPricesDiffer: extracted.variantPricesDiffer === true,
    raw: extracted.raw || {},
  };
}

function productPayload(item: NormalizedProduct): Record<string, unknown> {
  return {
    name: item.name.trim(),
    description: item.description || null,
    category: item.category || null,
    brand: item.brand || null,
    price: item.price,
    compare_price: item.comparePrice,
    currency: item.currency,
    images: item.images,
    stock: item.stockTracked ? item.stock : 0,
    stock_tracked: item.stockTracked,
    availability: item.availability,
    sku: item.sku || null,
    variants: item.variants,
    sizes_available: item.sizesAvailable,
    color: item.colors,
    active: item.active,
  };
}

function snapshotFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(SYNCED_FIELDS.map((field) => [field, payload[field] ?? null]));
}

async function importItem(
  admin: any,
  source: any,
  item: NormalizedProduct,
  contentHash: string,
): Promise<{ status: "added" | "updated" | "unchanged" | "conflict"; productId: string; conflicts?: string[] }> {
  const { data: existingLink } = await admin.from("product_source_links")
    .select("*").eq("store_id", source.store_id).eq("external_key", item.externalKey).maybeSingle();

  if (existingLink?.content_hash === contentHash) {
    await admin.from("product_source_links").update({
      last_seen_at: new Date().toISOString(), missing_sync_count: 0, last_error: null,
    }).eq("id", existingLink.id);
    return { status: "unchanged", productId: existingLink.product_id };
  }

  const payload = productPayload(item);
  if (!existingLink) {
    payload.images = (await rehostExternalImages(admin, source.store_id, item.images)).filter(Boolean);
    const { data: product, error } = await admin.from("products").insert({
      ...payload, store_id: source.store_id,
    }).select("id").single();
    if (error || !product) throw new Error(error?.message || "Could not create imported product");
    const { error: linkError } = await admin.from("product_source_links").upsert({
      store_id: source.store_id,
      source_id: source.id,
      product_id: product.id,
      external_id: item.externalId,
      external_key: item.externalKey,
      external_group_id: item.externalGroupId || null,
      source_snapshot: snapshotFromPayload(payload),
      content_hash: contentHash,
      last_seen_at: new Date().toISOString(),
      missing_sync_count: 0,
    }, { onConflict: "store_id,external_key" });
    if (linkError) throw new Error(linkError.message);
    return { status: "added", productId: product.id };
  }

  const { data: product } = await admin.from("products").select("*")
    .eq("id", existingLink.product_id).eq("store_id", source.store_id).maybeSingle();
  if (!product) throw new Error("The linked product no longer exists");
  const lastSnapshot = existingLink.source_snapshot || {};
  let conflicts = detectLocalConflicts(product, lastSnapshot)
    .filter((field) => !valuesEqual(product[field], payload[field]));

  if (!conflicts.includes("images")) {
    payload.images = (await rehostExternalImages(admin, source.store_id, item.images)).filter(Boolean);
  }
  const updates: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS) {
    if (!conflicts.includes(field) && !valuesEqual(product[field], payload[field])) updates[field] = payload[field];
  }
  if (Object.keys(updates).length) {
    const { error } = await admin.from("products").update(updates)
      .eq("id", product.id).eq("store_id", source.store_id);
    if (error) throw new Error(error.message);
  }

  conflicts = Array.from(new Set([...conflicts]));
  const { error: linkError } = await admin.from("product_source_links").update({
    source_id: source.id,
    external_id: item.externalId,
    external_group_id: item.externalGroupId || null,
    source_snapshot: snapshotFromPayload(payload),
    content_hash: contentHash,
    last_seen_at: new Date().toISOString(),
    missing_sync_count: 0,
    conflict_fields: conflicts,
    last_error: null,
  }).eq("id", existingLink.id);
  if (linkError) throw new Error(linkError.message);
  return {
    status: conflicts.length ? "conflict" : Object.keys(updates).length ? "updated" : "unchanged",
    productId: product.id,
    conflicts,
  };
}

async function markMissingProducts(admin: any, source: any, run: any): Promise<number> {
  const { data: links } = await admin.from("product_source_links").select("id, product_id, last_seen_at, missing_sync_count")
    .eq("source_id", source.id);
  let deactivated = 0;
  for (const link of links || []) {
    const seen = link.last_seen_at && new Date(link.last_seen_at).getTime() >= new Date(run.started_at).getTime();
    const missing = nextMissingCount(link.missing_sync_count || 0, seen);
    await admin.from("product_source_links").update({ missing_sync_count: missing }).eq("id", link.id);
    if (!seen && shouldDeactivateAfterMissing(missing)) {
      const { error } = await admin.from("products").update({ active: false }).eq("id", link.product_id).eq("store_id", source.store_id);
      if (!error) deactivated++;
    }
  }
  return deactivated;
}

export async function commitSyncRun(admin: any, runId: string): Promise<any> {
  const { data: run } = await admin.from("product_sync_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) throw new Error("Sync run not found");
  const { data: source } = await admin.from("meta_product_sources").select("*").eq("id", run.source_id).maybeSingle();
  if (!source) throw new Error("Import source not found");
  const { data: candidates } = await admin.from("product_import_candidates").select("*")
    .eq("run_id", run.id).in("status", run.checkpoint?.mode === "preview" ? ["preview"] : ["ready"]);
  const counts: any = {
    added: 0, updated: 0, unchanged: Number(run.counts?.unchanged || 0),
    review: 0, failed: 0, conflicts: 0, deactivated: 0,
  };

  for (const candidate of candidates || []) {
    const issues = productIssues(itemFromExtracted(candidate.extracted), run.checkpoint?.currency || "", source.source_type);
    if (issues.length) {
      await admin.from("product_import_candidates").update({ status: "pending", issues }).eq("id", candidate.id);
      counts.review++;
      continue;
    }
    try {
      const item = itemFromExtracted(candidate.extracted);
      const result = await importItem(admin, source, item, String(candidate.extracted?._contentHash || await hashContent(candidate.raw_payload)));
      counts[result.status === "conflict" ? "updated" : result.status]++;
      if (result.status === "conflict") counts.conflicts++;
      await admin.from("product_import_candidates").update({
        status: result.status === "conflict" ? "conflict" : "imported",
        product_id: result.productId,
        issues: result.conflicts?.map((field) => `local_conflict:${field}`) || [],
      }).eq("id", candidate.id);
    } catch (error) {
      counts.failed++;
      const message = error instanceof Error ? error.message : String(error);
      await admin.from("product_import_candidates").update({ status: "pending", issues: ["import_failed"], extracted: { ...candidate.extracted, import_error: message } }).eq("id", candidate.id);
    }
  }

  const { count: reviewCount } = await admin.from("product_import_candidates").select("id", { count: "exact", head: true })
    .eq("run_id", run.id).in("status", ["pending", "conflict"]);
  counts.review = reviewCount || 0;
  counts.deactivated = await markMissingProducts(admin, source, run);
  await admin.from("meta_product_sources").update({
    status: "active", last_synced_at: new Date().toISOString(), last_successful_sync_at: new Date().toISOString(), last_error: null,
  }).eq("id", source.id);
  await admin.from("product_sync_runs").update({
    status: "completed", counts, completed_at: new Date().toISOString(), checkpoint: { ...run.checkpoint, mode: "commit" },
  }).eq("id", run.id);
  return counts;
}

export async function runProductSync(admin: any, runId: string): Promise<void> {
  const { data: run } = await admin.from("product_sync_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) return;
  const { data: source } = await admin.from("meta_product_sources").select("*").eq("id", run.source_id).maybeSingle();
  if (!source) throw new Error("Import source not found");
  const { data: connection } = await admin.from("platform_connections").select("*").eq("id", source.connection_id).eq("store_id", source.store_id).maybeSingle();
  if (!connection) throw new Error("The connected account no longer exists");
  const { data: store } = await admin.from("stores").select("id, currency").eq("id", source.store_id).maybeSingle();
  const currency = String(store?.currency || run.checkpoint?.currency || "").toUpperCase();
  if (!currency) throw new Error("Confirm the store currency before importing");

  const preview = run.checkpoint?.mode === "preview";
  const { data: existingLinks } = await admin.from("product_source_links").select("id, external_key, content_hash").eq("source_id", source.id);
  const linkByKey = new Map((existingLinks || []).map((link: any) => [link.external_key, link]));
  const { data: oldCandidates } = await admin.from("product_import_candidates").select("id, external_key, status, extracted").eq("source_id", source.id);
  const candidateByKey = new Map((oldCandidates || []).map((candidate: any) => [candidate.external_key, candidate]));
  let unchanged = 0;

  let items: NormalizedProduct[];
  if (source.source_type === "shop") {
    items = groupCatalogItems(await fetchCatalogProducts(source.external_id, connection), source.external_id);
  } else {
    const posts = await fetchPublishedPosts(connection);
    const toExtract: any[] = [];
    for (const post of posts) {
      const base = emptyPostProduct(post, connection);
      const hash = await hashContent(post);
      const link = linkByKey.get(base.externalKey);
      const candidate = candidateByKey.get(base.externalKey);
      if (!preview && link?.content_hash === hash) {
        await admin.from("product_source_links").update({ last_seen_at: new Date().toISOString(), missing_sync_count: 0 }).eq("id", link.id);
        unchanged++;
        continue;
      }
      if (candidate?.extracted?._contentHash === hash && ["dismissed", "pending"].includes(candidate.status)) {
        if (candidate.status === "pending") await admin.from("product_import_candidates").update({ run_id: run.id }).eq("id", candidate.id);
        else unchanged++;
        continue;
      }
      toExtract.push(post);
    }
    items = await extractProductPosts(toExtract, connection);
  }

  for (const item of items) {
    const contentHash = await hashContent(item.raw);
    const link = linkByKey.get(item.externalKey);
    if (!preview && link?.content_hash === contentHash) {
      await admin.from("product_source_links").update({ last_seen_at: new Date().toISOString(), missing_sync_count: 0 }).eq("id", link.id);
      unchanged++;
      continue;
    }
    const oldCandidate = candidateByKey.get(item.externalKey);
    if (oldCandidate?.status === "dismissed" && oldCandidate.extracted?._contentHash === contentHash) {
      unchanged++;
      continue;
    }
    const issues = productIssues(item, currency, source.source_type);
    if ((item.raw as any)?.extraction_failed) issues.push("extraction_failed");
    const status = preview ? "preview" : issues.length ? "pending" : "ready";
    const { error } = await admin.from("product_import_candidates").upsert({
      store_id: source.store_id,
      source_id: source.id,
      run_id: run.id,
      product_id: link?.id ? (await admin.from("product_source_links").select("product_id").eq("id", link.id).maybeSingle()).data?.product_id || null : null,
      external_id: item.externalId,
      external_key: item.externalKey,
      raw_payload: item.raw as any,
      extracted: extractedItem(item, contentHash),
      issues,
      status,
      permalink: item.permalink || null,
      photos: item.images,
    }, { onConflict: "store_id,external_key" });
    if (error) throw new Error(error.message);
  }

  if (preview) {
    const { data: previewRows } = await admin.from("product_import_candidates").select("status, issues, extracted").eq("run_id", run.id);
    const counts = {
      added: 0, updated: 0, unchanged, failed: 0,
      review: (previewRows || []).filter((row: any) => row.issues?.length).length,
      ready: (previewRows || []).filter((row: any) => !row.issues?.length).length,
      total: (previewRows || []).length,
    };
    await admin.from("product_sync_runs").update({ status: "completed", counts, completed_at: new Date().toISOString() }).eq("id", run.id);
    return;
  }

  await admin.from("product_sync_runs").update({ counts: { unchanged } }).eq("id", run.id);
  await commitSyncRun(admin, run.id);
}

export async function approveImportCandidate(admin: any, candidateId: string, edits: any): Promise<any> {
  const { data: candidate } = await admin.from("product_import_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (!candidate) throw new Error("Review item not found");
  const { data: source } = await admin.from("meta_product_sources").select("*").eq("id", candidate.source_id).maybeSingle();
  const { data: store } = await admin.from("stores").select("currency").eq("id", candidate.store_id).maybeSingle();
  const extracted = {
    ...candidate.extracted,
    ...edits,
    externalId: candidate.external_id,
    externalKey: candidate.external_key,
    active: true,
    multiProduct: false,
    variantPricesDiffer: false,
  };
  const item = itemFromExtracted(extracted);
  const issues = productIssues(item, String(store?.currency || ""), source.source_type);
  if (issues.length) throw new Error(`Cannot approve: ${issues.join(", ")}`);
  const contentHash = String(extracted._contentHash || await hashContent(candidate.raw_payload));
  const result = await importItem(admin, source, item, contentHash);
  await admin.from("product_import_candidates").update({
    extracted,
    issues: result.conflicts?.map((field: string) => `local_conflict:${field}`) || [],
    status: result.status === "conflict" ? "conflict" : "imported",
    product_id: result.productId,
  }).eq("id", candidate.id);
  return result;
}
