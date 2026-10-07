"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Globe,
  Package,
  ShoppingBag,
  Settings,
  Menu,
  ChevronDown,
  Search,
  X,
} from "lucide-react";

type NavItem = { slug: string; label: string };
const groups = [
  {
    title: "Products & stock",
    icon: Package,
    slugs: [
      "products",
      "categories",
      "brands",
      "attributes",
      "collections",
      "inventory",
      "media",
      "imports",
    ],
  },
  {
    title: "Orders & service",
    icon: ShoppingBag,
    slugs: ["orders", "returns", "inquiries"],
  },
  {
    title: "Website & marketing",
    icon: Globe,
    slugs: ["home-sections", "content", "promotions", "reviews", "customers"],
  },
  {
    title: "Business & access",
    icon: Settings,
    slugs: [
      "reports",
      "staff",
      "proposals",
      "assistant",
      "api-access",
      "jobs",
      "settings",
      "audit-events",
    ],
  },
];
const labels: Record<string, string> = {
  orders: "All orders",
  customers: "Website customers",
  "home-sections": "Homepage & banners",
  reports: "Business reports",
  settings: "Store settings",
};
export function AdminNav({
  modules,
  direct,
  online,
}: {
  modules: NavItem[];
  direct: boolean;
  online: boolean;
}) {
  const path = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const open = openedAt === path;
  const active = (url: string) =>
    path === url || (url !== "/admin" && path.startsWith(url + "/"));
  const link = (href: string, label: string, icon?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      aria-current={path === href ? "page" : undefined}
      className={active(href) ? "active" : ""}
      onClick={() => {
        setOpenedAt(null);
        setSearch("");
      }}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <div className="admin-navigation">
      <button
        className="admin-menu-button button"
        aria-expanded={open}
        aria-controls="admin-workspace-menu"
        onClick={() => setOpenedAt(open ? null : path)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
        {open ? "Close navigation" : "Workspace menu"}
      </button>
      <nav
        id="admin-workspace-menu"
        aria-label="Admin workspace"
        className={open ? "menu-open" : ""}
      >
        {link("/admin", "Overview", <LayoutDashboard />)}
        <div className="admin-nav-section-label">SALES CHANNELS</div>
        {direct && link("/admin/direct-sales", "Direct Sales", <Building2 />)}
        {direct && path.startsWith("/admin/direct-sales") && (
          <div className="admin-channel-links">
            {link("/admin/direct-sales/new-order", "Take an order")}
            {link("/admin/direct-sales/customers", "Office customers")}
            {link("/admin/direct-sales/orders", "Direct orders")}
            {link("/admin/direct-sales/follow-ups", "Follow-ups")}
          </div>
        )}
        {online && link("/admin/online-store", "Online Store", <Globe />)}
        {online &&
          path.startsWith("/admin/online-store") &&
          modules.some((m) => m.slug === "orders") && (
            <div className="admin-channel-links">
              {link("/admin/online-store/orders", "Online orders")}
            </div>
          )}
        <label className="admin-nav-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="Find an admin page"
            placeholder="Find a page…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="admin-nav-section-label">SHARED WORKSPACE</div>
        {groups.map((group) => {
          const items = group.slugs
            .flatMap((slug) => modules.filter((m) => m.slug === slug))
            .filter((m) =>
              `${m.label} ${labels[m.slug] ?? ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            );
          if (!items.length) return null;
          return (
            <details
              key={`${group.title}-${path}-${Boolean(search)}`}
              className="admin-nav-group"
              open={
                !!search ||
                items.some((m) => active(`/admin/${m.slug}`)) ||
                group.title === "Products & stock"
              }
            >
              <summary>
                <group.icon size={16} />
                {group.title}
                <ChevronDown size={14} />
              </summary>
              <div>
                {items.map((m) =>
                  link(`/admin/${m.slug}`, labels[m.slug] ?? m.label),
                )}
              </div>
            </details>
          );
        })}
        {search &&
          !modules.some((m) =>
            `${m.label} ${labels[m.slug] ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ) && <p className="form-help">No pages match this search.</p>}
      </nav>
    </div>
  );
}
export function AdminBreadcrumb() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  const workspace =
    parts[1] === "direct-sales"
      ? "Direct Sales"
      : parts[1] === "online-store"
        ? "Online Store"
        : "Shared workspace";
  return (
    <div className="admin-breadcrumb">
      <Link href="/admin">Inforteks</Link>
      <span>/</span>
      <span>{parts.length === 1 ? "Overview" : workspace}</span>
    </div>
  );
}
