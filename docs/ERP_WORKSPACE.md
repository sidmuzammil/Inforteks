# ERP workspace

The staff workspace uses an app launcher, a persistent app menu and a short menu for the current app. It follows familiar ERP patterns while keeping Inforteks' Direct Sales and Online Store channels. This is the commerce and CRM workspace; it is not a replacement for a financial accounting or payroll system.

## Find your work

| App        | Daily work                                                                         |
| ---------- | ---------------------------------------------------------------------------------- |
| CRM        | Pipeline, opportunities, salesperson assignment and activities                     |
| Contacts   | Office contacts, website accounts and guest order contacts                         |
| Sales      | All orders, direct orders, online orders, new office orders, returns and inquiries |
| Products   | Products, pricing, images, categories, brands and specifications                   |
| Inventory  | Shared stock and reasoned adjustments                                              |
| Website    | Homepage, banners, pages, promotions and reviews                                   |
| Operations | Reports, exact-change approvals, assistant and jobs                                |
| Settings   | Named staff, access roles, integrations and audit history                          |

The menu only shows apps and actions permitted for the current staff member. **Find a page** searches available administration pages. On a phone, open **Workspace menu** to switch apps. Existing bookmarked administration routes remain supported.

## Contacts for both channels

Open **Contacts** and search by name, company, email or phone. Source filters distinguish:

- **Office contact:** company, named recipient, phone, delivery address, notes and active/archive status. Staff with direct-sales write access can create/edit this record and take an order without creating a customer login. The profile links to the existing office visits/follow-ups workflow.
- **Website account:** an existing customer account, saved delivery addresses and orders tied to its actual user ID. The customer maintains their account; this screen does not change credentials or grant staff access.
- **Guest order contact:** the details recorded on one real online guest order. These records deliberately remain order-specific.

Matching email addresses never merge people, expose another account's orders or grant ownership. Guest contacts are not invented registered customers. Office edits do not rewrite purchased address/item snapshots. Addresses and emails are shown only to permitted staff; session, password, OAuth and guest-token data are never returned by Contacts.

Order history is paginated (25 per page). Online contact access alone does not grant purchase-history access: `orders:read` is also required. An office profile shows direct order history with `direct_sales:read`. The latest 20 CRM opportunities are shown on a contact, explicitly labelled when capped.

## Opportunity to sales order

1. Open a contact and select **New opportunity**, or search for a contact from CRM → **New opportunity**.
2. Enter a descriptive title, estimated value in AED, optional expected closing date, salesperson and notes. The channel comes from the selected contact; staff cannot forge it.
3. Move through **New → Qualified → Proposal** as the conversation progresses. Changes are version checked; a colleague's newer edit cannot be silently overwritten.
4. Open **Schedule an activity** for a call, visit, email follow-up or to-do. Times are explicitly **UAE time** and stored as UTC. Mark tasks done once completed. CRM → **Activities** shows pending work, including overdue tasks and filters for your assigned opportunities.
5. For a Direct Sales opportunity, choose **Create sales order**. The office stays fixed. Select products and quantities, review authoritative stock/prices/tax/delivery, then confirm. The shared transaction creates the order, reserves stock and links the opportunity as **Won**, all together. A network retry does not create a second order.
6. For an existing order in either channel, enter its exact reference under **Link an existing sales order**. It must belong to this contact and channel, must not be cancelled/expired, and cannot already be attributed to another opportunity.

A **Won** opportunity must have a real order. **Lost** requires a reason; reopening is an explicit versioned stage change. Linking or winning does **not** record payment. A linked order may later expire or be cancelled; its current status remains visible on the opportunity and the historical CRM stage is not silently rewritten. Pipeline estimates remain forecasts, including the Won column; paid revenue comes from order/payment reports.

Board columns display at most 12 recent opportunities with full matching stage counts and estimated-value totals. **View all** opens the paginated list. The list displays 25 per page. Activity history is also paginated, with planned activities first.

## Simple order maintenance

Sales order screens retain separate order, payment and fulfilment status. **Prepare shipment** lists product names and remaining quantities; enter the quantity shipping now and use 0 for items left for later. No JSON editing is needed. **Record verified payment** and refund requests accept amounts in AED and convert them to integer fils on submission.

Shipment, payment, cancellation and refund proposals show a readable business summary before approval. Exact stored change details remain available in a disclosure. Current permissions, versions and stock/payment rules are rechecked at approval. Recording a receipt is separate from actually collecting a payment; refund requests do not transfer money.

## Access and persistence

- Owner and Manager receive `crm:read` and `crm:write` through the normal role definitions.
- Sales representatives receive CRM read/write and direct-sales read/write. They can work on **office** opportunities and contacts, but do not gain website customer/order access, payment recording, stock adjustments, fulfilment or store settings.
- Online CRM requires customer access; linked order details additionally require order access. A colleague can only be assigned an opportunity in a channel they can access.
- Contacts remain the existing `BusinessCustomer`, customer `User` and immutable guest `Order` records. There is no duplicate customer ledger or email-based migration.
- `CrmOpportunity` uses relational references and a database check enforcing exactly one contact source. One order can link to at most one opportunity. Database constraints require an order for Won and a reason for Lost.
- `CrmActivity` records creator, due time, completion time and completing actor. Duplicate completion creates only one audit event. New opportunities and activities support actor/payload-bound idempotency keys.
- New CRM writes and stage/order transitions are audited. Existing office visits remain available and are not copied into CRM activities or counted twice.

## Boundaries and research

Official Odoo 19 CRM, Contacts and Activities documentation URLs were requested on 7 October 2026, but the environment's network proxy rejected all three with HTTP 403. No live documentation review is claimed. The design uses established ERP conventions—app navigation, contact records, pipeline/list views, activities, linked orders and explicit permissions—adapted to this application's tested domain rules. It does not reproduce Odoo branding or claim feature parity.

This release does not add invoices, an accounting ledger, tax filing, purchasing, suppliers, custom CRM stages, drag-and-drop stage updates, automated email/SMS reminders, customer identity merging, or a new payment/courier provider. CRM email activities are internal tasks and do not send messages. Those capabilities require separate domain work or provider authorization. Existing launch limitations remain in `RAILWAY_STATUS.md` and `PROGRESS.md`.
