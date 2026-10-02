# Delivery status

This file distinguishes the supplied brief's broad target from the working implementation.

## Implemented

- Delivery-country selection in the header, UAE emirates and permission-based country detection on the device; Saudi Arabia, Qatar and Oman explicitly coming soon, with UAE-only checkout validation.
- Live same-department comparison for up to four SKU configurations, merged shared/variant specifications, refreshed prices, difference filtering and mobile access. Optional, bounded AI explanations require separate provider enablement.
- Signed-in carts restore across devices; additions increment atomically, archived items can be removed, and checkout retries retain their idempotency key after network failure.

- Branded responsive storefront with original hero, department navigation, search suggestions, shared catalogue filters, pagination, variants, image zoom, wishlist and comparison.
- Database-backed carts, server totals, coupon/shipping/tax calculation, guest checkout, idempotent stock reservations, protected order confirmation and customer order/return views.
- Separate customer accounts and private staff sign-in; Better Auth password changes, session revocation, expiring recovery and optional email verification; first-Owner bootstrap and named staff creation.
- Permission-filtered administration for catalogue, inventory, orders, returns, content, promotions, imports, keys, jobs, audit and assistant conversations.
- Owner-controlled staff role changes and access revocation; product and content roles; homepage banner uploads with publication-aware image access.
- Google customer sign-in and explicit same-email account connection, guarded by provider configuration; Google/Firebase authorization is still unavailable, so live Google consent remains unverified.
- Shared operation scopes, one-time hashed integration keys, rate limits, version-bound approvals and transactional audit/stock ledgers.
- Quantity-aware fulfilment, cancellation restrictions, received-return disposition/restocking and expired reservation release.
- Validated image re-encoding, private draft media and adapters for S3-compatible storage and private Vercel Blob.
- Durable import/email/AI worker, two official AI provider adapters and a bounded tool allowlist.
- PostgreSQL migrations, repeatable development setup, tests, generated API registry and Railway/Vercel deployment files.
- Separate Railway web/worker configurations, bounded database connections and query timeouts, worker health checks and graceful draining, and an operations/recovery runbook. Railway production and staging are provisioned; see RAILWAY_STATUS.md for verification and remaining external requirements.

## Remaining product scope

- Full CSV quoting/mapping, supplier imports, updating existing products and inventory imports.
- Full response/request schemas for every OpenAPI operation and broader integration contract coverage.
- Dedicated shipping-zone administration, custom-grant editing, API key rotation UI, customer detail workflows and date-filtered financial reporting.
- Media removal/reordering, orphan cleanup and responsive image delivery optimization.
- Arbitrary category-driven catalogue facets, richer product organization/SEO editing, Arabic translation and RTL review.
- Streaming assistant responses, attachment workflows, spending ledger and broader operation coverage.
- Payment webhooks/reconciliation, executed refunds, courier automation, order email delivery and broader remote workflow testing.
- Independent accessibility, security, load, retention/backup and production-operational reviews.

The storefront and staff workspace are deployed on Railway, with production Owner access verified. Domain cutover, live sending authorization, merchant catalogue/policies and payment/shipping integrations remain launch requirements. Passing tests does not establish completion of every feature in the original brief or readiness to accept live retail payments.
