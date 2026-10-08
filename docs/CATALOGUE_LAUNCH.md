# Quote catalogue and storefront launch

The catalogue now supports a product-level **Request a quote** mode independently of `Product.store`. A quote-only product can be published without a price after normal image/specification validation. Its public DTO suppresses internal prices, discounts and inventory counts. Search, cards, product pages, comparison, wishlist and homepage sections show quote wording; structured data does not fabricate an Offer. Explicit price, discount and in-stock filters exclude quote-only products. Price sorts place them last.

Online cart additions and checkout reject quote-only products, including old carts and products with an internal Direct Sales price. Direct Sales keeps its existing price, stock, permission and shared-inventory rules. Turning quote-only mode off for a published product requires normal prices and a version-bound publishing approval. The independent Online Store, Direct Sales, CRM and Contacts modules are preserved.

Product quote links open a prefilled contact page. Submission resolves the current public product and active SKU again, records the requested quantity and verified identifiers in the existing Inquiries workspace, and creates no order, reservation or customer identity. Success confirms storage only; it does not claim an email was delivered.

## Administration and import

Products provides quote-mode controls for creation and a separate reviewed proposal for existing records. Private product and homepage previews render the same quote wording. Imports now includes a researched JSON manifest preview with per-row research notes and conflict detection. The original priced CSV workflow is unchanged.

The manifest schema is `src/lib/catalogue-manifest.ts`. Imports are limited to atomic batches of 100, and the browser/CLI split larger manifests into these batches. A human staff session, current catalogue-write permission, a matching fingerprint and an unexpired 15-minute preview are required to create drafts. The import:

- Creates only real, quote-only drafts with null prices and zero inventory; it never assigns inferred stock.
- Preserves existing products, `store` settings, prices, reservations and orders.
- Stores private source identities in `CatalogueSource`, with a unique source/external ID and manifest fingerprint.
- Detects duplicate SKU, model, slug and taxonomy conflicts. A changed source requires explicit review in the existing editor.
- Serializes concurrent batches and retains completed batches on retry without duplicate products.
- Records an audit trail and keeps research/source details out of public product DTOs.

`scripts/catalogue-import.ts` is an authenticated HTTP client. It never creates an actor, resets a password, connects directly to a production database or invokes a seed. Configure `INFORTEKS_ADMIN_ORIGIN` and an existing `INFORTEKS_SESSION_COOKIE` through private runtime bindings; do not paste credentials into source, commands, logs or chat.

```sh
node --use-env-proxy --import tsx scripts/catalogue-import.ts preview .data/catalogue/stocklist-manifest.json .data/catalogue/staging-receipt.json
node --use-env-proxy --import tsx scripts/catalogue-import.ts commit .data/catalogue/staging-receipt.json
node --use-env-proxy --import tsx scripts/catalogue-import.ts upload .data/catalogue/staging-receipt.json
node --use-env-proxy --import tsx scripts/catalogue-import.ts propose .data/catalogue/staging-receipt.json
# Inspect the exact, version-bound proposals saved in the private receipt first.
node --use-env-proxy --import tsx scripts/catalogue-import.ts publish .data/catalogue/staging-receipt.json --reviewed
```

Photograph files must be inside the manifest directory and match reviewed SHA-256 hashes. The normal media service validates and re-encodes image bytes. Unexpected existing media is preserved and stops automation for review. Unresolved research or missing photos block CLI publication proposals. Each propose invocation prepares at most 100 products; review/publish that batch, then repeat for remaining drafts. Re-proposing renews expired unapproved proposals. Recheck the resulting storefront and inquiry flow in staging before separately previewing and importing production.

## Research prepared on 8 October 2026

After the source host is allowed, run `node --use-env-proxy --import tsx scripts/research-supplier-catalogue.ts .data/catalogue/supplier` to enumerate the public Shopify feed. It checkpoints identity/photo references, rejects repeated pagination, records product and variant counts separately, and generates **unverified research drafts only**. It strips source prices, stock, HTML descriptions and reviews. Category/brand suggestions and every photo require review; successful feed traversal does not prove manufacturer verification or complete supplier availability. This tool has not been verified against the live feed because source access is blocked.

The supplied stocklist contains 139 rows resolving to **137 distinct products: 116 HP and 21 Canon**, consisting of 135 toner cartridges and two imaging drums. Duplicate 35A/89A rows are consolidated; HP 05A is normalized to CE505A; Canon 045A/054A names are normalized to standard 045/054. The user confirmed genuine cartridges and requested quote-only publication with no invented price or inventory quantity.

The private manifest and provenance files are under `.data/catalogue/`. They contain original factual summaries, source links, normalization notes and publication blockers. Manufacturer research produced 134 photo references. Three HP references need exact-photo resolution, and four Canon filenames need visual/model confirmation. **No photo binaries have been downloaded or verified, and no researched products have been imported or published remotely.** Source URLs are not evidence of a usable, approved photograph.

Al Ershad's public Shopify all-products page reported **4,298 products** during research. The saved partial discovery manifest contains only 76 identities; it is not a complete catalogue import. The user confirmed supplier availability for the wider catalogue. Import only independently checked product facts and appropriate real product images, not another merchant's marketing descriptions, warranties, prices, reviews, stock or delivery promises. A supplier export or allowed direct feed access is still needed for complete coverage.

The managed environment currently denies the supplier/manufacturer image hosts and Railway storefront hosts. Required network destinations include `www.alershadonline.com`, `alershadonline.com`, `cdn.shopify.com`, `www.hp.com`, `hp.com`, `hp.widen.net`, `www.canon.co.uk`, `i1.adis.ws`, `web-staging-4569.up.railway.app` and `web-production-b6327.up.railway.app`. Update them through the managed environment configuration workflow. Do not bypass its proxy or destination restrictions.

## Release constraints

The new artwork is `public/brand/storefront-hero.webp`, an original abstract Inforteks campaign banner. Category navigation uses semantic icons; product cards do not substitute illustrative product photos when media is missing. Production discovery excludes demo records, and publication rejects production demo products. Existing private sample starters remain drafts until replaced by verified merchant products.

Migrations 11 and 12 add `Product.quoteOnly=false` and the private `CatalogueSource` table; neither changes existing prices, quantities or order history. Follow `DEPLOYMENT_RAILWAY.md`: check a fresh backup, deploy web/migrations to staging, verify it, then deploy the matching worker and production release. Never seed production or reset the existing Owner. Do not roll back to code that lacks `store` or quote-only checkout guards after either restriction is in use. Keep additive tables/columns when rolling application code back.

The full retail launch remains blocked on verified photo assets, complete supplier data, an authenticated existing staff session for the import, and Railway backup/deployment verification. Shipping source code is not proof that these catalogue records are live.
