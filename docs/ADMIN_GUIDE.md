# Administrator guide

Staff sign in at `/admin/login`; customers use `/login` and `/register` for orders, favourites and delivery details. Inforteks is a single-merchant store: there are no seller accounts or public product-listing tools. Create the first Owner using the hidden-password bootstrap in the README. Public registration never grants staff access. Staff modules are shown according to the signed-in user's effective permissions; the server independently checks every operation.

The workspace home provides shortcuts for categories, brands, products, homepage banners, store pages and staff access. Each colleague sees only the modules their assigned role allows.

## Catalogue workflow

1. Create the required brand and category. Add category attributes with product or SKU scope, type and required flags.
2. Create a draft product and its SKU configurations. Enter only verified specifications and warranties. Price entry requires a separate pricing scope.
3. Upload images with descriptive alternative text. The server validates actual bytes and re-encodes images; adding media to a live product stages it for a later publication approval.
4. Adjust opening stock through a reasoned proposal. Review the current value and proposed delta, then approve.
5. Preview the draft privately. Request publication and inspect the exact proposal before approving. Missing required specifications, media or SKU prices block publication.

Published product edits, SKU edits, price changes, unpublishing and archiving also require proposals. Approvals expire after 15 minutes and fail if the target changed. Start a new proposal after reviewing the new state. An API key or AI response cannot supply human approval.

## Orders, payments and returns

Orders expose their immutable purchased configuration, quantity, totals and status. Development simulator orders transfer no money and remain pending. Offline payment recording is an explicit staff action with a reason/reference; it is not a card provider integration.

Fulfil only the quantities actually dispatched and provide the carrier/tracking information available. Partial fulfilment is supported. Cancelling an unfulfilled order releases its reservations; cancellation after shipment is rejected. The worker expires unpaid, unfulfilled reservations after 24 hours.

Customers can request returns against eligible fulfilled quantities. Staff review each request, then separately record receipt as damaged or restockable. Restocking requires inventory adjustment permission as well as return permission. A return does not automatically refund money. Refund requests are recorded for review; execution deliberately reports that a provider is not connected.

## Content and operations

Categories, brands, attributes, collections, promotions, content pages and scheduled homepage sections have validated administration forms. Tax/store settings are Owner-controlled JSON forms. Policy seed text and development shipping rates must be replaced with approved business information before selling.

In **Homepage**, create or open a section. A hero supports a headline, supporting text, destination, button label and an uploaded image. Describe the image, upload it, then save the section. Uploads remain private until attached to a visible hero within its active dates. Turn off Visible to remove it from the homepage; already-cached public image responses may remain visible for up to five minutes. Other section types use the same ordering and visibility controls.

CSV import accepts the supplied six-column template: `name,sku,brand,category,price_aed,description`. Use existing brand/category slugs and new SKU codes. The current parser accepts 1–500 simple unquoted rows; embedded commas/newlines, updates to existing SKUs, supplier mapping and stock-import files are unsupported. Preview lists row errors without changing products. A human commits a valid batch and the worker creates all drafts in one transaction. Imports do not publish or allocate stock.

The Jobs screen shows queued, running, completed, failed and blocked work. Missing production providers result in a visible blocked state. Check the recorded outcome before retrying a failed AI task or abandoned external operation. Audit events record sensitive changes and actors. Demo orders are excluded from reported real sales.

## Roles and integration keys

| Role            | Intended access                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Owner           | All scopes; staff, keys and integration settings                                               |
| Manager         | Day-to-day catalogue, inventory, orders, content and reports; restricted access administration |
| Product manager | Product listings, prices and publication; no staff, order or stock management                  |
| Content editor  | Homepage banners and store pages only                                                          |
| Editor          | Product drafts and content; no pricing or stock authority                                      |
| Inventory       | Catalogue visibility and stock adjustments                                                     |
| Support         | Orders, fulfilment, customer support, returns and refund requests                              |
| Analyst         | Reports without financial amounts unless separately granted                                    |

The exact registry is `src/domains/identity.ts`. Create individual staff accounts with strong initial passwords and revoke sessions when needed. In **Staff & access → Manage access**, the Owner can change a named colleague’s role or select **No staff access**. Saving clears custom grants and signs the colleague out on every device. The Owner cannot remove their own access or alter another Owner here. Public customer registrations cannot be promoted through this workflow; create a named staff account. Arbitrary custom-grant editing remains unavailable.

Owners can create named scoped API clients, choose expiry and copy the one-time key. Store it in the integration's secret manager. Revoke compromised keys immediately. Current rotation uses issuance of a replacement client/key followed by revocation; a dedicated overlapping rotation workflow is future work.

## Account security and recovery

Staff and customers can change their password under **Account → Profile & security** using their current password; changing it signs out other devices. Use unique passwords of 12–128 characters. The Owner can also revoke a colleague’s sessions from Staff & access.

Password reset uses an expiring, single-use link and does not reveal whether an email is registered. Real recovery and email verification require the configured email provider. Until sender authorization is complete, recovery clearly reports that email is unavailable; it never claims an email was sent. Microsoft 365 can remain the business mailbox while a verified transactional sender delivers authentication mail.
