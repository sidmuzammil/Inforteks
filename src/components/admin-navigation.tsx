"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  Target,
  Users,
  ShoppingBag,
  Package,
  Boxes,
  Globe,
  ChartNoAxesCombined,
  Settings,
  Search,
  Menu,
  X,
} from "lucide-react";
import { availableAdminApps, type AdminApp } from "@/lib/admin-apps";
const icons = {
  crm: Target,
  contacts: Users,
  sales: ShoppingBag,
  products: Package,
  inventory: Boxes,
  website: Globe,
  operations: ChartNoAxesCombined,
  settings: Settings,
};
export function AppIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? LayoutGrid;
  return <Icon size={size} />;
}
export function AdminAppTiles({ apps }: { apps: AdminApp[] }) {
  return (
    <div className="erp-app-tiles">
      {apps.map((app) => (
        <Link
          key={app.id}
          href={app.links[0].href}
          className={`erp-app-tile erp-app-${app.id}`}
        >
          <span>
            <AppIcon name={app.icon} size={28} />
          </span>
          <div>
            <h2>{app.label}</h2>
            <p>{app.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function AdminNav({ scopes }: { scopes: string[] }) {
  const path = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const open = openedAt === path;
  const apps = availableAdminApps(scopes);
  const app = apps.find((a) => a.match.includes(path.split("/")[2]));
  const results = apps
    .flatMap((a) => a.links)
    .filter((l) => l.label.toLowerCase().includes(search.toLowerCase()));
  function close() {
    setOpenedAt(null);
    setSearch("");
  }
  return (
    <div className="erp-navigation">
      <div className="erp-navigation-bar">
        <button
          className="erp-mobile-menu button"
          aria-controls="admin-workspace-menu"
          aria-expanded={open}
          onClick={() => setOpenedAt(open ? null : path)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
          {open ? "Close navigation" : "Workspace menu"}
        </button>
        <nav
          aria-label="Admin workspace"
          id="admin-workspace-menu"
          className={`erp-app-nav ${open ? "menu-open" : ""}`}
        >
          <Link
            href="/admin"
            onClick={close}
            aria-label="All apps"
            aria-current={path === "/admin" ? "page" : undefined}
          >
            <LayoutGrid size={20} />
            <span>Apps</span>
          </Link>
          {apps.map((a) => (
            <Link
              key={a.id}
              href={a.links[0].href}
              className={app?.id === a.id ? "active" : ""}
              aria-current={app?.id === a.id ? "page" : undefined}
              onClick={close}
            >
              <AppIcon name={a.icon} size={18} />
              <span>{a.label}</span>
            </Link>
          ))}
          {open && app && (
            <div className="erp-mobile-links">
              {app.links.map((l) => (
                <Link key={l.href} href={l.href} onClick={close}>
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
        <div className="erp-search">
          <label>
            <Search size={16} />
            <input
              type="search"
              aria-label="Find an admin page"
              placeholder="Find a page…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
            />
          </label>
          {search && (
            <nav
              aria-label="Page search results"
              className="erp-search-results"
            >
              {results.length ? (
                results.map((l) => (
                  <Link key={l.href} href={l.href} onClick={close}>
                    {l.label}
                  </Link>
                ))
              ) : (
                <p>No pages match this search.</p>
              )}
            </nav>
          )}
        </div>
      </div>
      {app && (
        <nav className="erp-context-nav" aria-label={`${app.label} navigation`}>
          <b>{app.label}</b>
          {app.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              onClick={close}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
