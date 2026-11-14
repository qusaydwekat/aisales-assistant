# Website experience refresh

# Customer voice messages

- [x] Transcribe Facebook, Instagram and WhatsApp voice messages into the existing customer reply flow, preserving typing and burst grouping.
- [x] Test audio parsing and transcription failures (14 focused regressions passed), verify live WAV/OGG speech transcription and authenticated inbox, and deploy.
- [ ] Verify an actual customer voice message and delivered reply on Meta; requires a new voice message from a connected customer account.

# Connected-page store information

- [x] Add secure Facebook/Instagram profile import and editable preview without saving automatically.
- [x] Test field mapping and tenant isolation (4 tests); verify live signed-in Facebook import, edited preview, no automatic save, and mobile layout. Live Instagram verification awaits a connected Instagram account.

# Confirmed order registration

- [x] Fix tool-round exhaustion after customer approval; search-to-order and failed-action recovery regressions passed and reply worker deployed. Live Messenger order confirmation still needs a new customer message; the previous unsaved order was not recreated automatically.

- [x] Refine the supplied logo to match the platform and apply shared branding and favicon; check public, auth and workspace views.

- [x] Match legal pages to the homepage with shared navigation and footer; verify English/Arabic and signed-in links.

- [x] Localize homepage controls and adapt its welcome and actions to the signed-in account; verify both languages and account navigation.

- [x] Replace the dark theme with a light AI-inspired palette.
- [x] Create a public homepage covering existing sections with AI automation imagery.
- [x] Verify homepage navigation, Arabic, and desktop/mobile layouts; check the signed-in dashboard, products, orders, inbox, and AI settings.

- [x] Refresh shared styling, controls, and accessible motion.
- [x] Improve desktop and mobile navigation, including Arabic layouts.
- [x] Refine dashboard, sign-in, and page-wide presentation without changing workflows.
- [x] Check authenticated store-owner pages, navigation, product forms, and storefront cart at desktop and mobile sizes; Arabic layouts verified. Admin-only interaction checks were not available in the requesting account.

# Jev customer-message decisions

- [x] Add Jev message-intent sorting and explicit cancellation detection to the customer reply worker, with safe fallback to the existing agent.
- [x] Test representative English and Arabic messages, gateway failure handling, and the deployed reply flow.

# Meta product importing

- [x] Add a configurable recent-post count (default 20, range 1–100), persist it for later syncs, deploy bounded fetching, and protect older products; 17 tests passed and authenticated count submission verified.
- [ ] Verify completion of a bounded live Facebook preview after the existing running import finishes; the three-post test was blocked by the source's in-progress run (409).

- [x] Include Facebook post access in page connection and simplify review with selection, inline prices, and selected-product import; deployed redirect verified, 22 tests passed, sample selection checked on desktop/mobile.

- [x] Add and verify separate Facebook post-import authorization now that the administrator enabled pages_read_engagement; signed-in button and deployed redirect verified, 20 focused tests passed.

- [x] Remove app-rejected import scopes from channel login, deploy, and verify the generated OAuth redirect; 17 focused tests passed.

- [x] Approve the import and automatic-sync plan.
- [x] Build complete Shop catalog and product-post imports without duplicates or guessed facts.
- [x] Add review, safe automatic updates, Arabic/English controls, permission pauses, and six-hour reconciliation.
- [ ] Verify a live selected-product import when review candidates are available (current account has none); existing Facebook connections need one reconnect to grant post access, and Shop imports still await catalog permission support and any required App Review.
