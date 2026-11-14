# Import products from Facebook and Instagram

## What you will get

A new **Import from Meta** option on the Products page will support both sources you selected:

- **Facebook/Instagram Shop:** import the complete product catalog, including variations, photos, descriptions, prices and availability supplied by Meta.
- **Facebook posts and Instagram media:** scan the connected account's own published content, identify likely product posts and turn them into products or review items.
- **Automatic sync:** keep source-linked products current while protecting local edits and never silently deleting products.

The complete flow will work in English and Arabic, on desktop and mobile.

## 1. Connect and choose a source

- Extend the existing Meta connection permission request to cover product catalogs, Facebook Page posts and Instagram professional-account media.
- Keep existing messaging connections working; ask for one reconnect only to grant the additional access.
- In the import window, let the store owner choose a connected account, then choose **Shop** or **Posts**.
- Discover the Shops/catalogs available to that account and show clear guidance when none exists or access is missing.
- Confirm the store currency before the first import. Preserve Meta's currency and hold mismatches for review rather than converting or guessing prices.

Meta permission note: the current messaging permissions alone cannot read Shops or posts. Meta may require App Review before these permissions work for every store owner; Development Mode remains limited to eligible app testers and their assets.

## 2. Shop import

- Read every catalog page with cursor pagination, not just the first screen of products.
- Map supplied names, descriptions, brand/category, regular and sale prices, photos, product links, availability and variations.
- Group variation items by Meta's product-group identifier instead of creating accidental duplicates.
- Re-host accessible photos in the store's existing asset storage so they remain available to the catalog and AI.
- Show a preview with product counts, new/already-imported status, skipped items and exact reasons.
- Import only complete, valid items; incomplete items go to **Needs review**.

## 3. Post and photo import

- Scan all published Facebook Page posts and Instagram professional-account media, including carousel photos where available.
- Use inexpensive classification to separate likely product posts from announcements and unrelated content; use structured AI extraction only for likely products.
- Extract only facts explicitly supported by the caption or image: title, description, price, currency, options and photos.
- Treat each source post/media ID as a stable identity to prevent duplicates on repeated scans.
- Put unclear, multi-product or incomplete posts into **Needs review**, showing the original post/photo and the missing fields.
- Require an explicit price and selling availability before a post-derived product can become active. AI will never invent a price, quantity, variation or product name.
- After the initial scan, process only new or changed posts unless the owner requests a full rescan.

## 4. Review and product controls

- Add a review list for incomplete Shop items and product-post candidates, with edit/approve/dismiss actions.
- Show each product's source, linked account, last sync time and sync problem where relevant.
- Add **Sync now**, automatic-sync enable/disable, and a run summary showing added, updated, unchanged, review and failed counts.
- Keep the existing manual product wizard and CSV import unchanged apart from shared source/availability fields.

## 5. Automatic sync without damaging local work

- Use Meta change notifications where available to queue a targeted refresh; Catalog is a supported webhook topic in Meta's webhook reference [3](https://developers.facebook.com/docs/graph-api/webhooks/reference/).
- Run one consolidated reconciliation every six hours for enabled sources: four checks per day at most, covering missed notifications and changed posts. This can add a small recurring Cloud cost even when nothing changed.
- Retry temporary Meta failures with backoff and isolate each store/source so one failure cannot block others.
- Compare the current product with the last imported snapshot. Update fields still managed by the source; if the owner edited a field locally, preserve it and surface a conflict for review.
- If an item disappears from a source, mark it inactive only after two successful full reconciliations confirm its absence. Never hard-delete a product that may have orders.
- Pause only the affected source and show a reconnect/action message when permissions or tokens fail.

## 6. Stock and sales safeguards

- Store exact quantity only when Meta supplies one.
- Distinguish **quantity tracked** from **availability only**. A Shop item explicitly marked in stock can remain sellable without pretending to know its quantity.
- Post-derived products with unknown availability remain inactive until reviewed.
- Update storefront, product views, order stock reduction and AI stock tools to respect this distinction, so unknown quantity is not treated as either zero stock or unlimited stock.
- Existing manually managed products retain their current stock behavior.

## Technical design

- Add store-scoped records for source links, import candidates and sync runs, with stable external IDs, last-imported snapshots, content hashes and conflict state. Apply owner/admin access rules and required grants.
- Add additive product/store fields for source availability, quantity-tracking mode and confirmed currency.
- Add a dedicated `meta-product-sync` backend function, split into catalog reading, post reading, extraction, mapping and sync-engine modules. Validate the signed-in user, store ownership and subscription on every app-initiated action.
- Extend Meta OAuth scopes and webhook routing without exposing page/user tokens to the browser.
- Process large imports in bounded background batches with pagination checkpoints, idempotent upserts and retryable errors.
- Reuse the existing asset-import behavior through a shared server helper; do not call one function's private files from another.
- Keep customer wording with the main sales agent; any post classification assistance remains internal and falls back safely when unavailable.

## Verification

- Add focused tests for pagination, variant grouping, currency mismatch, duplicate prevention, local-edit conflicts, two-pass removal, unknown stock and English/Arabic post extraction.
- Test retry/failure behavior and confirm one store cannot read or modify another store's imports.
- Exercise Products-page import, review, manual sync and automatic-sync settings on desktop/mobile in both languages.
- Run an end-to-end import against an eligible connected test Shop/Page after reconnecting permissions; if the available Meta account lacks a Shop or the new permissions, report that specific live-check limitation rather than claiming a live import succeeded.
