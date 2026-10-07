import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { audit, idempotent, requireScope, roles, type Actor } from "./identity";
import {
  contactChannels,
  contactReference,
  contactOrderWhere,
  resolveContact,
  requireContactRead,
} from "./contacts";

export const crmStages = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export const opportunityInput = z
  .object({
    title: z.string().trim().min(3).max(160),
    contact: contactReference,
    expectedValue: z.number().int().min(0).max(100_000_000),
    expectedClose: z.iso.date().nullable().default(null),
    assignedTo: z.string().min(1).max(100).nullable().default(null),
    notes: z.string().trim().max(4000).default(""),
  })
  .strict();
export const opportunityUpdate = opportunityInput
  .omit({ contact: true })
  .extend({ version: z.number().int().positive() });
export const stageInput = z
  .object({
    version: z.number().int().positive(),
    stage: z.enum(crmStages),
    lostReason: z.string().trim().max(1000).default(""),
  })
  .strict();
export const activityInput = z
  .object({
    kind: z.enum(["CALL", "VISIT", "EMAIL", "TODO"]),
    title: z.string().trim().min(3).max(160),
    notes: z.string().trim().max(2000).default(""),
    dueAt: z.iso.datetime(),
  })
  .strict();
export const orderLinkInput = z
  .object({
    reference: z.string().trim().min(1).max(100),
    version: z.number().int().positive(),
  })
  .strict();
