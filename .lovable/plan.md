

## Easier Product Adding — Plan

Revamp the Products page so creating a product takes seconds, not minutes. Replace the cramped single modal with a 3-step wizard, add AI photo autofill, multi-image drag & drop, smart category selection, duplicate, and CSV bulk import/export.

### 1. Step-by-step Wizard (replaces current modal)

Full-screen overlay with progress bar and 3 steps:

```text
[ 1. Photos ] ── [ 2. Basics ] ── [ 3. Details ]
```

- **Step 1 — Photos**: Large drop zone. Drag & drop multiple images at once, paste from clipboard, or browse. Thumbnails are reorderable (drag handle); first image = cover (badge "Cover"). Remove on hover. After first image uploads, an **"✨ Autofill with AI"** button appears.
- **Step 2 — Basics**: Name*, Price*, Compare price, Stock*, SKU. Big inputs, mobile-friendly. "Next" disabled until name + price filled.
- **Step 3 — Details**: Description (textarea), Category (combobox — see below), Active toggle. "Save" or "Save & add another".

Edit mode opens directly to a tabbed view of the same 3 sections (no forced stepping).

### 2. AI Autofill from Photo

Button on Step 1 once an image is uploaded. Calls a new edge function `ai-product-autofill` which sends the image to `google/gemini-2.5-flash` (vision) and returns JSON: `{ name, description, category, suggested_price }`. Fields auto-populate in steps 2 & 3 with a small "AI suggested — edit anytime" hint. User can re-run or dismiss.

### 3. Smart Category Selector

Combobox (shadcn `Command` + `Popover`):
- Lists existing categories from current products
- Type to filter
- "+ Create new category: …" appears at bottom when typed value doesn't match
- Replaces today's free-text input — keeps catalog clean while still allowing new categories

### 4. Multi-image Drag & Drop + Reorder

- Drop zone accepts multiple files (parallel uploads with progress)
- Reorder via `@dnd-kit/sortable` (already a small dep to add)
- First image marked as cover automatically; user can drag any image to position 1

### 5. Quick Actions on Product Cards/Rows

- **Duplicate** button (copy icon) on each product — clones with " (Copy)" suffix, opens wizard pre-filled at Step 2
- Hover actions on grid cards: Edit · Duplicate · Delete

### 6. CSV Bulk Import / Export

New "Import / Export" dropdown next to "Add product":
- **Download template** (CSV with headers: name, description, category, price, compare_price, stock, sku, active, image_url)
- **Import CSV** — parses with PapaParse, shows preview table with row-level validation (errors highlighted), then "Import N products" button creates all in a batch
- **Export CSV** — downloads current filtered catalog

### Technical Details

**New/modified files**
- `src/pages/ProductsPage.tsx` — wire up wizard, dropdown menu, duplicate, drag handlers
- `src/components/products/ProductWizard.tsx` — new 3-step component (uses shadcn `Dialog`, `Progress`, `Tabs` for edit mode)
- `src/components/products/ImageDropzone.tsx` — multi-upload + dnd-kit sortable grid
- `src/components/products/CategoryCombobox.tsx` — shadcn Command-based selector
- `src/components/products/CsvImportDialog.tsx` — preview + validation table
- `src/lib/csv.ts` — parse/serialize helpers (PapaParse)
- `supabase/functions/ai-product-autofill/index.ts` — Gemini vision call, returns structured JSON; uses `LOVABLE_API_KEY`; `verify_jwt = true`; deployed automatically
- `src/hooks/useSupabaseData.ts` — add `useBulkCreateProducts` mutation

**Deps to add**: `@dnd-kit/core`, `@dnd-kit/sortable`, `papaparse`, `@types/papaparse`

**No DB schema changes** — existing `products` table covers everything. CSV image_url column is optional (URL pasted directly into `images[]`); uploaded files still go through the existing `store-assets` bucket via `useFileUpload`.

**RTL**: All new components use Tailwind logical properties (`ms-`, `me-`, `start`, `end`) per project i18n constraint.

### Out of Scope (can add later)
- Variants editor (sizes/colors) — current schema has `variants jsonb` but no UI; flagged for a follow-up
- Importing products from a connected Facebook/Instagram page
- AI bulk-rewrite of existing descriptions

