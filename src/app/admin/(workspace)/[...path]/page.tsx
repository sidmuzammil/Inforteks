import { SalesWorkspace, SalesOrdersPage } from "@/components/sales-workspace";
import { requireOrderRead } from "@/domains/direct-sales";
import { AddressSummary } from "@/components/address-summary";
import { emailDeliveryEnabled } from "@/lib/email-policy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ArrowUpRight, FileText, ShieldCheck } from "lucide-react";
import { staffPageActor } from "@/lib/session";
import { db } from "@/lib/db";
import { modules, adminList, dashboard } from "@/domains/administration";
import {
  roles,
  staffRoleLabels,
  requireScope,
  type Permission,
} from "@/domains/identity";
import { providerStatus } from "@/domains/ai";
import { includeProduct, publicProduct } from "@/domains/catalogue";
import { AppError } from "@/lib/errors";
import { json, money, date } from "@/lib/utils";
import {
  ProductEditor,
  ActionButton,
  ProposalForm,
  ApiKeyForm,
  Assistant,
  ImportForm,
} from "@/components/admin-client";
import { MutationForm, type Field, PrintButton } from "@/components/forms";
import { Gallery } from "@/components/store-client";
import { apiOperations, openapi } from "@/lib/openapi";
import { HomeSectionEditor } from "@/components/home-section-editor";

const writeScope = (resource: string): Permission =>
  ["categories", "brands", "attributes", "collections"].includes(resource)
    ? "catalog:write"
    : resource === "promotions"
      ? "promotions:write"
      : "content:write";
