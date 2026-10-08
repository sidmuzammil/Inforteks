# Storefront redesign — 8 October 2026

## Reference review and original direction

Reviewed https://www.alershadonline.com/ on 8 October 2026. Useful patterns are prominent product search, grouped technology departments, separate offer/new-product shopping routes and image-led product cards. Inforteks retains its own logo, navy/blue palette, original concept artwork, copy and simpler category hierarchy. No reference-site artwork, product descriptions, prices, reviews, delivery promises or warranty claims were copied.

Desktop navigation is driven by visible categories, with parent/child groups in a keyboard-accessible department panel. The mobile panel scrolls within the viewport and includes offers, arrivals, brands and account access. Search supports department selection on desktop, current-query suggestions, loading/empty/error feedback, clear, Escape, outside dismissal and model/SKU queries. Sorting and filtering preserve the chosen search department/collection.

Product cards emphasize brand, name, highlights, AED price, genuine previous-price savings, availability, cart, wishlist and comparison. Sample cards carry an explicit illustrative label. Responsive category tiles, banners, shopping grids/rows and brand links use the existing catalogue and checkout.

## Online Store controls

Open Online Store → Homepage → Edit & preview. Existing sections and their saved copy, schedules, media and visibility remain intact. Banners offer Midnight navy, Inforteks blue and Soft ice themes. Product sections offer a responsive grid or horizontal row, 1–12 products, and optional department and collection filters. Filters combine with the section's Featured, Discounted or New arrivals selection. Curated shopping sections use newest matching products.

Desktop/mobile previews and the storefront share rendering and query construction. Preview does not save, publish or enable shopping actions. Only published Online Store products are selected; `Product.store=false` and draft products remain excluded. Empty product sections stay hidden. Changes retain existing content permissions, optimistic versions, media authorization, schedule enforcement and sanitization.

## Sample drafts only

Products → Create product → Sample draft starters contains three original illustrative concepts: a work laptop, desk monitor and headset. A starter fills an unsaved form; choose a brand/category and a unique SKU before saving. The server marks template-created products DRAFT, `demo=true` and `store=false`, even if the client submits `store=true`. Prices are initially unset, stock is zero, and no warranty or delivery claim is supplied. There is no production seed or automatic import. Samples are prepared in source and can be saved individually by authorized staff; this release does not insert production samples.

Sample drafts follow the existing private product-preview workflow. They are not verified merchant listings and must not be presented as saleable stock. Create genuine products from verified supplier information through the normal reviewed publication workflow.

## Architecture and deployment

No schema migration is required. New settings are stored in the existing HomeSection JSON with backward-compatible defaults. Online Store and Direct Sales remain independent; inventory, CRM, Contacts, authorization, exact approvals and purchased-item snapshots are unchanged. No Owner bootstrap, production seed or production browser fixture is part of this release.

Run isolated database tests and browser regression before deploying web to staging. Deploy production only after staging verification. The worker has no changed runtime behavior and needs no deployment for this release. Record actual deployment evidence in RAILWAY_STATUS.md; do not equate a queued deployment with success.
