import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { staffPageActor } from "@/lib/session";
import { availableAdminApps } from "@/lib/admin-apps";
import { AdminAppTiles } from "@/components/admin-navigation";
export default async function Workspace() {
  const actor = await staffPageActor();
  const apps = availableAdminApps(actor.scopes);
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <div className="eyebrow">INFORTEKS WORKSPACE</div>
          <h1>Your business. One workspace.</h1>
          <p>
            Choose Direct Sales or Online Store. CRM, Contacts, products and
            stock are shared.
          </p>
        </div>
        {actor.scopes.includes("direct_sales:write") && (
          <Link href="/admin/direct-sales/new-order" className="button primary">
            <Plus size={16} />
            New sales order
          </Link>
        )}
      </div>
      <AdminAppTiles apps={apps} />
      <section className="panel erp-start-guide">
        <h2>A simple daily workflow</h2>
        <div>
          {[
            {
              label: "Find your customer",
              text: "Open Contacts for office and online customer details.",
              href: "/admin/contacts",
              show:
                actor.scopes.includes("direct_sales:read") ||
                actor.scopes.includes("customers:read"),
            },
            {
              label: "Follow up on opportunities",
              text: "Plan the next call or visit in CRM.",
              href: "/admin/crm",
              show: actor.scopes.includes("crm:read"),
            },
            {
              label: "Manage sales orders",
              text: "Check orders, payments and fulfilment separately.",
              href: actor.scopes.includes("orders:read")
                ? "/admin/orders"
                : "/admin/direct-sales/orders",
              show:
                actor.scopes.includes("orders:read") ||
                actor.scopes.includes("direct_sales:read"),
            },
          ]
            .filter((item) => item.show)
            .map((item, i) => (
              <Link href={item.href} key={item.href}>
                <span>{i + 1}</span>
                <div>
                  <b>{item.label}</b>
                  <p>{item.text}</p>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
