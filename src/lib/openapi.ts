import {
  businessCustomerInput,
  businessCustomerUpdate,
  visitInput,
  directOrderInput,
  directOrderConfirmation,
} from "@/domains/direct-sales";
import { z } from "zod";
import { productInput } from "@/domains/catalogue";
import { inquiryInput } from "@/domains/inquiries";
import {
  catalogueImportInput,
  catalogueImportCommitInput,
} from "@/lib/catalogue-manifest";
import { addressInput, checkoutInput } from "@/domains/commerce";
import { productMediaInput } from "@/lib/product-media";
import { locationLookupInput } from "@/domains/geocoding";
import {
  opportunityInput,
  opportunityUpdate,
  stageInput,
  activityInput,
  orderLinkInput,
} from "@/domains/crm";
type OperationDoc = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  id: string;
  scope?: string;
  summary: string;
};
export const apiOperations: OperationDoc[] = [
  {
    method: "post",
    path: "/admin/catalogue-imports",
    id: "previewCatalogueImport",
    scope: "catalog:write",
    summary:
      "Preview up to 100 researched quote-only catalogue records. Identifies source/SKU/MPN conflicts, missing photographs and unresolved research. Saves a private 15-minute preview; creates no products.",
  },
  {
    method: "post",
    path: "/admin/catalogue-imports/{id}/commit",
    id: "commitCatalogueImport",
    scope: "catalog:write",
    summary:
      "Human staff session only. Rechecks permissions, exact manifest fingerprint and conflicts; creates additive quote-only drafts without prices or inventory. Identical retries preserve existing products. Upload real media and approve publication separately.",
  },
  {
    method: "get",
    path: "/admin/contacts",
    id: "listContacts",
    summary:
      "Unified contact directory; filters q, kind ALL/office/account/guest and page. direct_sales:read permits offices; customers:read permits website accounts and order-specific guest contacts. Never merges by email.",
  },
  {
    method: "get",
    path: "/admin/contacts/{kind}/{id}",
    id: "getContact",
    summary:
      "Contact details and paginated purchase history. Office access requires direct_sales:read; online contact access requires customers:read and order history additionally requires orders:read. CRM history requires crm:read.",
  },
  {
    method: "get",
    path: "/admin/crm/opportunities",
    id: "listOpportunities",
    scope: "crm:read",
    summary:
      "Channel-scoped pipeline/list. q, channel, stage, mine, view, page. Stage counts and expected-value totals cover all matching records; board cards capped at 12 per stage, list pages at 25. Also requires contact access for each channel.",
  },
  {
    method: "post",
    path: "/admin/crm/opportunities",
    id: "createOpportunity",
    scope: "crm:write",
    summary:
      "Create from an existing permitted contact. Idempotency-Key required; channel derives from contact. Does not create an account or order.",
  },
  {
    method: "get",
    path: "/admin/crm/opportunities/{id}",
    id: "getOpportunity",
    scope: "crm:read",
    summary:
      "Read a permitted opportunity; linked online order details additionally require orders:read.",
  },
  {
    method: "patch",
    path: "/admin/crm/opportunities/{id}",
    id: "updateOpportunity",
    scope: "crm:write",
    summary:
      "Version-checked title, estimate, expected close, salesperson and notes. Contact identity is immutable.",
  },
  {
    method: "patch",
    path: "/admin/crm/opportunities/{id}/stage",
    id: "moveOpportunity",
    scope: "crm:write",
    summary:
      "Version-checked stage change. Lost requires a reason; Won requires a linked active order. Audited.",
  },
  {
    method: "post",
    path: "/admin/crm/opportunities/{id}/order",
    id: "linkOpportunityOrder",
    scope: "crm:write",
    summary:
      "Link an existing order for the same contact and channel, then mark Won. One opportunity per order; version checked. Does not record payment. Online linking additionally requires orders:read.",
  },
  {
    method: "post",
    path: "/admin/crm/opportunities/{id}/activities",
    id: "createCrmActivity",
    scope: "crm:write",
    summary:
      "Schedule an internal activity with UTC dueAt. Idempotency-Key required. No email or notification is sent.",
  },
  {
    method: "get",
    path: "/admin/crm/activities",
    id: "listCrmActivities",
    scope: "crm:read",
    summary:
      "Paginated pending activities; filters channel and mine. Optional opportunity ID returns planned and completed history for that permitted opportunity.",
  },
  {
    method: "patch",
    path: "/admin/crm/activities/{id}",
    id: "completeCrmActivity",
    scope: "crm:write",
    summary:
      "Complete a permitted activity with completed:true. Repeat requests do not duplicate audit events.",
  },
  {
    method: "get",
    path: "/admin/crm/assignees",
    id: "listCrmAssignees",
    scope: "crm:read",
    summary:
      "Names, IDs and eligible sales channels of active CRM colleagues. No credentials or grants returned.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/customers",
    id: "listBusinessCustomers",
    scope: "direct_sales:read",
    summary:
      "Search office customers by company, email, phone or contact; q and page.",
  },
  {
    method: "post",
    path: "/admin/direct-sales/customers",
    id: "createBusinessCustomer",
    scope: "direct_sales:write",
    summary: "Create an office contact without a login or staff access.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/customers/{id}",
    id: "getBusinessCustomer",
    scope: "direct_sales:read",
    summary: "Office profile and latest 30 visits.",
  },
  {
    method: "patch",
    path: "/admin/direct-sales/customers/{id}",
    id: "updateBusinessCustomer",
    scope: "direct_sales:write",
    summary:
      "Version-checked office update; archived contacts cannot take new orders. Purchased snapshots remain unchanged.",
  },
  {
    method: "post",
    path: "/admin/direct-sales/visits/{id}",
    id: "createSalesVisit",
    scope: "direct_sales:write",
    summary:
      "Record a visit for this customer and optional UTC follow-up time. Idempotency-Key required.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/follow-ups",
    id: "listSalesFollowUps",
    scope: "direct_sales:read",
    summary: "Outstanding follow-ups for active offices; paginated.",
  },
  {
    method: "patch",
    path: "/admin/direct-sales/follow-ups/{id}",
    id: "completeSalesFollowUp",
    scope: "direct_sales:write",
    summary: "Mark follow-up complete; body completed: true.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/products",
    id: "searchSalesProducts",
    scope: "direct_sales:write",
    summary:
      "Search published, active priced SKUs. At most 20, excludes private costs.",
  },
  {
    method: "post",
    path: "/admin/direct-sales/quote",
    id: "quoteDirectOrder",
    scope: "direct_sales:write",
    summary:
      "Calculate authoritative stock, catalogue prices, coupon, delivery and tax. No reservation. Returns fingerprint for confirmation.",
  },
  {
    method: "post",
    path: "/admin/direct-sales/orders",
    id: "createDirectOrder",
    scope: "direct_sales:write",
    summary:
      "Confirm a reviewed office order; atomic shared inventory and idempotency. Offline payment remains pending. No public token or login created.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/orders",
    id: "listDirectOrders",
    scope: "direct_sales:read",
    summary:
      "Search direct orders with status, payment, customerId and page filters.",
  },
  {
    method: "get",
    path: "/admin/direct-sales/overview",
    id: "getDirectSalesOverview",
    scope: "direct_sales:read",
    summary:
      "Direct-sales order counts and due follow-ups; paid value requires reports:financial.",
  },
  {
    method: "get",
    path: "/admin/sales-orders",
    id: "listSalesOrders",
    scope: "orders:read",
    summary:
      "Search orders; channel ONLINE, DIRECT or ALL. Direct-only staff may query DIRECT only. q, status, payment, customerId and page.",
  },
  {
    method: "get",
    path: "/storefront/location",
    id: "addressLookupStatus",
    summary:
      "Reports whether optional automatic address lookup is configured. Never exposes a key.",
  },
  {
    method: "post",
    path: "/storefront/location",
    id: "lookupDeliveryAddress",
    summary:
      "Origin-checked, rate-limited reverse geocoding after explicit consent. Returns suggestions only; never saves a location. Requires Google Geocoding configuration.",
  },
  {
    method: "patch",
    path: "/account/addresses/{id}",
    id: "updateDeliveryAddress",
    summary:
      "Replace an owned saved address. Optional GPS pin requires explicit confirmation and device-reported accuracy at most 200m. Existing order snapshots remain unchanged.",
  },
  {
    method: "patch",
    path: "/admin/products/{id}/media",
    id: "updateProductMedia",
    scope: "catalog:write",
    summary:
      "Save the complete ordered image IDs and descriptions with the current product version. Published products additionally require catalog:publish. Never changes image visibility or files; stale versions return 409.",
  },
  {
    method: "post",
    path: "/admin/home-sections/preview",
    id: "previewHomeSection",
    scope: "content:write",
    summary:
      "Validate and sanitize an unsaved homepage section and return only its preview data. Does not publish or save.",
  },
  {
    method: "get",
    path: "/storefront/comparison",
    id: "compareProducts",
    summary:
      "Live public specifications for one to four comma-separated SKU IDs in skus; same visible department only. Unavailable IDs are reported, never replaced.",
  },
  {
    method: "post",
    path: "/storefront/comparison/insights",
    id: "comparisonInsights",
    summary:
      "Authenticated, origin-checked optional AI explanation of current public SKU facts; skuIds and purpose (work, study, gaming, travel). Requires configured AI and explicit enablement; bounded daily limits.",
  },
  {
    method: "post",
    path: "/admin/banner-media",
    id: "uploadBanner",
    scope: "content:write",
    summary:
      "Multipart file and alt; image validation and reencoding, 4 MB maximum. Private until referenced by a visible, active homepage section.",
  },
  {
    method: "patch",
    path: "/admin/staff/{id}",
    id: "updateStaffAccess",
    scope: "staff:manage",
    summary:
      "Owner session only. Change a named staff role or revoke staff access; revokes sessions and records an audit event. Cannot modify an Owner or promote a customer.",
  },
  {
    method: "get",
    path: "/storefront/products",
    id: "listProducts",
    summary:
      "Published catalogue; q, category, brand, ram, storage, min/max AED, availability, sort and page filters.",
  },
  {
    method: "get",
    path: "/storefront/products/{slug}",
    id: "getProduct",
    summary: "Published product with public SKU fields.",
  },
  {
    method: "get",
    path: "/storefront/search",
    id: "searchProducts",
    summary: "Bounded catalogue search and facets.",
  },
  ...["categories", "brands", "collections"].map((r) => ({
    method: "get" as const,
    path: `/storefront/${r}`,
    id: `listStorefront${r}`,
    summary: `Public ${r}.`,
  })),
  {
    method: "get",
    path: "/storefront/carts",
    id: "getCart",
    summary: "Guest cookie cart or the authenticated customer’s restored cart.",
  },
  {
    method: "post",
    path: "/storefront/carts",
    id: "setCartItem",
    summary:
      "Set an exact SKU quantity (default); mode add increments atomically. Zero with mode set removes even unavailable items.",
  },
  {
    method: "post",
    path: "/storefront/carts/quote",
    id: "quoteCart",
    summary: "Server-calculated totals and shipping.",
  },
  {
    method: "post",
    path: "/storefront/checkout",
    id: "createOrder",
    summary:
      "Requires Idempotency-Key. Transactional reservations and immutable snapshots.",
  },
  {
    method: "post",
    path: "/storefront/track-order",
    id: "trackOrder",
    summary: "Requires order reference and secure guest token or ownership.",
  },
  {
    method: "post",
    path: "/storefront/inquiries",
    id: "createInquiry",
    summary:
      "Save a contact or product quote inquiry. Product/SKU references are checked against current public visibility; no order or reservation is created.",
  },
  ...["profile", "addresses", "orders", "returns", "wishlist"].map((r) => ({
    method: "get" as const,
    path: `/account/${r}`,
    id: `getAccount${r}`,
    summary: `Current customer's ${r}; session required.`,
  })),
  ...["addresses", "returns", "wishlist", "reviews"].map((r) => ({
    method: "post" as const,
    path: `/account/${r}`,
    id: `createAccount${r}`,
    summary: `Customer-owned ${r}; session and Origin required.`,
  })),
  {
    method: "patch",
    path: "/account/profile",
    id: "updateProfile",
    summary: "Change own display name.",
  },
  {
    method: "get",
    path: "/storefront/payment-methods",
    id: "getPaymentMethods",
    summary:
      "Enabled payment methods; simulator is never available in production.",
  },
  {
    method: "patch",
    path: "/storefront/carts",
    id: "updateCartItem",
    summary: "Set exact quantity for a SKU; zero removes it.",
  },
  {
    method: "delete",
    path: "/account/wishlist",
    id: "deleteWishlistItem",
    summary: "Remove own saved SKU; body contains skuId.",
  },
  {
    method: "delete",
    path: "/account/addresses/{id}",
    id: "deleteAddress",
    summary: "Delete own address.",
  },
  {
    method: "get",
    path: "/account/orders/{id}",
    id: "getAccountOrder",
    summary: "Read own order by ID or reference.",
  },
  {
    method: "get",
    path: "/admin/dashboard",
    id: "getDashboard",
    scope: "reports:read",
    summary:
      "Operational summary; financial figures additionally require reports:financial.",
  },
  {
    method: "get",
    path: "/admin/integration-status",
    id: "getIntegrationStatus",
    scope: "integrations:manage",
    summary: "Configuration presence, not proof of provider connectivity.",
  },
  {
    method: "get",
    path: "/admin/orders/{id}",
    id: "getAdminOrder",
    scope: "orders:read",
    summary:
      "Order with payments, shipments, returns and refund requests. General orders:read permits both channels; direct_sales:read permits DIRECT orders only. Guest token hashes are omitted.",
  },
  {
    method: "patch",
    path: "/admin/returns/{id}",
    id: "reviewReturn",
    scope: "returns:write",
    summary:
      "Approve or reject a REQUESTED return. Receiving/restocking uses a separate proposal.",
  },
  {
    method: "patch",
    path: "/admin/reviews/{id}",
    id: "moderateReview",
    scope: "content:write",
    summary: "Approve or reject a customer review.",
  },
  {
    method: "patch",
    path: "/admin/inquiries/{id}",
    id: "updateInquiry",
    scope: "customers:read",
    summary: "Mark an inquiry OPEN or RESOLVED.",
  },
  {
    method: "post",
    path: "/admin/refund-requests/{id}/execute",
    id: "executeRefund",
    scope: "refunds:execute",
    summary:
      "Currently returns 503: no refund provider is connected and no money is moved.",
  },
  {
    method: "get",
    path: "/admin/products",
    id: "listAdminProducts",
    scope: "catalog:read",
    summary: "Staff catalogue. Price/cost fields require separate scopes.",
  },
  {
    method: "post",
    path: "/admin/products",
    id: "createProduct",
    scope: "catalog:write",
    summary:
      "Create a draft with store=true for online eligibility or false for Direct Sales only. Supplied prices additionally require pricing:write.",
  },
  {
    method: "get",
    path: "/admin/products/{id}",
    id: "getAdminProduct",
    scope: "catalog:read",
    summary: "Private product editor data with field permissions.",
  },
  {
    method: "patch",
    path: "/admin/products/{id}",
    id: "proposeProductEdit",
    scope: "catalog:write",
    summary: "Stage an exact version-bound edit proposal.",
  },
  ...["publish", "unpublish", "archive"].map((a) => ({
    method: "post" as const,
    path: `/admin/products/{id}/${a}`,
    id: `${a}Product`,
    scope: "catalog:publish",
    summary: "Creates proposal; explicit human approval required.",
  })),
  {
    method: "post",
    path: "/admin/products/{id}/duplicate",
    id: "duplicateProduct",
    scope: "catalog:write",
    summary: "Create an unpriced draft copy.",
  },
  {
    method: "post",
    path: "/admin/media",
    id: "uploadImage",
    scope: "catalog:write",
    summary:
      "Multipart file, productId, alt. Content-checked and reencoded; maximum 4 MB.",
  },
  {
    method: "post",
    path: "/admin/proposals",
    id: "createProposal",
    summary:
      "Permission depends on operation. Body: operation, targetId, payload.",
  },
  {
    method: "post",
    path: "/admin/proposals/{id}/approve",
    id: "approveProposal",
    summary:
      "Human session only. Current operation scope, versions and expiry rechecked.",
  },
  {
    method: "post",
    path: "/admin/proposals/{id}/reject",
    id: "rejectProposal",
    summary: "Initiating human or Owner may reject.",
  },
  ...Object.entries({
    categories: "catalog:write",
    brands: "catalog:write",
    attributes: "catalog:write",
    collections: "catalog:write",
    promotions: "promotions:write",
    content: "content:write",
    "home-sections": "content:write",
  }).flatMap(([r, scope]) => [
    {
      method: "post" as const,
      path: `/admin/${r}`,
      id: `create_${r.replaceAll("-", "_")}`,
      scope,
      summary: "Validated resource creation with audit event.",
    },
    {
      method: "patch" as const,
      path: `/admin/${r}/{id}`,
      id: `update_${r.replaceAll("-", "_")}`,
      scope,
      summary: "Validated resource update with audit event.",
    },
  ]),
  ...Object.entries({
    categories: "catalog:read",
    brands: "catalog:read",
    attributes: "catalog:read",
    collections: "catalog:read",
    inventory: "inventory:read",
    orders: "orders:read",
    returns: "returns:write",
    customers: "customers:read",
    promotions: "promotions:write",
    content: "content:read",
    "home-sections": "content:read",
    media: "catalog:read",
    reviews: "content:write",
    inquiries: "customers:read",
    imports: "catalog:write",
    staff: "staff:manage",
    jobs: "audit:read",
    "audit-events": "audit:read",
    settings: "integrations:manage",
    reports: "reports:read",
    proposals: "ai:use",
  }).map(([r, scope]) => ({
    method: "get" as const,
    path: `/admin/${r}`,
    id: `list_${r.replaceAll("-", "_")}`,
    scope,
    summary: "Permission-filtered list, 30 records per page.",
  })),
  {
    method: "post",
    path: "/admin/api-keys",
    id: "issueApiKey",
    scope: "api_keys:manage",
    summary: "Owner human session; one-time key display, hashed storage.",
  },
  {
    method: "post",
    path: "/admin/api-keys/{id}/revoke",
    id: "revokeApiKey",
    scope: "api_keys:manage",
    summary: "Owner human session; immediate revocation.",
  },
  {
    method: "post",
    path: "/admin/staff",
    id: "createStaff",
    scope: "staff:manage",
    summary: "Owner human session. Named email/password staff account.",
  },
  {
    method: "post",
    path: "/admin/staff/{id}/revoke-sessions",
    id: "revokeStaffSessions",
    scope: "staff:manage",
    summary: "Owner revokes staff sessions.",
  },
  {
    method: "post",
    path: "/admin/imports",
    id: "previewImport",
    scope: "catalog:write",
    summary: "Validate simple CSV and persist preview; no catalogue mutation.",
  },
  {
    method: "post",
    path: "/admin/imports/{id}/commit",
    id: "commitImport",
    scope: "catalog:write",
    summary: "Queue all-or-nothing import. Also requires pricing:write.",
  },
  {
    method: "get",
    path: "/admin/exports",
    id: "exportInventory",
    scope: "reports:read",
    summary: "CSV stock export. Also requires inventory:read.",
  },
  {
    method: "post",
    path: "/admin/ai/runs",
    id: "startAiRun",
    scope: "ai:use",
    summary: "Queue a bounded, permission-controlled provider run.",
  },
  {
    method: "get",
    path: "/admin/ai/runs",
    id: "listAiRuns",
    scope: "ai:use",
    summary: "Initiating staff member's conversations only.",
  },
  {
    method: "post",
    path: "/admin/ai/runs/{id}",
    id: "cancelAiRun",
    scope: "ai:use",
    summary: "Cancel pending work; already completed actions are not undone.",
  },
  {
    method: "patch",
    path: "/admin/settings",
    id: "updateSettings",
    scope: "integrations:manage",
    summary:
      "Owner human configuration. No plaintext provider secrets accepted.",
  },
  {
    method: "get",
    path: "/admin/me/permissions",
    id: "getPermissions",
    summary: "Current identity's effective scopes and role registry.",
  },
];
const requestSchemas: Record<string, unknown> = {
  createInquiry: z.toJSONSchema(inquiryInput),
  previewCatalogueImport: z.toJSONSchema(catalogueImportInput),
  commitCatalogueImport: z.toJSONSchema(catalogueImportCommitInput),
  createOpportunity: z.toJSONSchema(opportunityInput),
  updateOpportunity: z.toJSONSchema(opportunityUpdate),
  moveOpportunity: z.toJSONSchema(stageInput),
  linkOpportunityOrder: z.toJSONSchema(orderLinkInput),
  createCrmActivity: z.toJSONSchema(activityInput),
  completeCrmActivity: z.toJSONSchema(
    z.object({ completed: z.literal(true) }).strict(),
  ),
  updateDeliveryAddress: z.toJSONSchema(addressInput),
  lookupDeliveryAddress: z.toJSONSchema(locationLookupInput),
  updateProductMedia: z.toJSONSchema(productMediaInput),
  createProduct: z.toJSONSchema(productInput),
  createBusinessCustomer: z.toJSONSchema(businessCustomerInput),
  updateBusinessCustomer: z.toJSONSchema(businessCustomerUpdate),
  createSalesVisit: z.toJSONSchema(visitInput),
  quoteDirectOrder: z.toJSONSchema(directOrderInput),
  createDirectOrder: z.toJSONSchema(directOrderConfirmation),
  completeSalesFollowUp: {
    type: "object",
    required: ["completed"],
    additionalProperties: false,
    properties: { completed: { const: true } },
  },
  createOrder: z.toJSONSchema(checkoutInput),
  createAccountaddresses: z.toJSONSchema(addressInput),
  setCartItem: {
    type: "object",
    required: ["skuId", "quantity"],
    additionalProperties: false,
    properties: {
      skuId: { type: "string" },
      quantity: { type: "integer", minimum: 0, maximum: 99 },
      mode: { type: "string", enum: ["set", "add"], default: "set" },
    },
  },
  quoteCart: {
    type: "object",
    required: ["emirate"],
    additionalProperties: false,
    properties: { emirate: { type: "string" }, coupon: { type: "string" } },
  },
  createProposal: {
    type: "object",
    required: ["operation", "targetId", "payload"],
    additionalProperties: false,
    properties: {
      operation: { type: "string" },
      targetId: { type: "string" },
      payload: { type: "object" },
    },
  },
  previewImport: {
    type: "object",
    required: ["csv"],
    additionalProperties: false,
    properties: { csv: { type: "string", maxLength: 1000000 } },
  },
  createAccountwishlist: {
    type: "object",
    required: ["skuId"],
    additionalProperties: false,
    properties: { skuId: { type: "string" } },
  },
  startAiRun: {
    type: "object",
    required: ["prompt"],
    additionalProperties: false,
    properties: { prompt: { type: "string", minLength: 3, maxLength: 5000 } },
  },
  trackOrder: {
    type: "object",
    required: ["reference", "token"],
    additionalProperties: false,
    properties: {
      reference: { type: "string", maxLength: 100 },
      token: { type: "string", maxLength: 100 },
    },
  },
  reviewReturn: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: { status: { type: "string", enum: ["APPROVED", "REJECTED"] } },
  },
  updateInquiry: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: { status: { type: "string", enum: ["OPEN", "RESOLVED"] } },
  },
  updateProfile: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: { name: { type: "string", minLength: 2, maxLength: 100 } },
  },
  uploadImage: {
    type: "object",
    required: ["file", "productId", "alt"],
    properties: {
      file: { type: "string", format: "binary" },
      productId: { type: "string" },
      alt: { type: "string", maxLength: 250 },
    },
  },
};
requestSchemas.updateCartItem = requestSchemas.setCartItem;
requestSchemas.deleteWishlistItem = requestSchemas.createAccountwishlist;
requestSchemas.moderateReview = requestSchemas.reviewReturn;
const paths: Record<string, Record<string, unknown>> = {};
for (const o of apiOperations) {
  const parameters: Record<string, unknown>[] = [
    ...o.path.matchAll(/\{([^}]+)\}/g),
  ].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (
    [
      "createOrder",
      "createDirectOrder",
      "createSalesVisit",
      "createOpportunity",
      "createCrmActivity",
    ].includes(o.id)
  )
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 8, maxLength: 128 },
      description:
        "Reuse exactly for a retried checkout. A changed payload requires a new key.",
    });
  if (
    [
      "listContacts",
      "listOpportunities",
      "listBusinessCustomers",
      "listDirectOrders",
      "listSalesOrders",
      "searchSalesProducts",
    ].includes(o.id)
  )
    parameters.push({
      name: "q",
      in: "query",
      schema: { type: "string", maxLength: 160 },
    });
  if (
    [
      "listContacts",
      "getContact",
      "listOpportunities",
      "listCrmActivities",
      "listBusinessCustomers",
      "listDirectOrders",
      "listSalesOrders",
      "listSalesFollowUps",
    ].includes(o.id)
  )
    parameters.push({
      name: "page",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 1000, default: 1 },
    });
  if (["listDirectOrders", "listSalesOrders"].includes(o.id)) {
    for (const [name, values] of Object.entries({
      status: [
        "ALL",
        "PLACED",
        "PROCESSING",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
      ],
      payment: ["ALL", "PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
      queue: ["ALL", "TO_FULFIL", "PAYMENT_PENDING"],
    }))
      parameters.push({
        name,
        in: "query",
        schema: { type: "string", enum: values, default: "ALL" },
      });
    parameters.push({
      name: "customerId",
      in: "query",
      schema: { type: "string", maxLength: 100 },
    });
  }
  if (o.id === "listContacts")
    parameters.push({
      name: "kind",
      in: "query",
      schema: {
        type: "string",
        enum: ["ALL", "office", "account", "guest"],
        default: "ALL",
      },
    });
  if (["listOpportunities", "listCrmActivities"].includes(o.id)) {
    parameters.push(
      {
        name: "channel",
        in: "query",
        schema: {
          type: "string",
          enum: ["ALL", "DIRECT", "ONLINE"],
          default: "ALL",
        },
      },
      {
        name: "mine",
        in: "query",
        schema: { type: "string", enum: ["yes", "no"], default: "no" },
      },
    );
    if (o.id === "listOpportunities")
      parameters.push(
        {
          name: "stage",
          in: "query",
          schema: {
            type: "string",
            enum: ["ALL", "NEW", "QUALIFIED", "PROPOSAL", "WON", "LOST"],
            default: "ALL",
          },
        },
        {
          name: "view",
          in: "query",
          schema: { type: "string", enum: ["board", "list"], default: "board" },
        },
      );
    else
      parameters.push({
        name: "opportunity",
        in: "query",
        schema: { type: "string", maxLength: 100 },
        description:
          "Show planned and completed activities for one permitted opportunity.",
      });
  }
  if (o.id === "listSalesOrders")
    parameters.push({
      name: "channel",
      in: "query",
      schema: {
        type: "string",
        enum: ["ALL", "ONLINE", "DIRECT"],
        default: "ALL",
      },
    });
  if (o.id === "listProducts" || o.id === "searchProducts")
    for (const key of [
      "q",
      "category",
      "brand",
      "collection",
      "min",
      "max",
      "ram",
      "storage",
      "available",
      "sort",
      "page",
      "limit",
      "offers",
    ])
      parameters.push({ name: key, in: "query", schema: { type: "string" } });
  const sessionOnly =
    o.path.startsWith("/account") ||
    [
      "approveProposal",
      "rejectProposal",
      "createStaff",
      "revokeStaffSessions",
      "issueApiKey",
      "revokeApiKey",
      "commitImport",
      "commitCatalogueImport",
      "startAiRun",
      "updateSettings",
    ].includes(o.id);
  const responses = Object.fromEntries(
    [200, 201, 400, 401, 403, 404, 409, 413, 422, 429, 503].map((code) => [
      code,
      {
        description:
          code < 300
            ? "Successful response"
            : (
                {
                  400: "Invalid request",
                  401: "Authentication required",
                  403: "Permission or origin denied",
                  404: "Record not found",
                  409: "State, version or idempotency conflict",
                  413: "Request too large",
                  422: "Validation failed",
                  429: "Rate limit exceeded",
                  503: "Provider or service unavailable",
                } as Record<number, string>
              )[code],
        content: {
          "application/json": {
            schema: {
              $ref:
                code < 300
                  ? "#/components/schemas/Success"
                  : "#/components/schemas/Error",
            },
          },
        },
      },
    ]),
  );
  paths[o.path] ??= {};
  paths[o.path][o.method] = {
    operationId: o.id,
    summary: o.summary,
    "x-required-scope": o.scope ?? null,
    parameters,
    security: o.path.startsWith("/storefront")
      ? []
      : sessionOnly
        ? [{ sessionAuth: [] }]
        : [{ bearerAuth: [] }, { sessionAuth: [] }],
    ...(requestSchemas[o.id]
      ? {
          requestBody: {
            required: true,
            content: {
              [o.id === "uploadImage"
                ? "multipart/form-data"
                : "application/json"]: { schema: requestSchemas[o.id] },
            },
          },
        }
      : {}),
    responses:
      o.id === "exportInventory"
        ? {
            ...responses,
            200: {
              description: "Spreadsheet-safe CSV inventory export",
              content: { "text/csv": { schema: { type: "string" } } },
            },
          }
        : responses,
  };
}
export const openapi = {
  openapi: "3.1.1",
  info: {
    title: "Inforteks Commerce API",
    version: "1.0.0",
    description:
      "Money uses integer AED fils. Sensitive writes create proposals. Effective permissions are checked in shared services. Cookie-authenticated writes require the exact configured Origin. Resource-specific validation remains authoritative; see API_GUIDE.md for supported workflows and schema coverage.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Scoped integration key; admin routes only",
      },
      sessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description:
          "In HTTPS production Better Auth uses its secure cookie prefix. Use the auth endpoints to establish a session.",
      },
    },
    schemas: {
      Success: { type: "object", properties: { data: {} }, required: ["data"] },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
      },
      Money: {
        type: "integer",
        minimum: 0,
        description: "AED minor units (fils). 100 fils = AED 1.",
      },
    },
  },
};
