import Link from "next/link";
import { AddressBook } from "@/components/delivery-address";
import { AddressSummary } from "@/components/address-summary";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  ArrowRight,
  CheckCircle,
  ShoppingBag,
  Heart,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ownedOrder } from "@/domains/commerce";
import { money, date } from "@/lib/utils";
import { actorForUser } from "@/domains/identity";
import { Breadcrumbs } from "@/components/store";
import { CataloguePage } from "@/components/catalogue-page";
import { DepartmentIcon } from "@/components/department-icon";
import { QuoteInquiry } from "@/components/quote-inquiry";
import { getProduct } from "@/domains/catalogue";
import { SelectionPage } from "@/components/store-client";
import {
  CartPage,
  MutationForm,
  TrackOrder,
  SignOut,
  PrintButton,
} from "@/components/forms";
import {
  AuthForm,
  AccountSecurity,
  GoogleAccountConnection,
} from "@/components/auth-forms";
import { safeReturnPath } from "@/lib/auth-navigation";
import { emailDeliveryEnabled } from "@/lib/email-policy";
import { googleSignInEnabled, googleSignInError } from "@/lib/google-auth";
import type { Metadata } from "next";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  const privatePage = [
    "account",
    "checkout",
    "cart",
    "order-confirmation",
    "search",
    "login",
    "register",
    "reset-password",
    "forgot-password",
    "track-order",
    "wishlist",
    "compare",
  ].includes(path[0]);
  return {
    title: path[path.length - 1].replaceAll("-", " "),
    robots: privatePage ? { index: false, follow: false } : undefined,
    alternates: privatePage ? undefined : { canonical: `/${path.join("/")}` },
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const [section, slug, id] = path;
  const query = Object.fromEntries(
    Object.entries(await searchParams)
      .filter(([, v]) => typeof v === "string" && v !== "")
      .map(([k, v]) => [k, v as string]),
  );
  const base = `/${path.join("/")}`;
  if (
    [
      "category",
      "brand",
      "collection",
      "search",
      "offers",
      "new-arrivals",
    ].includes(section)
  ) {
    let title = "All products";
    let subtitle = "The right technology for what comes next.";
    const filters = { ...query };
    if (section === "category") {
      const c = await db.category.findFirst({
        where: { slug: path[path.length - 1], visible: true },
      });
      if (!c) notFound();
      title = c.name;
      filters.category = c.slug;
    }
    if (section === "brand") {
      const b = await db.brand.findUnique({ where: { slug } });
      if (!b) notFound();
      title = `Explore ${b.name}`;
      filters.brand = b.slug;
    }
    if (section === "collection") {
      const c = await db.collection.findUnique({ where: { slug } });
      if (!c) notFound();
      title = c.name;
      filters.collection = c.slug;
    }
    if (section === "search") {
      title = query.q ? `Results for “${query.q}”` : "Explore the catalogue";
      subtitle = "Search names, brands, models and SKU codes.";
    }
    if (section === "offers") {
      title = "An upgrade worth exploring.";
      filters.offers = "true";
      subtitle = "Current catalogue savings, clearly priced.";
    }
    if (section === "new-arrivals") {
      title = "New arrivals. New possibilities.";
      filters.sort = query.sort ?? "newest";
    }
    return (
      <CataloguePage
        title={title}
        subtitle={subtitle}
        query={filters}
        base={base}
      />
    );
  }
  if (section === "categories" || section === "brands") {
    const cats =
      section === "categories"
        ? await db.category.findMany({
            where: { visible: true },
            orderBy: { position: "asc" },
          })
        : [];
    const brands =
      section === "brands"
        ? await db.brand.findMany({ orderBy: { name: "asc" } })
        : [];
    return (
      <div className="page-container">
        <Breadcrumbs items={[{ label: section }]} />
        <div className="page-heading">
          <div className="eyebrow">THE WORLD OF INFORTEKS</div>
          <h1>
            {section === "categories"
              ? "Find your kind of tech."
              : "Good company. Great technology."}
          </h1>
          <p>Considered essentials for the way you work, play and create.</p>
        </div>
        <div
          className={`directory-grid ${section === "brands" ? "brand-directory" : ""}`}
        >
          {cats.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="directory-card"
            >
              <DepartmentIcon name={`${c.slug} ${c.name}`} size={46} />
              <div>
                <h2>{c.name}</h2>
                <small>
                  Explore department <ArrowRight size={12} />
                </small>
              </div>
            </Link>
          ))}
          {brands.map((b) => (
            <Link key={b.id} href={`/brand/${b.slug}`}>
              {b.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }
  if (section === "wishlist" || section === "compare")
    return <SelectionPage kind={section} />;
  if (section === "cart" || section === "checkout")
    return <CartPage checkout={section === "checkout"} />;
  if (
    ["login", "register", "forgot-password", "reset-password"].includes(section)
  ) {
    const mode = section as
      | "login"
      | "register"
      | "forgot-password"
      | "reset-password";
    if (
      mode === "login" &&
      (query.next === "/admin" || query.next?.startsWith("/admin/"))
    ) {
      redirect(
        `/admin/login?next=${encodeURIComponent(safeReturnPath(query.next, true))}`,
      );
    }
    const staff =
      query.audience === "staff" && !["login", "register"].includes(mode);
    const loginUrl = staff ? "/admin/login" : "/login";
    const next = safeReturnPath(query.next);
    if (["login", "register"].includes(mode) && (await getSession()))
      redirect(next);
    return (
      <div className="auth-shell">
        <aside className="auth-story">
          <span className="auth-kicker">YOUR INFORTEKS ACCOUNT</span>
          <h1>
            A little less effort.
            <br />A lot more possibility.
          </h1>
          <p>Your orders, favourites and delivery details, in one place.</p>
          <ul className="auth-benefits">
            <li>
              <ShoppingBag />
              <div>
                <b>Follow every order</b>
                <span>View your purchases and order updates.</span>
              </div>
            </li>
            <li>
              <Heart />
              <div>
                <b>Keep your favourites</b>
                <span>Save the tech you’re considering.</span>
              </div>
            </li>
            <li>
              <MapPin />
              <div>
                <b>Keep details handy</b>
                <span>Save your delivery addresses securely.</span>
              </div>
            </li>
          </ul>
          <Link href="/categories">
            Continue shopping <ArrowRight size={15} />
          </Link>
        </aside>
        <section className="auth-card">
          <div className="auth-icon">
            <ShieldCheck size={23} />
          </div>
          <div className="eyebrow">
            {staff ? "STAFF ACCOUNT RECOVERY" : "CUSTOMER ACCOUNT"}
          </div>
          <h2>
            {mode === "login"
              ? "Welcome back."
              : mode === "register"
                ? "Your next chapter starts here."
                : mode === "forgot-password"
                  ? "Forgot your password?"
                  : "Choose a new password."}
          </h2>
          <p>
            {mode === "login"
              ? "Sign in to your account to pick up where you left off."
              : mode === "register"
                ? "Create a customer account for your orders and favourites."
                : mode === "forgot-password"
                  ? "Enter your account email and we’ll help you get back in."
                  : "Choose a unique password you haven’t used elsewhere."}
          </p>
          {mode === "login" && query.verified === "1" && (
            <div className="notice success" role="status">
              Email verified. You can now sign in.
            </div>
          )}
          {mode === "reset-password" && (!query.token || query.error) ? (
            <div className="notice warning">
              This recovery link is missing or expired.{" "}
              <Link href={`/forgot-password${staff ? "?audience=staff" : ""}`}>
                Request a new link.
              </Link>
            </div>
          ) : (
            <AuthForm
              mode={mode}
              token={query.token}
              next={next}
              staff={staff}
              emailEnabled={emailDeliveryEnabled()}
              googleEnabled={googleSignInEnabled()}
              initialError={
                mode === "login" || mode === "register"
                  ? googleSignInError(query.error)
                  : ""
              }
            />
          )}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                New to Inforteks?{" "}
                <Link href={`/register?next=${encodeURIComponent(next)}`}>
                  Create a customer account
                </Link>
              </>
            ) : (
              <Link
                href={
                  mode === "register"
                    ? `/login?next=${encodeURIComponent(next)}`
                    : loginUrl
                }
              >
                Back to sign in
              </Link>
            )}
          </div>
          {mode === "register" && (
            <p className="auth-footnote">
              You can also browse and shop as a guest.
            </p>
          )}
        </section>
      </div>
    );
  }
  if (section === "track-order")
    return (
      <div className="auth-wrap">
        <div className="form-card">
          <h1>Find your order.</h1>
          <p>
            Your order reference and secure access code keep your details
            private.
          </p>
          <TrackOrder />
          <div className="auth-switch">
            <Link href="/account/orders">Or sign in to see your orders</Link>
          </div>
        </div>
      </div>
    );
  if (section === "order-confirmation") {
    const session = await getSession();
    const record = await db.order.findUnique({
      where: { reference: slug },
      select: { id: true },
    });
    if (!record) notFound();
    const token = (await cookies()).get(`ift-order-${record.id}`)?.value;
    const order = await ownedOrder(slug, session?.user.id, token).catch(
      () => null,
    );
    if (!order) notFound();
    return (
      <div className="page-container">
        <div className="page-heading">
          <CheckCircle size={39} color="#168361" />
          <h1 style={{ marginTop: 18 }}>Your order is in.</h1>
          <p>
            Reference <b>{order.reference}</b> · {date(order.createdAt)}
          </p>
        </div>
        {order.demo && (
          <div className="notice warning">
            Development order — no money has been transferred. Payment remains
            pending until a verified payment operation is recorded.
          </div>
        )}
        <div className="checkout-layout">
          <section className="panel">
            <h2>Order details</h2>
            <div className="order-timeline">
              <span>{order.status}</span>
              <span>Payment: {order.paymentStatus}</span>
              <span>{order.fulfillmentStatus}</span>
            </div>
            {order.items.map((i) => (
              <div className="summary-line" key={i.id}>
                <span>
                  {i.quantity} × {(i.snapshot as { name: string }).name}
                </span>
                <b>{money(i.total)}</b>
              </div>
            ))}
            <AddressSummary address={order.address} />
            <PrintButton />
            {token && (
              <details style={{ marginTop: 24 }}>
                <summary>Save your secure guest access code</summary>
                <p className="notice">
                  Keep this code private. It provides access to this order.
                </p>
                <code style={{ overflowWrap: "anywhere" }}>{token}</code>
              </details>
            )}
          </section>
          <aside className="summary-card">
            <h2>Order total</h2>
            {[
              ["Subtotal", order.subtotal],
              ["Discount", -order.discount],
              ["Delivery", order.shipping],
              ["VAT", order.tax],
              ["Total", order.total],
            ].map(([label, value]) => (
              <div
                key={label}
                className={`summary-line ${label === "Total" ? "total" : ""}`}
              >
                <span>{label}</span>
                <b>{money(Number(value))}</b>
              </div>
            ))}
            <Link href="/categories" className="button primary">
              Continue exploring
              <ArrowRight size={15} />
            </Link>
          </aside>
        </div>
      </div>
    );
  }
  if (section === "account") {
    const session = await getSession();
    if (!session) redirect(`/login?next=${encodeURIComponent(base)}`);
    const actor = await actorForUser(session.user.id);
    let content: React.ReactNode;
    if (slug === "orders" && id) {
      const order = await ownedOrder(id, session.user.id).catch(() => null);
      if (!order) notFound();
      content = (
        <>
          <h2>{order.reference}</h2>
          <div className="order-timeline">
            <span>{order.status}</span>
            <span>{order.paymentStatus}</span>
            <span>{order.fulfillmentStatus}</span>
          </div>
          {order.items.map((i) => (
            <div key={i.id} className="summary-line">
              <span>
                {i.quantity} × {(i.snapshot as { name: string }).name}
              </span>
              <b>{money(i.total)}</b>
            </div>
          ))}
          <div className="summary-line total">
            <b>Total</b>
            <b>{money(order.total)}</b>
          </div>
          <AddressSummary address={order.address} />
          <PrintButton />
          {order.items.some((i) => i.fulfilled > i.returned) && (
            <div className="editor-section">
              <h2>Request a return</h2>
              <MutationForm
                endpoint="account/returns"
                label="Submit request"
                fields={[
                  { name: "orderId", label: "Order ID", value: order.id },
                  {
                    name: "itemId",
                    label: "Item",
                    type: "select",
                    options: order.items
                      .filter((i) => i.fulfilled > i.returned)
                      .map((i) => ({
                        value: i.id,
                        label: (i.snapshot as { name: string }).name,
                      })),
                  },
                  {
                    name: "quantity",
                    label: "Quantity",
                    type: "number",
                    value: 1,
                    min: 1,
                  },
                  { name: "reason", label: "Reason", type: "textarea" },
                ]}
                success="Return request saved. A return request does not issue a refund."
              />
            </div>
          )}
        </>
      );
    } else if (slug === "orders") {
      const orders = await db.order.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      content = (
        <>
          <h2>Your orders</h2>
          {orders.length ? (
            <div className="data-table-wrap" style={{ marginTop: 20 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/account/orders/${o.id}`}>
                          {o.reference}
                        </Link>
                      </td>
                      <td>{date(o.createdAt)}</td>
                      <td>
                        <span className="badge">{o.status}</span>
                      </td>
                      <td>{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice">
              Your orders will appear here after checkout.
            </p>
          )}
        </>
      );
    } else if (slug === "profile") {
      const accounts = await db.account.findMany({
        where: { userId: session.user.id },
        select: { providerId: true },
      });
      content = (
        <>
          <h2 style={{ marginBottom: 22 }}>Your profile</h2>
          <p className="notice">Signed in as {session.user.email}</p>
          <MutationForm
            endpoint="account/profile"
            method="PATCH"
            fields={[
              { name: "name", label: "Full name", value: session.user.name },
            ]}
          />
          <AccountSecurity
            email={session.user.email}
            verified={session.user.emailVerified}
            emailEnabled={emailDeliveryEnabled()}
            hasPassword={accounts.some(
              (account) => account.providerId === "credential",
            )}
          />
          {googleSignInEnabled() &&
            actor.role === "CUSTOMER" &&
            actor.scopes.length === 0 && (
              <GoogleAccountConnection
                connected={accounts.some(
                  (account) => account.providerId === "google",
                )}
                error={googleSignInError(query.error)}
              />
            )}
          <div style={{ marginTop: 24 }}>
            <SignOut />
          </div>
        </>
      );
    } else if (slug === "addresses") {
      const addresses = await db.address.findMany({
        where: { userId: session.user.id },
      });
      content = (
        <>
          <h2>Saved addresses</h2>
          <AddressBook addresses={addresses} />
        </>
      );
    } else if (slug === "returns") {
      const returns = await db.returnRequest.findMany({
        where: { order: { userId: session.user.id } },
        include: { order: { select: { reference: true } } },
        take: 50,
      });
      content = (
        <>
          <h2>Return requests</h2>
          {returns.length ? (
            returns.map((r) => (
              <div className="notice" key={r.id}>
                <b>
                  {r.order.reference} · {r.status}
                </b>
                <p>{r.reason}</p>
              </div>
            ))
          ) : (
            <p className="notice">
              No return requests. Open a fulfilled order to request a return.
            </p>
          )}
        </>
      );
    } else
      content = (
        <>
          <h2>Good to see you, {session.user.name.split(" ")[0]}.</h2>
          <p className="notice">
            Manage your orders, delivery addresses and account details here.
          </p>
          {actor.scopes.length > 0 && (
            <Link className="button primary" href="/admin">
              Open staff workspace <ArrowRight size={15} />
            </Link>
          )}
          <div style={{ marginTop: 23 }}>
            <SignOut />
          </div>
        </>
      );
    return (
      <div className="page-container">
        <Breadcrumbs items={[{ label: "My account" }]} />
        <div className="page-heading">
          <h1>Your Inforteks.</h1>
          <p>A little more organized. A lot more you.</p>
        </div>
        <div className="account-grid">
          <nav className="account-menu" aria-label="Account">
            {[
              ["Overview", "/account"],
              ["My orders", "/account/orders"],
              ["Addresses", "/account/addresses"],
              ["Profile & security", "/account/profile"],
              ["Returns", "/account/returns"],
              ["Wishlist", "/wishlist"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={base === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="panel">{content}</div>
        </div>
      </div>
    );
  }
  if (section === "contact") {
    const product = query.product ? await getProduct(query.product) : null;
    const sku =
      product?.skus.find((item) => item.id === query.sku) ??
      (!query.sku ? product?.skus[0] : undefined);
    if (query.product && (!product || !sku)) notFound();
    return (
      <div className="page-container">
        <Breadcrumbs items={[{ label: "Contact us" }]} />
        <div className="page-heading">
          <div className="eyebrow">LET’S TALK TECHNOLOGY</div>
          <h1>{product ? "Let’s prepare your quote." : "How can we help?"}</h1>
          <p>
            {product
              ? "Tell us what you need. Our team will confirm pricing and availability for your requirements."
              : "A product question, a little advice, or an update on your order. Start a conversation."}
          </p>
        </div>
        <div className="checkout-layout">
          <div className="form-card">
            {product && sku ? (
              <QuoteInquiry
                product={{
                  name: product.name,
                  slug: product.slug,
                  skuId: sku.id,
                  code: sku.code,
                  mpn: sku.mpn,
                }}
              />
            ) : (
              <MutationForm
                endpoint="storefront/inquiries"
                fields={[
                  { name: "name", label: "Your name" },
                  { name: "email", label: "Email address", type: "email" },
                  { name: "subject", label: "What’s on your mind?" },
                  { name: "message", label: "Your message", type: "textarea" },
                ]}
                label="Send inquiry"
                success="Your inquiry has been saved for the Inforteks team."
              />
            )}
          </div>
          <div className="panel">
            <h2>Find a quick answer</h2>
            <p style={{ marginTop: 15 }}>
              Our help pages cover orders, delivery and product information.
            </p>
            <div className="account-menu" style={{ marginTop: 22 }}>
              <Link href="/faq">Frequently asked questions</Link>
              <Link href="/shipping-delivery">Shipping & delivery</Link>
              <Link href="/track-order">Track an order</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const page = await db.contentPage.findFirst({
    where: { slug: section, published: true },
  });
  if (!page || path.length > 1) notFound();
  return (
    <div className="page-container">
      <Breadcrumbs items={[{ label: page.title }]} />
      <article className="content-prose">
        <h1>{page.title}</h1>
        <p>{page.body}</p>
      </article>
    </div>
  );
}
