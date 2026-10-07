export type AdminLink = {
  href: string;
  label: string;
  scope?: string;
  any?: string[];
};
export type AdminApp = {
  id: string;
  label: string;
  description: string;
  icon: string;
  links: AdminLink[];
  match: string[];
};
export const adminApps: AdminApp[] = [
  {
    id: "direct-sales",
    label: "Direct Sales",
    icon: "direct-sales",
    description: "Office visits, follow-ups and orders taken by your team.",
    match: ["direct-sales"],
    links: [
      {
        href: "/admin/direct-sales",
        label: "Overview",
        scope: "direct_sales:read",
      },
      {
        href: "/admin/direct-sales/orders",
        label: "Direct orders",
        scope: "direct_sales:read",
      },
      {
        href: "/admin/direct-sales/new-order",
        label: "New sales order",
        scope: "direct_sales:write",
      },
      {
        href: "/admin/direct-sales/customers",
        label: "Office customers",
        scope: "direct_sales:read",
      },
      {
        href: "/admin/direct-sales/follow-ups",
        label: "Visits & follow-ups",
        scope: "direct_sales:read",
      },
    ],
  },
  {
    id: "online-store",
    label: "Online Store",
    icon: "online-store",
    description: "Website orders, customers, banners and promotions.",
    match: [
      "online-store",
      "home-sections",
      "content",
      "promotions",
      "reviews",
      "inquiries",
    ],
    links: [
      {
        href: "/admin/online-store",
        label: "Overview",
        any: ["orders:read", "content:read", "customers:read"],
      },
      {
        href: "/admin/online-store/orders",
        label: "Online orders",
        scope: "orders:read",
      },
      {
        href: "/admin/contacts?kind=account",
        label: "Website accounts",
        scope: "customers:read",
      },
      {
        href: "/admin/contacts?kind=guest",
        label: "Guest contacts",
        scope: "customers:read",
      },
      {
        href: "/admin/home-sections",
        label: "Homepage & banners",
        scope: "content:read",
      },
      { href: "/admin/content", label: "Pages", scope: "content:read" },
      {
        href: "/admin/promotions",
        label: "Promotions",
        scope: "promotions:write",
      },
      { href: "/admin/reviews", label: "Reviews", scope: "content:write" },
      { href: "/admin/inquiries", label: "Inquiries", scope: "customers:read" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: "crm",
    description: "Opportunities, pipeline and follow-up activities.",
    match: ["crm"],
    links: [
      { href: "/admin/crm", label: "Pipeline", scope: "crm:read" },
      { href: "/admin/crm/activities", label: "Activities", scope: "crm:read" },
      {
        href: "/admin/direct-sales/follow-ups",
        label: "Office follow-ups",
        scope: "direct_sales:read",
      },
    ],
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: "contacts",
    description: "Your office and online customer directory.",
    match: ["contacts", "customers"],
    links: [
      {
        href: "/admin/contacts",
        label: "All contacts",
        any: ["direct_sales:read", "customers:read"],
      },
      {
        href: "/admin/contacts?kind=office",
        label: "Office contacts",
        scope: "direct_sales:read",
      },
      {
        href: "/admin/contacts?kind=account",
        label: "Website accounts",
        scope: "customers:read",
      },
      {
        href: "/admin/contacts?kind=guest",
        label: "Guest contacts",
        scope: "customers:read",
      },
    ],
  },
  {
    id: "products",
    label: "Products",
    icon: "products",
    description: "Listings, images, pricing and specifications.",
    match: [
      "products",
      "categories",
      "brands",
      "attributes",
      "collections",
      "media",
      "imports",
    ],
    links: [
      { href: "/admin/products", label: "Products", scope: "catalog:read" },
      { href: "/admin/categories", label: "Categories", scope: "catalog:read" },
      { href: "/admin/brands", label: "Brands", scope: "catalog:read" },
      {
        href: "/admin/attributes",
        label: "Specifications",
        scope: "catalog:read",
      },
      {
        href: "/admin/collections",
        label: "Collections",
        scope: "catalog:read",
      },
      { href: "/admin/media", label: "Media library", scope: "catalog:read" },
      {
        href: "/admin/imports",
        label: "Imports & exports",
        scope: "catalog:write",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "inventory",
    description: "Shared stock levels and stock adjustments.",
    match: ["inventory"],
    links: [
      {
        href: "/admin/inventory",
        label: "Stock overview",
        scope: "inventory:read",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "operations",
    description: "All orders, returns, reports and shared approvals.",
    match: ["orders", "returns", "reports", "proposals", "assistant", "jobs"],
    links: [
      { href: "/admin/orders", label: "All orders", scope: "orders:read" },
      { href: "/admin/returns", label: "Returns", scope: "returns:write" },
      { href: "/admin/reports", label: "Reports", scope: "reports:read" },
      { href: "/admin/proposals", label: "Approvals", scope: "ai:use" },
      { href: "/admin/assistant", label: "AI assistant", scope: "ai:use" },
      { href: "/admin/jobs", label: "Background jobs", scope: "audit:read" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    description: "Staff access, integrations and audit history.",
    match: ["staff", "api-access", "api-docs", "settings", "audit-events"],
    links: [
      { href: "/admin/staff", label: "Staff & access", scope: "staff:manage" },
      {
        href: "/admin/settings",
        label: "Store settings",
        scope: "integrations:manage",
      },
      {
        href: "/admin/api-access",
        label: "API access",
        scope: "api_keys:manage",
      },
      {
        href: "/admin/audit-events",
        label: "Audit trail",
        scope: "audit:read",
      },
    ],
  },
];
export function availableAdminApps(scopes: readonly string[]) {
  return adminApps
    .map((app) => ({
      ...app,
      links: app.links.filter((link) =>
        link.scope
          ? scopes.includes(link.scope)
          : link.any?.some((s) => scopes.includes(s)),
      ),
    }))
    .filter(
      (app) =>
        app.links.length && (app.id !== "crm" || scopes.includes("crm:read")),
    );
}