function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <div className="eyebrow">INFORTEKS WORKSPACE</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await staffPageActor();
  const { path } = await params;
  const [resource, id, action] = path;
  const query = await searchParams;
  async function renderPage() {
    if (["direct-sales", "online-store"].includes(resource))
      return await SalesWorkspace({ actor, path, query });
    if (resource === "orders" && !id)
      return await SalesOrdersPage({ actor, query });
    if (resource === "api-docs") {
      requireScope(actor, "api_keys:manage");
      return (
        <>
          <Heading
            title="API reference"
            description="Versioned operations, explicit scopes and consistent business rules."
          />
          <div className="panel">
            <p>
              Authenticate external requests with a scoped bearer key. Browser
              requests use sessions and require an exact Origin on mutations.
              Money is expressed in integer fils.
            </p>
            <pre className="code-block" style={{ marginBlock: 24 }}>
              {
                'curl "$APP_URL/api/v1/admin/products" \\\n  -H "Authorization: Bearer $INFORTEKS_API_KEY"'
              }
            </pre>
            <details>
              <summary>OpenAPI 3.1 document</summary>
              <pre className="code-block">
                {JSON.stringify(openapi, null, 2)}
              </pre>
            </details>
            <div className="data-table-wrap" style={{ marginTop: 24 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Operation</th>
                    <th>Permission</th>
                  </tr>
                </thead>
                <tbody>
                  {apiOperations.map((o) => (
                    <tr key={o.id}>
                      <td>{o.method.toUpperCase()}</td>
                      <td>
                        <code>{o.path}</code>
                      </td>
                      <td>{o.id}</td>
                      <td>{o.scope ?? "Public / owned record"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      );
    }
    const mod = modules.find((m) => m.slug === resource);
    if (!mod) notFound();
    if (
      !(
        resource === "orders" &&
        id &&
        actor.scopes.includes("direct_sales:read")
      )
    )
      requireScope(actor, mod.scope as Permission);
    if (resource === "products" && id) {
      const [categories, brands] = await Promise.all([
        db.category.findMany({ orderBy: { name: "asc" } }),
        db.brand.findMany({ orderBy: { name: "asc" } }),
      ]);
      if (id === "new") {
        requireScope(actor, "catalog:write");
        return (
          <>
            <Heading
              title="Create something worth discovering."
              description="Start with a draft. Bring it to life one detail at a time."
            />
            <ProductEditor
              categories={categories}
              brands={brands}
              scopes={[...actor.scopes]}
            />
          </>
        );
      }
      const p = await db.product.findUnique({
        where: { id },
        include: includeProduct,
      });
      if (!p) notFound();
      if (action === "preview") {
        const safe = publicProduct(p, true);
        return (
          <>
            <Heading
              title="Private storefront preview"
              description="This page is private and is never indexed or publicly cached."
            >
              <Link className="button" href={`/admin/products/${id}`}>
                Back to editor
              </Link>
            </Heading>
            <div className="notice warning">
              Preview only. Draft items cannot be purchased until publication is
              approved.
            </div>
            <div className="product-detail">
              <Gallery product={safe} />
              <div className="product-info">
                <h1>{p.name}</h1>
                <p>{p.description}</p>
                <div className="spec-preview">
                  {safe.skus.map((s) => (
                    <div key={s.id}>
                      <span>{s.code}</span>
                      <b>{money(s.price)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      }
      const safe = {
        ...p,
        skus: p.skus.map((s) => ({
          ...s,
          cost: undefined,
          price: actor.scopes.includes("pricing:read") ? s.price : undefined,
          compareAt: actor.scopes.includes("pricing:read")
            ? s.compareAt
            : undefined,
          onHand: actor.scopes.includes("inventory:read")
            ? s.onHand
            : undefined,
          reserved: actor.scopes.includes("inventory:read")
            ? s.reserved
            : undefined,
        })),
      };
      return (
        <>
          <Heading
            title={p.name}
            description={`Product editor · ${p.status} · Changes are reviewed before applying.`}
          >
            <Link href={`/product/${p.slug}`} className="button">
              View storefront
              <ArrowUpRight size={14} />
            </Link>
          </Heading>
          <ProductEditor
            product={json(safe)}
            categories={categories}
            brands={brands}
            scopes={[...actor.scopes]}
          />
        </>
      );
    }
    if (resource === "proposals" && id) {
      const p = await db.proposal.findUnique({ where: { id } });
      if (!p || (p.actorId !== actor.id && actor.role !== "OWNER")) notFound();
      return (
        <>
          <Heading
            title="Review the exact change."
            description="One concrete preview. One authorized human decision."
          />
          <div className="proposal-card">
            <h3>{p.operation}</h3>
            <p className="form-help">
              Record: {p.targetId} · Version: {p.version} · Status: {p.status} ·
              Expires:{" "}
              {new Intl.DateTimeFormat("en-AE", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Asia/Dubai",
              }).format(p.expiresAt)}
            </p>
            <div className="proposal-diff">
              <div>
                <b>Current record</b>
                <pre>{JSON.stringify(p.before, null, 2)}</pre>
              </div>
              <div>
                <b>Proposed change</b>
                <pre>{JSON.stringify(p.payload, null, 2)}</pre>
              </div>
            </div>
            <p className="notice">
              Approval rechecks current permissions, record version and business
              rules. A changed, expired or already consumed proposal will be
              rejected.
            </p>
            {p.status === "PENDING" && (
              <div className="proposal-actions">
                <ActionButton
                  endpoint={`admin/proposals/${id}/approve`}
                  label="Approve & apply change"
                />
                <ActionButton
                  endpoint={`admin/proposals/${id}/reject`}
                  label="Reject"
                  danger
                />
              </div>
            )}
          </div>
        </>
      );
    }
    if (resource === "inventory" && id) {
      const sku = await db.sku.findUnique({
        where: { id },
        include: {
          product: { select: { name: true } },
          movements: { take: 30, orderBy: { createdAt: "desc" } },
        },
      });
      if (!sku) notFound();
      return (
        <>
          <Heading title={sku.code} description={sku.product.name} />
          <div className="metric-grid">
            {[
              ["On hand", sku.onHand],
              ["Reserved", sku.reserved],
              ["Available", sku.onHand - sku.reserved],
            ].map(([label, value]) => (
              <div className="metric-card" key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          {actor.scopes.includes("inventory:adjust") && (
            <div className="panel">
              <h2 style={{ marginBottom: 20 }}>Prepare stock adjustment</h2>
              <ProposalForm
                operation="inventory.adjust"
                targetId={id}
                fields={[
                  {
                    name: "delta",
                    label: "Adjustment (+ or −)",
                    type: "number",
                    value: 0,
                  },
                  { name: "reason", label: "Reason" },
                ]}
              />
            </div>
          )}
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Movement history</h2>
            {sku.movements.length ? (
              sku.movements.map((m) => (
                <div key={m.id} className="summary-line">
                  <span>
                    {date(m.createdAt)} · {m.reason}
                  </span>
                  <b>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </b>
                </div>
              ))
            ) : (
              <p className="notice">
                No inventory movements have been recorded.
              </p>
            )}
          </div>
        </>
      );
    }
    if (resource === "returns" && id) {
      const r = await db.returnRequest.findUnique({
        where: { id },
        include: { order: { include: { items: true } } },
      });
      if (!r) notFound();
      return (
        <>
          <Heading
            title="Return request"
            description={`${r.order.reference} · ${r.status}`}
          />
          <div className="panel">
            <h2>Inspection & disposition</h2>
            <p className="notice">{r.reason}</p>
            <pre className="code-block">{JSON.stringify(r.items, null, 2)}</pre>
            {r.status === "REQUESTED" && (
              <div className="inline-form" style={{ marginTop: 20 }}>
                <ActionButton
                  endpoint={`admin/returns/${id}`}
                  method="PATCH"
                  payload={{ status: "APPROVED" }}
                  label="Approve request"
                />
                <ActionButton
                  endpoint={`admin/returns/${id}`}
                  method="PATCH"
                  payload={{ status: "REJECTED" }}
                  label="Reject request"
                  danger
                />
              </div>
            )}
            {r.status === "APPROVED" && (
              <div style={{ marginTop: 24 }}>
                <ProposalForm
                  operation="return.receive"
                  targetId={id}
                  label="Review receipt & disposition"
                  fields={[
                    {
                      name: "disposition",
                      label: "Inspection result",
                      type: "select",
                      options: [
                        {
                          value: "DAMAGED",
                          label: "Received — do not restock",
                        },
                        ...(actor.scopes.includes("inventory:adjust")
                          ? [
                              {
                                value: "RESTOCK",
                                label: "Received and inspected — restock",
                              },
                            ]
                          : []),
                      ],
                    },
                  ]}
                />
              </div>
            )}
            <p className="status-note">
              Approving a request does not receive stock or refund money. Stock
              is added only after an approved receipt and restock disposition.
            </p>
          </div>
        </>
      );
    }
    if (resource === "orders" && id) {
      const o = await db.order.findUnique({
        where: { id },
        include: {
          items: true,
          payments: true,
          shipments: true,
          returns: true,
          refunds: true,
        },
      });
      if (!o) notFound();
      requireOrderRead(actor, o.channel);
      return (
        <>
          <Heading
            title={o.reference}
            description={`${date(o.createdAt)} · ${o.channel === "DIRECT" ? "Direct Sales" : "Online Store"} · ${o.email || "Phone contact"}${o.demo ? " · Test order" : ""}`}
          >
            <PrintButton />
          </Heading>
          <Link
            className="text-button sales-back-link"
            href={
              o.channel === "DIRECT"
                ? "/admin/direct-sales/orders"
                : "/admin/online-store/orders"
            }
          >
            ← Back to {o.channel === "DIRECT" ? "direct" : "online"} orders
          </Link>
          <div className="panel">
            {o.channel === "DIRECT" && (
              <div className="sales-order-context">
                <span className="badge channel-direct">Direct Sales</span>
                <h2>
                  {(o.businessSnapshot as { company?: string } | null)?.company}
                </h2>
                {actor.scopes.includes("direct_sales:read") &&
                  o.businessCustomerId && (
                    <Link
                      href={`/admin/direct-sales/customers/${o.businessCustomerId}`}
                    >
                      Office profile →
                    </Link>
                  )}
                {o.salesNote && (
                  <p className="sales-notes sales-internal-note">
                    {o.salesNote}
                  </p>
                )}
                <p className="form-help">
                  Taken by{" "}
                  {(o.businessSnapshot as { takenBy?: string } | null)
                    ?.takenBy ?? "a staff member"}
                  . Payment and fulfilment are tracked separately.
                </p>
              </div>
            )}
            <div className="order-timeline">
              <span>{o.status}</span>
              <span>{o.paymentStatus}</span>
              <span>{o.fulfillmentStatus}</span>
            </div>
            {o.items.map((i) => (
              <div key={i.id} className="summary-line">
                <span>
                  {i.quantity} × {(i.snapshot as { name: string }).name}
                  <small className="muted">
                    {" "}
                    · {i.fulfilled} fulfilled · {i.returned} returned
                  </small>
                </span>
                <b>{money(i.total)}</b>
              </div>
            ))}
            <div className="summary-line">
              <span>Delivery</span>
              <b>{money(o.shipping)}</b>
            </div>
            <div className="summary-line">
              <span>
                VAT
                {(o.termsSnapshot as { taxInclusive?: boolean }).taxInclusive
                  ? " (included)"
                  : ""}
              </span>
              <b>{money(o.tax)}</b>
            </div>
            <div className="summary-line total">
              <b>Order total</b>
              <b>{money(o.total)}</b>
            </div>
            <AddressSummary address={o.address} />
          </div>
          <div
            className="integration-grid admin-order-actions"
            style={{ marginTop: 24 }}
          >
            {actor.scopes.includes("fulfillments:write") &&
              o.status !== "CANCELLED" &&
              o.fulfillmentStatus !== "FULFILLED" && (
                <div className="panel">
                  <h2 style={{ marginBottom: 18 }}>Prepare shipment</h2>
                  <ProposalForm
                    operation="order.fulfil"
                    targetId={id}
                    fields={[
                      {
                        name: "carrier",
                        label: "Carrier / fulfillment method",
                      },
                      {
                        name: "tracking",
                        label: "Tracking reference",
                        required: false,
                      },
                      {
                        name: "items",
                        label: "Item quantities (JSON)",
                        type: "json",
                        value: o.items
                          .filter((i) => i.fulfilled < i.quantity)
                          .map((i) => ({
                            itemId: i.id,
                            quantity: i.quantity - i.fulfilled,
                          })),
                      },
                    ]}
                    label="Review fulfillment"
                  />
                </div>
              )}
            {actor.scopes.includes("orders:cancel") &&
              !["CANCELLED", "COMPLETED"].includes(o.status) && (
                <div className="panel">
                  <h2 style={{ marginBottom: 18 }}>Cancel order</h2>
                  <ProposalForm
                    operation="order.cancel"
                    targetId={id}
                    fields={[{ name: "reason", label: "Cancellation reason" }]}
                    label="Review cancellation"
                  />
                  <p className="status-note">
                    Cancellation releases unshipped stock. It does not issue a
                    refund.
                  </p>
                </div>
              )}
            {actor.scopes.includes("payments:record") &&
              o.paymentMethod === "OFFLINE" &&
              o.paymentStatus === "PENDING" && (
                <div className="panel">
                  <h2 style={{ marginBottom: 18 }}>Record verified payment</h2>
                  <ProposalForm
                    operation="payment.record"
                    targetId={id}
                    fields={[
                      { name: "reference", label: "Bank / receipt reference" },
                      {
                        name: "amount",
                        label: "Received amount (fils)",
                        type: "number",
                        value: o.total,
                      },
                    ]}
                    label="Review payment"
                  />
                </div>
              )}
            {actor.scopes.includes("refunds:request") &&
              o.paymentStatus === "PAID" && (
                <div className="panel">
                  <h2 style={{ marginBottom: 18 }}>Prepare refund request</h2>
                  <ProposalForm
                    operation="refund.request"
                    targetId={id}
                    fields={[
                      {
                        name: "amount",
                        label: "Amount (fils)",
                        type: "number",
                        value: o.total,
                      },
                      { name: "reason", label: "Reason" },
                    ]}
                  />
                  <p className="status-note">
                    Refund execution requires a live provider. Requests do not
                    move money.
                  </p>
                </div>
              )}
          </div>
        </>
      );
    }
    if (resource === "assistant") {
      const status = providerStatus();
      const runs = await db.aiRun.findMany({
        where: { actorId: actor.id },
        take: 20,
        orderBy: { createdAt: "desc" },
      });
      return (
        <>
          <Heading
            title="Your operations assistant."
            description="Useful intelligence, grounded in your catalogue and permissions."
          />
          <div className="panel">
            <Assistant
              connected={
                status.selected === "openai"
                  ? status.openai
                  : status.selected === "anthropic" && status.anthropic
              }
            />
          </div>
          {runs.map((r) => (
            <div key={r.id} className="panel" style={{ marginTop: 20 }}>
              <span className="badge">{r.status}</span>
              <h3 style={{ marginTop: 12 }}>{r.prompt}</h3>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
                {r.result ?? "The worker will process this task."}
              </p>
              {["QUEUED", "RUNNING"].includes(r.status) && (
                <ActionButton
                  label="Cancel pending work"
                  endpoint={`admin/ai/runs/${r.id}`}
                  danger
                />
              )}
            </div>
          ))}
        </>
      );
    }
    if (resource === "settings") {
      const settings = await db.setting.findMany();
      const status = providerStatus();
      return (
        <>
          <Heading
            title="Make Inforteks yours."
            description="Store identity, tax configuration and integration readiness."
          />
          <div className="integration-grid">
            {[
              {
                name: "AI providers",
                status:
                  status.openai || status.anthropic
                    ? "Configured"
                    : "Not connected",
                note: "OpenAI and Anthropic adapters. Models and keys stay on the server.",
              },
              {
                name: "Payments",
                status:
                  process.env.OFFLINE_PAYMENTS_ENABLED === "true"
                    ? "Offline enabled"
                    : "Live provider not connected",
                note: "The development simulator is rejected in production.",
              },
              {
                name: "Storage",
                status: process.env.STORAGE_DRIVER ?? "local",
                note: "Private S3 or Vercel Blob storage for production uploads.",
              },
              {
                name: "Transactional email",
                status: emailDeliveryEnabled()
                  ? "Configured"
                  : "Development mailbox",
                note: "Queued messages are not described as delivered without provider confirmation.",
              },
            ].map((i) => (
              <div key={i.name} className="integration-card">
                <h3>{i.name}</h3>
                <p>{i.note}</p>
                <span className="badge">{i.status}</span>
              </div>
            ))}
          </div>
          {settings.map((s) => (
            <div className="panel" key={s.key} style={{ marginTop: 22 }}>
              <h2 style={{ marginBottom: 20 }}>
                {s.key === "tax" ? "Tax configuration" : "Store identity"}
              </h2>
              <MutationForm
                endpoint="admin/settings"
                method="PATCH"
                fields={[
                  {
                    name: "key",
                    label: "Setting",
                    type: "select",
                    value: s.key,
                    options: [{ label: s.key, value: s.key }],
                  },
                  {
                    name: "value",
                    label: "Configuration (JSON)",
                    type: "json",
                    value: s.value,
                  },
                ]}
              />
            </div>
          ))}
        </>
      );
    }
    if (resource === "api-access") {
      const clients = (await adminList(actor, resource)) as {
        id: string;
        name: string;
        scopes: string[];
        keys: {
          id: string;
          prefix: string;
          expiresAt: Date;
          revokedAt: Date | null;
        }[];
      }[];
      return (
        <>
          <Heading
            title="Connected. On your terms."
            description="Scoped keys for external applications and AI tools."
          >
            <Link href="/admin/api-docs" className="button">
              <FileText size={15} />
              API reference
            </Link>
          </Heading>
          <div className="panel">
            <h2 style={{ marginBottom: 20 }}>Create integration access</h2>
            <ApiKeyForm scopes={[...actor.scopes]} />
          </div>
          {clients.map((c) => (
            <div key={c.id} className="panel" style={{ marginTop: 20 }}>
              <h3>{c.name}</h3>
              <p className="notice">{c.scopes.join(", ")}</p>
              {c.keys.map((k) => (
                <div key={k.id} className="inline-form">
                  <code>{k.prefix}••••••</code>
                  <span className="badge">
                    {k.revokedAt ? "REVOKED" : `Expires ${date(k.expiresAt)}`}
                  </span>
                  {!k.revokedAt && (
                    <ActionButton
                      endpoint={`admin/api-keys/${k.id}/revoke`}
                      label="Revoke key"
                      danger
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      );
    }
    if (resource === "imports")
      return (
        <>
          <Heading
            title="Bring your catalogue together."
            description="Validate first. Review the outcome. Commit intentionally."
          />
          <div className="panel">
            <ImportForm />
          </div>
          <div className="panel" style={{ marginTop: 20 }}>
            <h2>Inventory export</h2>
            <p style={{ marginBlock: 15 }}>
              A current stock snapshot. Requires reporting and inventory read
              permissions.
            </p>
            {actor.scopes.includes("inventory:read") &&
              actor.scopes.includes("reports:read") && (
                <Link
                  className="button"
                  href="/api/v1/admin/exports"
                  prefetch={false}
                >
                  Download inventory CSV
                </Link>
              )}
            <Link href="/admin/jobs" className="text-button">
              View job history →
            </Link>
          </div>
        </>
      );
    if (resource === "reports") {
      const stats = await dashboard(actor);
      return (
        <>
          <Heading
            title="Clarity for your next decision."
            description="Persisted operational metrics; development trading activity is excluded."
          />
          <div className="metric-grid">
            {Object.entries(stats).map(([key, value]) => (
              <div className="metric-card" key={key}>
                <small>{key}</small>
                <b>
                  {key === "sales" && value !== null
                    ? money(value)
                    : (value ?? "Restricted")}
                </b>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Inventory report</h2>
            <p style={{ marginBlock: 18 }}>
              Download the current stock balances for reconciliation.
            </p>
            {actor.scopes.includes("inventory:read") && (
              <Link
                className="button primary"
                href="/api/v1/admin/exports"
                prefetch={false}
              >
                Export inventory CSV
              </Link>
            )}
          </div>
        </>
      );
    }
    const formResources = [
      "categories",
      "brands",
      "attributes",
      "collections",
      "promotions",
      "content",
      "home-sections",
    ];
    if ((id === "new" || id) && formResources.includes(resource)) {
      requireScope(actor, writeScope(resource));
      const rows = (await adminList(actor, resource)) as Record<
        string,
        unknown
      >[];
      const existing =
        id !== "new"
          ? resource === "home-sections"
            ? await db.homeSection.findUnique({ where: { id } })
            : rows.find((r) => r.id === id || r.slug === id)
          : undefined;
      if (id !== "new" && !existing) notFound();
      let fields: Field[] = [];
      if (resource === "categories" || resource === "brands")
        fields = [
          { name: "name", label: "Name" },
          { name: "slug", label: "URL slug" },
          ...(resource === "categories"
            ? [
                { name: "icon", label: "Illustration key", value: "laptop" },
                {
                  name: "position",
                  label: "Position",
                  type: "number",
                  value: 0,
                },
                {
                  name: "visible",
                  label: "Visible",
                  type: "checkbox",
                  value: true,
                },
              ]
            : []),
        ];
      if (resource === "content")
        fields = [
          { name: "slug", label: "Page URL slug" },
          { name: "title", label: "Page title" },
          { name: "body", label: "Page content", type: "textarea" },
          {
            name: "published",
            label: "Publish page",
            type: "checkbox",
            value: false,
          },
        ];
      if (resource === "collections")
        fields = [
          { name: "name", label: "Collection name" },
          { name: "slug", label: "URL slug" },
          {
            name: "productIds",
            label: "Product IDs (JSON array)",
            type: "json",
            value: [],
          },
        ];
      if (resource === "attributes") {
        const categories = await db.category.findMany();
        fields = [
          {
            name: "categoryId",
            label: "Category",
            type: "select",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          { name: "key", label: "Stable key (e.g. ram)" },
          { name: "label", label: "Display label" },
          {
            name: "type",
            label: "Value type",
            type: "select",
            options: [
              { value: "text", label: "Text" },
              { value: "number", label: "Number" },
            ],
          },
          { name: "unit", label: "Unit", required: false },
          {
            name: "scope",
            label: "Applies to",
            type: "select",
            options: [
              { value: "sku", label: "SKU" },
              { value: "product", label: "Product" },
            ],
          },
          {
            name: "required",
            label: "Required for publication",
            type: "checkbox",
          },
          {
            name: "filterable",
            label: "Filterable",
            type: "checkbox",
            value: true,
          },
          {
            name: "comparable",
            label: "Comparable",
            type: "checkbox",
            value: true,
          },
          {
            name: "allowed",
            label: "Allowed values (JSON array)",
            type: "json",
            value: [],
          },
        ];
      }
      if (resource === "promotions")
        fields = [
          { name: "code", label: "Coupon code (uppercase)" },
          {
            name: "percent",
            label: "Discount percent",
            type: "number",
            value: 10,
            min: 1,
            max: 100,
          },
          {
            name: "minimum",
            label: "Minimum order (fils)",
            type: "number",
            value: 0,
          },
          {
            name: "maxUses",
            label: "Redemption limit",
            type: "number",
            value: 100,
          },
          {
            name: "startsAt",
            label: "Starts at (UTC)",
            type: "datetime-local",
          },
          { name: "endsAt", label: "Ends at (UTC)", type: "datetime-local" },
          { name: "active", label: "Enabled", type: "checkbox", value: true },
        ];
      return (
        <>
          <Heading
            title={`${existing ? "Edit" : "Create"} ${mod.label.toLowerCase()}`}
            description="Validated changes are saved to the database and reflected on fresh storefront requests."
          />
          <div className="panel admin-editor">
            {resource === "home-sections" ? (
              <HomeSectionEditor
                key={String(existing?.id ?? "new")}
                values={json(existing) ?? {}}
              />
            ) : (
              <MutationForm
                endpoint={`admin/${resource}${existing ? `/${id}` : ""}`}
                method={existing ? "PATCH" : "POST"}
                fields={fields}
                values={json(existing)}
              />
            )}
          </div>
        </>
      );
    }
    if (resource === "staff" && id && id !== "new") {
      requireScope(actor, "staff:manage");
      const staff = await db.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!staff || staff.role === "CUSTOMER") notFound();
      return (
        <>
          <Heading
            title={staff.name}
            description={`Staff account · ${staff.email}`}
          />
          <div className="panel admin-editor">
            {staff.role === "OWNER" ? (
              <p className="notice">
                The Owner retains full access. This account cannot be reassigned
                or disabled here.
              </p>
            ) : (
              <>
                <h2>Access level</h2>
                <p className="notice">
                  Choose only the access this colleague needs. Saving signs them
                  out of every device and applies the new permissions
                  immediately.
                </p>
                <MutationForm
                  endpoint={`admin/staff/${staff.id}`}
                  method="PATCH"
                  label="Save access level"
                  values={{ role: staff.role }}
                  success="Access updated. This colleague must sign in again."
                  fields={[
                    {
                      name: "role",
                      label: "Permission preset",
                      type: "select",
                      options: Object.entries(staffRoleLabels).map(
                        ([value, label]) => ({ value, label }),
                      ),
                    },
                  ]}
                />
              </>
            )}
            <div className="editor-section">
              <h3>Permissions in this role</h3>
              <div className="permission-tags">
                {roles[staff.role]?.length ? (
                  roles[staff.role].map((scope) => (
                    <span key={scope} className="badge">
                      {scope}
                    </span>
                  ))
                ) : (
                  <p>No staff permissions.</p>
                )}
              </div>
            </div>
          </div>
        </>
      );
    }
    if (resource === "staff" && id === "new")
      return (
        <>
          <Heading
            title="Create a staff account."
            description="Give each colleague their own login and the access they need. Customers cannot register as staff."
          />
          <div className="panel admin-editor">
            <MutationForm
              endpoint="admin/staff"
              fields={[
                { name: "name", label: "Full name" },
                { name: "email", label: "Email", type: "email" },
                {
                  name: "password",
                  label: "Initial password",
                  type: "password",
                  help: "At least 12 characters. Share through your approved secure channel.",
                },
                {
                  name: "role",
                  label: "Permission preset",
                  type: "select",
                  options: Object.entries(staffRoleLabels)
                    .filter(([r]) => r !== "STAFF_DISABLED")
                    .map(([value, label]) => ({ value, label })),
                },
              ]}
            />
          </div>
        </>
      );
    if (resource === "home-sections") {
      const sections = await db.homeSection.findMany({
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      const canEdit = actor.scopes.includes("content:write");
      return (
        <>
          <Heading
            title="Homepage sections"
            description="Your page, from top to bottom. Edit one area, preview it on desktop or mobile, then save."
          >
            {canEdit && (
              <Link href="/admin/home-sections/new" className="button primary">
                Add section
              </Link>
            )}
          </Heading>
          <div className="homepage-section-list">
            {sections.map((s) => (
              <article className="panel homepage-section-card" key={s.id}>
                <div className="section-order">{s.position}</div>
                <div>
                  <span className="eyebrow">
                    {s.kind.toUpperCase()} · {s.visible ? "Visible" : "Hidden"}
                    {s.startsAt || s.endsAt ? " · Scheduled" : ""}
                  </span>
                  <h2>{s.title}</h2>
                  <p>{s.subtitle}</p>
                </div>
                {canEdit && (
                  <Link
                    className="button"
                    href={`/admin/home-sections/${s.id}`}
                  >
                    Edit & preview
                  </Link>
                )}
              </article>
            ))}
            {!sections.length && (
              <p className="notice">
                Add your first hero, banner or product section to start building
                the homepage.
              </p>
            )}
          </div>
        </>
      );
    }
    const records = (await adminList(
      actor,
      resource,
      Number(query.page ?? 1),
      query.q ?? "",
    )) as Record<string, unknown>[];
    const rows = Array.isArray(records) ? records : [];
    const columns: Record<string, string[]> = {
      products: ["name", "status", "category", "updatedAt"],
      categories: ["name", "slug", "visible", "position"],
      brands: ["name", "slug"],
      attributes: ["label", "key", "scope", "required"],
      collections: ["name", "slug"],
      inventory: ["code", "onHand", "reserved"],
      orders: ["reference", "email", "status", "paymentStatus", "total"],
      returns: ["id", "reason", "status", "createdAt"],
      customers: ["name", "email", "createdAt"],
      promotions: ["code", "percent", "uses", "maxUses", "active"],
      content: ["title", "slug", "published"],
      "home-sections": ["title", "kind", "position", "visible"],
      media: ["alt", "mime", "public"],
      reviews: ["rating", "body", "status", "verified"],
      inquiries: ["name", "email", "subject", "status"],
      staff: ["name", "email", "role"],
      proposals: ["operation", "targetId", "status", "createdAt"],
      jobs: ["type", "status", "attempts", "lastError", "createdAt"],
      "audit-events": [
        "operation",
        "source",
        "actorId",
        "targetId",
        "createdAt",
      ],
    };
    const cols = columns[resource] ?? ["id", "status", "createdAt"];
    const canCreate =
      resource === "products"
        ? actor.scopes.includes("catalog:write")
        : formResources.includes(resource)
          ? actor.scopes.includes(writeScope(resource))
          : resource === "staff";
    const linkable = [
      "products",
      "inventory",
      "orders",
      "returns",
      "proposals",
      ...formResources,
    ].includes(resource);
    function render(value: unknown, key: string): React.ReactNode {
      if (value === null || value === undefined)
        return <span className="muted">—</span>;
      if (key.endsWith("At")) return date(String(value));
      if (key === "total") return money(Number(value));
      if (key === "status" || key === "paymentStatus" || key === "role")
        return (
          <span
            className={`badge ${["PUBLISHED", "PAID", "COMPLETED", "APPROVED"].includes(String(value)) ? "green" : ""}`}
          >
            {String(value)}
          </span>
        );
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "object")
        return String((value as { name?: string }).name ?? "—");
      return String(value).slice(0, 160);
    }
    return (
      <>
        <Heading title={mod.label} description={mod.description}>
          {canCreate && (
            <Link href={`/admin/${resource}/new`} className="button primary">
              <Plus size={14} />
              {resource === "products" ? "Add product" : "Create new"}
            </Link>
          )}
        </Heading>
        <div className="panel">
          <div className="table-toolbar">
            <form>
              <input
                name="q"
                placeholder={
                  resource === "products"
                    ? "Search products…"
                    : "Filter not available for this module"
                }
                aria-label="Search products"
                defaultValue={query.q}
                disabled={resource !== "products"}
              />
              {resource === "products" && (
                <button className="text-button">Search</button>
              )}
            </form>
            <span className="form-help">
              {rows.length} records on this page
            </span>
          </div>
          {rows.length ? (
            <div className="data-table-wrap">
              <table className="data-table admin-table">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c}>
                        {c
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (s) => s.toUpperCase())}
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={String(row.id ?? row.slug ?? i)}>
                      {cols.map((c, n) => (
                        <td key={c}>
                          {n === 0 && linkable ? (
                            <Link
                              href={`/admin/${resource}/${row.id ?? row.slug}`}
                            >
                              {render(row[c], c)}
                            </Link>
                          ) : (
                            render(row[c], c)
                          )}
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          {linkable && (
                            <Link
                              className="text-button"
                              href={`/admin/${resource}/${row.id ?? row.slug}`}
                            >
                              Open →
                            </Link>
                          )}
                          {resource === "reviews" && (
                            <>
                              <ActionButton
                                endpoint={`admin/reviews/${row.id}`}
                                method="PATCH"
                                payload={{ status: "APPROVED" }}
                                label="Approve"
                              />
                              <ActionButton
                                endpoint={`admin/reviews/${row.id}`}
                                method="PATCH"
                                payload={{ status: "REJECTED" }}
                                label="Reject"
                                danger
                              />
                            </>
                          )}
                          {resource === "inquiries" &&
                            row.status === "OPEN" && (
                              <ActionButton
                                endpoint={`admin/inquiries/${row.id}`}
                                method="PATCH"
                                payload={{ status: "RESOLVED" }}
                                label="Resolve"
                              />
                            )}
                          {resource === "staff" && (
                            <>
                              <Link
                                className="text-button"
                                href={`/admin/staff/${row.id}`}
                              >
                                Manage access →
                              </Link>
                              <ActionButton
                                endpoint={`admin/staff/${row.id}/revoke-sessions`}
                                label="Revoke sessions"
                                danger
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={30} />
              <h3>A fresh start.</h3>
              <p>
                No records yet. New activity will appear here as your store
                grows.
              </p>
            </div>
          )}
          <nav className="pagination" aria-label="Admin pages">
            {Number(query.page ?? 1) > 1 && (
              <Link href={`?page=${Number(query.page) - 1}`}>Previous</Link>
            )}
            <span className="form-help">Page {query.page ?? 1}</span>
            {rows.length === 30 && (
              <Link href={`?page=${Number(query.page ?? 1) + 1}`}>Next</Link>
            )}
          </nav>
        </div>
      </>
    );
  }
  try {
    return await renderPage();
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    if (e instanceof AppError && e.status === 403)
      return (
        <div className="empty-state">
          <ShieldCheck size={38} />
          <h1>Permission required.</h1>
          <p>{e.message}</p>
          <Link className="button" href="/admin">
            Back to workspace
          </Link>
        </div>
      );
    throw e;
  }
}
