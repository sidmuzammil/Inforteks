"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "./store-client";
import { aedToFils } from "@/lib/merchant-pricing";
import { stageLabels, contactLabels } from "@/lib/crm-display";
import type { ContactKind, ContactRow } from "@/domains/contacts";

type Contact = { id: string; kind: ContactKind; name: string };
type Opportunity = {
  id: string;
  version: number;
  title: string;
  expectedValue: number;
  expectedClose: string | null;
  assignedTo: string | null;
  notes: string;
};
function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  const request = useRef({ body: "", key: "" });
  function headers(body: unknown) {
    const serialized = JSON.stringify(body);
    if (request.current.body !== serialized)
      request.current = { body: serialized, key: crypto.randomUUID() };
    return { "Idempotency-Key": request.current.key };
  }
  async function run(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return { busy, error, run, headers, router };
}
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
export function OpportunityEditor({
  initial,
  opportunity,
  assignees,
  kinds,
}: {
  initial?: Contact;
  opportunity?: Opportunity;
  assignees: { id: string; name: string; channels: string[] }[];
  kinds: ContactKind[];
}) {
  const action = useSave();
  const [contact, setContact] = useState<Contact | undefined>(initial);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ContactKind | "ALL">(
    kinds.length === 1 ? kinds[0] : "ALL",
  );
  const [results, setResults] = useState<ContactRow[] | null>(null);
  async function find() {
    await action.run(async () =>
      setResults(
        (
          await api<{ rows: ContactRow[] }>(
            `admin/contacts?q=${encodeURIComponent(search)}&kind=${kind}`,
          )
        ).rows,
      ),
    );
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await action.run(async () => {
      if (!contact) throw new Error("Choose a contact first.");
      const data = {
        title: String(fd.get("title")),
        expectedValue: aedToFils(fd.get("expectedValue")) ?? 0,
        expectedClose: String(fd.get("expectedClose") ?? "") || null,
        assignedTo: String(fd.get("assignedTo") ?? "") || null,
        notes: String(fd.get("notes") ?? ""),
        ...(opportunity
          ? { version: opportunity.version }
          : { contact: { kind: contact.kind, id: contact.id } }),
      };
      const result = await api<{ id: string }>(
        `admin/crm/opportunities${opportunity ? `/${opportunity.id}` : ""}`,
        data,
        opportunity ? "PATCH" : "POST",
        action.headers(data),
      );
      action.router.push(`/admin/crm/${result.id}`);
    });
  }
  return (
    <div className="erp-form-sheet">
      {!opportunity && (
        <section className="erp-contact-picker">
          <h2>1. Choose a contact</h2>
          <div className="sales-filters">
            <label>
              Search contacts
              <input
                value={search}
                maxLength={160}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, company, phone or email"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void find();
                  }
                }}
              />
            </label>
            <label>
              Contact source
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="ALL">All permitted contacts</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {contactLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button"
              disabled={action.busy}
              onClick={find}
            >
              Find contacts
            </button>
          </div>
          {results && (
            <div className="erp-picker-results">
              {results.length ? (
                results.map((c) => (
                  <button
                    type="button"
                    key={`${c.kind}-${c.id}`}
                    className="erp-picker-row"
                    disabled={!c.active}
                    aria-pressed={
                      contact?.kind === c.kind && contact.id === c.id
                    }
                    onClick={() => setContact(c)}
                  >
                    <b>{c.name}</b>
                    <span>
                      {contactLabels[c.kind]} · {c.email || c.phone || c.person}
                      {!c.active ? " · Archived" : ""}
                    </span>
                  </button>
                ))
              ) : (
                <p>No matching contacts. Try another name.</p>
              )}
              <small>
                Showing up to 25 matches. Narrow your search to find another
                contact.
              </small>
            </div>
          )}
          {kinds.includes("office") && (
            <Link href="/admin/contacts/new" className="text-button">
              Add an office contact →
            </Link>
          )}
        </section>
      )}
      {contact && (
        <div className="erp-selected-contact">
          <span className="badge">{contactLabels[contact.kind]}</span>
          <Link href={`/admin/contacts/${contact.kind}/${contact.id}`}>
            {contact.name}
          </Link>
        </div>
      )}
      <form className="form-stack" onSubmit={save}>
        <fieldset disabled={action.busy}>
          <h2>
            {opportunity
              ? "Opportunity details"
              : "2. Describe the opportunity"}
          </h2>
          <label>
            Opportunity title
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              defaultValue={opportunity?.title}
              placeholder="e.g. Four toners for the office"
            />
          </label>
          <div className="form-grid">
            <label>
              Expected value (AED)
              <input
                name="expectedValue"
                inputMode="decimal"
                required
                defaultValue={
                  opportunity
                    ? (opportunity.expectedValue / 100).toFixed(2)
                    : "0.00"
                }
              />
              <small className="form-help">
                An estimate. Confirmed order totals are calculated separately.
              </small>
            </label>
            <label>
              Expected closing date
              <input
                name="expectedClose"
                type="date"
                defaultValue={opportunity?.expectedClose?.slice(0, 10)}
              />
            </label>
            <label>
              Salesperson
              <select
                key={contact?.kind}
                name="assignedTo"
                aria-label="Salesperson"
                defaultValue={opportunity?.assignedTo ?? ""}
              >
                <option value="">Unassigned</option>
                {assignees
                  .filter((a) =>
                    a.channels.includes(
                      contact?.kind === "office" ? "DIRECT" : "ONLINE",
                    ),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Internal notes
            <textarea
              name="notes"
              maxLength={4000}
              defaultValue={opportunity?.notes}
              placeholder="Requirements, buying preferences and next steps"
            />
          </label>
          <ErrorMessage message={action.error} />
          <div className="erp-actions">
            <button className="button primary" disabled={!contact}>
              {action.busy
                ? "Saving…"
                : opportunity
                  ? "Save opportunity"
                  : "Create opportunity"}
            </button>
            <Link
              href={opportunity ? `/admin/crm/${opportunity.id}` : "/admin/crm"}
              className="button"
            >
              Cancel
            </Link>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
export function OpportunityStage({
  id,
  version,
  stage,
  hasOrder,
}: {
  id: string;
  version: number;
  stage: string;
  hasOrder: boolean;
}) {
  const action = useSave();
  const [nextStage, setNextStage] = useState(stage);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void action.run(async () => {
          await api(
            `admin/crm/opportunities/${id}/stage`,
            {
              version,
              stage: nextStage,
              lostReason: String(fd.get("lostReason") ?? ""),
            },
            "PATCH",
          );
        });
      }}
    >
      <fieldset disabled={action.busy}>
        <label>
          Stage
          <select
            aria-label="Stage"
            value={nextStage}
            onChange={(e) => setNextStage(e.target.value)}
          >
            {Object.entries(stageLabels).map(([value, label]) => (
              <option
                key={value}
                value={value}
                disabled={value === "WON" && !hasOrder}
              >
                {label}
              </option>
            ))}
          </select>
        </label>
        {nextStage === "LOST" && (
          <label>
            Reason for loss
            <textarea
              name="lostReason"
              required
              minLength={3}
              maxLength={1000}
            />
          </label>
        )}
        <ErrorMessage message={action.error} />
        <button className="button" disabled={nextStage === stage}>
          {action.busy ? "Saving…" : "Update stage"}
        </button>
      </fieldset>
    </form>
  );
}
export function LinkOpportunityOrder({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const action = useSave();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void action.run(async () => {
          await api(
            `admin/crm/opportunities/${id}/order`,
            { version, reference: String(fd.get("reference")) },
            "POST",
          );
        });
      }}
    >
      <fieldset disabled={action.busy}>
        <label>
          Existing order reference
          <input
            name="reference"
            required
            maxLength={100}
            placeholder="IFT-…"
          />
        </label>
        <p className="form-help">
          The order must belong to this contact. Linking it marks this
          opportunity Won; payment stays separate.
        </p>
        <ErrorMessage message={action.error} />
        <button className="button">
          {action.busy ? "Linking…" : "Link order & mark won"}
        </button>
      </fieldset>
    </form>
  );
}
export function ActivityEditor({ id }: { id: string }) {
  const action = useSave();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="form-stack"
      onChange={() => setSaved(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        void action.run(async () => {
          const data = {
            kind: String(fd.get("kind")),
            title: String(fd.get("title")),
            notes: String(fd.get("notes") ?? ""),
            dueAt: new Date(`${fd.get("dueAt")}:00+04:00`).toISOString(),
          };
          await api(
            `admin/crm/opportunities/${id}/activities`,
            data,
            "POST",
            action.headers(data),
          );
          form.reset();
          setSaved(true);
        });
      }}
    >
      <fieldset disabled={action.busy}>
        <div className="form-grid">
          <label>
            Activity type
            <select name="kind">
              <option value="CALL">Call</option>
              <option value="VISIT">Visit</option>
              <option value="EMAIL">Email follow-up</option>
              <option value="TODO">To-do</option>
            </select>
          </label>
          <label>
            Due date & time (UAE)
            <input name="dueAt" type="datetime-local" required />
          </label>
        </div>
        <label>
          What needs to happen?
          <input
            name="title"
            required
            minLength={3}
            maxLength={160}
            placeholder="Confirm laptop requirements"
          />
        </label>
        <label>
          Activity notes
          <textarea name="notes" maxLength={2000} />
        </label>
        <p className="form-help">
          A task for your team. No email or message is sent automatically.
        </p>
        <ErrorMessage message={action.error} />
        {saved && (
          <p role="status" className="form-help">
            Activity scheduled.
          </p>
        )}
        <button className="button primary">
          {action.busy ? "Saving…" : "Schedule activity"}
        </button>
      </fieldset>
    </form>
  );
}
