# Storefront redesign — 8 October 2026

## Reference review and original direction

Reviewed https://www.alershadonline.com/ on 8 October 2026. Useful patterns are prominent product search, grouped technology departments, separate offer/new-product shopping routes and image-led product cards. The later product-carousel revision also reviewed publicly indexed Noon electronics navigation; live reference homepages timed out in the available browser connector, so a fresh visual review is not claimed. Inforteks retains its own logo, navy/blue/pearl palette, copy and category hierarchy. No reference-site artwork, product descriptions, prices, reviews, delivery promises or warranty claims were copied.

## Product-led carousel

The homepage no longer substitutes the abstract campaign artwork or generated concept product illustrations into an empty hero. Hero sections support up to six product-photo slides with keyboard arrows, previous/next buttons, thumbnail selectors and horizontal touch swipes. Controls disappear for a single slide. Manual navigation is the default. Optional seven-second rotation pauses during focus, hover, hidden-page state and reduced motion; admin previews do not rotate automatically.

Each slide can link a currently published Online Store product, use an uploaded banner photo, or combine them. Product photos and commercial facts come from the current public catalogue: quote-only products show Request a quote and suppress internal price/stock. A product becoming a draft, Direct-only, hidden by its category, or lacking an eligible public photo removes its bound slide on the next render, even if that slide also has a banner upload. Demo products and illustrative media are excluded from automatic and explicit product selection.

With no configured slides or uploaded legacy hero image, automatic selection uses up to six real public products. Existing uploaded legacy hero images and side-banner copy are retained; side banners render only when they have an uploaded image. If no eligible photo-backed products exist, the page shows a compact department-discovery area. This fallback is not evidence of an imported catalogue.

All-products links are available in desktop navigation, the mobile department menu, the homepage and footer. If the configured product shelves all return no matches, the homepage displays up to twelve newest eligible public products with a link to the full paginated catalogue. Thus a newly published product does not also need a featured flag or discount to appear on an otherwise empty homepage. The same publication, category, `store` and quote rules remain enforced.

Desktop navigation is driven by visible categories, with parent/child groups in a keyboard-accessible department panel. The mobile panel scrolls within the viewport and includes offers, arrivals, brands and account access. Search supports department selection on desktop, current-query suggestions, loading/empty/error feedback, clear, Escape, outside dismissal and model/SKU queries. Sorting and filtering preserve the chosen search department/collection.

Product cards emphasize brand, name, highlights, AED price, genuine previous-price savings, availability, cart, wishlist and comparison. Sample cards carry an explicit illustrative label. Responsive category tiles, banners, shopping grids/rows and brand links use the existing catalogue and checkout.

## Online Store controls

Open Online Store → Homepage → Edit & preview. Existing sections and their saved copy, schedules, media and visibility remain intact. Banners offer Midnight navy, Inforteks blue and Soft ice themes. Product sections offer a responsive grid or horizontal row, 1–12 products, and optional department and collection filters. Filters combine with the section's Featured, Discounted or New arrivals selection. Curated shopping sections use newest matching products.

Desktop/mobile previews and the storefront share rendering and query construction. Preview does not save, publish or enable shopping actions; the carousel navigation controls remain interactive inside its isolated frame. Only published Online Store products are selected; `Product.store=false` and draft products remain excluded. Empty configured product sections stay hidden. Changes retain existing content permissions, optimistic versions, media authorization, schedule enforcement and sanitization.

Hero controls include slide product search, upload, copy, destination, tone, reordering/removal, automatic selection and optional rotation. Product lookup reads the public catalogue and saving rechecks eligibility. Uploads remain private until referenced by a visible, currently scheduled section. Existing content versions prevent overwriting another editor's changes.

## Sample drafts only

Products → Create product → Sample draft starters contains three original illustrative concepts: a work laptop, desk monitor and headset. A starter fills an unsaved form; choose a brand/category and a unique SKU before saving. The server marks template-created products DRAFT, `demo=true` and `store=false`, even if the client submits `store=true`. Prices are initially unset, stock is zero, and no warranty or delivery claim is supplied. There is no production seed or automatic import. Samples are prepared in source and can be saved individually by authorized staff; this release does not insert production samples.

Sample drafts follow the existing private product-preview workflow. They are not verified merchant listings and must not be presented as saleable stock. Create genuine products from verified supplier information through the normal reviewed publication workflow.

## Architecture and deployment

No schema migration is required. New settings are stored in the existing HomeSection JSON with backward-compatible defaults. Online Store and Direct Sales remain independent; inventory, CRM, Contacts, authorization, exact approvals and purchased-item snapshots are unchanged. No Owner bootstrap, production seed or production browser fixture is part of this release.

Run isolated database tests and browser regression before deploying web to staging. Deploy production only after staging verification. The worker has no changed runtime behavior and needs no deployment for this release. Record actual deployment evidence in RAILWAY_STATUS.md; do not equate a queued deployment with success.
