import Link from "next/link";
import {
  MessageSquare,
  ListChecks,
  Headphones,
  ChevronRight,
  MapPin,
  Box,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DeliveryLocationPicker } from "./delivery-location";
import { HeaderActions, SearchBox, DepartmentMenu } from "./store-client";
export async function Header() {
  const [categories, store, session] = await Promise.all([
    db.category.findMany({
      where: { visible: true },
      orderBy: { position: "asc" },
    }),
    db.setting.findUnique({ where: { key: "store" } }),
    getSession(),
  ]);
  const address = session
    ? await db.address.findFirst({
        where: { userId: session.user.id },
        select: { emirate: true, area: true },
        orderBy: { id: "desc" },
      })
    : null;
  const demo = (store?.value as { demo?: boolean })?.demo;
  return (
    <>
      <div className="utility-bar marketplace-utility">
        <div className="container utility-inner">
          <div className="utility-left">
            <DeliveryLocationPicker
              signedIn={Boolean(session)}
              savedEmirate={address?.emirate}
              savedArea={address?.area ?? undefined}
            />
            <Link className="utility-service" href="/contact">
              <Headphones size={13} aria-hidden="true" /> Product advice
            </Link>
            <Link className="utility-service" href="/track-order">
              <Box size={13} aria-hidden="true" /> Track order
            </Link>
          </div>
          <span className="utility-center">
            {demo
              ? "Development store · Illustrative products & prices"
              : "Your technology. Your requirements."}
          </span>
          <div className="utility-right">
            <Link href="/contact">Help & support</Link>
            <span className="currency-label">AED</span>
            <span className="language-label" lang="en">
              English
            </span>
          </div>
        </div>
      </div>
      <header className="site-header marketplace-header">
        <div className="container header-main">
          <Link href="/" className="brand" aria-label="Inforteks home">
            <img
              src="/brand/inforteks.png"
              width="195"
              height="66"
              alt="inforteks"
            />
          </Link>
          <SearchBox categories={categories.filter((c) => !c.parentId)} />
          <HeaderActions signedIn={Boolean(session)} />
        </div>
        <div className="marketplace-nav-bar">
          <nav className="container main-nav" aria-label="Main navigation">
            <DepartmentMenu categories={categories} />
            <div className="nav-links">
              <Link href="/search">All products</Link>
              {categories
                .filter((c) => !c.parentId)
                .slice(0, 4)
                .map((c) => (
                  <Link key={c.id} href={`/category/${c.slug}`}>
                    {c.name}
                  </Link>
                ))}
              <Link href="/brands">Brands</Link>
              <Link href="/offers" className="offer-link">
                Offers
              </Link>
            </div>
            <Link className="nav-new" href="/new-arrivals">
              New arrivals <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
export { ProductCard, SectionHeading } from "./catalogue-cards";
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
    <div className="benefits marketplace-benefits container">
      <div>
        <Box />
        <span>
          <b>One store. Every essential.</b>
          <small>Technology for work, play & beyond</small>
        </span>
      </div>
      <div>
        <MessageSquare />
        <span>
          <b>A quote for your requirements</b>
          <small>Confirm pricing & availability with our team</small>
        </span>
      </div>
      <div>
        <ListChecks />
        <span>
          <b>Shop with clarity</b>
          <small>Model numbers & specifications that matter</small>
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
    <footer className="footer marketplace-footer">
      <div className="footer-help-strip">
        <div className="container footer-help-inner">
          <div>
            <Headphones size={27} aria-hidden="true" />
            <span>
              <strong>Let’s find the right product.</strong>
              <small>Ask about a model, a quote or an existing order.</small>
            </span>
          </div>
          <Link className="footer-help-link" href="/contact">
            Contact Inforteks <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="container footer-top footer-columns">
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
            Computers, print supplies and everyday technology. Find what you
            need for your next project, workspace or business.
          </p>
          <span className="footer-location">
            <MapPin size={14} />
            United Arab Emirates · AED
          </span>
        </div>
        {[
          {
            title: "Shop Inforteks",
            links: [
              ["All products", "/search"],
              ["Laptops", "/category/laptops"],
              ["Toners & cartridges", "/category/toners-cartridges"],
              ["PC components", "/category/components"],
              ["Monitors", "/category/monitors"],
              ["All departments", "/categories"],
              ["Brands", "/brands"],
            ],
          },
          {
            title: "Customer support",
            links: [
              ["Contact us", "/contact"],
              ["FAQs", "/faq"],
              ["Shipping & delivery", "/shipping-delivery"],
              ["Returns & refunds", "/returns-refunds"],
              ["Warranty", "/warranty"],
            ],
          },
          {
            title: "Your account",
            links: [
              ["My account", "/account"],
              ["My orders", "/account/orders"],
              ["Wishlist", "/wishlist"],
              ["Compare products", "/compare"],
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
