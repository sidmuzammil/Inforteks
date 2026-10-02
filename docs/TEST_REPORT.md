# Verification report

Verified in the development cloud environment on **2 October 2026**. This records completed checks, not a production certification.

| Check                        | Result                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repeated setup               | Passed; pinned install, verified engine, migrations and seed are repeatable                                                                      |
| TypeScript                   | Passed with `tsc --noEmit`                                                                                                                       |
| ESLint                       | Passed with no source errors or warnings                                                                                                         |
| Formatting                   | Passed with Prettier                                                                                                                             |
| Pricing/unit tests           | 7 passed                                                                                                                                         |
| PostgreSQL integration tests | 19 passed against `inforteks_test`                                                                                                               |
| Chromium browser journeys    | 5 passed; Owner journey rerun after correcting zero-sales display                                                                                |
| OpenAPI generation           | 93 operations generated and validated as OpenAPI 3.1                                                                                             |
| Next production build        | Passed with an intentionally unreachable database URL                                                                                            |
| Docker production build      | Passed from the supplied Dockerfile without runtime secrets/database access                                                                      |
| Container runtime            | Updated Railway image: homepage/web readiness/worker health returned 200 against the isolated test database; anonymous admin redirected to login |
| Container isolation          | Non-root user; no `.env` or temporary build CA in the runtime image                                                                              |
| First-Owner bootstrap        | Passed on a fresh isolated database; a second bootstrap was rejected                                                                             |
| Database snapshot restore    | Passed into an isolated database; all 50 demo products restored                                                                                  |
| Web/worker startup           | Web readiness passed; separate worker started and durable import execution tested                                                                |

## Railway preparation checks

The updated suite passed **33 tests**: the original 26 pricing/domain tests, two production-storage checks, three worker lifecycle checks and two database-limit checks. Worker tests cover health before database readiness, cancellation of idle sleep, draining an active job without claiming another, and cleanup after a database failure. The PostgreSQL timeout check cancels a long query and verifies the same pool remains usable.

Both Railway TOML files validate against Railway's published JSON schema. TypeScript, ESLint and formatting passed. The new Docker image built successfully without runtime credentials. Its migration command ran against `inforteks_test`; the web and worker served successful health responses, `/admin` redirected an anonymous request to `/login`, and the worker claimed a disposable email job once and marked it blocked without a live provider. Verification records were removed. Runtime checks confirmed the non-root user and exclusion of local secrets, provider configuration and the temporary build CA.

Development setup rejects remote migration URLs and production mode. Integration tests were rerun with an intentionally invalid inherited direct-database URL and still used only the isolated test database.

The final image uses Next's standalone server; its homepage and 12 static assets returned 200. The worker stopped with exit 0, while Next used its documented SIGTERM exit 143 without an out-of-memory termination. Container checks ran sequentially after this cloud runner exhausted disk space; only obsolete Inforteks test images/containers and disposable build cache were removed. The development PostgreSQL volume was preserved.

Private Vercel Blob upload/authenticated read also passed during the preceding deployment work; anonymous reads returned 403 and test objects were removed. This does not verify a Railway bucket, which has not been provisioned.

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

Docker initially could not resolve the cloud proxy hostname, then rejected the proxy's certificate chain. Verification used an explicit build-time hostname mapping and a trusted CA bundle mounted through a BuildKit secret. The Dockerfile supports that optional secret, retains normal TLS verification, and does not copy the CA into the runtime image. The same source can build normally without the optional secret on an ordinary network.

The PostgreSQL adapter emits a deprecation warning concerning concurrent client queries; all transaction tests passed. ESLint 9 is a documented compatibility exception while the installed plugin set lacks ESLint 10 support. See architecture notes before upgrading either stack.

## Not verified or not implemented

No Railway deployment, fresh published cloud restoration, live payment/refund/courier transaction, live email delivery or paid AI call was performed. Source has been pushed to GitHub and a Vercel build succeeded, but that site's database-backed homepage remained unavailable. GitHub CI results have not been independently verified. Railway login is currently blocked by cloud network access, and no Railway credentials were available in the session. Accessibility testing is representative, not a full audit. Load behavior, production backup schedules, data retention, complete API contract coverage and remaining features are tracked in [delivery status](PROGRESS.md) and [future integrations](INTEGRATIONS_LATER.md).
