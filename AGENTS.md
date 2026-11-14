# Architecture rules

- Customer reply workers own a typing session from burst collection through final outbound delivery, with serialized refreshes and finally-based cleanup, so slow AI/tool calls cannot leave a gap or leak timers.- Automated Meta sends go through `_shared/meta-messaging.ts` so out-of-24h messages carry a message tag; Meta blocks untagged ones.
- The customer agent retries a failed AI round once on a model from the other provider family (circuit breaker), so one upstream outage cannot stall replies.
- Customer-agent tool rounds reserve capacity for catalog refinement and order execution; switch to text-only after a successful order action, but keep tools available after failures so confirmed purchases are not stranded.
- platform-webhook stores each verified Meta payload in a durable queue, acks 200 at once, and processes in the background with backoff retries (no polling cron), so Meta never times out and failed payloads aren't lost.
- platform-webhook is split into modules by concern (shared, meta-client, ai-agent, ai-tools, order-manager, burst-collector, conversation-intel, queue, jev-decisions, jev-policy); add new code to the matching module, not index.ts. Jev supplies typed intent and cancellation evidence while the main agent owns customer wording, with existing behavior as the fallback when Jev is unavailable.

- Shared navigation items power desktop navigation, mobile menus, and page search; keep their destinations synchronized in one module to prevent inaccessible pages.
- Inbox order badges derive from the latest store-scoped, conversation-linked order independently of chat lifecycle, so confirmation cannot leave a stale pending label.
- Website-wide visual refinements live in semantic global tokens and shared controls; preserve page workflows and use MotionConfig to honor reduced-motion preferences.
- The public homepage lives at `/` independently of the protected workspace, and its workspace section derives destinations from shared navigation items so advertised sections stay synchronized.
- Homepage account actions derive from the existing auth context and language context; keep workspace links behind existing route gates without duplicating access logic.
- Public homepage and legal pages share PublicSiteHeader and PublicSiteFooter; legal documents use LegalPageLayout to keep branding, account actions, and bilingual navigation consistent without changing policy content.
- Shared BrandLogo renders the approved logo asset and typeset name across public, auth and workspace layouts; derive the favicon from the same asset for consistent identity.
- meta-product-sync owns Meta Shop/post imports, source links, field-level conflict handling and scheduled reconciliation; platform-webhook only forwards verified change events so product writes stay store-scoped and idempotent.
- Meta OAuth requests enabled Facebook post-read access during Page connection; platform-specific messaging and unapproved Shop permissions stay unchanged so users approve supported access in one flow.
- Meta review selection enables inline prices only for selected candidates and submits them through the existing approval validation, so bulk review cannot bypass factual availability checks.
- Post imports persist a bounded recent-post window in source settings and each run checkpoint; stop pagination at that count and never reconcile missing products from partial post windows, so older products remain safe.
- meta-store-info reads owner-scoped connected profiles with page-specific tokens and rehosts branding; its editable preview applies selected factual fields to the unsaved store form, never overwriting absent fields or saving automatically.
- Voice attachments use voice-policy and voice-transcription modules: message-scoped leased jobs transcribe complete audio before burst intent/order handling, with continuous typing, owner-visible errors and a persisted platform pause for terminal gateway access/credit failures; replies remain text.
