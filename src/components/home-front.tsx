import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  ChevronRight,
  ClipboardList,
  GitCompareArrows,
  PackageSearch,
  Sparkles,
  Tags,
} from "lucide-react";
import { DepartmentIcon } from "./department-icon";

type Department = { id: string; name: string; slug: string };

const shortcuts = [
  { href: "/offers", label: "Offers", Icon: BadgePercent },
  { href: "/new-arrivals", label: "New arrivals", Icon: Sparkles },
  { href: "/brands", label: "Brands", Icon: Tags },
  { href: "/compare", label: "Compare", Icon: GitCompareArrows },
];

/**
 * The above-the-fold shopping panel: departments, shortcuts and the quote route
 * stay in view without scrolling. Configured product slides take the middle
 * column; without them it shows a text panel with no artwork, so it never
 * implies product photography.
 */
export function HomeFront({
  categories,
  children,
}: {
  categories: Department[];
  children?: ReactNode;
}) {
  const departments = categories.slice(0, 10);
  return (
    <section className="home-front" aria-label="Discover Inforteks">
      {departments.length > 0 && (
        <nav className="home-front-departments" aria-label="Departments">
          <h2>Departments</h2>
          <ul>
            {departments.map((category) => (
              <li key={category.id}>
                <Link href={`/category/${category.slug}`}>
                  <DepartmentIcon
                    name={`${category.slug} ${category.name}`}
                    size={18}
                  />
                  <span>{category.name}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/categories" className="home-front-all">
            All departments
          </Link>
        </nav>
      )}
      {children ? (
        <div className="home-front-slot">{children}</div>
      ) : (
        <div className="home-front-main">
          <span className="eyebrow">IT products for home and business</span>
          <h1>Everything for your workspace, in one place.</h1>
          <p>
            Shop laptops, monitors, printers, networking and accessories online,
            or ask our team for a business quotation.
          </p>
          <div className="home-front-actions">
            <Link href="/search" className="button primary">
              Shop all products <ArrowUpRight size={17} />
            </Link>
            <Link href="/categories" className="button home-front-outline">
              Browse departments
            </Link>
          </div>
          <ul className="home-front-shortcuts">
            {shortcuts.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link href={href}>
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="home-front-side">
        <Link href="/contact" className="home-front-card quote">
          <ClipboardList size={22} aria-hidden="true" />
          <b>Business and bulk quotes</b>
          <small>Send your list and our team confirms price and stock.</small>
          <span>Request a quote</span>
        </Link>
        <Link href="/track-order" className="home-front-card">
          <PackageSearch size={22} aria-hidden="true" />
          <b>Track an order</b>
          <small>Check the status of your order with its reference.</small>
          <span>Track order</span>
        </Link>
      </div>
    </section>
  );
}
