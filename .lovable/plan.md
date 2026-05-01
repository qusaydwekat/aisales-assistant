# Human-Grade AI Sales Agent — Implementation Plan

## What already exists (no rework needed)

The webhook (`platform-webhook`) already handles a huge portion of the spec and we will not rewrite it:
- Burst collection with rolling window, typing indicator, chunked replies
- Persona name + tone + language detection (AR/EN/mixed)
- Channel detection (Messenger / Instagram / WhatsApp), ad referral parsing, reply-to context, post→product linking
- Vision attribute extraction + image embeddings + cosine similarity matching
- Tools: `search_products`, `create_order`, `update_order`, `cancel_order`, `add_order_note`, `check_order_status`, `send_product_images`, `list_categories`
- Cancellation pre-processing, duplicate-order guard, out-of-hours flow, abuse/escalation detection, quality score, handoff summary, working-hours, store context refresh per turn

The plan focuses **only on what's missing** from the spec.

## Gaps to close

### 1. Promotions & discount codes (new feature)
New table `promotions` (store_id, code, label, type [percent|fixed|free_shipping], value, min_order, starts_at, ends_at, active, max_uses, uses, applies_to [all|category|product_ids]). RLS by store ownership.

- Inject active promotions into the AI system prompt on every turn (read inside `getCachedStore` extension).
- New AI tool `apply_discount_code(order_id, code)` — validates code, recomputes total, persists `discount_code` + `discount_amount` on the order.
- New tool `get_active_promotions()` — returns promotions the AI can mention naturally.
- Admin UI: new **Promotions** tab in Store Settings — CRUD with code, value, window, conditions.

### 2. Knowledge-gap capture (new feature)
New table `knowledge_gaps` (store_id, conversation_id, customer_question, detected_at, status [open|answered|dismissed], answer).

- New AI tool `flag_knowledge_gap(question)` — called when AI says "let me confirm that for you".
- Admin UI: a **Knowledge Gaps** card on Dashboard showing open questions; clicking one opens a textarea to write the answer; saved answers append to a new `stores.custom_ai_instructions` block fed into the system prompt.

### 3. Restock notifications (new feature)
New table `restock_signups` (store_id, conversation_id, customer_name, contact, product_id, variant, status [pending|notified], created_at, notified_at).

- New AI tool `register_restock_interest(product_id, variant, contact)`.
- New scheduled edge function `restock-notifier` (cron every 15 min) — for each pending signup whose product is now in stock, send proactive WhatsApp/IG/FB message via existing `sendMetaReply*` helpers and mark notified.
- Admin UI: a **Waitlists** page listing pending signups per product.

### 4. Post-delivery follow-up + satisfaction (new feature)
New scheduled edge function `delivery-followup` (cron hourly):
- 24h after `orders.status = 'delivered'`, send "did everything arrive okay?" via the original conversation channel; mark `orders.followup_sent_at`.
- 30 min after the last message of a resolved (closed/no-activity) conversation, send a one-question 👍/👎 satisfaction prompt; store result in new `conversations.satisfaction` column (`good|bad|null`).
- Reactions/text replies (👍 / "yes" / "good") are detected by webhook and routed to update `satisfaction`.

### 5. Returning-customer memory (enhancement to webhook)
On conversation start, look up previous orders for the same `customer_phone` (across conversations of the same store). Inject into the system prompt:
- "Returning customer — last delivery address: …, last phone: …, last 3 items: …"
- Add explicit instruction: "If they want to order again, ask 'Same address as last time?' instead of re-collecting."

No schema change — uses existing `orders` table.

### 6. First-time customer orientation (prompt-only enhancement)
If the conversation has zero prior messages **and** no prior orders for the customer's contact, inject a one-time RUNTIME hint:
"This is a first-time customer — be slightly warmer, briefly mention delivery zone/time and payment options once after your first answer."

### 7. Gift mode (prompt-only enhancement)
Detect the words gift/هدية/كادو in the burst → set a per-turn flag `gift_mode=true` and inject hint:
"Customer mentioned this is a gift. Ask once about the recipient and offer a gift note. When creating the order, append a note `GIFT: <details>` via `add_order_note`."

