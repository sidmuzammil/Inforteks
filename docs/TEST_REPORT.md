# Verification report

## Merchant editors — 3 October 2026

- 63 tests passed across 14 unit/integration files in `inforteks_test`. Coverage adds first-category creation, complete sale-product metadata, independent featured/offer selections, exact decimal-to-fils conversion, invalid discounts, sanitized HTML, preview without persistence, stale-edit rejection, customer denial and publication-aware HTML image access. All 69 documented staff API operations deny anonymous and customer access.
- All 19 browser journeys passed across the regression run and the corrected two-SKU test rerun. New journeys create a brand/category inside the product form, attach an image before saving the draft, publish a featured discounted product, verify the crossed-out price, approve an AED price change, preview custom HTML on desktop/mobile without publishing, check hidden/public image access, and preview a complete hero with edited side-banner text.
- Existing customer checkout, stock approval, comparison, location, keyboard/hover navigation, recovery, wishlist and representative accessibility checks passed. Google consent handoff uses local test-only configuration; this does not establish live provider availability.
- The production build passed with deliberately unreachable database URLs and no Google credentials. OpenAPI validates 98 operations. Six migrations apply to the isolated database; migration six adds section settings/version/media relations and editable homepage templates without inserting products or customer records.
- An old test initially matched both the current and previous price inputs (and both variant buttons); it now uses exact accessible names. An immediate retry hit the real login rate limit, and a simultaneous Prisma generation briefly invalidated test imports. Checks were rerun without disabling security controls or generation races.
- Fresh CI exposed a PostgreSQL initialization race: `pg_isready` accepted the temporary init socket before the application database existed. Setup now waits for a successful TCP query to the actual database; a fresh network-isolated disposable PostgreSQL container and the existing development database both passed.
- Testing is scoped to implemented workflows; live payments, Google consent, email delivery, custom-domain DNS and recovery drills remain separately unverified where provider setup is incomplete.

Verified in the development cloud environment on **2 October 2026**. This records completed checks, not a production certification.

| Check                     | Result                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repeated setup            | Passed; pinned install, verified engine, migrations and seed are repeatable                                                                      |
| TypeScript                | Passed with `tsc --noEmit`                                                                                                                       |
| ESLint                    | Passed with no source errors or warnings                                                                                                         |
| Formatting                | Passed with Prettier                                                                                                                             |
| Unit/integration tests    | 57 passed across twelve files; database tests use isolated `inforteks_test`                                                                      |
| Chromium browser journeys | All 16 passed across the full suite and the corrected account follow-up run                                                                      |
| OpenAPI generation        | 97 operations generated and validated as OpenAPI 3.1                                                                                             |
| Next production build     | Passed with an intentionally unreachable database URL                                                                                            |
| Docker production build   | Passed from the supplied Dockerfile without runtime secrets/database access                                                                      |
| Container runtime         | Updated Railway image: homepage/web readiness/worker health returned 200 against the isolated test database; anonymous admin redirected to login |
| Container isolation       | Non-root user; no `.env` or temporary build CA in the runtime image                                                                              |
| First-Owner bootstrap     | Passed on a fresh isolated database; a second bootstrap was rejected                                                                             |
| Database snapshot restore | Passed into an isolated database; all 50 demo products restored                                                                                  |
| Web/worker startup        | Web readiness passed; separate worker started and durable import execution tested                                                                |

## Store workflow and Google release — 2 October 2026 UTC

