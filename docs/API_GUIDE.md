# REST API guide

Base path: `/api/v1`. See [OpenAPI 3.1](openapi.json) and the [operation matrix](OPERATION_MATRIX.md). Authentication endpoints are provided by Better Auth at `/api/auth/*` and are outside this business API registry.

Success is `{ "data": ... }`. Errors are `{ "error": { "code": "...", "message": "..." } }`; validation errors can also include field issues. Common statuses: 401 unauthenticated, 403 scope/origin denied, 404 unavailable record, 409 state/idempotency conflict, 422 invalid input, 429 rate limited, 503 unavailable integration. Create operations can return 201. Inventory export returns CSV rather than a JSON envelope.

Public catalogue reads require no credentials. Account routes require a customer session and always scope records to that customer. Staff routes accept a session or `Authorization: Bearer <integration-key>`, except human-only operations such as approval, key issuance, staff changes and import commitment. Cookie-authenticated mutations require the exact configured `Origin`. Bearer authority is recognized only under the admin API; it does not substitute for customer ownership.

## Examples

```http
GET /api/v1/storefront/products?q=laptop&ram=32%20GB&available=true&sort=price-asc&page=1&limit=20
```

The result includes products, total, pages and filtered facets. `min` and `max` query filters are AED amounts; prices in product/order JSON are integer **fils**. SKU filters apply to a single matching SKU, whose card price is presented first. Out-of-stock products remain browseable unless filtered out.

```json
{ "skuId": "sku-record-id", "quantity": 2 }
```

POST or PATCH that body to `/storefront/carts` to set the exact quantity. Zero removes a line. Retain the HTTP-only cart cookie. Quote using `/storefront/carts/quote` with `emirate` and optional `coupon`. Checkout requires `Idempotency-Key` plus email, validated delivery address and an enabled payment method; reuse the same key and exact body after an uncertain response.

To stage a price change, POST `/admin/proposals`:

```json
{
  "operation": "price.change",
  "targetId": "sku-record-id",
  "payload": { "price": 249900, "compareAt": null }
}
```

This requires `pricing:write`. The result is a proposal, not a changed price. A human reviews it in the workspace and approves through `/admin/proposals/{id}/approve`. Versions, expiry, initiator permissions and reviewer permissions are checked again. Integration keys cannot approve their own proposed changes.

Keys have explicit scopes, expiry, immediate revocation and a database-backed request limit. Limits are currently fixed in code (120 requests/minute per key); there is no configurable quota dashboard. Never include raw keys in query parameters, logs or client JavaScript.

To reorder existing product photos or change image descriptions, PATCH `/admin/products/{id}/media` with the current product `version` and the complete ordered `images` array, each containing `id` and `alt`. The order is applied atomically and increments the product version. Every current image must appear exactly once; attaching foreign images, omitting images or changing publication flags is rejected. Requires `catalog:write`, plus `catalog:publish` for a published product. A stale version returns 409. The result contains the new version and ordered media. Files and visibility stay unchanged; new uploads append after existing images and remain private until publication.

Delivery addresses accept separate `area`, `zone`, `postalCode` and an optional `location` object (`latitude`, `longitude`, `accuracy`, `confirmed: true`). Pins with accuracy above 200 metres are rejected; postal code is optional. Customers can PATCH an owned `/account/addresses/{id}` or delete it; existing order snapshots are independent. `GET /storefront/location` reports optional lookup availability. `POST /storefront/location` requires explicit `consent: true` and coordinates, checks origin and limits provider usage; it returns suggestions without saving an address and returns 503 while disconnected. See [delivery location](DELIVERY_LOCATION.md).

## Contract coverage

The generated registry documents 102 operations. Core checkout, product creation, carts, image upload and ordering, proposal creation and several common mutations include request schemas. Some generic admin resource bodies and response payloads still use descriptive/generic schemas; this is not yet a complete generated client contract for every table. Zod domain validators are authoritative, and `src/lib/api-client.ts` provides a small typed caller. Add concrete schemas and contract tests when expanding an integration.

No live payment webhook, courier API or executed-refund endpoint is implemented. The refund execution route intentionally returns 503. A missing provider must never be interpreted as success. Contact inquiries are durably saved but are not automatically emailed.
