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

Successful approval returns only a receipt: `{ "id": "proposal-id", "operation": "price.change", "targetId": "sku-record-id", "status": "APPROVED" }`. It does not return the unrestricted changed database row. Refresh the appropriate scoped read endpoint for updated values; write permission alone never grants cost, price or inventory read access. Restocking rechecks both `returns:write` and `inventory:adjust` for the initiating identity as well as the approver.

Keys have explicit scopes, expiry, immediate revocation and a database-backed request limit. Limits are currently fixed in code (120 requests/minute per key); there is no configurable quota dashboard. Never include raw keys in query parameters, logs or client JavaScript.

Integration proposals are owned by the API client and bound to the exact key that submitted them. Creation and human approval both recheck that key's client membership, revocation, expiry and required scopes, plus the client's current activity and scopes. A replacement key cannot authorize an older key's proposal. Key expiry, revocation, client deactivation or removal of a required scope blocks approval with 403; a failed attempt leaves the proposal pending and does not change the target. Restore the intended current authority or submit a fresh proposal with an authorized key, then review it again. Revocation never reverses an already committed approval. Key/client changes serialize with proposal creation and approval; an operation already holding the authority locks may finish before revocation completes.

Proposals created by integrations before migration `20261011120000_proposal_key_provenance` have no trustworthy originating key and cannot be approved by the new runtime. Resubmit them through an active key; their usual 15-minute expiry still applies. Existing staff proposals remain subject to their current user permissions, expiry and version checks. The internal `originatingKeyId` records provenance only and is not a credential or an alternative authentication mechanism.

To reorder existing product photos or change image descriptions, PATCH `/admin/products/{id}/media` with the current product `version` and the complete ordered `images` array, each containing `id` and `alt`. The order is applied atomically and increments the product version. Every current image must appear exactly once; attaching foreign images, omitting images or changing publication flags is rejected. Requires `catalog:write`, plus `catalog:publish` for a published product. A stale version returns 409. The result contains the new version and ordered media. Files and visibility stay unchanged; new uploads append after existing images and remain private until publication.

Delivery addresses accept separate `area`, `zone`, `postalCode` and an optional `location` object (`latitude`, `longitude`, `accuracy`, `confirmed: true`). Pins with accuracy above 200 metres are rejected; postal code is optional. Customers can PATCH an owned `/account/addresses/{id}` or delete it; existing order snapshots are independent. `GET /storefront/location` reports optional lookup availability. `POST /storefront/location` requires explicit `consent: true` and coordinates, checks origin and limits provider usage; it returns suggestions without saving an address and returns 503 while disconnected. See [delivery location](DELIVERY_LOCATION.md).

## Contract coverage

The generated registry documents 102 operations. Core checkout, product creation, carts, image upload and ordering, proposal creation and several common mutations include request schemas. Some generic admin resource bodies and response payloads still use descriptive/generic schemas; this is not yet a complete generated client contract for every table. Zod domain validators are authoritative, and `src/lib/api-client.ts` provides a small typed caller. Add concrete schemas and contract tests when expanding an integration.

No live payment webhook, courier API or executed-refund endpoint is implemented. The refund execution route intentionally returns 503. A missing provider must never be interpreted as success. Contact inquiries are durably saved but are not automatically emailed.

## Category-aware catalogue filters

`GET /api/v1/storefront/products` and `/storefront/search` accept `spec.<key>=<exact value>` (URL-encode spaces in keys/values). For example, `spec.ports=24` is meaningful only when an eligible product/configuration actually stores that fact. Returned `facets.specifications` provides each key, query parameter, label, optional stored unit and counted values; no networking or other product facts are invented. Product specifications are overridden by SKU options and then SKU specifications, and every selected filter must match the same SKU. Existing `ram` and `storage` parameters and response arrays are retained for clients. The new controls respect category `filterable=false`, cap at 24 keys, omit fields over 50 distinct values, and exclude non-scalar/metadata keys. Merchant attribute normalization and larger-catalogue performance remain unverified.

Proposal rejection uses the same per-proposal serialization as approval. Only the current initiating staff member or current Owner may reject; the successful response stays `{rejected: true}`. A terminal proposal returns HTTP 409 instead of false success, and each successful rejection records a `proposal.reject` audit event. Concurrent approval/rejection has one winning decision; refresh the scoped proposal view after a conflict.
