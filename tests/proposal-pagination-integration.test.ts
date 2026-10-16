import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { adminList } from "../src/domains/administration";
import { actorForUser, type Actor } from "../src/domains/identity";
import type { Prisma } from "../src/generated/prisma/client";

const prefix = `proposal-pagination-${randomUUID()}`;
const staffId = `${prefix}-staff`;
const otherId = `${prefix}-other`;
const ownerId = `${prefix}-owner`;
const actorIds = [staffId, otherId, ownerId];
const createdAt = Date.now() + 60_000;
let ready = false;

async function proposals(
  actorId: string,
  operation: string,
  payload: Prisma.InputJsonObject,
  count = 1,
  offset = 0,
) {
  const ids = Array.from({ length: count }, () => `${prefix}-${randomUUID()}`);
  await db.proposal.createMany({
    data: ids.map((id, index) => ({
      id,
      actorId,
      operation,
      targetId: `${prefix}-target`,
      payload,
      before: {},
      version: 1,
      createdAt: new Date(createdAt + offset + index),
      expiresAt: new Date(createdAt + 15 * 60_000),
    })),
  });
  return ids;
}

const edit = {
  name: "Pagination test product",
  description: "Isolated proposal listing fixture",
  highlights: [],
  slug: "pagination-test-product",
};
const price = { price: 12345, compareAt: null };

async function proposalIds(actor: Actor, page = 1) {
  const rows = await adminList(actor, "proposals", page);
  if (!Array.isArray(rows)) throw new Error("Expected proposal list.");
  return rows.map((row) => {
    if (!("id" in row)) throw new Error("Expected proposal identifier.");
    return row.id;
  });
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  await db.user.createMany({
    data: actorIds.map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
      role: id === ownerId ? "OWNER" : "CATALOG",
    })),
  });
  ready = true;
});

beforeEach(async () => {
  await db.proposal.deleteMany({ where: { actorId: { in: actorIds } } });
  await db.user.update({
    where: { id: staffId },
    data: { role: "CATALOG", grants: [] },
  });
});

afterAll(async () => {
  if (ready) {
    await db.proposal.deleteMany({ where: { actorId: { in: actorIds } } });
    await db.user.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.$disconnect();
});

it("keeps an older authorized edit on page one after catalogue staff lose pricing access", async () => {
  const [olderEdit] = await proposals(staffId, "product.edit", edit);
  await proposals(staffId, "price.change", price, 30, 1);
  await db.user.update({ where: { id: staffId }, data: { role: "EDITOR" } });
  const actor = await actorForUser(staffId);

  expect(await proposalIds(actor)).toEqual([olderEdit]);
  expect(await proposalIds(actor, 2)).toEqual([]);
});

it("paginates authorized own proposals in complete 30-row pages", async () => {
  const edits = await proposals(staffId, "product.edit", edit, 31);
  await proposals(staffId, "price.change", price, 60, 100);
  await proposals(otherId, "product.edit", edit, 2, 200);
  await proposals(staffId, "__proto__", {}, 1, 250);
  await db.user.update({ where: { id: staffId }, data: { role: "EDITOR" } });
  const actor = await actorForUser(staffId);
  const newestFirst = [...edits].reverse();

  expect(await proposalIds(actor, 1)).toEqual(newestFirst.slice(0, 30));
  expect(await proposalIds(actor, 2)).toEqual(newestFirst.slice(30));
  expect(await proposalIds(actor, 3)).toEqual([]);
});

it("filters return restocking authority before pagination and honors current grants", async () => {
  const [damaged] = await proposals(staffId, "return.receive", {
    disposition: "DAMAGED",
  });
  const restocks = await proposals(
    staffId,
    "return.receive",
    { disposition: "RESTOCK" },
    31,
    1,
  );
  await db.user.update({ where: { id: staffId }, data: { role: "SUPPORT" } });

  expect(await proposalIds(await actorForUser(staffId))).toEqual([damaged]);

  await db.user.update({
    where: { id: staffId },
    data: { grants: ["inventory:adjust"] },
  });
  const actor = await actorForUser(staffId);
  const newestFirst = [...restocks].reverse();
  expect(await proposalIds(actor)).toEqual(newestFirst.slice(0, 30));
  expect(await proposalIds(actor, 2)).toEqual([
    ...newestFirst.slice(30),
    damaged,
  ]);

  await db.user.update({
    where: { id: staffId },
    data: { role: "INVENTORY", grants: [] },
  });
  expect(await proposalIds(await actorForUser(staffId))).toEqual([]);
});

it("preserves Owner visibility across initiators without bypassing operation scopes", async () => {
  const own = await proposals(ownerId, "product.edit", edit);
  const other = await proposals(otherId, "product.edit", edit, 1, 1);
  const priced = await proposals(otherId, "price.change", price, 1, 2);
  const unsupported = await proposals(otherId, "unknown.operation", {}, 1, 3);
  const owner = await actorForUser(ownerId);
  const rows = await proposalIds(owner);

  expect(rows).toEqual(expect.arrayContaining([...own, ...other, ...priced]));
  expect(rows).not.toContain(unsupported[0]);

  const scopedRows = await proposalIds({ ...owner, scopes: ["catalog:write"] });
  expect(scopedRows).toEqual(expect.arrayContaining([...own, ...other]));
  expect(scopedRows).not.toContain(priced[0]);
});
