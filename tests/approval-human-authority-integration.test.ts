import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { actorForUser } from "../src/domains/identity";
import { approve, propose } from "../src/domains/approvals";

const prefix = `human-approval-${randomUUID()}`;
const initiatorId = `${prefix}-initiator`;
const reviewerId = `${prefix}-reviewer`;
const actorIds = [initiatorId, reviewerId];
const products: string[] = [];
let isolatedDatabaseVerified = false;
let brandId = "",
  categoryId = "";

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  isolatedDatabaseVerified = true;
  await db.user.createMany({
    data: actorIds.map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
      role: id === initiatorId ? "CATALOG" : "MANAGER",
    })),
  });
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  categoryId = (
    await db.category.create({ data: { name: prefix, slug: prefix } })
  ).id;
});

beforeEach(async () => {
  await db.user.update({
    where: { id: initiatorId },
    data: { role: "CATALOG", grants: [] },
  });
  await db.user.update({
    where: { id: reviewerId },
    data: { role: "MANAGER", grants: [] },
  });
});

afterAll(async () => {
  if (!isolatedDatabaseVerified) return;
  await db.proposal.deleteMany({ where: { actorId: { in: actorIds } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
  await db.sku.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: { in: actorIds } } });
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
      skus: {
        create: [
          { code: `${code}-first`, price: 10000 },
          { code: `${code}-later`, price: 10000 },
        ],
      },
    },
    include: { skus: { orderBy: { code: "asc" } } },
  });
  products.push(product.id);
  const initiator = await actorForUser(initiatorId);
  const reviewer = await actorForUser(reviewerId);
  const [firstSku, laterSku] = product.skus;
  const first = await propose(initiator, "price.change", firstSku.id, {
    price: 15000,
  });
  const later = await propose(initiator, "price.change", laterSku.id, {
    price: 16000,
  });
  return { initiator, reviewer, firstSku, laterSku, first, later };
}

async function waitForBlockedBy(blockerPid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const blocked = await db.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))`;
    if (blocked[0]) return blocked[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Expected transaction did not wait for the human authority lock.",
  );
}

it.each(["initiator", "reviewer"] as const)(
  "serializes a %s downgrade with in-flight approval and blocks later approval using cached actors",
  async (identity) => {
    const f = await fixture();
    expect(f.initiator.id).not.toBe(f.reviewer.id);
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
        await tx.$queryRaw`SELECT id FROM "Sku" WHERE id=${f.firstSku.id} FOR UPDATE`;
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
    const applying = approve(f.reviewer, f.first.id).then(
      () => null,
      (error: unknown) => error,
    );
    let downgrading: Promise<unknown> | undefined;
    let approvalResult: unknown;
    let downgradeResult: unknown;
    const downgradedId = identity === "initiator" ? initiatorId : reviewerId;
    try {
      // Waiting on the SKU proves the real approval reached the target after
      // acquiring both users' authority locks. The role update must wait for it.
      const approvalPid = await waitForBlockedBy(targetPid);
      downgrading = db.user
        .update({
          where: { id: downgradedId },
          data: { role: "ANALYST", grants: [] },
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      await waitForBlockedBy(approvalPid);
      expect(
        await db.proposal.findUniqueOrThrow({ where: { id: f.first.id } }),
      ).toMatchObject({ status: "PENDING", approverId: null });
    } finally {
      release();
      [approvalResult, downgradeResult] = await Promise.all([
        applying,
        downgrading ?? Promise.resolve(null),
        targetLock,
      ]);
    }
    expect(approvalResult).toBeNull();
    expect(downgradeResult).toBeNull();
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: f.first.id } }),
    ).toMatchObject({ status: "APPROVED", approverId: reviewerId });
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: f.firstSku.id } }),
    ).toMatchObject({ price: 15000, version: f.firstSku.version + 1 });
    expect(
      await db.auditEvent.count({
        where: {
          proposalId: f.first.id,
          operation: "price.change",
          actorId: reviewerId,
        },
      }),
    ).toBe(1);
    expect((await actorForUser(downgradedId)).scopes).not.toContain(
      "pricing:write",
    );

    // The downgrade is now committed. This untouched target avoids a stale
    // version rejection masking a missing current-user permission check.
    await expect(approve(f.reviewer, f.later.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: f.laterSku.id } }),
    ).toEqual(f.laterSku);
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: f.later.id } }),
    ).toMatchObject({ status: "PENDING", approverId: null });
    expect(
      await db.auditEvent.count({
        where: { proposalId: f.later.id, operation: "price.change" },
      }),
    ).toBe(0);
  },
);
