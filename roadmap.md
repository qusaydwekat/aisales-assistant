# Website experience refresh

# Confirmed order registration

- [ ] Fix tool-round exhaustion after customer approval, test search-to-order and failed-action recovery, and deploy the reply worker.

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

- [x] Include Facebook post access in page connection and simplify review with selection, inline prices, and selected-product import; deployed redirect verified, 22 tests passed, sample selection checked on desktop/mobile.

- [x] Add and verify separate Facebook post-import authorization now that the administrator enabled pages_read_engagement; signed-in button and deployed redirect verified, 20 focused tests passed.

- [x] Remove app-rejected import scopes from channel login, deploy, and verify the generated OAuth redirect; 17 focused tests passed.

- [x] Approve the import and automatic-sync plan.
- [x] Build complete Shop catalog and product-post imports without duplicates or guessed facts.
- [x] Add review, safe automatic updates, Arabic/English controls, permission pauses, and six-hour reconciliation.
- [ ] Verify a live selected-product import when review candidates are available (current account has none); existing Facebook connections need one reconnect to grant post access, and Shop imports still await catalog permission support and any required App Review.
