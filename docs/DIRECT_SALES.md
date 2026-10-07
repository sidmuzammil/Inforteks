# Direct Sales and Online Store

Inforteks sells through one business, one product catalogue and one stock balance. The administration separates **how an order arrives** from **how it is paid and fulfilled**.

| Workspace        | Used for                                                                     | Main actions                                                                      |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Direct Sales     | Staff visit an office and take an order, including one laptop or four toners | Office customers, visit history, follow-ups, take an order, direct order tracking |
| Online Store     | Customers browse and order through the website                               | Website orders, customer accounts, homepage and banners                           |
| Shared workspace | Work that supports both channels                                             | Products, prices, stock, fulfilment, returns, reports and staff access            |

## Take an order during an office visit

1. Open **Direct Sales → Take an order**. Search for the office by company, contact, phone or email. An existing office can also start an order from its profile.
2. If needed, use **Add office customer** in the order screen. Save the company, contact person, UAE phone and delivery address. Email is optional. This creates a staff-managed contact, not a website login. Only request a location pin when the customer agrees and you are at the delivery office.
3. Search by product name or SKU. Add the correct variant and quantity. There is no minimum order quantity. Only published, active, priced products can be ordered. Production excludes demonstration products.
4. Optionally enter a valid store coupon and an internal purchase-order/delivery note. Prices come from the catalogue; arbitrary staff price overrides are not implemented.
5. Select **Review order total**. The server recalculates stock, coupon eligibility, configured delivery and tax. Confirm the customer’s items, address and total, then select **Confirm direct order**.
6. The order opens with a reference, the office snapshot, sales channel, staff attribution and payment status **PENDING**. Confirmation reserves stock; it does not charge money, send an email or create a customer account. A manager/support colleague handles the existing fulfilment workflow; recording a verified payment needs its own payment permission and approval.

A direct order can be recorded while public offline checkout is disabled. It is a private, permission-controlled staff workflow. It does not enable card payments or change the storefront payment settings. Existing shipping zones still determine delivery charges; staff cannot promise an unconfigured delivery area.

Reservations for unpaid, unfulfilled orders expire after **24 hours**, matching the existing order policy. Fulfilment or verified payment clears expiry through the existing workflow. There are no credit terms, accounts receivable, split payments or automatic customer reminders in this release.

Network retries with the same request key return the same order. Changed prices, coupon terms, office details or delivery quotes require a new review. Confirming an order locks and checks stock again; another online or direct order cannot oversell the same unit. The same SKU can appear only once per order, with combined quantity (1–99 units per SKU, up to 50 distinct SKUs).

## Visits and repeat business

Open an office profile to edit contact details, see order history or record a visit. Choose an outcome, enter notes and optionally set the next follow-up. Staff-entered follow-up times and displayed visit times use **UAE time (UTC+4)**. Follow-ups are staff tasks, not automatic email/SMS notifications. Mark one complete after handling it.

Archiving an office prevents new orders and visits and removes its outstanding follow-ups from the active list. History remains. Editing a company or delivery address never rewrites a previous order’s purchased-item, company or address snapshot. Concurrent edits require a reload rather than overwriting a colleague’s change.

## Access and navigation

The Owner can create a **Sales representative — offices, visits & direct orders** account under **Business & access → Staff & access**. It grants `direct_sales:read` and `direct_sales:write`. Representatives share the direct-sales office list, visit history and orders. Assignment-based or own-customer-only access is not implemented.

A Sales representative cannot read online orders, modify catalogue prices/stock, record payments, fulfil orders or open store settings. Managers and Owners have the new direct-sales permissions alongside their existing operational permissions. General `orders:read` remains a cross-channel operational permission for authorised support/management staff. Website customers never gain staff access by registering.

Desktop navigation groups shared work into **Products & stock**, **Orders & service**, **Website & marketing**, and **Business & access**. Use **Find a page** to find an allowed administration page. On a phone, open **Workspace menu**. Channel dashboards link to their own orders; **All orders** can filter channel, status, payment and work queue. Search and pagination preserve filters.

## Design rationale and research limits

The user’s Noon Seller Lab reference suggests clearly named operational sections. FBN/FBP are fulfilment-model terminology; they would mislabel Inforteks’s distinction between website orders and staff visits. The design uses the actual sales channels and keeps payment/fulfilment as separate order states.

The existing application was audited for authorisation, inventory reservation, checkout, payments, fulfilment, customer accounts and admin navigation. This release reuses those domain rules instead of creating separate stock balances or duplicate order tables.

Public reference URLs attempted on 7 October 2026:

- [Shopify: creating draft orders](https://help.shopify.com/en/manual/orders/create-orders)
- [Shopify: B2B companies and customers](https://help.shopify.com/en/manual/b2b/companies-and-customers)
- [Shopify: managing orders](https://help.shopify.com/en/manual/orders/manage-orders)
- [Noon partner support](https://support.noon.partners/portal/en/kb)

The environment’s egress proxy returned HTTP 403 for the documentation hosts. Their latest content/screens were not retrieved or independently verified. The implemented decisions are based on the user-confirmed workflow and the repository audit; this is not a claim of a completed live competitor review.

## Data and API contract

Migration `20261007100000_direct_sales` adds `BusinessCustomer`, `SalesVisit`, the `SalesChannel` enum and indexed order channel/customer references. Existing orders default to `ONLINE`. It does not guess which historical orders were taken by staff. No production records are rewritten or seeded.

Orders retain immutable `businessSnapshot`, `salesActorId` and `salesNote`. Internal order notes and operational action forms are excluded from the printable order view. Customer records use optimistic versions; visits and confirmed orders use actor-bound idempotency. Writes and stock/audit entries commit transactionally.

The documented `/admin/direct-sales` endpoints cover office CRUD, visits, follow-ups, product search, quote/review, order creation/listing and overview. `/admin/sales-orders` adds channel/status/payment/work-queue filters. All operations require authenticated staff/API scopes and browser mutation origin checks. Order detail requires either general order-read permission or direct-read permission on a `DIRECT` order. It never returns the guest token hash to staff clients.

See the generated [OpenAPI contract](openapi.json) and [operation matrix](OPERATION_MATRIX.md).