### 8. `send_product_card` structured tool (replaces ad-hoc product mentions)
New tool that emits a single rich card per product (image + auto_description + price + variants) using existing Meta `attachment` payload sender. The AI calls this instead of pasting price/description in plain text when presenting a matched product. Falls back to text on WhatsApp where rich cards aren't available.

### 9. `get_store_context` explicit tool
Lightweight tool exposing working hours, delivery zones, payment methods, return policy, active promotions. Currently this is only injected into the system prompt — adding the tool lets the AI re-fetch fresh data mid-conversation (e.g. when a customer asks at minute 30 about closing time).

### 10. Story / template context resolution (small webhook fixes)
- Instagram story replies: when `messaging.message.reply_to.story.id` is present, look up `post_product_links` by `story_id` (add `story_id` text column or reuse `post_id`). Already partially handled — finalize the lookup path.
- WhatsApp template context: when `messages[].context.id` matches a previous outbound template, attach the template name to the burst context so the AI doesn't ask "what are you replying to?".

### 11. Competitor & negotiation guardrails (prompt-only)
Add explicit rules to the system prompt:
- "Never name a competitor. If a customer mentions one, respond: 'I can't speak to other stores, but here's what we have that's similar.'"
- "Never invent or promise discounts. Only mention codes from `get_active_promotions`. If asked for a discount and none are active: 'I'm working with fixed prices but I'll let you know the moment we have a sale.'"

### 12. Universal product attributes (schema additions)
Add nullable columns to `products` so non-clothing categories work cleanly (clothing columns already exist):
- `brand text`, `model text`, `weight text`, `dimensions text`, `warranty text`, `ingredients text`, `allergens text[]`, `volume text`, `compatibility text`, `custom_attributes jsonb default '{}'`

Update `ai-product-autofill` to detect category first, then extract the right attribute set. Update Products UI so the attribute editor shows the right fields based on category.

## File-level changes

```text
supabase/migrations/<new>.sql
  - promotions, knowledge_gaps, restock_signups tables (+ RLS)
  - conversations.satisfaction, orders.followup_sent_at, orders.discount_code, orders.discount_amount
  - products: brand, model, weight, dimensions, warranty, ingredients, allergens, volume, compatibility, custom_attributes
  - stores.custom_ai_instructions text
  - post_product_links: add story_id text (nullable)

supabase/functions/platform-webhook/index.ts
  - new tools: apply_discount_code, get_active_promotions, get_store_context,
    flag_knowledge_gap, register_restock_interest, send_product_card
  - inject promotions, returning-customer summary, first-time hint, gift hint into prompt
  - competitor + negotiation rules in prompt
  - story_id + WhatsApp template context lookup
  - reaction handler for satisfaction (👍/👎)

supabase/functions/restock-notifier/index.ts          (new, cron)
supabase/functions/delivery-followup/index.ts         (new, cron)
supabase/functions/ai-product-autofill/index.ts       (category-aware extraction)

src/pages/StoreSettingsPage.tsx                        (Promotions tab)
src/pages/DashboardPage.tsx                            (Knowledge Gaps card)
src/pages/ProductsPage.tsx + ProductWizard.tsx        (category-aware attribute editor)
src/pages/AdminPage.tsx or new src/pages/WaitlistsPage.tsx (restock signups)
src/hooks/useSupabaseData.ts                          (hooks for the new tables)
```

## Out of scope (call out for the user)
- Live carrier tracking integration (would require a 3PL connector — flag as follow-up).
- Bulk catalog import from Facebook/Instagram pages.
- Custom domain verified email for the satisfaction/follow-up notifications (already a known pending item per project memory).

Approve and I'll implement in this order: (1) DB migration, (2) webhook tool additions + prompt rules, (3) promotions UI, (4) knowledge gaps UI, (5) restock + delivery-followup cron functions, (6) category-aware attributes.
