import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Plus,
  Users,
  Target,
  CalendarCheck,
  ArrowUpRight,
  List,
  Columns3,
} from "lucide-react";
import { requireScope, type Actor } from "@/domains/identity";
import {
  contactChannels,
  contactQuery,
  getContact,
  listContacts,
  resolveContact,
  type ContactKind,
} from "@/domains/contacts";
import {
  crmAssignees,
  crmQuery,
  getOpportunity,
  listActivities,
  listOpportunities,
  opportunityContact,
} from "@/domains/crm";
import {
  stageLabels,
  contactLabels,
  channelLabel,
  opportunityName,
  crmDateTime,
} from "@/lib/crm-display";
import { json, money, date } from "@/lib/utils";
import {
  SalesHeading,
  SalesPagination,
  SalesOrderTable,
} from "./sales-workspace";
import {
  ActivityEditor,
  LinkOpportunityOrder,
  OpportunityEditor,
  OpportunityStage,
} from "./crm-client";
import { OfficeEditor } from "./direct-sales-client";
import { getBusinessCustomer } from "@/domains/direct-sales";
import { AddressSummary } from "./address-summary";
import { ActionButton } from "./admin-client";

type Query = Record<string, string>;
const href = (base: string, values: Record<string, string | number>) =>
  `${base}?${new URLSearchParams(Object.entries(values).map(([k, v]) => [k, String(v)]))}`;
