# Master Build Prompt: UAE IT E-commerce Store with Admin AI and Permission-Controlled APIs

Act as a senior full-stack engineer, e-commerce architect, product designer, and QA engineer. Build the complete application described below in this new repository. Implement and verify working software; do not stop at a plan, homepage, UI mockup, or disconnected dashboard.

## 1. Business objective and fixed scope

We are creating a UAE IT products store operated by one company. Our visual and shopping-experience reference is [Microless UAE](https://uae.microless.com/). Carry its category-led retail structure, product density, detailed specifications, and clear shopping hierarchy across every storefront page.

We own and manage all products, prices, stock, orders, and content. Build a secure admin panel where named staff log in with email and password. Authorized changes must persist in PostgreSQL and appear on the appropriate storefront pages without editing source code.

This is a single-merchant store. Exclude vendor registration, seller dashboards, competing seller offers, commissions, seller ratings, and marketplace payouts.

AI administration and read/write APIs are foundational requirements. Authorized admins must be able to use AI for business operations, and external AI tools or integrations must be able to use documented, scoped APIs. AI must follow the same permissions and commerce rules as manual administration.

Initial defaults: UAE, AED, English, Asia/Dubai display time, and one stock location. Store timestamps in UTC. Prepare translation dictionaries and direction-aware layouts for later Arabic support; a full Arabic translation is a later integration task. Use “Tech Store” as a temporary configurable brand. Do not invent company contact details or legal identity.

## 2. Execution approach

Read existing repository instructions and inspect starter files. Preserve unrelated work. Make reasonable implementation decisions and record assumptions; do not repeatedly pause for routine design choices or missing optional credentials.

Save this specification in docs/BUILD_SPEC.md and maintain a concise progress checklist. First implement a vertical slice: owner login → create product → upload image → set SKU price and stock → publish → view on storefront. Then complete the remaining modules.

Inspect representative Microless home, category, product, cart, account, and support pages where accessible. Review desktop and mobile rendering if browser tooling permits. Record observed patterns separately from your design decisions in docs/REFERENCE_AUDIT.md. If access is blocked, document the limitation and continue using the requirements below.

Use our own branding, original interface copy and banners, and uploaded or appropriately licensed images. Do not import the competitor’s catalogue, branding, reviews, customer data, or policies.

Work through all implementation milestones. Missing external accounts should block only the affected live integration, not the functioning application. Report actual verification results and remaining launch configuration honestly.

## 3. Stack and application structure

Use one maintainable full-stack application:

- Next.js App Router, React, strict TypeScript, and a supported Node.js LTS runtime.
- Tailwind CSS and accessible reusable components; shadcn/ui is an appropriate foundation.
- PostgreSQL with Prisma, committed schema migrations, and runtime validation using Zod or an equivalent shared schema system.
- Better Auth for email/password authentication and database sessions, using its documented PostgreSQL/Prisma integration.
- PostgreSQL-backed search initially; add a separate search engine only after a demonstrated need.
- A storage adapter with persistent local development uploads and S3-compatible production storage.
- Vitest or equivalent for business rules, integration tests against PostgreSQL, and Playwright for critical browser flows.
- pnpm with a committed lockfile.

Verify compatible, currently supported stable dependency versions against official documentation before installation. Pin selected versions and record them. Do not blindly install release candidates through an unqualified latest tag.

Keep the storefront, admin, APIs, and business services in one repository. Organize by domains such as catalogue, pricing, inventory, orders, identity, content, integrations, and AI.

Use shared server-only business services for all entry points. Admin screens, REST routes, and AI tools must invoke the same operations. Avoid duplicated business logic or an AI-only database access path.

Provide a durable PostgreSQL-backed job/outbox mechanism for imports, exports, AI runs, and integration delivery. A worker can run from the same repository/image. Do not require Redis or microservices for the initial build.

## 4. Storefront visual system

Create a polished, information-rich electronics retail experience closely guided by the Microless reference. Apply the design consistently to every page template.

Use a light neutral background, white product surfaces, strong readable prices, restrained borders, consistent typography, and a configurable accent palette. Match the reference’s retail hierarchy and useful content density through visual inspection.

The shared shell must include:

- A compact utility row with configured contact/help information and delivery destination.
- A prominent search field, brand identity, account access, wishlist, comparison, and cart count.
- Desktop department navigation with an accessible mega-menu.
- Mobile search and nested category navigation with usable filter/sort drawers.
- Breadcrumbs on interior pages.
- A substantial footer with real support, company, policy, and account links.

Home should have a useful promotional area, category shortcuts, offers, featured products, new arrivals, selected brands, and category merchandise sections. Admins control content, ordering, visibility, dates, and destinations.

Aim for approximately five cards across wide home sections, three or four beside a listing filter sidebar, and two on ordinary phone widths where readable. Verify actual layouts rather than treating these counts as rigid.

Give cards consistent image proportions, useful product titles, key specifications, AED pricing, genuine sale indicators, availability, and appropriate actions. Display only operationally supported delivery and pickup claims.

Design loading, empty, error, unavailable, permission-denied, and out-of-stock states. Every visible control must work or have an honest disabled explanation.

## 5. Required storefront routes

Implement complete reusable templates and functioning navigation for these pages:

| Area | Routes and behavior |
|---|---|
| Home | / — admin-controlled sections and products |
| Departments | /categories and /category/[...slug] — hierarchy, category landing, filtered listings |
| Search | /search — query, suggestions, filters, sort, pagination |
| Brands | /brands and /brand/[slug] |
| Merchandising | /offers, /new-arrivals, /collection/[slug] |
| Products | /product/[slug] — SKU selection and full detail |
| Selection | /wishlist and /compare |
| Purchase | /cart, /checkout, /order-confirmation/[reference] |
| Authentication | /login, /register, /forgot-password, /reset-password |
| Customer account | /account, /account/orders, /account/orders/[id], /account/addresses, /account/profile |
| Returns | Customer return-request form and request history/detail |
| Tracking | /track-order — protected lookup and fulfillment timeline |
| Support | /about, /contact, /faq, /shipping-delivery, /returns-refunds, /warranty, /payment-methods |
| Policies | /privacy-policy and /terms-conditions |
| System | Useful 404, access-denied, expired-link, and service-error states |

Confirmation, order detail, return, and tracking pages must require ownership or a secure guest access token. An order number alone must not disclose customer information.

Brand, category, collection, offer, and search pages must reuse one catalogue engine. Do not hardcode independent product arrays for different screens. All templates need responsive layouts and relevant empty states.

## 6. Search, filtering, and comparison

Search product names, brands, models, SKU, manufacturer part numbers, and applicable specifications. Prioritize exact SKU/model matches and then relevant text matches. Provide debounced suggestions with keyboard support.

Implement real category-specific filters, numeric ranges, availability filters, active filter chips, clear-all, result counts, sorting, and pagination. Preserve query/filter state in the URL and restore it when navigating back.

Use consistent units and meaningful numeric comparisons. Filter counts must come from matching published catalogue data. Bound query complexity and page sizes.

Filters must match an actual sellable SKU. A product with only 16GB/256GB and 8GB/512GB variants must not appear as a matching 16GB/512GB configuration.

Compare up to four products or selected SKUs within compatible category templates. Align specification groups, highlight differences, and show “Not specified” for missing values.

Wishlist, comparison, and add-to-cart must preserve the selected SKU. Provide a useful no-results state with clear-filter and category suggestions.

## 7. Product detail requirements

Build a detailed product template with:

- Image gallery, thumbnails, zoom, alt text, and reliable fallback imagery.
- Product name, brand, model, SKU/MPN, condition, and short highlights.
- Valid variant selectors that update specifications, image selection, price, availability, and URL/state.
- Quantity controls, add-to-cart, wishlist, and comparison.
- Current price, applicable tax wording, truthful comparison price, and calculated discount.
- Availability, configured delivery estimate, warranty duration/provider, and pickup only where configured.
- Description, grouped technical specifications, supplied manufacturer resources, related products, and compatible accessories.
- Review display and submission tied to an implemented moderation/verified-purchase workflow.
- Useful out-of-stock behavior, with notification registration only if its workflow is implemented.
- Accessible mobile purchase controls that do not obscure content.

Do not invent warranty, compatibility, specifications, review counts, or delivery dates. Related products may use category rules; compatibility claims require supplied data or explicitly maintained relationships.

An unavailable product may remain viewable when appropriate, but drafts and archived products must not become purchasable.

## 8. IT catalogue and data model

Separate Product from SKU/Variant. Every product has at least one sellable SKU; simple products use a default SKU. Store only real option combinations.

Product includes identity, slug, brand, primary/additional categories, description, highlights, publication status, merchandising, SEO, and product-level specifications.

SKU includes unique SKU, optional MPN/GTIN, valid options, price, optional cost, condition, weight/dimensions, warranty overrides, stock association, and variant-level specifications. Draft SKUs can await pricing; publication requires valid pricing from an authorized actor.

Create relational models for:

- Brands, categories, category hierarchy, attribute definitions/values, options, SKUs, media, collections, and product relationships.
- Stock locations, balances, reservations, and inventory movements.
- Customers, addresses, carts/cart items, wishlists/wishlist items, orders/order items, payment attempts/transactions, shipments/fulfillment items, returns/return items, refund requests, and executed refund records.
- Coupons, redemptions, content pages, banners, navigation, reviews, inquiries, and store settings.
- Staff permissions, sessions, API service accounts/keys, audit events, jobs, integration events, AI conversations/runs/proposals.

Use foreign keys, unique constraints, appropriate indexes, and validation. Flexible JSONB is acceptable for validated content/specifications; do not make the whole store one unvalidated JSON document.

Attribute definitions need stable keys, type, unit, allowed values, product/SKU scope, and required/filterable/comparable flags. Category changes must surface incompatible or missing values.

Preserve historical orders through immutable snapshots of names, selected options, prices, discounts, tax, addresses, and relevant commercial terms. Catalogue edits must not rewrite past purchases.

## 9. Initial departments and specifications

Create an editable IT-focused hierarchy with these departments and suitable subcategories:

| Department | Example structured specifications |
|---|---|
| Laptops | CPU, GPU, RAM, storage, display, OS, keyboard layout |
| Desktops and workstations | Processor, graphics, memory, storage, chassis, OS |
| Processors and motherboards | Socket, chipset, cores, form factor, memory support |
| Graphics cards | GPU model, VRAM, interface, outputs, dimensions, power requirements |
| Memory and storage | Capacity, generation, speed, interface, form factor |
| Cases, power, and cooling | Form factor, dimensions, wattage, connectors, supported sockets |
| Monitors | Size, resolution, panel, refresh rate, ports, VESA |
| Networking and servers | Port count/speed, Wi-Fi standard, PoE, rack size where relevant |
| Printers and consumables | Technology, color/mono, duplex, connectivity, compatible models |
| Peripherals and accessories | Connection, layout, compatibility, cable/port types |

Allow admins to add or hide categories and define new attribute templates without code changes. Include region-relevant keyboard layout, plug type, and warranty information when applicable.

Do not build an automatic PC compatibility builder, digital license fulfillment engine, procurement ERP, or multi-country tax system in this first release.

## 10. Admin workspace and modules

Build a separate professional /admin layout with a persistent sidebar, breadcrumbs, search, clear primary actions, useful tables, filters, pagination, and responsive forms.

Provide these usable modules:

| Module | Required functions |
|---|---|
| Dashboard | Real order/sales metrics, low stock, pending work, failed jobs, activity |
| Products | Create, edit, duplicate, search, filter, draft, preview, publish, archive |
| Catalogue setup | Categories, brands, specification templates, options, collections |
| Inventory | On-hand/reserved/available balances, reasoned adjustments, movement history |
| Orders | Customer/items/totals, timeline, payment summary, fulfillment, cancellations |
| Returns | Requests, quantities, inspection, disposition, refund-request tracking |
| Customers | Authorized profile, addresses, order history, and support context |
| Promotions | Coupons, eligibility, dates, redemption limits, explicit stacking rules |
| Content | Homepage sections, banners, menus, footer, information/policy pages |
| Media | Uploads, alt text, ordering, usage references, safe removal |
| Reviews and inquiries | Moderation, verified purchase checks, contact/quote request records |
| Imports and exports | Templates, validation preview, commit, row errors, job history |
| Reports | Date-filtered sales, products, stock, refunds, CSV export |
| Staff and access | Named accounts, role assignment, sessions, permission visibility |
| API access | Service accounts, scoped keys, documentation, usage, revocation |
| AI assistant | Tasks, conversations, tools, approvals, results, usage |
| Settings and audit | Store identity, tax/shipping configuration, integration status, audit search |

Use real persisted data for dashboards. Show honest empty states before trading. Do not fabricate revenue or customer reviews.

Provide a concise admin user guide describing what each menu does.

## 11. Product editing and storefront publication

The product editor needs sections for Overview, Media, Pricing, Inventory, Variants, Specifications, Organization, SEO, and Publishing. Include validation, unsaved-change protection, a working preview using the storefront template, and visible save/publish results.

Distinguish saving a draft from publishing. Editing a published product must have clear save-to-live behavior. AI-generated changes to an already published product belong in a separate proposal or draft revision until approved; saving them must neither overwrite live content nor unpublish the product.

Prefer request-time database-backed catalogue rendering initially. If introducing caching, invalidate all affected views after a successful commit: product, category, brand, search, collection, homepage, and metadata. Protect private previews from public caching.

A fresh anonymous storefront request after publishing or editing must show the committed information without deployment, rebuild, or manual synchronization. Existing open tabs can refresh normally; do not claim automatic push updates unless implemented.

Price and stock must always be rechecked by cart/checkout services even if the browser displays older content. Slug changes need redirects and canonical URL handling.

## 12. Cart, checkout, pricing, stock, and orders

Implement persistent guest and customer carts, cart merging on login, quantity updates, item removal, coupons, shipping calculation, and totals.

Checkout should support guest purchase, contact details, UAE address fields, emirate, city/area, building/unit, optional landmark, phone validation, shipping choice, order review, and enabled payment methods. Do not force a made-up postal code.

Implement persisted, admin-configurable UAE delivery zones, eligibility, flat rates/free-shipping thresholds, and lead-time rules before courier integration. Quote shipping from the address and server cart, and snapshot the selected service, charge, and estimate on the order.

Store money in integer minor units and use deterministic decimal-safe tax/discount calculations. Document rounding and coupon allocation. Recalculate prices, discounts, shipping, tax, and availability on the server; never trust submitted totals.

Make merchant VAT registration, TRN, tax rates, and tax-inclusive/exclusive configuration editable. A 5% example may be seeded for development, but do not assume the merchant is registered or show production tax claims without configuration.

Use one explicit stock policy:

1. Reserve stock transactionally when an order/checkout is created.
2. Available stock equals on-hand minus reserved.
3. Keep confirmed allocations reserved until fulfillment.
4. At shipment, decrement on-hand and the corresponding reservation exactly once.
5. Release reservations through valid cancellation/expiry transitions.
6. Restock returns only after recorded receipt and disposition.

Use database locking or atomic conditional updates to prevent overselling. Record inventory movements with actor, reference, quantity, and reason.

Separate order, payment, fulfillment, return, and refund states. Implement allowed transitions in business services. Cancelling an order does not mean a refund succeeded; approving a return does not mean stock was received.

Create immutable order item and address snapshots. Support quantity-aware fulfillment/returns, enforce refundable/returnable limits, and provide printable order summaries. Tax invoice output must depend on configured merchant information and applicable rules.

Use idempotency for order creation, stock changes, fulfillment, and financial operations. Bind keys to actor, operation, and payload: the same request returns its existing result; a changed payload conflicts. Enforce uniqueness in PostgreSQL. A browser success URL must never mark an order paid. Future payment adapters must verify provider events, deduplicate webhook delivery, reconcile out-of-order/late results, and coordinate payment expiry with stock reservations.

Provide a clearly identified development payment simulator and configurable offline payment support. Production must reject simulated payment mode. Without a live payment provider, only deliberately enabled operational offline methods may accept orders. A refund request can exist before integration; never show money as refunded without a verified result.

## 13. Staff authentication and authorization

Use mature authentication with secure password hashing, database sessions, HttpOnly cookies, production Secure cookies, CSRF/origin protection for cookie-authenticated mutations, rate limiting, and generic authentication errors.

Create the first Owner through a documented one-time bootstrap command using an interactively supplied password or deployment secret. Never commit a default production password. Public registration creates customer accounts only and can never assign staff permissions.

Implement password recovery, session revocation, and owner-controlled staff onboarding. Local email delivery may use a development mailbox; production recovery must use a configured provider or a documented secure operator procedure.

Enforce authorization on every protected read, mutation, job, API route, and AI tool. Hiding UI controls or protecting only a layout/middleware is insufficient.

Implement permission presets:

| Role | Default authority |
|---|---|
| Owner | Full business administration, staff, keys, integration settings, sensitive approvals |
| Store Manager | Catalogue, prices, stock, orders, promotions, content; no Owner privilege management |
| Catalogue Editor | Product drafts, attributes, media, categories/content; no price, cost, inventory, or financial changes by default |
| Inventory Staff | Authorized stock visibility and reasoned inventory adjustments |
| Order/Support Staff | Orders, fulfillment, returns workflow, necessary customer details; no payment recording/refund execution by default |
| Analyst | Approved aggregate reports; no writes or unrestricted personal data exports |
| API Service Account | Explicit assigned scopes only; no automatic authority from its creator |
| Customer | Their own profile, addresses, cart, orders, reviews, and returns |

Make permission grants explicit and inspectable. Separate publication, price changes, cost/margin visibility, refunds, customer exports, and access management.

Prevent insecure direct-object access: knowing a customer/order/product draft ID must not bypass its permissions.

## 14. API Access Center and credentials

Implement /admin/api-access with service-account creation, scope selection, read-only presets, expiry, key issuance, rotation, revocation, last-used metadata, usage limits, and audit history.

Separate three credential types:

- Staff credentials establish browser sessions.
- Integration keys authenticate external applications to our API.
- Provider keys let our server call AI, email, storage, or payment providers.

For integration keys, generate high-entropy secrets, display them once, store only a secure hash plus identifier/prefix, and check current revocation/expiry on every request. Show masked metadata afterward. Never store keys in browser localStorage or include them in logs.

Permission families should include at least:

catalog:read, catalog:write, catalog:publish, pricing:read, pricing:write,
costs:read, costs:write, inventory:read, inventory:adjust, orders:read, orders:update,
orders:cancel, payments:record, fulfillments:write, returns:write, refunds:request,
refunds:execute, customers:read, customers:export, content:read,
content:write, promotions:write, reports:read, reports:financial,
staff:manage, api_keys:manage, integrations:manage, audit:read, ai:use.

Use a central permission registry; add specific scopes when a module requires them. Do not collapse sensitive privileges into one generic admin/write switch.

Effective integration permissions cannot exceed the approved service account and key scopes. Effective AI permissions are the intersection of the initiating user's current authority, delegated AI permissions, and allowed tools.

Apply record and field checks, request limits, and reasonable quotas. Public APIs must never expose cost prices, supplier notes, staff data, private drafts, or customer records.

## 15. Versioned APIs and documentation

Implement /api/v1/storefront, /api/v1/account, and /api/v1/admin namespaces. Use GET for reads, POST for creation/actions, PATCH for permitted edits, and DELETE only where deletion is genuinely appropriate. Archive referenced catalogue records.

All admin business operations must have a documented API equivalent. Explicit action endpoints must enforce order, payment, stock, publication, and approval transitions.

Minimum endpoint families, beneath /api/v1:

| Family | Required API coverage |
|---|---|
| /storefront/products, /storefront/categories, /storefront/brands, /storefront/collections, /storefront/search | Published catalogue, detail, facets, suggestions |
| /storefront/carts and /storefront/checkout | Scoped carts, items, server quotes, order creation |
| /account/profile, /account/addresses, /account/orders, /account/returns, /account/wishlist, /account/reviews | Customer-owned data and supported actions |
| /admin/products and /admin/products/{id} | List, create, detail, field-validated edit, duplicate, archive |
| /admin/products/{id}/publish and /admin/products/{id}/unpublish | Explicit publication operations |
| /admin/categories, /admin/brands, /admin/attributes, /admin/collections | Catalogue administration |
| /admin/media | Authorized uploads, metadata, ordering, safe deletion |
| /admin/inventory and /admin/inventory/adjustments | Balances, reservations, movement history, adjustments |
| /admin/orders | List/detail; explicit cancellations, fulfillments, permitted payment recording |
| /admin/returns and /admin/refund-requests | Quantity-aware workflow and provider-gated refund execution |
| /admin/customers, /admin/reports, /admin/exports | Permission-filtered data and exports |
| /admin/promotions, /admin/content, /admin/navigation, /admin/settings | Merchandising and operational configuration |
| /admin/reviews and /admin/inquiries | Moderation and request handling |
| /admin/imports and /admin/imports/{id}/commit | Upload, validate, preview, commit, errors |
| /admin/staff, /admin/roles, /admin/api-clients, /admin/api-keys | Authorized access administration |
| /admin/ai/runs and /admin/ai/proposals | Start, inspect, cancel, approve/reject where authorized |
| /admin/jobs, /admin/audit-events, /admin/me/permissions | Progress, audit, effective authority |

Provide validated OpenAPI 3.1 documentation, stable operationIds, schemas, examples, pagination, filtering, sorting, authentication, required scopes, and error responses. Keep runtime schemas, docs, and a small typed client synchronized.

Provide protected interactive API documentation and example requests using placeholders. Document 400/401/403/404/409/422/429 responses consistently; never expose stack traces or SQL details.

Cookie-based API requests require CSRF controls. External bearer keys need a separate authentication path. Use explicit CORS rules; do not combine credentialed requests with unrestricted origins.

Create docs/OPERATION_MATRIX.md mapping each admin action to endpoint, permission, AI tool exposure, confirmation requirement, and audit event. Security operations may require human handoff; document that deliberately.

## 16. Admin AI assistant

Build /admin/assistant and contextual entry points on products, inventory, and orders. Include conversations, suggested tasks, attachments/import references, progress, permission explanations, approval cards, result links, cancellation, history, and usage.

Implement real server-side adapters for OpenAI and Anthropic with configurable model identifiers. Use official SDKs and supported tool calling. Keep one provider interface for text, tool requests/results, streaming, cancellation, errors, and usage.

Do not claim arbitrary providers are interchangeable. Make additional provider adapters possible without replacing the business logic.

Initially keep provider secrets in server environment variables. The Owner can select configured providers/models, see connection status, and test connectivity. Do not expose plaintext credentials. If a later settings screen accepts secrets, encrypt them with a server-held key and return masked values only.

Never send provider keys, integration tokens, session cookies, passwords, or signing/encryption secrets to a model through prompts, tool arguments/results, attachments, conversation history, or traces.

When no provider is configured, show “AI provider not connected.” Keep manual admin fully functional. A deterministic development/test adapter can validate tool workflows, but must be labelled and impossible to mistake for live AI.

Support these first-release tasks:

- Find low-stock products, missing images, incomplete specifications, and pending orders.
- Create product drafts from supplied specifications or validated import rows.
- Draft titles, descriptions, SEO text, and category content.
- Prepare price changes, promotions, and inventory adjustments.
- Summarize order/customer context permitted to the current user.
- Prepare fulfillment, cancellation, return, and refund-request actions.
- Produce authorized sales/inventory summaries and exports.
- Edit homepage sections, banners, and other permitted catalogue/content settings.

Preserve source facts. Unknown technical specifications, compatibility, warranty, stock, delivery, or tax details must remain unknown or be requested for review.

## 17. AI tools, proposals, and approvals

Use a curated named-tool registry built on existing business services. Each tool has a runtime schema, operationId, permission, permitted fields, risk classification, and output contract. Adapt schemas to each model provider's supported subset; do not assume OpenAPI schemas are directly valid AI tool schemas.

Expose tools such as search_products, create_product_draft, propose_price_change, adjust_inventory, summarize_orders, and update_home_section. Do not expose arbitrary SQL, shell execution, unrestricted HTTP requests, or a generic administrator bypass.

Use server-owned action policies:

- Authorized reads, analysis, and uncommitted drafts can run directly.
- Reversible draft saves can run when clearly requested and authorized, with visible results.
- Publication, live price changes, stock adjustments, bulk edits, order cancellation, exports of personal data, and financial actions require an appropriate concrete preview and confirmation.
- Access/credential changes require an Owner-controlled human flow. AI can explain or prepare a request but cannot grant itself access, issue itself keys, reveal secrets, or approve its own changes.

The preview must show exact affected records, counts, before/after values, validation problems, and relevant financial impact.

Persist proposals bound to the actor, operation, normalized payload, affected record versions, approval requirement, and expiry. Approval must come from an authenticated authorized human action. A model-provided confirmed=true or natural-language claim of approval is not authorization.

The shared service must enforce required approvals across admin, direct REST, and external AI entry points. A lower-level mutation cannot bypass them. Service-account keys cannot approve proposals or satisfy a human-only action.

Record approver identity and consume each approval once, transactionally with the internal mutation. For external effects, atomically consume approval and enqueue one idempotent execution job.

Recheck permissions, object versions, business constraints, and approval immediately before execution. Reject altered or stale proposals with a fresh preview. Apply idempotency and optimistic concurrency.

For bulk tasks, show durable progress and per-item outcomes. Cancellation stops pending work; do not claim completed external actions have been undone. Offer rollback only for operations with a real, validated inverse.

Treat supplier text, uploads, product content, and tool results as untrusted data, never as instructions that can change tools or privileges. Minimize personal data sent to providers and isolate conversations by authorized user/context.

Set configurable step, time, token, retry, and spending limits. Return results supported by tool responses and link changed records.

## 18. Auditing and integration reliability

Record actor, service account/delegation, source (admin/API/AI), operation, target, redacted before/after values, timestamp, request/job ID, proposal/approval, and outcome.

Protect audit history from ordinary edits. Keep credentials and unnecessary personal data out of logs. Separate activity logs from inventory and financial ledgers.

Persist internal mutations and their required audit events in the same transaction. Record approved external intent durably before dispatch and its verified outcome afterward. Fail closed when required authorization, approval, or audit persistence cannot be established.

Use durable jobs with bounded retries, deduplication, visible failures, and idempotent handlers. Recheck current permissions when queued privileged work executes; revocation must prevent subsequent unauthorized execution.

Define provider interfaces for payment, email, shipping, storage, and AI. Implement honest configured/unconfigured/error states. Notification jobs should say queued or failed when appropriate, not claim delivery without evidence.

Document signed webhooks and outbound event schemas for future ERP/automation connections. Full n8n, Odoo, MCP, WhatsApp, or courier integrations can be added later through the same scoped APIs.

## 19. Imports, uploads, and data quality

Implement CSV product/SKU import and stock import with downloadable templates, column mapping, validation preview, explicit matching by SKU, duplicate detection, and row-level errors. Preview must not mutate data.

Require an explicit commit after validation, record the batch outcome, and document all-or-nothing versus partial processing. Revalidate authorization and relevant current data at commit time. New products default to draft; updates to published records require relevant field/publication permissions.

Stock imports must declare adjustment-delta versus physical-count mode. Apply through the inventory service, preserve reservations, record batch/reason, and reject inconsistent counts below allocated stock with a clear discrepancy error.

Sanitize rich text and rendered AI/imported content; never render untrusted HTML directly. Validate file size/type/content and image dimensions. Generate safe object names, strip unsafe metadata where appropriate, and reject executable or unsafe upload formats. Store original asset references and provenance where available.

Store object keys plus metadata rather than expiring signed download URLs. Restrict public media delivery to explicitly public assets; draft previews and customer attachments remain protected.

Use local assets or authorized image sources in development. Do not hotlink Microless assets. Add checks for missing images and incomplete required specifications.

Neutralize spreadsheet formulas in exported user-controlled CSV fields. Restrict financial/customer exports and make sensitive export files private and time-limited.

## 20. Railway and local environment

Provide Docker Compose for local PostgreSQL and persistent development uploads, plus clear setup, migration, seeding, bootstrap, start, build, and test commands.

The same application must run on Railway as a Node service. Supply a production Dockerfile and Railway configuration/instructions, including the worker when required.

Railway deployment requirements:

- PostgreSQL connection details remain server-only. Use a service variable reference for DATABASE_URL when app and database share a Railway environment.
- A local machine or another host cannot use Railway's private database hostname; document explicitly enabled external access when needed.
- Build without querying a live database. Generate the ORM client during build and run committed production migrations in the pre-deploy stage.
- Include migration files and required executables in the deployed image.
- Never run development migrations, schema reset, automatic demo seeding, or destructive synchronization in production.
- Listen on the provided PORT and expose minimal health/readiness endpoints.
- Keep uploaded production images outside the app container filesystem.
- Use an S3-compatible storage adapter. Railway buckets are private: serve approved public catalogue assets through stable application media URLs or an appropriately designed delivery layer.
- Configure endpoint and addressing style from the actual bucket settings.
- Document database backup enablement, restore steps, logging, monitoring, and environment separation.

Provide a validated .env.example covering database, auth, application URL, storage, AI provider/model, optional email/payment/shipping, worker configuration, and feature flags. Include descriptions, safe placeholders, and no secrets.

Do not make Railway credentials a prerequisite for finishing local development. Do not create paid infrastructure or publish the live store as part of the local build without an explicit deployment request.

## 21. SEO, accessibility, and performance

Implement server-rendered product/category content, editable metadata, canonical URLs, slug redirects, sitemap generation, robots rules, breadcrumbs, and social metadata.

Add truthful Product/Offer/variant structured data from the same published records. Include ratings only when genuine reviews exist. Keep draft/admin/account/checkout/search-filter combinations out of indexing as appropriate.

Target WCAG 2.2 AA: keyboard navigation, visible focus, semantic controls, labelled inputs, accessible validation/dialogs, contrast, alt text, reduced motion, and suitable touch targets. Verify important flows manually as well as with automated checks.

Optimize images with dimensions, responsive sizes, and sensible loading. Avoid unnecessary client-side JavaScript, unbounded queries, N+1 reads, and full-catalogue downloads. Index actual filter/search patterns.

Do not claim performance, accessibility, or security certifications from a single automated score. Report measured results and unresolved limitations.

## 22. Development data and integration boundaries

Seed at least 48 clearly identifiable development products across the IT departments, including simple/variant products, images, specifications, promotions, low-stock/out-of-stock cases, and several order states.

Use coherent illustrative data and original descriptions. Never seed fake customer reviews or sales as real business activity. Guard development accounts and payment simulation from production.

Complete now:

- Full responsive storefront and admin page templates.
- Real PostgreSQL persistence, authentication, authorization, uploads, catalogue publishing, stock, carts, orders, and content.
- Customer accounts and core returns/reviews/inquiry workflows.
- Versioned APIs, scoped keys, API docs, and operation matrix.
- AI interface, provider adapters, tool executor, permission checks, approvals, audit history, and development contract tests.
- Import/export, jobs, tests, deployment configuration, and operating documentation.

Connect or finalize later:

- Railway project/environment and production storage credentials.
- Actual brand assets, company identity, tax registration/configuration, and approved policy content.
- Payment processor, transactional email domain/provider, courier accounts, and pickup arrangements.
- AI provider account, approved model, credentials, and usage budget.
- Domain/DNS, analytics consent/configuration, ERP/Odoo, WhatsApp, n8n/MCP, advanced search, and Arabic translation.

Missing services must show clear setup status. Contact/quote requests may be saved before outbound email is configured; do not claim an email was sent. Never enable a nonfunctional payment option.

## 23. Acceptance tests and visual review

Implement meaningful tests for the risks below and verify the main UI flows:

1. From a fresh database, documented setup produces a runnable app and secure Owner access.
2. Create a product with two SKUs, image/specifications/price/stock, preview it, publish it, and find it in product/category/brand/search/collection views.
3. Edit a published price or image and verify the next fresh anonymous request sees it without rebuilding.
4. Draft/archived products remain private or unavailable as designed; internal fields never leak publicly.
5. Search, combined filters, pagination, compare, wishlist, and selected SKU cart identity work.
6. Cart totals reject client manipulation; coupons, tax, shipping, rounding, and order snapshots reconcile.
7. Two concurrent checkouts for the final unit produce one valid reservation.
8. Cancellation, reservation expiry, shipment, returns, and payment retry do not duplicate stock movements.
9. Simulated duplicate/late/out-of-order provider events are idempotent; a success URL alone cannot mark payment received.
10. Customers cannot access other customers' orders, addresses, returns, or private files.
11. Read-only API keys cannot write; revoked/expired keys fail; field restrictions hold through manual UI, API, and AI.
12. A Catalogue Editor cannot modify price, cost, inventory, or staff privileges without the relevant grant.
13. AI drafts use supplied facts; unauthorized tools and injected supplier instructions cannot bypass policy.
14. A sensitive AI write cannot execute without the exact valid approval; stale, altered, and replayed proposals are handled correctly.
15. Approved AI and manual edits produce equivalent validated state and audit records.
16. Import previews do not change data; committed jobs persist and expose row outcomes.
17. Store/manual admin work with optional providers absent; unavailable integrations never report fake success.
18. Production build succeeds without a live database connection; production migration/start instructions are complete.

Review representative templates at approximately 390px, 768px, and 1440px widths, plus a narrow phone width. Check menu, search, filtering, product gallery, variant selection, cart, checkout, account, admin forms, and AI approval dialogs.

Fix overflow, clipped text, broken images, dead links, inconsistent cards, inaccessible controls, and runtime errors. Capture representative screenshots when tools permit.

Run lint, type checking, relevant tests, and production build. Record exact commands and outcomes. Mark unavailable live-provider tests as not performed rather than passed.

## 24. Completion and handoff

Work in these milestones: foundation/auth/schema; admin-to-storefront product slice; full catalogue/design; commerce/accounts; admin operations/APIs; AI integration/approvals; verification/documentation.

Maintain checkpoints so work can resume across sessions. Do not treat completion of a milestone as completion of the project.

Deliver the source code, migrations, protected bootstrap, seed, .env.example, Docker/Railway configuration, tests, and these concise documents:

- README.md: setup, commands, architecture, actual dependency versions.
- docs/BUILD_SPEC.md and progress checklist.
- docs/REFERENCE_AUDIT.md with observations and visual evidence where available.
- docs/ADMIN_GUIDE.md.
- docs/DATA_MODEL.md.
- docs/API_GUIDE.md and OpenAPI specification.
- docs/OPERATION_MATRIX.md.
- docs/AI_ADMIN_GUIDE.md covering providers, tools, permissions, approvals, and limits.
- docs/DEPLOYMENT_RAILWAY.md including backup/restore and migration instructions.
- docs/INTEGRATIONS_LATER.md listing required account, credentials, configuration, and activation test for each deferred service.
- docs/TEST_REPORT.md with verified results, limitations, and remaining work.

At handoff, state what works, how to run it and access admin, which tests actually passed, and what must be supplied before live launch. Do not label unfinished code or simulated integrations production-ready.

The primary success condition is: our staff can manage the real catalogue in the password-protected admin, the storefront reflects committed changes, customers can complete the supported shopping flow, and authorized AI/integrations can use the same business operations through controlled APIs.

## Official references to consult during implementation

- [Microless shopping reference](https://uae.microless.com/)
- [Microless category reference](https://uae.microless.com/laptops/gaming/328/l/)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway storage buckets](https://docs.railway.com/storage-buckets)
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security)
- [Better Auth Prisma integration](https://better-auth.com/docs/adapters/prisma)
- [OpenAPI specification](https://spec.openapis.org/oas/v3.1.1.html)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- [OWASP API security](https://api-security.owasp.org/editions/2023/en/0x11-t10/)
- [OWASP AI agent security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [Google product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [W3C accessibility guidance](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [UAE Federal Tax Authority](https://tax.gov.ae/en/)

Start implementing now.