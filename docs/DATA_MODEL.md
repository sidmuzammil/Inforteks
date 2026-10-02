# Data model

The complete relational definition is [`prisma/schema.prisma`](../prisma/schema.prisma); migrations are authoritative for database constraints.

| Area                 | Records and relationships                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identity             | User, Account, Session and Verification belong to Better Auth; roles/grants determine current staff authority       |
| Catalogue            | Category hierarchy and Attribute definitions; Brand; Product with many Sku and Media records; Collection membership |
| Stock                | Sku physical/reserved counts plus append-only InventoryMovement records                                             |
| Shopping             | Cart/CartItem, WishlistItem and customer-owned Address                                                              |
| Orders               | Order and immutable OrderItem snapshots; Payment, Shipment, ReturnRequest and RefundRequest                         |
| Merchandising        | Coupon, ShippingZone, ContentPage, HomeSection and Setting                                                          |
| Customer operations  | Verified-purchase Review and saved Inquiry                                                                          |
| Integrations         | ApiClient with scoped, expiring ApiKey hashes; raw keys are displayed once                                          |
| Operational controls | Proposal, AuditEvent, Idempotency, Job, ImportBatch and AiRun                                                       |

Money is integer AED fils. Discount allocations use exact integer arithmetic and largest-remainder allocation so line discounts equal the order discount. Tax is configured in basis points and defaults to unregistered/zero in the demo. The code does not assume that the merchant has a UAE tax registration.

Inventory constraints require nonnegative stock and reservations, with reserved stock no greater than physical stock. Checkout reserves; fulfilment consumes; cancellation/expiry releases; accepted returns restock only through an explicit inspected disposition. Order line quantities bound fulfilment and returns. These are transaction invariants, not UI-only checks.

Product and SKU versions prevent stale proposal application. Publication requires prices on active SKUs, media and required category attributes. Draft media remains private until publication. Archived records retain order history instead of cascading away commercial evidence.

Guest cart and order tokens are stored as hashes for lookup. The guest order token is also part of the private idempotency response so a checkout retry can recover the same receipt; database backups must therefore be treated as sensitive. Auth credentials, sessions, customer addresses, job payloads and local recovery mailboxes also require private access and a defined retention policy before launch.

Database snapshots and media form one backup set. Restore into a separate database first, run migrations, verify representative products/orders and uploaded media, then plan any production cutover. A schema migration succeeding is not proof that a backup contains the associated media objects.
