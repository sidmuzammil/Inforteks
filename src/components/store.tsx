import Link from "next/link";
import {
  Truck,
  ShieldCheck,
  Headphones,
  ChevronRight,
  MapPin,
  Box,
  ArrowUpRight,
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
        select: { emirate: true },
        orderBy: { id: "desc" },
      })
    : null;
  const demo = (store?.value as { demo?: boolean })?.demo;
  return (
    <>
      <div className="utility-bar">
        <div className="container utility-inner">
          <DeliveryLocationPicker
            signedIn={Boolean(session)}
            savedEmirate={address?.emirate}
          />
          <span className="utility-center">
            {demo
              ? "Development store · Illustrative products & prices"
              : "Technology. Thoughtfully selected."}
          </span>
          <div>
            <Link href="/track-order">Track order</Link>
            <Link href="/contact">Help & support</Link>
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
