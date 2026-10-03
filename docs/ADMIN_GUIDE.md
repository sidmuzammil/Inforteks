# Administrator guide

Staff sign in at `/admin/login`; customers use `/login` and `/register` for orders, favourites and delivery details. Inforteks is a single-merchant store: there are no seller accounts or public product-listing tools. Create the first Owner using the hidden-password bootstrap in the README. Public registration never grants staff access. Staff modules are shown according to the signed-in user's effective permissions; the server independently checks every operation.

The workspace home provides shortcuts for categories, brands, products, homepage banners, store pages and staff access. Each colleague sees only the modules their assigned role allows.

Google sign-in, when configured, is only for customers. It cannot create, connect or sign into staff accounts. Existing email/password customers connect Google from Profile & security; staff continue using the account created by the Owner. See [Google activation](GOOGLE_SIGN_IN.md) for provider setup.

## Catalogue workflow

1. Open **Products → Create product**. Choose a brand/category or use **Create brand / Create category** directly in the editor, including on an empty store. Category attributes can define required product or SKU specifications.
2. Enter the name, description, real specifications, model, search-engine copy and SKU details. Leave the URL slug blank to generate it from the name. **Feature on homepage** includes the published product in a featured-products section.
3. Enter **Price (AED)** and, optionally, a genuine **Previous price (AED)**. Previous price must be higher; the storefront shows it crossed out beside the current price, with a calculated discount. Blank previous price means no sale. Price entry requires pricing permission. Choose product images in this same form; the first is the cover. Each must be JPEG/PNG/WebP/AVIF, at least 100 × 100 pixels and no more than 4 MB. The server validates and re-encodes actual bytes. A partially failed upload preserves the new draft and resumes remaining files on retry. Existing products also have an upload form with success feedback; new media on a published product needs publication approval.
4. Adjust opening stock through a reasoned proposal. Review the current value and proposed delta, then approve.
5. Preview the draft privately. Request publication and inspect the exact proposal before approving. Missing required specifications, media or SKU prices block publication.

Published product edits, SKU edits, price changes, unpublishing and archiving also require proposals. Approvals expire after 15 minutes and fail if the target changed. Start a new proposal after reviewing the new state. An API key or AI response cannot supply human approval.

## Orders, payments and returns

Orders expose their immutable purchased configuration, quantity, totals and status. Development simulator orders transfer no money and remain pending. Offline payment recording is an explicit staff action with a reason/reference; it is not a card provider integration.

Fulfil only the quantities actually dispatched and provide the carrier/tracking information available. Partial fulfilment is supported. Cancelling an unfulfilled order releases its reservations; cancellation after shipment is rejected. The worker expires unpaid, unfulfilled reservations after 24 hours.

Customers can request returns against eligible fulfilled quantities. Staff review each request, then separately record receipt as damaged or restockable. Restocking requires inventory adjustment permission as well as return permission. A return does not automatically refund money. Refund requests are recorded for review; execution deliberately reports that a provider is not connected.

## Content and operations

Categories, brands, attributes, collections, promotions, content pages and scheduled homepage sections have validated administration forms. Tax/store settings are Owner-controlled JSON forms. Policy seed text and development shipping rates must be replaced with approved business information before selling.

In **Homepage**, the section list follows page position. Open **Edit & preview** for the exact area you want:

- **Hero & side banners:** headline, eyebrow, description, destination/button, background image and decorative footer text; show/hide the two side banners and edit their copy, images and destinations separately.
- **Call to action banner:** editable headline, supporting copy, image, button and decorative text. The old hardcoded workspace CTA is now a normal section.
- **Custom HTML banner:** paste HTML or insert the starter template. Use inline colours/spacing and `/media/…` paths from uploaded images. Scripts, forms, embeds, external URLs and unsafe CSS are stripped by the server. Preview shows the sanitized result.
- **Featured products**, **Discounted products**, **New arrivals** and **Departments:** independent data selections with editable headings, destinations and button labels. Empty product/department sections stay hidden on the public homepage.

