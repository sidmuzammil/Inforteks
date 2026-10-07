import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Globe,
  Plus,
  ShoppingBag,
  Users,
  CalendarCheck,
  PackageCheck,
} from "lucide-react";
import { requireScope, type Actor } from "@/domains/identity";
import {
  getBusinessCustomer,
  listBusinessCustomers,
  listSalesOrders,
  salesFollowUps,
  salesOverview,
  salesQuery,
} from "@/domains/direct-sales";
import {
  DirectOrderBuilder,
  OfficeEditor,
  VisitForm,
} from "./direct-sales-client";
import { ActionButton } from "./admin-client";
import { AddressSummary } from "./address-summary";
import { json, money, date } from "@/lib/utils";
import { type DeliveryAddress } from "@/lib/address";

type Query = Record<string, string>;
const when = (value: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function SalesHeading({
  title,
  description,
  children,
  channel = "DIRECT SALES",
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  channel?: string;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <div className="eyebrow">{channel}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function ChannelCards({ actor }: { actor: Actor }) {
  return (
    <div className="sales-channel-grid">
      {actor.scopes.includes("direct_sales:read") && (
        <Link className="sales-channel-card direct" href="/admin/direct-sales">
          <span className="channel-icon">
            <Building2 />
          </span>
          <div>
            <span className="eyebrow">OFFICE VISITS & STAFF ORDERS</span>
            <h2>Direct Sales</h2>
            <p>
              Office customers, visits, follow-ups and orders taken by your
              team.
            </p>
            <b>
              Open Direct Sales <ArrowRight size={17} />
            </b>
          </div>
        </Link>
      )}
      {actor.scopes.some((s) =>
        ["orders:read", "content:read", "customers:read"].includes(s),
      ) && (
        <Link className="sales-channel-card online" href="/admin/online-store">
          <span className="channel-icon">
            <Globe />
          </span>
          <div>
            <span className="eyebrow">YOUR WEBSITE</span>
            <h2>Online Store</h2>
            <p>Website orders, customer accounts, banners and promotions.</p>
            <b>
              Open Online Store <ArrowRight size={17} />
            </b>
          </div>
        </Link>
      )}
    </div>
  );
}
export function SalesPagination({
  total,
  page,
  query = {},
}: {
  total: number;
  page: number;
  query?: Query;
}) {
  const href = (p: number) =>
    `?${new URLSearchParams({ ...query, page: String(p) })}`;
  return (
    <nav className="pagination" aria-label="Results pages">
      {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
      <span>
        Page {page} · {total} results
      </span>
      {page * 25 < total && <Link href={href(page + 1)}>Next</Link>}
    </nav>
  );
}
export function SalesOrderTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listSalesOrders>>["rows"];
}) {
  return rows.length ? (
    <div className="data-table-wrap">
      <table className="data-table sales-table">
        <thead>
          <tr>
            <th>Order / customer</th>
            <th>Channel</th>
            <th>Date</th>
            <th>Order status</th>
            <th>Payment</th>
            <th>Fulfilment</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/admin/orders/${o.id}`}>{o.reference}</Link>
                <small>
                  {o.channel === "DIRECT"
                    ? (o.businessSnapshot as { company?: string })?.company
                    : o.email}
                  {o.demo ? " · Test order" : ""}
                </small>
              </td>
              <td>
                <span
                  className={`badge ${o.channel === "DIRECT" ? "channel-direct" : ""}`}
                >
                  {o.channel === "DIRECT" ? "Direct Sales" : "Online Store"}
                </span>
              </td>
              <td>{date(o.createdAt)}</td>
              <td>
                <span className="badge">{o.status}</span>
              </td>
              <td>
                <span
                  className={`badge ${o.paymentStatus === "PAID" ? "green" : ""}`}
                >
                  {o.paymentStatus}
                </span>
              </td>
              <td>{o.fulfillmentStatus}</td>
              <td>{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="sales-empty">
      <ShoppingBag size={30} />
      <h3>No orders to show</h3>
      <p>
        New orders will appear here. If you applied filters, try clearing them.
      </p>
    </div>
  );
}
export async function SalesOrdersPage({
  actor,
  query,
  channel = "ALL",
}: {
  actor: Actor;
  query: Query;
  channel?: "ALL" | "ONLINE" | "DIRECT";
}) {
  const parsed = salesQuery.safeParse({
    ...query,
    channel: channel === "ALL" ? (query.channel ?? "ALL") : channel,
  });
  const filters = parsed.success ? parsed.data : salesQuery.parse({ channel });
  const result = await listSalesOrders(actor, filters);
  return (
    <>
      <SalesHeading
        title={
          channel === "ALL"
            ? "All orders"
            : channel === "DIRECT"
              ? "Direct orders"
              : "Online orders"
        }
        description="Track orders, payment and fulfilment separately. Both channels use the same stock."
        channel={
          channel === "ALL"
            ? "SHARED OPERATIONS"
            : channel === "DIRECT"
              ? "DIRECT SALES"
              : "ONLINE STORE"
        }
      >
        {actor.scopes.includes("direct_sales:write") && (
          <Link className="button primary" href="/admin/direct-sales/new-order">
            <Plus size={16} />
            Take an order
          </Link>
        )}
      </SalesHeading>
      <div className="panel">
        <form className="sales-filters">
          <label>
            Find an order
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Reference, email or company"
              maxLength={160}
            />
          </label>
          {channel === "ALL" && (
            <label>
              Sales channel
              <select name="channel" defaultValue={filters.channel}>
                <option value="ALL">All channels</option>
                <option value="DIRECT">Direct Sales</option>
                <option value="ONLINE">Online Store</option>
              </select>
            </label>
          )}
          <label>
            Order status
            <select name="status" defaultValue={filters.status}>
              {[
                "ALL",
                "PLACED",
                "PROCESSING",
                "COMPLETED",
                "CANCELLED",
                "EXPIRED",
              ].map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment
            <select name="payment" defaultValue={filters.payment}>
              {["ALL", "PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s === "ALL" ? "All payments" : s.replaceAll("_", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Work queue
            <select name="queue" defaultValue={filters.queue}>
              <option value="ALL">All orders</option>
              <option value="TO_FULFIL">To fulfil</option>
              <option value="PAYMENT_PENDING">Awaiting payment</option>
            </select>
          </label>
          <button className="button primary">Apply filters</button>
          <Link
            href={
              channel === "ALL"
                ? "/admin/orders"
                : channel === "DIRECT"
                  ? "/admin/direct-sales/orders"
                  : "/admin/online-store/orders"
            }
            className="text-button"
          >
            Clear
          </Link>
        </form>
        <SalesOrderTable rows={result.rows} />
        <SalesPagination
          total={result.total}
          page={result.page}
          query={{
            q: filters.q,
            status: filters.status,
            payment: filters.payment,
            queue: filters.queue,
            ...(channel === "ALL" ? { channel: filters.channel } : {}),
          }}
        />
      </div>
    </>
  );
}
export async function SalesWorkspace({
  actor,
  path,
  query,
}: {
  actor: Actor;
  path: string[];
  query: Query;
}) {
  const [resource, section, id, action] = path;
  const parsedPage = salesQuery.shape.page.safeParse(query.page ?? 1);
  const page = parsedPage.success ? parsedPage.data : 1;
  const direct = resource === "direct-sales";
  if (direct) requireScope(actor, "direct_sales:read");
  else if (
    !actor.scopes.some((s) =>
      ["orders:read", "content:read", "customers:read"].includes(s),
    )
  )
    requireScope(actor, "orders:read");
  if (section === "orders" && !id)
    return (
      <SalesOrdersPage
        actor={actor}
        query={query}
        channel={direct ? "DIRECT" : "ONLINE"}
      />
    );
  if (direct && section === "new-order" && !id) {
    requireScope(actor, "direct_sales:write");
    const customer = query.customer
      ? await getBusinessCustomer(actor, query.customer)
      : undefined;
    return (
      <>
        <SalesHeading
          title="Take an order"
          description="One laptop or a full office order. Select the customer, add products, then confirm."
        />
        <DirectOrderBuilder
          initial={customer?.active ? json(customer) : undefined}
        />
      </>
    );
  }
  if (direct && section === "customers") {
    if (id === "new" && !action) {
      requireScope(actor, "direct_sales:write");
      return (
        <>
          <SalesHeading
            title="Add an office customer"
            description="Keep contact and delivery details ready for repeat orders. No customer login is required."
          />
          <div className="panel sales-editor">
            <OfficeEditor />
          </div>
        </>
      );
    }
    if (id) {
      const customer = await getBusinessCustomer(actor, id);
      if (action === "edit") {
        requireScope(actor, "direct_sales:write");
        return (
          <>
            <SalesHeading
              title={`Edit ${customer.company}`}
              description="Changes apply to future orders. Existing order details stay unchanged."
            />
            <div className="panel sales-editor">
              <OfficeEditor key={customer.version} customer={json(customer)} />
            </div>
          </>
        );
      }
      if (action) notFound();
      const orders = await listSalesOrders(actor, {
        channel: "DIRECT",
        customerId: id,
        page,
      });
      return (
        <>
          <SalesHeading
            title={customer.company}
            description={
              customer.active
                ? "Office customer · Direct Sales"
                : "Archived customer · Existing history is retained"
            }
          >
            {actor.scopes.includes("direct_sales:write") && (
              <div className="inline-form">
                <Link
                  href={`/admin/direct-sales/customers/${id}/edit`}
                  className="button"
                >
                  Edit details
                </Link>
                {customer.active && (
                  <Link
                    className="button primary"
                    href={`/admin/direct-sales/new-order?customer=${id}`}
                  >
                    <Plus size={16} />
                    Take an order
                  </Link>
                )}
              </div>
            )}
          </SalesHeading>
          <div className="admin-columns">
            <section className="panel">
              <h2>Contact & delivery</h2>
              <p>{customer.email || "No email provided"}</p>
              <AddressSummary address={customer.address} />
              {customer.notes && (
                <>
                  <h3>Internal notes</h3>
                  <p className="sales-notes">{customer.notes}</p>
                </>
              )}
            </section>
            <section className="panel">
              <h2>Record a visit</h2>
              {customer.active &&
              actor.scopes.includes("direct_sales:write") ? (
                <VisitForm customerId={id} />
              ) : (
                <p className="notice">
                  Visit recording is unavailable for this customer or staff
                  role.
                </p>
              )}
            </section>
          </div>
          <section className="panel sales-section">
            <div className="panel-title">
              <h2>Order history</h2>
              <span className="form-help">{orders.total} orders</span>
            </div>
            <SalesOrderTable rows={orders.rows} />
            <SalesPagination total={orders.total} page={orders.page} />
          </section>
          <section className="panel sales-section">
            <h2>Recent visits</h2>
            {customer.visits.length ? (
              <ol className="sales-visit-history">
                {customer.visits.map((v) => (
                  <li key={v.id}>
                    <div>
                      <b>{v.outcome.replaceAll("_", " ")}</b>
                      <small>{when(v.createdAt)} UAE</small>
                    </div>
                    <p className="sales-notes">{v.notes}</p>
                    {v.followUpAt && (
                      <p className="form-help">
                        Follow-up: {when(v.followUpAt)} UAE ·{" "}
                        {v.completedAt ? "Completed" : "Open"}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sales-empty">No visits recorded yet.</p>
            )}
            <p className="form-help">Showing the latest 30 visits.</p>
          </section>
        </>
      );
    }
    const result = await listBusinessCustomers(actor, {
      q: (query.q ?? "").slice(0, 160),
      page,
    });
    return (
      <>
        <SalesHeading
          title="Office customers"
          description="The businesses your team visits and sells to. Keep each office’s contact and delivery details in one place."
        >
          {actor.scopes.includes("direct_sales:write") && (
            <Link
              className="button primary"
              href="/admin/direct-sales/customers/new"
            >
              <Plus size={16} />
              Add office customer
            </Link>
          )}
        </SalesHeading>
        <div className="panel">
          <form className="sales-search">
            <label className="sr-only" htmlFor="office-list-search">
              Search office customers
            </label>
            <input
              id="office-list-search"
              name="q"
              defaultValue={query.q}
              maxLength={160}
              placeholder="Company, email, contact or phone"
            />
            <button className="button">Search</button>
          </form>
          {result.rows.length ? (
            <div className="data-table-wrap">
              <table className="data-table sales-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>Orders / visits</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((c) => {
                    const address = c.address as DeliveryAddress;
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/admin/direct-sales/customers/${c.id}`}>
                            {c.company}
                          </Link>
                          <small>{c.email || "No email"}</small>
                        </td>
                        <td>
                          {address.name}
                          <small>{address.phone}</small>
                        </td>
                        <td>
                          {address.area || address.city}
                          <small>{address.emirate}</small>
                        </td>
                        <td>
                          {c._count.orders} orders · {c._count.visits} visits
                        </td>
                        <td>
                          <span className={`badge ${c.active ? "green" : ""}`}>
                            {c.active ? "Active" : "Archived"}
                          </span>
                        </td>
                        <td>
                          <Link href={`/admin/direct-sales/customers/${c.id}`}>
                            Open →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sales-empty">
              <Building2 size={32} />
              <h3>Start with your first office</h3>
              <p>
                Add the company and contact details. Your team can then record a
                visit or take an order immediately.
              </p>
            </div>
          )}
          <SalesPagination
            total={result.total}
            page={result.page}
            query={{ q: query.q ?? "" }}
          />
        </div>
      </>
    );
  }
  if (direct && section === "follow-ups" && !id) {
    const result = await salesFollowUps(actor, page);
    return (
      <>
        <SalesHeading
          title="Follow-ups"
          description="Your team’s open follow-ups, earliest first. Times are shown in UAE time."
        />
        <div className="panel">
          {result.rows.length ? (
            <div className="sales-follow-ups">
              {result.rows.map((v) => (
                <article key={v.id}>
                  <CalendarCheck />
                  <div>
                    <Link
                      href={`/admin/direct-sales/customers/${v.customer.id}`}
                    >
                      <b>{v.customer.company}</b>
                    </Link>
                    <p className="sales-notes">{v.notes}</p>
                    <small>
                      {when(v.followUpAt!)} UAE ·{" "}
                      {v.followUpAt! <= new Date() ? "Due" : "Upcoming"}
                    </small>
                  </div>
                  {actor.scopes.includes("direct_sales:write") && (
                    <ActionButton
                      endpoint={`admin/direct-sales/follow-ups/${v.id}`}
                      method="PATCH"
                      payload={{ completed: true }}
                      label="Mark complete"
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="sales-empty">
              <CalendarCheck size={32} />
              <h3>You’re up to date</h3>
              <p>Add a next follow-up when recording an office visit.</p>
            </div>
          )}
          <SalesPagination total={result.total} page={result.page} />
        </div>
      </>
    );
  }
  if (section) notFound();
  const channel = direct ? "DIRECT" : "ONLINE";
  const canRead = direct || actor.scopes.includes("orders:read");
  const stats = canRead ? await salesOverview(actor, channel) : null;
  const recent = canRead ? await listSalesOrders(actor, { channel }) : null;
  const base = direct ? "/admin/direct-sales" : "/admin/online-store";
  const links = direct
    ? [
        {
          href: `${base}/new-order`,
          title: "Take an order",
          description: "Choose an office, add items and confirm the price.",
          scope: "direct_sales:write",
          icon: ShoppingBag,
        },
        {
          href: `${base}/customers`,
          title: "Office customers",
          description: "Contact details, delivery addresses and repeat orders.",
          scope: "direct_sales:read",
          icon: Users,
        },
        {
          href: `${base}/follow-ups`,
          title: "Visits & follow-ups",
          description: "Record conversations and keep the next visit in view.",
          scope: "direct_sales:read",
          icon: CalendarCheck,
        },
      ]
    : [
        {
          href: `${base}/orders`,
          title: "Online orders",
          description: "Orders placed by customers through your website.",
          scope: "orders:read",
          icon: ShoppingBag,
        },
        {
          href: "/admin/home-sections",
          title: "Homepage & banners",
          description: "Edit, preview and publish each area of your homepage.",
          scope: "content:read",
          icon: Globe,
        },
        {
          href: "/admin/customers",
          title: "Website customers",
          description: "Registered customer accounts and contact information.",
          scope: "customers:read",
          icon: Users,
        },
      ];
  return (
    <>
      <SalesHeading
        title={direct ? "Direct Sales" : "Online Store"}
        channel={
          direct ? "OFFICE VISITS & STAFF ORDERS" : "WEBSITE SALES & EXPERIENCE"
        }
        description={
          direct
            ? "Visit an office. Understand what they need. Take their order on the spot."
            : "Manage the shopping experience and the orders customers place on your website."
        }
      >
        {direct && actor.scopes.includes("direct_sales:write") ? (
          <Link href={`${base}/new-order`} className="button primary">
            <Plus size={16} />
            Take an order
          </Link>
        ) : !direct ? (
          <Link href="/" className="button">
            View storefront <ArrowRight size={16} />
          </Link>
        ) : null}
      </SalesHeading>
      <div className="workspace-actions sales-shortcuts">
        {links
          .filter((l) => actor.scopes.includes(l.scope))
          .map((l) => (
            <Link href={l.href} key={l.href}>
              <l.icon size={22} />
              <b>
                {l.title}
                <ArrowRight size={16} />
              </b>
              <span>{l.description}</span>
            </Link>
          ))}
      </div>
      {stats && (
        <div className="metric-grid">
          {[
            {
              label: "Orders to fulfil",
              value: stats.awaitingFulfilment,
              href: `${base}/orders?queue=TO_FULFIL`,
              icon: PackageCheck,
            },
            {
              label: "Awaiting payment",
              value: stats.pendingPayment,
              href: `${base}/orders?queue=PAYMENT_PENDING`,
              icon: ShoppingBag,
            },
            {
              label: direct ? "Active office customers" : "Website accounts",
              value: stats.customers,
              href: direct ? `${base}/customers` : "/admin/customers",
              icon: Users,
            },
            {
              label: direct ? "Follow-ups due" : "Online orders",
              value: direct ? stats.followUps : stats.orders,
              href: direct ? `${base}/follow-ups` : `${base}/orders`,
              icon: CalendarCheck,
            },
          ].map((m) => (
            <div className="metric-card" key={m.label}>
              <m.icon />
              <small>{m.label}</small>
              <b>{m.value}</b>
              <Link href={m.href}>View details →</Link>
            </div>
          ))}
        </div>
      )}
      {stats?.paid !== null && stats?.paid !== undefined && (
        <p className="sales-financial-note">
          Paid order value: <b>{money(stats.paid)}</b> · {stats.orders} non-test
          orders across all statuses
        </p>
      )}
      {recent && (
        <section className="panel">
          <div className="panel-title">
            <h2>Recent {direct ? "direct" : "online"} orders</h2>
            <Link href={`${base}/orders`}>View all →</Link>
          </div>
          <SalesOrderTable rows={recent.rows.slice(0, 6)} />
        </section>
      )}
      <p className="sales-shared-note">
        Products, prices and available stock are shared across Direct Sales and
        Online Store. Each order keeps its original sales channel.
      </p>
    </>
  );
}