export const crmQuery = z.object({
  q: z.string().trim().max(160).default(""),
  channel: z.enum(["ALL", "DIRECT", "ONLINE"]).default("ALL"),
  stage: z.enum(["ALL", ...crmStages]).default("ALL"),
  mine: z.enum(["yes", "no"]).default("no"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  view: z.enum(["board", "list"]).default("board"),
});
const include = {
  businessCustomer: { select: { company: true, active: true } },
  user: { select: { name: true } },
  guestOrder: { select: { address: true, reference: true } },
  order: {
    select: {
      id: true,
      reference: true,
      status: true,
      paymentStatus: true,
      total: true,
    },
  },
} satisfies Prisma.CrmOpportunityInclude;
function crmDto<T extends { channel: string; order: unknown }>(
  actor: Actor,
  row: T,
): T {
  return {
    ...row,
    order:
      row.channel === "DIRECT" || actor.scopes.includes("orders:read")
        ? row.order
        : null,
  };
}
export function requireCrmChannel(
  actor: Actor,
  channel: string,
  write = false,
) {
  requireScope(actor, write ? "crm:write" : "crm:read");
  requireScope(
    actor,
    channel === "DIRECT" ? "direct_sales:read" : "customers:read",
  );
}
export async function crmAssignees(
  actor: Actor,
  channel?: "DIRECT" | "ONLINE",
) {
  requireScope(actor, "crm:read");
  // Only return public staff identity fields. No credentials or grants are exposed.
  const staff = await db.user.findMany({
    where: { role: { notIn: ["CUSTOMER", "STAFF_DISABLED"] } },
    select: { id: true, name: true, role: true, grants: true },
    orderBy: { name: "asc" },
  });
  return staff
    .filter((u) => {
      const scopes = [...(roles[u.role] ?? []), ...u.grants];
      return (
        scopes.includes("crm:read") &&
        (channel
          ? scopes.includes(
              channel === "DIRECT" ? "direct_sales:read" : "customers:read",
            )
          : contactChannels({ ...actor, scopes }).length)
      );
    })
    .map(({ id, name, role, grants }) => ({
      id,
      name,
      channels: contactChannels({
        ...actor,
        scopes: [...(roles[role] ?? []), ...grants],
      }),
    }));
}
async function validateAssignee(tx: Tx, id: string | null, channel: string) {
  if (!id) return;
  const staff = await tx.user.findUnique({
    where: { id },
    select: { role: true, grants: true },
  });
  const scopes = staff ? [...(roles[staff.role] ?? []), ...staff.grants] : [];
  invariant(
    staff &&
      !["CUSTOMER", "STAFF_DISABLED"].includes(staff.role) &&
      scopes.includes("crm:read") &&
      scopes.includes(
        channel === "DIRECT" ? "direct_sales:read" : "customers:read",
      ),
    400,
    "Choose a CRM colleague who can access this sales channel.",
  );
}
export async function getOpportunity(actor: Actor, id: string, tx: Tx = db) {
  requireScope(actor, "crm:read");
  const row = await tx.crmOpportunity.findUnique({ where: { id }, include });
  invariant(row, 404, "Opportunity not found.");
  requireCrmChannel(actor, row.channel);
  return crmDto(actor, row);
}
async function lockedOpportunity(
  actor: Actor,
  id: string,
  version: number,
  tx: Tx,
) {
  requireScope(actor, "crm:write");
  await tx.$queryRaw`SELECT id FROM "CrmOpportunity" WHERE id=${id} FOR UPDATE`;
  const row = await getOpportunity(actor, id, tx);
  invariant(
    row.version === version,
    409,
    "This opportunity changed. Reload before saving.",
  );
  return row;
}
export async function createOpportunity(
  actor: Actor,
  raw: unknown,
  key: string,
) {
  requireScope(actor, "crm:write");
  const data = opportunityInput.parse(raw);
  requireContactRead(actor, data.contact.kind);
  return db.$transaction((tx) =>
    idempotent(tx, actor.id, "crm.create", key, data, async () => {
      const contact = await resolveContact(actor, data.contact, tx);
      requireCrmChannel(actor, contact.channel, true);
      invariant(
        contact.active,
        409,
        "Restore the archived contact before creating an opportunity.",
      );
      await validateAssignee(tx, data.assignedTo, contact.channel);
      const row = await tx.crmOpportunity.create({
        data: {
          title: data.title,
          channel: contact.channel,
          businessCustomerId:
            data.contact.kind === "office" ? contact.id : null,
          userId: data.contact.kind === "account" ? contact.id : null,
          guestOrderId: data.contact.kind === "guest" ? contact.id : null,
          expectedValue: data.expectedValue,
          expectedClose: data.expectedClose
            ? new Date(data.expectedClose)
            : null,
          assignedTo: data.assignedTo,
          notes: data.notes,
          createdBy: actor.id,
        },
      });
      await audit(tx, actor, "crm.create", row.id, undefined, {
        title: row.title,
        channel: row.channel,
        contact: data.contact,
      });
      return { id: row.id };
    }),
  );
}
export async function updateOpportunity(
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const { version, expectedClose, ...data } = opportunityUpdate.parse(raw);
  return db.$transaction(async (tx) => {
    const old = await lockedOpportunity(actor, id, version, tx);
    await validateAssignee(tx, data.assignedTo, old.channel);
    const row = await tx.crmOpportunity.update({
      where: { id },
      data: {
        ...data,
        expectedClose: expectedClose ? new Date(expectedClose) : null,
        version: { increment: 1 },
      },
    });
    await audit(
      tx,
      actor,
      "crm.update",
      id,
      {
        title: old.title,
        expectedValue: old.expectedValue,
        assignedTo: old.assignedTo,
        expectedClose: old.expectedClose,
        notes: old.notes,
      },
      { ...data, expectedClose },
    );
    return { id: row.id };
  });
}
export async function moveOpportunity(actor: Actor, id: string, raw: unknown) {
  const data = stageInput.parse(raw);
  return db.$transaction(async (tx) => {
    const old = await lockedOpportunity(actor, id, data.version, tx);
    if (data.stage === "WON" && old.channel === "ONLINE")
      requireScope(actor, "orders:read");
    invariant(
      data.stage !== "LOST" || data.lostReason.length >= 3,
      400,
      "Add a reason before marking an opportunity lost.",
    );
    if (data.stage === "WON") {
      invariant(
        old.orderId,
        409,
        "Link an active order before marking this opportunity won.",
      );
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${old.orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: old.orderId },
        select: { status: true },
      });
      invariant(
        !["CANCELLED", "EXPIRED"].includes(order.status),
        409,
        "Link an active order before marking this opportunity won.",
      );
    }
    await tx.crmOpportunity.update({
      where: { id },
      data: {
        stage: data.stage,
        lostReason: data.stage === "LOST" ? data.lostReason : "",
        version: { increment: 1 },
      },
    });
    await audit(
      tx,
      actor,
      "crm.stage",
      id,
      { stage: old.stage },
      { stage: data.stage, lostReason: data.lostReason },
    );
    return { id };
  });
}
export function opportunityContact(row: {
  businessCustomerId: string | null;
  userId: string | null;
  guestOrderId: string | null;
}) {
  return row.businessCustomerId
    ? { kind: "office" as const, id: row.businessCustomerId }
    : row.userId
      ? { kind: "account" as const, id: row.userId }
      : { kind: "guest" as const, id: row.guestOrderId! };
}
// The same operation is used by explicit linking and direct-order confirmation.
// Locks precede customer/SKU locks in createDirectOrder to keep lock order stable.
export async function prepareOpportunityOrder(
  actor: Actor,
  id: string,
  version: number,
  customerId: string,
  tx: Tx,
) {
  const row = await lockedOpportunity(actor, id, version, tx);
  invariant(
    row.channel === "DIRECT" && row.businessCustomerId === customerId,
    409,
    "The opportunity belongs to a different contact or channel.",
  );
  invariant(
    !row.orderId && !["WON", "LOST"].includes(row.stage),
    409,
    "Use an open opportunity without a linked order.",
  );
}
export async function attachOpportunityOrder(
  actor: Actor,
  id: string,
  orderId: string,
  tx: Tx,
) {
  await tx.crmOpportunity.update({
    where: { id },
    data: { orderId, stage: "WON", lostReason: "", version: { increment: 1 } },
  });
  await audit(tx, actor, "crm.order_link", id, undefined, {
    orderId,
    stage: "WON",
  });
}
export async function linkOpportunityOrder(
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const data = orderLinkInput.parse(raw);
  return db.$transaction(async (tx) => {
    const row = await lockedOpportunity(actor, id, data.version, tx);
    invariant(
      !row.orderId,
      409,
      "This opportunity already has a linked order.",
    );
    // Reading an online contact does not grant access to its orders.
    requireScope(
      actor,
      row.channel === "DIRECT" ? "direct_sales:read" : "orders:read",
    );
    const ref = opportunityContact(row);
    const order = await tx.order.findFirst({
      where: {
        ...contactOrderWhere(ref.kind, ref.id),
        reference: data.reference,
      },
      select: { id: true },
    });
    invariant(
      order,
      404,
      "An order with this reference was not found for this contact.",
    );
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, opportunity: { select: { id: true } } },
    });
    invariant(
      !["CANCELLED", "EXPIRED"].includes(current.status),
      409,
      "Cancelled or expired orders cannot be linked as a win.",
    );
    invariant(
      !current.opportunity,
      409,
      "This order is already linked to an opportunity.",
    );
    await attachOpportunityOrder(actor, id, order.id, tx);
    return { id };
  });
}
function crmWhere(
  actor: Actor,
  data: z.infer<typeof crmQuery>,
): Prisma.CrmOpportunityWhereInput {
  requireScope(actor, "crm:read");
  const channels = contactChannels(actor);
  invariant(channels.length, 403, "Contact access is required for CRM.");
  if (data.channel !== "ALL") requireCrmChannel(actor, data.channel);
  return {
    channel: data.channel === "ALL" ? { in: channels } : data.channel,
    ...(data.mine === "yes" ? { assignedTo: actor.id } : {}),
    ...(data.q
      ? {
          OR: [
            { title: { contains: data.q, mode: "insensitive" } },
            {
              businessCustomer: {
                company: { contains: data.q, mode: "insensitive" },
              },
            },
            { user: { name: { contains: data.q, mode: "insensitive" } } },
            {
              guestOrder: {
                OR: [
                  { reference: { contains: data.q, mode: "insensitive" } },
                  { email: { contains: data.q, mode: "insensitive" } },
                  { address: { path: ["name"], string_contains: data.q } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}
export async function listOpportunities(actor: Actor, raw: unknown = {}) {
  const data = crmQuery.parse(raw);
  const base = crmWhere(actor, data);
  const where = {
    ...base,
    ...(data.stage !== "ALL" ? { stage: data.stage } : {}),
  };
  const [totals, rows, total] = await Promise.all([
    db.crmOpportunity.groupBy({
      by: ["stage"],
      where: base,
      _count: true,
      _sum: { expectedValue: true },
    }),
    db.crmOpportunity.findMany({
      where,
      take: 25,
      skip: (data.page - 1) * 25,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include,
    }),
    db.crmOpportunity.count({ where }),
  ]);
  const board =
    data.view === "board"
      ? await Promise.all(
          crmStages
            .filter((s) => data.stage === "ALL" || data.stage === s)
            .map(async (stage) => ({
              stage,
              rows: await db.crmOpportunity.findMany({
                where: { ...base, stage },
                take: 12,
                orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
                include,
              }),
            })),
        )
      : [];
  return {
    rows: rows.map((r) => crmDto(actor, r)),
    total,
    page: data.page,
    totals,
    board: board.map((b) => ({
      ...b,
      rows: b.rows.map((r) => crmDto(actor, r)),
    })),
  };
}
export async function createActivity(
  actor: Actor,
  id: string,
  raw: unknown,
  key: string,
) {
  requireScope(actor, "crm:write");
  const data = activityInput.parse(raw);
  await getOpportunity(actor, id);
  return db.$transaction((tx) =>
    idempotent(tx, actor.id, "crm.activity", key, { id, ...data }, async () => {
      invariant(
        new Date(data.dueAt) > new Date(),
        400,
        "Choose a future activity time.",
      );
      await getOpportunity(actor, id, tx);
      const row = await tx.crmActivity.create({
        data: {
          ...data,
          dueAt: new Date(data.dueAt),
          opportunityId: id,
          createdBy: actor.id,
        },
      });
      await audit(tx, actor, "crm.activity", id, undefined, {
        activityId: row.id,
        ...data,
      });
      return { id: row.id };
    }),
  );
}
export async function completeActivity(actor: Actor, id: string) {
  requireScope(actor, "crm:write");
  return db.$transaction(async (tx) => {
    const row = await tx.crmActivity.findUnique({ where: { id } });
    invariant(row, 404, "Activity not found.");
    await getOpportunity(actor, row.opportunityId, tx);
    const update = await tx.crmActivity.updateMany({
      where: { id, completedAt: null },
      data: { completedAt: new Date(), completedBy: actor.id },
    });
    if (update.count)
      await audit(
        tx,
        actor,
        "crm.activity_complete",
        row.opportunityId,
        undefined,
        { activityId: id },
      );
    return { id };
  });
}
export async function listActivities(
  actor: Actor,
  raw: unknown = {},
  opportunityId?: string,
) {
  const data = crmQuery.parse(raw);
  const opportunity = crmWhere(actor, data);
  if (opportunityId) await getOpportunity(actor, opportunityId);
  const where: Prisma.CrmActivityWhereInput = {
    opportunity,
    ...(opportunityId ? { opportunityId } : { completedAt: null }),
  };
  const [rows, total] = await Promise.all([
    db.crmActivity.findMany({
      where,
      orderBy: [
        { completedAt: { sort: "asc", nulls: "first" } },
        { dueAt: "asc" },
        { id: "asc" },
      ],
      take: 25,
      skip: (data.page - 1) * 25,
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            channel: true,
            assignedTo: true,
            stage: true,
          },
        },
      },
    }),
    db.crmActivity.count({ where }),
  ]);
  return { rows, total, page: data.page };
}
