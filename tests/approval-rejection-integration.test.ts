import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { actorForUser, hash, type Actor } from "../src/domains/identity";
import { approve, propose } from "../src/domains/approvals";
import { POST } from "../src/app/api/v1/[...path]/route";

const prefix = `proposal-reject-${randomUUID()}`;
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const users: string[] = [];
const products: string[] = [];
let isolatedDatabaseVerified = false;
let owner: { actor: Actor; cookie: string },
  author: { actor: Actor; cookie: string },
  other: { actor: Actor; cookie: string };
let brandId = "",
  categoryId = "",
  clientId = "",
  keyId = "";
const token = randomUUID();

async function staff(role: string) {
  const signed = await auth.api.signUpEmail({
    body: {
      name: `${prefix}-${role}`,
      email: `${prefix}-${role}@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  const id = (await signed.json()).user.id;
  users.push(id);
  await db.user.update({ where: { id }, data: { role } });
  return {
    actor: await actorForUser(id),
    cookie: signed.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; "),
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  isolatedDatabaseVerified = true;
  owner = await staff("OWNER");
  author = await staff("CATALOG");
  other = await staff("EDITOR");
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  categoryId = (
    await db.category.create({ data: { name: prefix, slug: prefix } })
  ).id;
  const client = await db.apiClient.create({
    data: {
      name: prefix,
      scopes: ["pricing:write"],
      keys: {
        create: {
          prefix: "test",
          hash: hash(token),
          scopes: ["pricing:write"],
          expiresAt: new Date(Date.now() + 60000),
        },
      },
    },
    include: { keys: true },
  });
  clientId = client.id;
  keyId = client.keys[0].id;
});

afterAll(async () => {
  if (!isolatedDatabaseVerified) return;
  await db.proposal.deleteMany({ where: { actorId: { in: users } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await db.sku.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (clientId) {
    await db.rateLimit.deleteMany({ where: { key: `key:${keyId}` } });
    await db.apiKey.deleteMany({ where: { clientId } });
    await db.apiClient.delete({ where: { id: clientId } });
  }
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

async function fixture() {
  const code = `${prefix}-${products.length}`;
  const product = await db.product.create({
    data: {
      name: code,
      slug: code,
      brandId,
      categoryId,
      skus: { create: { code, price: 10000 } },
    },
    include: { skus: true },
  });
  products.push(product.id);
  const sku = product.skus[0];
  const proposal = await propose(author.actor, "price.change", sku.id, {
    price: 15000,
  });
  return { sku, proposal };
}

function rejectRequest(id: string, cookie: string, bearer?: string) {
  return POST(
    new NextRequest(`${origin}/api/v1/admin/proposals/${id}/reject`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(bearer
          ? { Authorization: `Bearer ${bearer}` }
          : { Cookie: cookie }),
      },
      body: "{}",
    }),
    { params: Promise.resolve({ path: ["admin", "proposals", id, "reject"] }) },
  );
}

async function waitForBlockedBy(pid: number, finished = () => false) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (finished()) return undefined;
    const rows = await db.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
    if (rows[0]) return rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected proposal transaction did not wait for its lock.");
}

it("serializes HTTP rejection behind approval and reports the losing rejection as a conflict", async () => {
  const f = await fixture();
  let release!: () => void;
  let signal!: (pid: number) => void;
  let fail!: (error: unknown) => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<number>((resolve, reject) => {
    signal = resolve;
    fail = reject;
  });
  const targetLock = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sku" WHERE id=${f.sku.id} FOR UPDATE`;
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      signal(backend.pid);
      await released;
    },
    { timeout: 15000 },
  );
  void targetLock.catch(fail);
  const targetPid = await ready;
  const applying = approve(owner.actor, f.proposal.id).then(
    () => null,
    (error: unknown) => error,
  );
  let rejecting: Promise<Response> | undefined;
  let earlyStatus: number | undefined;
  let rejectionPid: number | undefined;
  let approvalResult: unknown;
  let rejected: Response | undefined;
  try {
    const approvalPid = await waitForBlockedBy(targetPid);
    expect(approvalPid).toBeDefined();
    rejecting = rejectRequest(f.proposal.id, owner.cookie).then((response) => {
      earlyStatus = response.status;
      return response;
    });
    rejectionPid = await waitForBlockedBy(
      approvalPid!,
      () => earlyStatus !== undefined,
    );
  } finally {
    release();
    [approvalResult, rejected] = await Promise.all([
      applying,
      rejecting,
      targetLock,
    ]);
  }
  expect(
    rejectionPid,
    `Rejection finished before approval with HTTP ${earlyStatus}`,
  ).toBeDefined();
  expect(approvalResult).toBeNull();
  expect(rejected?.status).toBe(409);
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: f.proposal.id } }),
  ).toMatchObject({ status: "APPROVED", approverId: owner.actor.id });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } }),
  ).toMatchObject({ price: 15000, version: f.sku.version + 1 });
  expect(
    await db.auditEvent.count({
      where: { proposalId: f.proposal.id, operation: "price.change" },
    }),
  ).toBe(1);
  expect(
    await db.auditEvent.count({
      where: { proposalId: f.proposal.id, operation: "proposal.reject" },
    }),
  ).toBe(0);
});

