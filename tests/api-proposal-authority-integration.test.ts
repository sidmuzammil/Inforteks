import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import {
  actorForUser,
  authenticateKey,
  hash,
  type Actor,
} from "../src/domains/identity";
import { issueKey } from "../src/domains/administration";
import { propose, approve } from "../src/domains/approvals";
import { executeTool } from "../src/domains/ai";
import { POST } from "../src/app/api/v1/[...path]/route";

const prefix = `key-proposals-${randomUUID()}`;
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const clients: string[] = [];
const products: string[] = [];
const orders: string[] = [];
let isolatedDatabaseVerified = false;
let owner: Actor,
  cookie = "",
  brandId = "",
  categoryId = "";

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  isolatedDatabaseVerified = true;
  const signed = await auth.api.signUpEmail({
    body: {
      name: prefix,
      email: `${prefix}@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  const id = (await signed.json()).user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
  await db.user.update({ where: { id }, data: { role: "OWNER" } });
  owner = await actorForUser(id);
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  categoryId = (
    await db.category.create({ data: { name: prefix, slug: prefix } })
  ).id;
});

afterAll(async () => {
  if (!isolatedDatabaseVerified) return;
  const actorIds = [...clients, ...(owner ? [owner.id] : [])];
  const keyIds = (
    await db.apiKey.findMany({
      where: { clientId: { in: clients } },
      select: { id: true },
    })
  ).map((k) => k.id);
  await db.proposal.deleteMany({ where: { actorId: { in: actorIds } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
  await db.rateLimit.deleteMany({
    where: { key: { in: keyIds.map((id) => `key:${id}`) } },
  });
  await db.apiKey.deleteMany({ where: { clientId: { in: clients } } });
  await db.apiClient.deleteMany({ where: { id: { in: clients } } });
  await db.returnRequest.deleteMany({ where: { orderId: { in: orders } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  await db.inventoryMovement.deleteMany({
    where: { actorId: owner?.id ?? prefix },
  });
  await db.sku.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (owner) await db.user.delete({ where: { id: owner.id } });
  await db.$disconnect();
});

async function credential(scopes = ["pricing:write"]) {
  const issued = await issueKey(owner, { name: prefix, scopes, days: 1 });
  clients.push(issued.clientId);
  const actor = await authenticateKey(issued.key);
  const key = await db.apiKey.findUniqueOrThrow({
    where: { hash: hash(issued.key) },
  });
  return { actor, token: issued.key, keyId: key.id, clientId: issued.clientId };
}

async function fixture(scopes?: string[]) {
  const access = await credential(scopes);
  const code = `${prefix}-${products.length}`;
  const p = await db.product.create({
    data: {
      name: code,
      slug: code,
      brandId,
      categoryId,
      skus: { create: { code, price: 10000, onHand: 3 } },
    },
    include: { skus: true },
  });
  products.push(p.id);
  return { ...access, sku: p.skus[0] };
}

async function request(path: string, payload: unknown, token?: string) {
  return POST(
    new NextRequest(`${origin}/api/v1/admin/${path}`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : { Cookie: cookie }),
      },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ path: ["admin", ...path.split("/")] }) },
  );
}

async function pendingPrice(f: Awaited<ReturnType<typeof fixture>>) {
  return propose(f.actor, "price.change", f.sku.id, { price: 15000 });
}

async function expectBlocked(
  p: Awaited<ReturnType<typeof propose>>,
  status = 403,
) {
  const before = await db.sku.findUniqueOrThrow({ where: { id: p.targetId } });
  await expect(approve(owner, p.id)).rejects.toMatchObject({ status });
  expect(await db.sku.findUniqueOrThrow({ where: { id: p.targetId } })).toEqual(
    before,
  );
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
  ).toMatchObject({ status: "PENDING", approverId: null });
  expect(
    await db.auditEvent.count({
      where: { proposalId: p.id, operation: p.operation },
    }),
  ).toBe(0);
}

it("binds bearer-created proposals to the exact key and permits only a human to apply once", async () => {
  const f = await fixture();
  const response = await request(
    "proposals",
    {
      operation: "price.change",
      targetId: f.sku.id,
      payload: { price: 15000 },
    },
    f.token,
  );
  expect(response.status).toBe(201);
  const p = (await response.json()).data;
  expect(f.actor.keyId).toBe(f.keyId);
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
  ).toMatchObject({ actorId: f.clientId, originatingKeyId: f.keyId });
  expect(JSON.stringify(p).includes(f.token)).toBe(false);
  expect(JSON.stringify(p).includes(hash(f.token))).toBe(false);
  expect((await request(`proposals/${p.id}/approve`, {}, f.token)).status).toBe(
    403,
  );
  const approved = await request(`proposals/${p.id}/approve`, {});
  expect(approved.status).toBe(200);
  expect((await approved.json()).data).toEqual({
    id: p.id,
    operation: "price.change",
    targetId: f.sku.id,
    status: "APPROVED",
  });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } }),
  ).toMatchObject({ price: 15000, version: f.sku.version + 1 });
  await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
  expect(
    await db.auditEvent.count({
      where: { proposalId: p.id, operation: "price.change" },
    }),
  ).toBe(1);
});

it("revoking the original key blocks its proposal even when the client has a valid replacement key", async () => {
  const f = await fixture();
  const p = await pendingPrice(f);
  const siblingToken = randomUUID();
  await db.apiKey.create({
    data: {
      clientId: f.clientId,
      hash: hash(siblingToken),
      prefix: "test",
      scopes: ["pricing:write"],
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  expect((await request(`api-keys/${f.keyId}/revoke`, {})).status).toBe(200);
  await expect(authenticateKey(f.token)).rejects.toMatchObject({ status: 401 });
  const sibling = await authenticateKey(siblingToken);
  expect(sibling.id).toBe(f.clientId);
  await expectBlocked(p);
  const fresh = await propose(sibling, "price.change", f.sku.id, {
    price: 12000,
  });
  await approve(owner, fresh.id);
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } }),
  ).toMatchObject({ price: 12000 });
});

const invalidations = [
  "key revocation",
  "key expiry",
  "key scopes",
  "client scopes",
  "client deactivation",
] as const;
async function invalidate(
  f: Awaited<ReturnType<typeof fixture>>,
  kind: (typeof invalidations)[number],
) {
  if (kind === "key revocation")
    await db.apiKey.update({
      where: { id: f.keyId },
      data: { revokedAt: new Date() },
    });
  if (kind === "key expiry")
    await db.apiKey.update({
      where: { id: f.keyId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
  if (kind === "key scopes")
    await db.apiKey.update({ where: { id: f.keyId }, data: { scopes: [] } });
  if (kind === "client scopes")
    await db.apiClient.update({
      where: { id: f.clientId },
      data: { scopes: [] },
    });
  if (kind === "client deactivation")
    await db.apiClient.update({
      where: { id: f.clientId },
      data: { active: false },
    });
}

it.each(invalidations)(
  "rechecks %s for pending work and previously authenticated actors",
  async (kind) => {
    const f = await fixture();
    const p = await pendingPrice(f);
    await invalidate(f, kind);
    await expectBlocked(p);
    await expect(pendingPrice(f)).rejects.toMatchObject({ status: 403 });
    expect(await db.proposal.count({ where: { actorId: f.clientId } })).toBe(1);
    if (
      kind === "key revocation" ||
      kind === "key expiry" ||
      kind === "client deactivation"
    )
      await expect(authenticateKey(f.token)).rejects.toMatchObject({
        status: 401,
      });
    else expect((await authenticateKey(f.token)).scopes).toEqual([]);
  },
);

async function waitForBlockedBy(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
    if (rows[0]) return rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Expected local transaction did not wait for its authority lock.",
  );
}

it.each(["key", "proposal"] as const)(
  "rejects %s expiry reached while approval waits for the target",
  async (deadline) => {
    const f = await fixture();
    const p = await pendingPrice(f);
    const expiresAt = new Date(Date.now() + 60000);
    if (deadline === "key")
      await db.apiKey.update({ where: { id: f.keyId }, data: { expiresAt } });
    else await db.proposal.update({ where: { id: p.id }, data: { expiresAt } });
    let release!: () => void;
    let signal!: (pid: number) => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<number>((resolve) => {
      signal = resolve;
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
    const targetPid = await ready;
    const applying = approve(owner, p.id).then(
      () => null,
      (error: unknown) => error,
    );
    let result: unknown;
    try {
      await waitForBlockedBy(targetPid);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(expiresAt.getTime() + 1));
      release();
      [result] = await Promise.all([applying, targetLock]);
    } finally {
      release();
      await Promise.all([applying, targetLock]);
      vi.useRealTimers();
    }
    expect(result).toMatchObject({ status: deadline === "key" ? 403 : 409 });
    expect(await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } })).toEqual(
      f.sku,
    );
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
    ).toMatchObject({ status: "PENDING", approverId: null });
    expect(
      await db.auditEvent.count({
        where: { proposalId: p.id, operation: p.operation },
      }),
    ).toBe(0);
  },
);

it("serializes revocation behind an approval already holding the original key's authority", async () => {
  const f = await fixture();
  const p = await pendingPrice(f);
  let release!: () => void;
  let signal!: (pid: number) => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<number>((resolve) => {
    signal = resolve;
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
  const targetPid = await ready;
  const applying = approve(owner, p.id);
  let revoking: Promise<unknown> | undefined;
  try {
    // Reaching the target lock means the real approval acquired both shared
    // authority locks. The revoke must wait for that exact approval backend.
    const approvalPid = await waitForBlockedBy(targetPid);
    revoking = db.apiKey
      .update({ where: { id: f.keyId }, data: { revokedAt: new Date() } })
      .then((value) => value);
    await waitForBlockedBy(approvalPid);
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
    ).toMatchObject({ status: "PENDING" });
  } finally {
    release();
    await Promise.all([targetLock, applying, ...(revoking ? [revoking] : [])]);
  }
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
  ).toMatchObject({ status: "APPROVED" });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } }),
  ).toMatchObject({ price: 15000 });
  await expect(authenticateKey(f.token)).rejects.toMatchObject({ status: 401 });
});

it("rejects absent or foreign key provenance without inserting a proposal", async () => {
  const f = await fixture();
  const other = await credential();
  for (const keyId of [undefined, other.keyId]) {
    await expect(
      propose({ ...f.actor, keyId }, "price.change", f.sku.id, {
        price: 15000,
      }),
    ).rejects.toMatchObject({ status: 403 });
  }
  expect(await db.proposal.count({ where: { actorId: f.clientId } })).toBe(0);
  // Even a stored attributed record must match its client's identity.
  const p = await pendingPrice(f);
  await db.proposal.update({
    where: { id: p.id },
    data: { originatingKeyId: other.keyId },
  });
  await expectBlocked(p);
});

it("fails closed for legacy integration proposals while retaining existing staff proposals", async () => {
  const f = await fixture();
  const p = await pendingPrice(f);
  await db.proposal.update({
    where: { id: p.id },
    data: { originatingKeyId: null },
  });
  await expectBlocked(p);
  const human = await propose(owner, "price.change", f.sku.id, {
    price: 11000,
  });
  expect(human.originatingKeyId).toBeNull();
  await approve(owner, human.id);
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } }),
  ).toMatchObject({ price: 11000 });
});

it("retains proposal expiry and target version checks for integrations", async () => {
  const f = await fixture();
  const expired = await pendingPrice(f);
  await db.proposal.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expectBlocked(expired, 409);
  const stale = await pendingPrice(f);
  await db.sku.update({
    where: { id: f.sku.id },
    data: { version: { increment: 1 } },
  });
  await expectBlocked(stale, 409);
});

it("retains exact key provenance when an API actor delegates proposal creation through an AI tool", async () => {
  const f = await fixture(["pricing:write", "ai:use"]);
  const result = (await executeTool(f.actor, "propose_price_change", {
    skuId: f.sku.id,
    price: 15000,
    compareAt: null,
  })) as { id: string };
  const p = await db.proposal.findUniqueOrThrow({ where: { id: result.id } });
  expect(p.originatingKeyId).toBe(f.keyId);
  await db.apiKey.update({
    where: { id: f.keyId },
    data: { revokedAt: new Date() },
  });
  await expectBlocked(p);
});

it.each(["key", "client"] as const)(
  "rechecks the secondary inventory scope on the originating %s for restock approval",
  async (authority) => {
    const f = await fixture(["returns:write", "inventory:adjust"]);
    const order = await db.order.create({
      data: {
        reference: `${prefix}-${orders.length}`,
        guestTokenHash: hash(randomUUID()),
        email: `${prefix}@example.test`,
        address: {},
        paymentMethod: "OFFLINE",
        subtotal: 10000,
        discount: 0,
        tax: 0,
        shipping: 0,
        total: 10000,
        shippingSnapshot: {},
        termsSnapshot: {},
        items: {
          create: {
            skuId: f.sku.id,
            snapshot: {},
            quantity: 1,
            fulfilled: 1,
            unitPrice: 10000,
            total: 10000,
          },
        },
      },
      include: { items: true },
    });
    orders.push(order.id);
    const returned = await db.returnRequest.create({
      data: {
        orderId: order.id,
        reason: "Local restock authority regression",
        status: "APPROVED",
        items: [{ itemId: order.items[0].id, quantity: 1 }],
      },
    });
    const p = await propose(f.actor, "return.receive", returned.id, {
      disposition: "RESTOCK",
    });
    if (authority === "key")
      await db.apiKey.update({
        where: { id: f.keyId },
        data: { scopes: ["returns:write"] },
      });
    else
      await db.apiClient.update({
        where: { id: f.clientId },
        data: { scopes: ["returns:write"] },
      });
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 403 });
    expect(
      await db.returnRequest.findUniqueOrThrow({ where: { id: returned.id } }),
    ).toEqual(returned);
    expect(await db.sku.findUniqueOrThrow({ where: { id: f.sku.id } })).toEqual(
      f.sku,
    );
    expect(
      await db.orderItem.findUniqueOrThrow({
        where: { id: order.items[0].id },
      }),
    ).toMatchObject({ returned: 0 });
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: p.id } }),
    ).toMatchObject({ status: "PENDING", approverId: null });
    expect(
      await db.auditEvent.count({
        where: { proposalId: p.id, operation: "return.receive" },
      }),
    ).toBe(0);
  },
);