const kindsFor = (actor: Actor): ContactKind[] => [
  ...(actor.scopes.includes("direct_sales:read") ? ["office" as const] : []),
  ...(actor.scopes.includes("customers:read")
    ? ["account" as const, "guest" as const]
    : []),
];
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="erp-empty">
      <Users size={30} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Stage({ value }: { value: string }) {
  return (
    <span className={`erp-stage erp-stage-${value.toLowerCase()}`}>
      {stageLabels[value]}
    </span>
  );
}
export async function ContactsWorkspace({
  actor,
  path,
  query,
}: {
  actor: Actor;
  path: string[];
  query: Query;
}) {
  const [, kind, id, action] = path;
  if (kind && id && !["office", "account", "guest"].includes(kind)) notFound();
  if (kind === "new" && !id) {
    requireScope(actor, "direct_sales:write");
    return (
      <>
        <SalesHeading
          title="New office contact"
          description="Save the contact person, company and delivery address for your next sale."
          channel="CONTACTS"
        />
        <div className="panel erp-form-sheet">
          <OfficeEditor contacts />
        </div>
      </>
    );
  }
  if (kind && id) {
    if (action === "edit" && kind === "office") {
      requireScope(actor, "direct_sales:write");
      const office = await getBusinessCustomer(actor, id);
      return (
        <>
          <SalesHeading
            title={`Edit ${office.company}`}
            description="Update current details. Past orders retain their original delivery and contact details."
            channel="CONTACTS"
          />
          <div className="panel erp-form-sheet">
            <OfficeEditor
              key={office.version}
              customer={json(office)}
              contacts
            />
          </div>
        </>
      );
    }
    if (action) notFound();
    const result = await getContact(actor, kind, id, query.page ?? 1);
    const c = result.contact;
    return (
      <>
        <SalesHeading
          title={c.name}
          description={`${contactLabels[c.kind]} · ${c.email || "No email saved"}`}
          channel="CONTACTS"
        >
          <div className="erp-actions">
            {c.kind === "office" &&
              actor.scopes.includes("direct_sales:write") && (
                <Link
                  className="button"
                  href={`/admin/contacts/office/${id}/edit`}
                >
                  Edit contact
                </Link>
              )}
            {actor.scopes.includes("crm:write") &&
              actor.scopes.includes("crm:read") &&
              c.active && (
                <Link
                  className="button primary"
                  href={`/admin/crm/new?kind=${kind}&contact=${id}`}
                >
                  <Plus size={16} />
                  New opportunity
                </Link>
              )}
          </div>
        </SalesHeading>
        <div className="erp-record-actions">
          <Link href="/admin/contacts">← Contacts</Link>
          <span className="badge">{channelLabel(c.channel)}</span>
          <span className="badge">{c.active ? "Active" : "Archived"}</span>
          {c.kind === "office" &&
            c.active &&
            actor.scopes.includes("direct_sales:write") && (
              <Link
                href={`/admin/direct-sales/new-order?customer=${id}`}
                className="button primary"
              >
                New sales order
              </Link>
            )}
          {c.kind === "office" && (
            <Link
              href={`/admin/direct-sales/customers/${id}`}
              className="button"
            >
              Visits & follow-ups
            </Link>
          )}
        </div>
        <div className="erp-record-grid">
          <div className="panel">
            <h2>Contact details</h2>
            <dl className="erp-details">
              <dt>Email</dt>
              <dd>{c.email || "Not supplied"}</dd>
              <dt>Added</dt>
              <dd>{date(c.createdAt)}</dd>
              <dt>Source</dt>
              <dd>{contactLabels[c.kind]}</dd>
            </dl>
            {c.notes && <p className="sales-notes">{c.notes}</p>}
            {c.kind !== "office" && (
              <p className="form-help">
                {c.kind === "account"
                  ? "The customer maintains their account and saved addresses. Staff credentials and account access are managed separately."
                  : "This record belongs to one guest order. It is not merged with other people using the same email."}
              </p>
            )}
            <h3>
              {c.kind === "account"
                ? "Saved delivery addresses"
                : "Delivery address"}
            </h3>
            {c.addresses.length ? (
              c.addresses.map((address, i) => (
                <AddressSummary key={i} address={address} />
              ))
            ) : (
              <p className="muted">No saved address yet.</p>
            )}
          </div>
          <div className="panel">
            <h2>Opportunities</h2>
            {!actor.scopes.includes("crm:read") ? (
              <p className="muted">
                CRM access is required to view opportunities.
              </p>
            ) : result.opportunities.length ? (
              <ul className="erp-record-list">
                {result.opportunities.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/crm/${o.id}`}>{o.title}</Link>
                    <Stage value={o.stage} />
                    <span>{money(o.expectedValue)} estimated</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No opportunities for this contact yet.</p>
            )}
            {result.opportunities.length === 20 && (
              <p className="form-help">Latest 20 opportunities shown.</p>
            )}
          </div>
        </div>
        <section className="panel erp-section">
          <div className="panel-title">
            <h2>
              Sales orders {result.total !== null ? `(${result.total})` : ""}
            </h2>
            <span className="muted">Original order details are preserved</span>
          </div>
          {result.total === null ? (
            <p>Order access is required to view this history.</p>
          ) : (
            <>
              <SalesOrderTable rows={result.orders} />
              <SalesPagination
                total={result.total}
                page={result.page}
                query={{}}
              />
            </>
          )}
        </section>
      </>
    );
  }
  if (kind) notFound();
  const parsed = contactQuery.safeParse(query);
  const filters = parsed.success ? parsed.data : contactQuery.parse({});
  const result = await listContacts(actor, filters);
  return (
    <>
      <SalesHeading
        title="Contacts"
        description="Office customers, website accounts and guest order contacts in one directory."
        channel="CONTACTS"
      >
        {actor.scopes.includes("direct_sales:write") && (
          <Link className="button primary" href="/admin/contacts/new">
            <Plus size={16} />
            New office contact
          </Link>
        )}
      </SalesHeading>
      <div className="panel erp-list-panel">
        <form className="sales-filters">
          <label>
            Search contacts
            <input
              name="q"
              defaultValue={filters.q}
              maxLength={160}
              placeholder="Name, company, email or phone"
            />
          </label>
          <label>
            Contact source
            <select name="kind" defaultValue={filters.kind}>
              <option value="ALL">All permitted contacts</option>
              {kindsFor(actor).map((k) => (
                <option key={k} value={k}>
                  {contactLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary">Search</button>
          <Link href="/admin/contacts">Clear</Link>
        </form>
        <div className="erp-list-meta">
          <b>
            {result.total} contact{result.total !== 1 ? "s" : ""}
          </b>
          <span>Guest contacts remain separate for each order.</span>
        </div>
        {result.rows.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Contact person / order</th>
                  <th>Email / phone</th>
                  <th>City</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((c) => (
                  <tr key={`${c.kind}-${c.id}`}>
                    <td>
                      <Link
                        className="erp-record-link"
                        href={`/admin/contacts/${c.kind}/${c.id}`}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge">{contactLabels[c.kind]}</span>
                    </td>
                    <td>{c.person || "—"}</td>
                    <td>
                      {c.email || "—"}
                      {c.phone && (
                        <small className="erp-cell-secondary">{c.phone}</small>
                      )}
                    </td>
                    <td>{c.city || "—"}</td>
                    <td>{c.active ? "Active" : "Archived"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No contacts found"
            text="Save an office contact or search for a website customer."
          />
        )}
        <SalesPagination
          total={result.total}
          page={result.page}
          query={{ q: filters.q, kind: filters.kind }}
        />
      </div>
    </>
  );
}
async function Activities({
  actor,
  query,
  opportunityId,
}: {
  actor: Actor;
  query: Query;
  opportunityId?: string;
}) {
  const parsed = crmQuery.safeParse(query);
  const filters = parsed.success ? parsed.data : crmQuery.parse({});
  const result = await listActivities(actor, filters, opportunityId);
  return (
    <>
      {result.rows.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Activity</th>
                {!opportunityId && <th>Opportunity</th>}
                <th>Due · UAE time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.title}</b>
                    <small className="erp-cell-secondary">
                      {a.kind === "EMAIL"
                        ? "Email follow-up"
                        : a.kind.toLowerCase()}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </small>
                  </td>
                  {!opportunityId && (
                    <td>
                      <Link href={`/admin/crm/${a.opportunityId}`}>
                        {a.opportunity.title}
                      </Link>
                      <small className="erp-cell-secondary">
                        {channelLabel(a.opportunity.channel)} ·{" "}
                        {stageLabels[a.opportunity.stage]}
                      </small>
                    </td>
                  )}
                  <td>{crmDateTime(a.dueAt)}</td>
                  <td>
                    <span
                      className={`badge ${!a.completedAt && a.dueAt < new Date() ? "erp-overdue" : ""}`}
                    >
                      {a.completedAt
                        ? "Done"
                        : a.dueAt < new Date()
                          ? "Overdue"
                          : "Planned"}
                    </span>
                    {a.completedAt && (
                      <small className="erp-cell-secondary">
                        {crmDateTime(a.completedAt)}
                      </small>
                    )}
                  </td>
                  <td>
                    {!a.completedAt && actor.scopes.includes("crm:write") && (
                      <ActionButton
                        label="Mark done"
                        endpoint={`admin/crm/activities/${a.id}`}
                        method="PATCH"
                        payload={{ completed: true }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No activities to show"
          text="Schedule the next call, office visit or follow-up from an opportunity."
        />
      )}
      <SalesPagination
        total={result.total}
        page={result.page}
        query={{ channel: filters.channel, mine: filters.mine }}
      />
    </>
  );
}
export async function CrmWorkspace({
  actor,
  path,
  query,
}: {
  actor: Actor;
  path: string[];
  query: Query;
}) {
  requireScope(actor, "crm:read");
  const [, id, action] = path;
  const write = actor.scopes.includes("crm:write");
  if (id === "new" && !action) {
    requireScope(actor, "crm:write");
    const initial =
      query.kind && query.contact
        ? await resolveContact(actor, { kind: query.kind, id: query.contact })
        : undefined;
    const assignees = await crmAssignees(actor);
    return (
      <>
        <SalesHeading
          title="New opportunity"
          description="Capture what the customer needs, its expected value and who will follow up."
          channel="CRM"
        />
        <div className="panel">
          <OpportunityEditor
            initial={
              initial && {
                id: initial.id,
                kind: initial.kind,
                name: initial.name,
              }
            }
            assignees={assignees}
            kinds={kindsFor(actor)}
          />
        </div>
      </>
    );
  }
  if (id === "activities" && !action)
    return (
      <>
        <SalesHeading
          title="Activities"
          description="Plan your calls and visits. All times are shown in UAE time."
          channel="CRM"
        />
        <div className="panel">
          <form className="sales-filters">
            <ChannelFilter actor={actor} value={query.channel} />
            <label>
              Assigned to
              <select name="mine" defaultValue={query.mine ?? "no"}>
                <option value="no">Everyone</option>
                <option value="yes">Me</option>
              </select>
            </label>
            <button className="button">Apply filters</button>
          </form>
          <Activities actor={actor} query={query} />
        </div>
      </>
    );
  if (id) {
    const o = await getOpportunity(actor, id);
    const contact = opportunityContact(o);
    const assignees = await crmAssignees(actor, o.channel);
    if (action === "edit") {
      requireScope(actor, "crm:write");
      return (
        <>
          <SalesHeading
            title="Edit opportunity"
            description={o.title}
            channel="CRM"
          />
          <div className="panel">
            <OpportunityEditor
              opportunity={json(o)}
              initial={{ ...contact, name: opportunityName(o) }}
              assignees={assignees}
              kinds={kindsFor(actor)}
            />
          </div>
        </>
      );
    }
    if (action) notFound();
    const canOrder =
      o.channel === "DIRECT"
        ? actor.scopes.includes("direct_sales:write")
        : actor.scopes.includes("orders:read");
    return (
      <>
        <SalesHeading
          title={o.title}
          description={`${channelLabel(o.channel)} · Updated ${date(o.updatedAt)}`}
          channel="CRM"
        >
          <div className="erp-actions">
            {write && (
              <Link href={`/admin/crm/${id}/edit`} className="button">
                Edit
              </Link>
            )}
            {write &&
              canOrder &&
              o.channel === "DIRECT" &&
              !o.orderId &&
              !["WON", "LOST"].includes(o.stage) && (
                <Link
                  href={`/admin/direct-sales/new-order?customer=${o.businessCustomerId}&opportunity=${id}`}
                  className="button primary"
                >
                  Create sales order
                  <ArrowUpRight size={16} />
                </Link>
              )}
          </div>
        </SalesHeading>
        <div className="erp-record-actions">
          <Link href="/admin/crm">← Pipeline</Link>
          <Link href={`/admin/contacts/${contact.kind}/${contact.id}`}>
            {opportunityName(o)}
          </Link>
          {o.order && (
            <Link className="button" href={`/admin/orders/${o.order.id}`}>
              Sales order · {o.order.reference}
            </Link>
          )}
        </div>
        <ol className="erp-stage-bar" aria-label="Opportunity stages">
          {Object.entries(stageLabels).map(([stage, label]) => (
            <li
              key={stage}
              aria-current={o.stage === stage ? "step" : undefined}
            >
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <div className="erp-record-grid">
          <section className="panel">
            <h2>Opportunity</h2>
            <dl className="erp-details">
              <dt>Expected value</dt>
              <dd>
                <b>{money(o.expectedValue)}</b>
                <small className="erp-cell-secondary">
                  Forecast only, not collected revenue
                </small>
              </dd>
              <dt>Expected close</dt>
              <dd>{o.expectedClose ? date(o.expectedClose) : "Not set"}</dd>
              <dt>Salesperson</dt>
              <dd>
                {assignees.find((s) => s.id === o.assignedTo)?.name ??
                  (o.assignedTo
                    ? "Former / unavailable colleague"
                    : "Unassigned")}
              </dd>
              <dt>Contact</dt>
              <dd>
                <Link href={`/admin/contacts/${contact.kind}/${contact.id}`}>
                  {opportunityName(o)}
                </Link>
              </dd>
            </dl>
            {o.notes && <p className="sales-notes">{o.notes}</p>}
            {o.lostReason && (
              <p className="notice">Lost reason: {o.lostReason}</p>
            )}
            {o.order && (
              <p className="notice">
                Order {o.order.reference}: {o.order.status.toLowerCase()} ·
                payment {o.order.paymentStatus.toLowerCase()} ·{" "}
                {money(o.order.total)}. Winning an opportunity does not record
                payment.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Next step</h2>
            {write ? (
              <>
                <OpportunityStage
                  key={o.version}
                  id={id}
                  version={o.version}
                  stage={o.stage}
                  hasOrder={Boolean(o.order)}
                />
                {!o.orderId && canOrder && (
                  <details className="erp-disclosure">
                    <summary>Link an existing sales order</summary>
                    <LinkOpportunityOrder
                      key={o.version}
                      id={id}
                      version={o.version}
                    />
                  </details>
                )}
              </>
            ) : (
              <p className="muted">You have read-only CRM access.</p>
            )}
          </section>
        </div>
        {write && (
          <section className="panel erp-section">
            <details className="erp-disclosure">
              <summary>
                <CalendarCheck size={18} />
                Schedule an activity
              </summary>
              <ActivityEditor id={id} />
            </details>
          </section>
        )}
        <section className="panel erp-section">
          <div className="panel-title">
            <h2>Activity history</h2>
            <span className="muted">Planned and completed · UAE time</span>
          </div>
          <Activities actor={actor} query={query} opportunityId={id} />
        </section>
      </>
    );
  }
  const parsed = crmQuery.safeParse(query);
  const filters = parsed.success ? parsed.data : crmQuery.parse({});
  const result = await listOpportunities(actor, filters);
  const linkFilters = {
    q: filters.q,
    channel: filters.channel,
    mine: filters.mine,
    stage: filters.stage,
  };
  return (
    <>
      <SalesHeading
        title="Pipeline"
        description="Follow each opportunity from first conversation to a confirmed sales order."
        channel="CRM"
      >
        {write && (
          <Link className="button primary" href="/admin/crm/new">
            <Plus size={16} />
            New opportunity
          </Link>
        )}
      </SalesHeading>
      <div className="panel erp-control-panel">
        <form className="sales-filters">
          <label>
            Search opportunities
            <input
              name="q"
              defaultValue={filters.q}
              maxLength={160}
              placeholder="Opportunity or contact name"
            />
          </label>
          <ChannelFilter actor={actor} value={filters.channel} />
          <label>
            Salesperson
            <select name="mine" defaultValue={filters.mine}>
              <option value="no">Everyone</option>
              <option value="yes">Assigned to me</option>
            </select>
          </label>
          <label>
            Stage
            <select name="stage" defaultValue={filters.stage}>
              <option value="ALL">All stages</option>
              {Object.entries(stageLabels).map(([s, l]) => (
                <option key={s} value={s}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="view" value={filters.view} />
          <button className="button">Apply filters</button>
          <Link href="/admin/crm">Clear</Link>
        </form>
        <div className="erp-list-meta">
          <span>
            {result.total} opportunities · Values are forecasts in AED
          </span>
          <div className="erp-view-toggle">
            <Link
              aria-current={filters.view === "board" ? "page" : undefined}
              href={href("/admin/crm", { ...linkFilters, view: "board" })}
            >
              <Columns3 size={16} />
              Board
            </Link>
            <Link
              aria-current={filters.view === "list" ? "page" : undefined}
              href={href("/admin/crm", { ...linkFilters, view: "list" })}
            >
              <List size={16} />
              List
            </Link>
          </div>
        </div>
      </div>
      {filters.view === "board" ? (
        <div
          className="erp-pipeline"
          tabIndex={0}
          aria-label="Opportunity pipeline; scroll horizontally for more stages"
        >
          {result.board.map((column) => {
            const totals = result.totals.find((t) => t.stage === column.stage);
            return (
              <section key={column.stage} className="erp-pipeline-column">
                <header>
                  <h2>
                    <Stage value={column.stage} />
                    <span>{totals?._count ?? 0}</span>
                  </h2>
                  <small>
                    {money(totals?._sum.expectedValue ?? 0)} expected
                  </small>
                </header>
                <div className="erp-pipeline-cards">
                  {column.rows.map((o) => (
                    <Link
                      className="erp-opportunity-card"
                      href={`/admin/crm/${o.id}`}
                      key={o.id}
                    >
                      <b>{o.title}</b>
                      <span>{opportunityName(o)}</span>
                      <strong>{money(o.expectedValue)}</strong>
                      <footer>
                        <span>{channelLabel(o.channel)}</span>
                        {o.expectedClose && (
                          <time>{date(o.expectedClose)}</time>
                        )}
                      </footer>
                    </Link>
                  ))}
                  {!column.rows.length && (
                    <div className="erp-column-empty">
                      <Target size={20} />
                      <p>No opportunities here yet</p>
                    </div>
                  )}
                  {(totals?._count ?? 0) > column.rows.length && (
                    <Link
                      href={href("/admin/crm", {
                        ...linkFilters,
                        stage: column.stage,
                        view: "list",
                      })}
                    >
                      View all {totals?._count} →
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="panel erp-list-panel">
          {result.rows.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Opportunity</th>
                    <th>Contact</th>
                    <th>Channel</th>
                    <th>Stage</th>
                    <th>Expected value</th>
                    <th>Expected close</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link
                          className="erp-record-link"
                          href={`/admin/crm/${o.id}`}
                        >
                          {o.title}
                        </Link>
                      </td>
                      <td>{opportunityName(o)}</td>
                      <td>{channelLabel(o.channel)}</td>
                      <td>
                        <Stage value={o.stage} />
                      </td>
                      <td>{money(o.expectedValue)}</td>
                      <td>{o.expectedClose ? date(o.expectedClose) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No opportunities found"
              text="Create your first opportunity or clear your filters."
            />
          )}
          <SalesPagination
            total={result.total}
            page={result.page}
            query={{ ...linkFilters, view: "list" }}
          />
        </div>
      )}
    </>
  );
}
function ChannelFilter({ actor, value }: { actor: Actor; value?: string }) {
  return (
    <label>
      Sales channel
      <select name="channel" defaultValue={value ?? "ALL"}>
        <option value="ALL">All permitted channels</option>
        {contactChannels(actor).map((c) => (
          <option value={c} key={c}>
            {channelLabel(c)}
          </option>
        ))}
      </select>
    </label>
  );
}