it("does not overwrite rejection by a legacy writer while approval waits for the target", async () => {
  const f = await fixture();
  let release!: () => void;
  let signal!: (pid: number) => void;
  let fail!: (error: unknown) => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<number>((resolve, reject) => {
    signal = resolve;
    fail = reject;
  });
  const targetLock = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sku" WHERE id=${f.sku.id} FOR UPDATE`;
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      signal(backend.pid);
      await released;
    },
    { timeout: 15000 },
  );
  void targetLock.catch(fail);
  const targetPid = await ready;
  const applying = approve(owner.actor, f.proposal.id).then(
    () => null,
    (error: unknown) => error,
  );
  let result: unknown;
  try {
    expect(await waitForBlockedBy(targetPid)).toBeDefined();
    // Old rejection handlers did not acquire the proposal advisory lock.
    await db.proposal.update({
      where: { id: f.proposal.id },
      data: { status: "REJECTED", approverId: author.actor.id },
    });
  } finally {
    release();
    [result] = await Promise.all([applying, targetLock]);
  }
  expect(result).toMatchObject({ status: 409 });
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: f.proposal.id } }),
  ).toMatchObject({ status: "REJECTED", approverId: author.actor.id });
  expect(await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } })).toEqual(
    f.sku,
  );
  expect(
    await db.auditEvent.count({
      where: { proposalId: f.proposal.id, operation: "price.change" },
    }),
  ).toBe(0);
});

it.each(["author", "owner"] as const)(
  "allows the %s to reject once, then blocks approval and duplicate rejection",
  async (identity) => {
    const f = await fixture();
    const reviewer = identity === "author" ? author : owner;
    const rejected = await rejectRequest(f.proposal.id, reviewer.cookie);
    expect(rejected.status).toBe(200);
    expect((await rejected.json()).data).toEqual({ rejected: true });
    await expect(approve(owner.actor, f.proposal.id)).rejects.toMatchObject({
      status: 409,
    });
    expect((await rejectRequest(f.proposal.id, reviewer.cookie)).status).toBe(
      409,
    );
    expect(await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } })).toEqual(
      f.sku,
    );
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: f.proposal.id } }),
    ).toMatchObject({ status: "REJECTED", approverId: reviewer.actor.id });
    expect(
      await db.auditEvent.count({
        where: {
          proposalId: f.proposal.id,
          operation: "proposal.reject",
          actorId: reviewer.actor.id,
        },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { proposalId: f.proposal.id, operation: "price.change" },
      }),
    ).toBe(0);
  },
);

it("denies unrelated humans, integration keys and a demoted Owner without consuming the proposal", async () => {
  const f = await fixture();
  expect((await rejectRequest(f.proposal.id, other.cookie)).status).toBe(404);
  expect((await rejectRequest(f.proposal.id, "", token)).status).toBe(403);
  await db.user.update({
    where: { id: owner.actor.id },
    data: { role: "EDITOR" },
  });
  try {
    expect((await rejectRequest(f.proposal.id, owner.cookie)).status).toBe(404);
  } finally {
    await db.user.update({
      where: { id: owner.actor.id },
      data: { role: "OWNER" },
    });
  }
  expect(await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } })).toEqual(
    f.sku,
  );
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: f.proposal.id } }),
  ).toMatchObject({ status: "PENDING", approverId: null });
  expect(
    await db.auditEvent.count({
      where: { proposalId: f.proposal.id, operation: "proposal.reject" },
    }),
  ).toBe(0);
});
