import Link from "next/link";
import {
  ArrowRight,
  Truck,
  ShieldCheck,
  Headphones,
  ChevronRight,
  MapPin,
  ChevronDown,
  Box,
  ArrowUpRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { money } from "@/lib/utils";
import type { PublicProduct } from "@/domains/catalogue";
import {
  HeaderActions,
  SearchBox,
  DepartmentMenu,
  CardActions,
  WishlistButton,
} from "./store-client";
export async function Header() {
  const [categories, store] = await Promise.all([
    db.category.findMany({
      where: { visible: true },
      orderBy: { position: "asc" },
    }),
    db.setting.findUnique({ where: { key: "store" } }),
  ]);
  const demo = (store?.value as { demo?: boolean })?.demo;
  return (
    <>
      <div className="utility-bar">
        <div className="container utility-inner">
          <span>
            <MapPin size={12} />
            Delivering across the UAE <ChevronDown size={11} />
          </span>
          <span className="utility-center">
            {demo
              ? "Development store · Illustrative products & prices"
              : "Technology. Thoughtfully selected."}
          </span>
          <div>
            <Link href="/track-order">Track order</Link>
            <Link href="/contact">Help & support</Link>
            <span>
              EN <ChevronDown size={10} />
            </span>
            <span>AED</span>
          </div>
        </div>
      </div>
      <header className="site-header">
        <div className="container header-main">
          <Link href="/" className="brand" aria-label="Inforteks home">
            <img
              src="/brand/inforteks.png"
              width="195"
              height="66"
              alt="inforteks"
            />
          </Link>
          <SearchBox />
          <HeaderActions />
        </div>
        <nav className="container main-nav" aria-label="Main navigation">
          <DepartmentMenu categories={categories} />
          <div className="nav-links">
            <Link href="/category/laptops">Laptops</Link>
            <Link href="/category/components">PC components</Link>
            <Link href="/category/monitors">Monitors</Link>
            <Link href="/category/peripherals">Accessories</Link>
            <Link href="/brands">Brands</Link>
            <Link href="/offers" className="offer-link">
              Offers
              <span className="tiny-dot" />
            </Link>
          </div>
          <Link className="nav-new" href="/new-arrivals">
            New arrivals <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
    </>
  );
}
export function ProductCard({ product: p }: { product: PublicProduct }) {
  const s = p.skus[0];
  const sale =
    s?.compareAt && s.compareAt > s.price
      ? Math.round((1 - s.price / s.compareAt) * 100)
      : 0;
  return (
    <article className="product-card">
      <div className="card-image">
        <Link
          href={`/product/${p.slug}${p.skus[0] ? `?sku=${p.skus[0].id}` : ""}`}
          tabIndex={-1}
        >
          <img
            src={p.media[0]?.url ?? "/illustrations/laptop.svg"}
            alt={p.media[0]?.alt ?? p.name}
            width="300"
            height="240"
            loading="lazy"
          />
        </Link>
        {sale > 0 ? (
          <span className="sale-badge">−{sale}%</span>
        ) : p.demo ? (
          <span className="new-badge">EXPLORE</span>
        ) : null}
        <WishlistButton product={p} />
      </div>
      <div className="card-content">
        <div className="card-brand">{p.brand.name}</div>
        <Link
          href={`/product/${p.slug}${p.skus[0] ? `?sku=${p.skus[0].id}` : ""}`}
          className="product-name"
        >
          {p.name}
        </Link>
        <p className="card-spec">
          {p.highlights[0] ?? "Explore product details"}
        </p>
        <div className="card-price">
          {s ? money(s.price) : "Price unavailable"}
        </div>
        <div className="price-secondary">
          {sale > 0 && <del>{money(s.compareAt!)}</del>}
          {s?.available ? (
            <span className="stock-dot">In stock</span>
          ) : (
            <span className="muted">Out of stock</span>
          )}
        </div>
        <CardActions product={p} />
      </div>
    </article>
  );
}
export function SectionHeading({
  title,
  subtitle,
  href,
  label = "View all",
}: {
  title: string;
  subtitle?: string;
  href: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {subtitle && <p className="eyebrow">{subtitle}</p>}
        <h2>{title}</h2>
      </div>
      <Link href={href}>
        {label}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link>
      {items.map((i, n) => (
        <span key={n}>
          <ChevronRight size={12} />
          {i.href ? (
            <Link href={i.href}>{i.label}</Link>
          ) : (
            <span aria-current="page">{i.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
export function Benefits() {
  return (
    <div className="benefits container">
      <div>
        <Box />
        <span>
          <b>One store. Every essential.</b>
          <small>Technology for work, play & beyond</small>
        </span>
      </div>
      <div>
        <Truck />
        <span>
          <b>UAE delivery</b>
          <small>Options calculated at checkout</small>
        </span>
      </div>
      <div>
        <ShieldCheck />
        <span>
          <b>Shop with clarity</b>
          <small>Detailed specifications & clear pricing</small>
        </span>
      </div>
      <div>
        <Headphones />
        <span>
          <b>Here to help</b>
          <small>Talk to us about your next upgrade</small>
        </span>
      </div>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <Link href="/">
            <img
              src="/brand/inforteks.png"
              width="178"
              height="60"
              alt="inforteks"
            />
          </Link>
          <p>
            Technology. Thoughtfully selected.
            <br />
            For the way you work, play and create.
          </p>
          <span className="footer-location">
            <MapPin size={14} />
            United Arab Emirates · AED
          </span>
        </div>
        {[
          {
            title: "Explore",
            links: [
              ["Laptops", "/category/laptops"],
              ["PC components", "/category/components"],
              ["Monitors", "/category/monitors"],
              ["All departments", "/categories"],
              ["Brands", "/brands"],
            ],
          },
          {
            title: "We’re here to help",
            links: [
              ["Contact us", "/contact"],
              ["FAQs", "/faq"],
              ["Shipping & delivery", "/shipping-delivery"],
              ["Returns & refunds", "/returns-refunds"],
              ["Warranty", "/warranty"],
            ],
          },
          {
            title: "Your Inforteks",
            links: [
              ["My account", "/account"],
              ["My orders", "/account/orders"],
              ["Wishlist", "/wishlist"],
              ["Track an order", "/track-order"],
              ["About Inforteks", "/about"],
            ],
          },
        ].map((col) => (
          <div key={col.title}>
            <h3>{col.title}</h3>
            {col.links.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} Inforteks. All rights reserved.
        </span>
        <div>
          <Link href="/privacy-policy">Privacy policy</Link>
          <Link href="/terms-conditions">Terms & conditions</Link>
          <Link href="/payment-methods">Payment methods</Link>
          <Link href="/admin">
            Staff access <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
