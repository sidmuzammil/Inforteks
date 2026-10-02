import Link from "next/link";
import {
  Package,
  ShoppingBag,
  BarChart3,
  Boxes,
  CheckCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { requestActor } from "@/lib/session";
import { dashboard } from "@/domains/administration";
import { db } from "@/lib/db";
import { money, date } from "@/lib/utils";
export default async function Dashboard() {
  const actor = await requestActor();
  if (!actor.scopes.includes("reports:read"))
    return (
      <div className="panel">
        <h1>Welcome to your workspace.</h1>
        <p className="notice">
          Use the sidebar to open the modules available to your staff role. Your
          permissions are checked for every operation.
        </p>
      </div>
    );
  const [stats, orders] = await Promise.all([
    dashboard(actor),
    actor.scopes.includes("orders:read")
      ? db.order.findMany({
          where: { demo: false },
          take: 6,
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <div className="eyebrow">A CLEAR VIEW OF YOUR BUSINESS</div>
          <h1>Your store, at a glance.</h1>
          <p>What’s happening, what needs attention, and what comes next.</p>
        </div>
        {actor.scopes.includes("catalog:write") && (
          <Link href="/admin/products/new" className="button primary">
            Add product
            <ArrowRight size={15} />
          </Link>
        )}
      </div>
      <div className="metric-grid">
        {[
          {
            label: "Net paid order value",
            value: stats.sales === null ? "Restricted" : money(stats.sales),
            icon: BarChart3,
            caption: "Excludes development orders",
          },
          {
            label: "Live customer orders",
            value: stats.orders,
            icon: ShoppingBag,
            caption: "Real orders, all statuses",
          },
          {
            label: "Catalogue products",
            value: stats.products,
            icon: Package,
            caption: "Across all publication states",
          },
          {
            label: "Low-stock SKUs",
            value: stats.lowStock,
            icon: Boxes,
            caption: "3 or fewer available units",
          },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <m.icon />
            <small>{m.label}</small>
            <b>{m.value}</b>
            <p>{m.caption}</p>
          </div>
        ))}
      </div>
      <div className="admin-columns">
        <section className="panel">
          <div className="panel-title">
            <h2>Recent orders</h2>
            <Link href="/admin/orders">View orders →</Link>
          </div>
          {orders.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders/${o.id}`}>{o.reference}</Link>
                    </td>
                    <td>{date(o.createdAt)}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      <span className="badge">{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              className="empty-state"
              style={{ minHeight: 236, padding: 30 }}
            >
              <ShoppingBag size={32} />
              <h3>Your first chapter starts here.</h3>
              <p>
                Real customer orders will appear here. Development orders are
                excluded from business metrics.
              </p>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Needs your attention</h2>
            <CheckCircle size={17} color="#8da6dd" />
          </div>
          <ul className="checklist">
            <li>
              <Boxes />
              <Link href="/admin/inventory">
                <b>{stats.lowStock} low-stock SKUs</b>
                <small>Review availability and stock levels</small>
              </Link>
            </li>
            <li>
              <CheckCircle />
              <Link href="/admin/proposals">
                <b>{stats.pending} pending approvals</b>
                <small>Exact changes waiting for a human review</small>
              </Link>
            </li>
            <li>
              <Package />
              <Link href="/admin/jobs">
                <b>{stats.failed} failed jobs</b>
                <small>Inspect recorded background-work failures</small>
              </Link>
            </li>
            <li>
              <Sparkles />
              <Link href="/admin/assistant">
                <b>Meet your operations assistant</b>
                <small>Prepare work within your existing permissions</small>
              </Link>
            </li>
          </ul>
        </section>
      </div>
      <div className="notice" style={{ marginTop: 25 }}>
        Your development catalogue is separate from genuine trading activity.
        Connect operational providers and approve your business policies before
        launch.
      </div>
    </>
  );
}
