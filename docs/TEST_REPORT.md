# Verification report

Verified in the development cloud environment on **2 October 2026**. This records completed checks, not a production certification.

| Check                        | Result                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Repeated setup               | Passed; pinned install, verified engine, migrations and seed are repeatable                                |
| TypeScript                   | Passed with `tsc --noEmit`                                                                                 |
| ESLint                       | Passed with no source errors or warnings                                                                   |
| Formatting                   | Passed with Prettier                                                                                       |
| Pricing/unit tests           | 7 passed                                                                                                   |
| PostgreSQL integration tests | 19 passed against `inforteks_test`                                                                         |
| Chromium browser journeys    | 5 passed; Owner journey rerun after correcting zero-sales display                                          |
| OpenAPI generation           | 93 operations generated and validated as OpenAPI 3.1                                                       |
| Next production build        | Passed with an intentionally unreachable database URL                                                      |
| Docker production build      | Passed from the supplied Dockerfile without runtime secrets/database access                                |
| Container runtime            | Homepage and health returned 200; development settings correctly caused production readiness to return 503 |
| Container isolation          | Non-root user; no `.env` or temporary build CA in the runtime image                                        |
| First-Owner bootstrap        | Passed on a fresh isolated database; a second bootstrap was rejected                                       |
| Database snapshot restore    | Passed into an isolated database; all 50 demo products restored                                            |
| Web/worker startup           | Web readiness passed; separate worker started and durable import execution tested                          |

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

No Railway deployment, fresh published cloud restoration, live payment/refund/courier transaction, live email delivery or paid AI call was performed. CI is configured but has not run on GitHub because the source has not been pushed. Accessibility testing is representative, not a full audit. Load behavior, production backup schedules, data retention, complete API contract coverage and remaining features are tracked in [delivery status](PROGRESS.md) and [future integrations](INTEGRATIONS_LATER.md).