Click **Preview this section** to see only that area in a desktop or mobile frame. Previewing does not save or publish; its links and shopping controls are disabled. After editing again, refresh the preview. Upload selected files before saving or previewing. **Save homepage section** saves the current visibility setting; new sections start hidden. Check **Visible on storefront** and save to publish. Optional start/end dates use Dubai time (UTC+4). Lower position numbers appear first. Conflicting edits from another tab require a reload rather than silently overwriting content.

Uploaded banner assets remain private until their attached section is visible and within its schedule, including images inside HTML and hero side banners. Turn off Visible to remove a section. Already-cached public image responses may remain visible for up to five minutes. Upload removal/reordering and general media-library cleanup are separate future work.

CSV import accepts the supplied six-column template: `name,sku,brand,category,price_aed,description`. Use existing brand/category slugs and new SKU codes. The current parser accepts 1–500 simple unquoted rows; embedded commas/newlines, updates to existing SKUs, supplier mapping and stock-import files are unsupported. Preview lists row errors without changing products. A human commits a valid batch and the worker creates all drafts in one transaction. Imports do not publish or allocate stock.

The Jobs screen shows queued, running, completed, failed and blocked work. Missing production providers result in a visible blocked state. Check the recorded outcome before retrying a failed AI task or abandoned external operation. Audit events record sensitive changes and actors. Demo orders are excluded from reported real sales.

## Roles and integration keys

| Role            | Intended access                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Owner           | All scopes; staff, keys and integration settings                                               |
| Manager         | Day-to-day catalogue, inventory, orders, content and reports; restricted access administration |
| Product manager | Product listings, prices and publication; no staff, order or stock management                  |
| Content editor  | Homepage banners, store pages and review moderation                                            |
| Editor          | Product drafts and content; no pricing or stock authority                                      |
| Inventory       | Catalogue visibility and stock adjustments                                                     |
| Support         | Orders, fulfilment, customer support, returns and refund requests                              |
| Analyst         | Reports without financial amounts unless separately granted                                    |

The exact registry is `src/domains/identity.ts`. Create individual staff accounts with strong initial passwords and revoke sessions when needed. In **Staff & access → Manage access**, the Owner can change a named colleague’s role or select **No staff access**. Saving clears custom grants and signs the colleague out on every device. The Owner cannot remove their own access or alter another Owner here. Public customer registrations cannot be promoted through this workflow; create a named staff account. Arbitrary custom-grant editing remains unavailable.

Owners can create named scoped API clients, choose expiry and copy the one-time key. Store it in the integration's secret manager. Revoke compromised keys immediately. Current rotation uses issuance of a replacement client/key followed by revocation; a dedicated overlapping rotation workflow is future work.

## Account security and recovery

Staff and customers can change their password under **Account → Profile & security** using their current password; changing it signs out other devices. Use unique passwords of 12–128 characters. The Owner can also revoke a colleague’s sessions from Staff & access.

Password reset uses an expiring, single-use link and does not reveal whether an email is registered. Real recovery and email verification require the configured email provider. Until sender authorization is complete, recovery clearly reports that email is unavailable; it never claims an email was sent. Microsoft 365 can remain the business mailbox while a verified transactional sender delivers authentication mail.

## Delivery countries and comparison

The header lets visitors choose UAE, Saudi Arabia, Qatar or Oman. Only UAE delivery is supported. The other three show a coming-soon apology, and checkout rejects non-UAE destinations. Customers may permit browser location detection; coordinates stay on their device. A saved delivery emirate takes priority when a signed-in customer has not chosen a location.

Comparison reads the current published catalogue, combining product specifications, SKU options and SKU specifications (SKU values override shared values). Maintain consistent specification names and include units in displayed values. Customers can compare up to four configurations in one department and filter to differences. Missing values are shown explicitly; no performance benchmarks are inferred. Product prices and availability are checked again at checkout.

AI explanations are optional and disconnected until configured. They receive only public catalogue facts, are limited to signed-in customers, and cannot change products or orders. The normal comparison remains usable when AI is unavailable.