GitHub Actions [Application checks](https://github.com/sidmuzammil/Inforteks/actions/runs/37062842834) also passed on a fresh hosted runner, including setup, static/database checks, browser journeys and the production build. The workflow now starts and health-checks the email worker for browser recovery tests, shuts it down afterward, and uses local-only Google fixture credentials. Earlier runs failed during setup; their downloadable logs were blocked by cloud egress. A diagnostic annotation was added, and setup passed on the new run without a setup-script change; the earlier cause remains unknown.

- **57 unit/integration tests passed across 12 files**, using isolated local PostgreSQL. The API permission matrix denied all **68 documented staff operations** to anonymous visitors (401) and customer sessions (403). This proves those access boundaries; it is not complete semantic/response-schema coverage of every endpoint.
- The new HTTP lifecycle creates a dummy draft, uploads/re-encodes a PNG, checks private media, approves stock/publication, restores a signed-in cart without a cart cookie, quotes totals, rejects Qatar delivery, places/replays one simulator order, denies another customer access, fulfils once, processes/restocks a customer return, archives the product and removes the unavailable item. Fixtures and temporary media are removed from the isolated test database/storage.
- Comparison tests verify current prices, shared/SKU spec precedence, actual variant differences, deduplication, the four-item/same-department limit, unpublished/inactive exclusion, and customer-cart isolation. The optional AI adapter is tested with a mocked provider for public-only inputs, output limits, malformed/provider-error fallback and the daily user limit. No paid AI response has been verified.
- Google tests exercise the real authorization/callback/database/session handlers with only Google's TLS token exchange mocked. They cover state-cookie enforcement, replay, PKCE, verified email, customer-only creation, explicit same-email linking, staff denial, recent-session checks and rejection of forged client tokens, extra scopes and foreign origins. The fifth migration prevents duplicate provider/account identities. Live Google/Firebase authorization remains unavailable.
- All 16 Chromium journeys passed: five store, five account/staff, two Google and four location/navigation/comparison journeys. Browser verification exposed and fixed repeated product-detail additions resetting quantity; assertions for an overlay and a native label were corrected, then all five account journeys passed in the follow-up run. Signed-in country detection, non-UAE checkout blocking, manual emirate selection, cart restoration in a new browser and sign-out isolation were verified.
- Country tests use actual local boundary data and cover UAE, Saudi Arabia, Qatar and Oman, invalid coordinates and cookie validation. Coordinates never reach the application server. Browser tests verify permission-granted detection, manual override, coming-soon copy, mobile comparison, current configurations, and hover/keyboard/outside-click navigation.
- Test fixtures stay off production. Password recovery uses the private development mailbox and order payments use the development simulator; these do not establish real email delivery or payment processing.

## Account and staff release — 2 October 2026

- 43 tests passed across eight unit/integration files in the isolated `inforteks_test` database. Coverage includes customer-only registration, strict request origins, role assignment/revocation, hashed single-use reset tokens, session invalidation, profile validation and scheduled banner visibility.
- All nine Chromium journeys passed: the five existing store journeys and four new account/staff journeys. The latter include responsive staff login without registration, customer profile persistence and admin denial, content-role isolation, a real banner upload/private read/publication, password recovery through the private development mailbox, and authenticated password change.
- Staff login was visually inspected at desktop width and checked for horizontal overflow at 1440, 390 and 320 pixels. The mobile accessibility check found no serious or critical Axe violations. This is representative coverage, not an independent accessibility audit.
- Production build, type checking and lint passed. Generated OpenAPI validates 95 documented operations. The fourth migration adds nullable banner-media references and a default button label without removing existing data.
- Live email delivery remains unverified because no authorized sender/key is connected. Development mailbox checks do not prove Microsoft 365 or Resend delivery. No browser suite, demo seed or bootstrap verification suite was pointed at production.
- The final staging and production web/worker deployments passed Railway health checks. Production web applied all four migrations and served the homepage, readiness, customer authentication pages, cart, categories, offers and new arrivals successfully. Anonymous admin requests redirected to the dedicated staff login. The real authorized Owner signed in successfully and opened the workspace, staff, products and homepage-section pages, then signed out.
- Temporary object upload, authenticated read and deletion passed against both actual Railway media buckets. This verifies storage credentials and connectivity, not a full remote browser upload workflow or anonymous bucket access. Test objects were removed.

## Railway preparation checks

The updated suite passed **33 tests**: the original 26 pricing/domain tests, two production-storage checks, three worker lifecycle checks and two database-limit checks. Worker tests cover health before database readiness, cancellation of idle sleep, draining an active job without claiming another, and cleanup after a database failure. The PostgreSQL timeout check cancels a long query and verifies the same pool remains usable.

Both Railway TOML files validate against Railway's published JSON schema. TypeScript, ESLint and formatting passed. The new Docker image built successfully without runtime credentials. Its migration command ran against `inforteks_test`; the web and worker served successful health responses, `/admin` redirected an anonymous request to `/login`, and the worker claimed a disposable email job once and marked it blocked without a live provider. Verification records were removed. Runtime checks confirmed the non-root user and exclusion of local secrets, provider configuration and the temporary build CA.

Development setup rejects remote migration URLs and production mode. Integration tests were rerun with an intentionally invalid inherited direct-database URL and still used only the isolated test database.

The final image uses Next's standalone server; its homepage and 12 static assets returned 200. The worker stopped with exit 0, while Next used its documented SIGTERM exit 143 without an out-of-memory termination. Container checks ran sequentially after this cloud runner exhausted disk space; only obsolete Inforteks test images/containers and disposable build cache were removed. The development PostgreSQL volume was preserved.

Private Vercel Blob upload/authenticated read also passed during the preceding deployment work; anonymous reads returned 403 and test objects were removed. The later Railway bucket checks are recorded above; see RAILWAY_STATUS.md for the current host and deployment state.

## Integration coverage

Tests exercise public draft exclusion, combined filters against the same SKU, private-field redaction, editor/AI permission boundaries, missing-image publication rejection, transactional publication and audit, stale and replayed approvals, current-permission revocation, competing checkout reservations, order ownership, single-release cancellation, payload-bound idempotency, client-total rejection, reservation-safe adjustments, exact-once fulfilment, immutable order snapshots, hashed/revoked integration keys, import validation/worker commitment, inspected-return restocking and single-release reservation expiry.

Pricing tests cover allocation reconciliation, inclusive/exclusive tax, shipping, invalid amounts, safe arithmetic beyond floating-point intermediate precision, canonical idempotency input and spreadsheet-safe exports.

## Browser and visual coverage

- Homepage navigation, image loading and horizontal overflow at 1440, 768, 390 and 320 pixels.
- Variant selection, guest cart, server quote, checkout and denial of another browser's order confirmation.
- Owner login, creation of a two-SKU draft, real image upload, reviewed stock adjustment, publication and storefront visibility.
- Twenty representative storefront/account/support templates and an Axe scan of the login template with no serious or critical WCAG-tagged violations.
- Account wishlist persistence in a fresh browser session and isolation after sign-out.

Visual inspection of desktop administration and mobile storefront screenshots found and corrected an inherited extra grid row in the mobile hero and a zero-sales value incorrectly displayed as restricted. Browser testing also found and corrected an anonymous order ownership bug and a wishlist hydration race. These discoveries are covered by the relevant regression journeys; an automated pass should not be interpreted as exhaustive coverage.

Screenshots are kept privately under `.data/screenshots/`. Playwright traces and reports are ignored because they can contain authenticated requests and personal data. Temporary browser Owner accounts are removed and created products archived; published catalogue verification showed exactly 50 demo products and no published browser-test products after teardown.

## Environment findings

The initial Prisma engine download was blocked. The final helper uses the official endpoint and verifies both archive and extracted SHA-256 digests; verification was never disabled. Chromium was available as a system browser.

Docker initially could not resolve the cloud proxy hostname, then rejected the proxy's certificate chain. Earlier local verification used an explicit build-time hostname mapping and a trusted CA bundle mounted through a BuildKit secret. The final Railway Dockerfile removes secret mounts because its builder does not support them. Railway builds passed with normal TLS and Prisma checksum verification; no cloud CA or runtime credentials are copied into the image.

The PostgreSQL adapter emits a deprecation warning concerning concurrent client queries; all transaction tests passed. ESLint 9 is a documented compatibility exception while the installed plugin set lacks ESLint 10 support. See architecture notes before upgrading either stack.

## Not verified or not implemented

Fresh published cloud restoration, live payment/refund/courier transactions, live email delivery and paid AI calls remain unverified. Source is pushed to GitHub; Railway hosts the application and the retained Vercel project redirects to it. The duplicate Vercel project was removed. GitHub Actions [run 37062842834](https://github.com/sidmuzammil/Inforteks/actions/runs/37062842834) completed successfully on source/CI commit `a73f56de33b13e004ff77be593f449a72cd8c02e`: setup, static checks, database tests, browser journeys and production build passed. Railway GitHub autodeploy access is still pending. Backup schedules and named Railway snapshots were verified, but continuous WAL coverage and a Railway restore rehearsal were not. Accessibility testing is representative, not a full audit. Load behavior, data retention, complete API contract coverage and remaining features are tracked in [delivery status](PROGRESS.md) and [future integrations](INTEGRATIONS_LATER.md).
