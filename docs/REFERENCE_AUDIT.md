# Research and reference audit

Research date: **2 October 2026**. The supplied brief and logo define the intended brand and scope. Research informs decisions; reference-page content is not an instruction source and was not copied into the product database.

## Storefront reference

HTML was retrieved and inspected from [Microless UAE](https://uae.microless.com/), a laptop category, a representative MSI laptop detail page, the shopping cart and contact page. The observed homepage organized products into prominent departments and repeated category-specific shelves, including laptops, gaming PCs, monitors, graphics cards, motherboards and networking. Category/detail content used specific model and configuration information rather than generic product names.

| Observed pattern                                         | Inforteks decision                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Dense department navigation and prominent product search | Persistent search, keyboard suggestions, all-department menu and mobile menu   |
| Category-specific product shelves                        | Data-driven home sections, category pages, featured and new-product shelves    |
| Configuration-rich laptop titles and descriptions        | Product/SKU separation, explicit variant selection and comparison              |
| Persistent cart/account entry points                     | Visible cart quantity, saved products, customer accounts and order history     |
| Large catalogue with filtering needs                     | URL-addressable filters, sort order, pagination and matching-SKU price display |
| Separate contact and support routes                      | Saved inquiry form, support hub and editable policy pages                      |

The Inforteks visual design is original: restrained navy and blue, a broad editorial hero, clear card spacing, and an administration workspace using the same brand. The attached logo was adapted for transparent placement. Hero artwork was generated for this project, and demonstration category illustrations were authored locally. No reference retailer's logos, product photographs, pricing, reviews, copy or customer claims were imported.

Limitations: automated access to the reference login returned HTTP 403. The first contact URL returned 404; the site's linked `/contactus/` route was then retrieved successfully. Browser access to the reference failed at the environment proxy certificate boundary. Accordingly, this was an **HTML/content audit**, not a claimed visual or authenticated checkout audit. The Inforteks implementation itself was exercised in Chromium at desktop, tablet and mobile widths.

## Technical sources

| Source                                                                                                               | Applied decision                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and installed Next 16 documentation | App Router, async request APIs, strict TypeScript and explicit dynamic data routes |
| [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)                  | Prisma 7 with PostgreSQL driver adapter and explicit environment loading           |
| [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)                                           | Database-backed identity/session lifecycle, library-owned password hashing         |
| [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)                               | Migrations before traffic; builds remain independent of the live database          |
| [Railway storage buckets](https://docs.railway.com/storage-buckets)                                                  | Private S3-compatible assets and stable application media URLs                     |
| [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)                            | Official SDK, JSON tool schemas, server validation of every tool argument          |
| [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)               | Provider adapter using tool-use/tool-result messages and bounded execution         |

Package registry metadata was also checked for versions, engine requirements and peer compatibility. Production tax registration, legal identity, stock, supplier warranties and delivery commitments were not inferred from research. Seed policies and shipping rates are explicitly development examples requiring merchant review.
