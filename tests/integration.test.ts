import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  actorForUser,
  authenticateKey,
  hash,
  type Actor,
} from "../src/domains/identity";
import { createProduct, catalogue, getProduct } from "../src/domains/catalogue";
import { propose, approve } from "../src/domains/approvals";
import {
  ensureCart,
  setCartItem,
  checkout,
  ownedOrder,
  requestReturn,
} from "../src/domains/commerce";
import { executeTool } from "../src/domains/ai";
import {
  issueKey,
  importPreview,
  commitImport,
} from "../src/domains/administration";
import { reviewReturn } from "../src/domains/returns";
import { expireReservations } from "../src/domains/maintenance";
import { runOneJob } from "../scripts/worker";

const prefix = `TEST-${randomUUID().slice(0, 8)}`;
let owner: Actor,
  editor: Actor,
  categoryId: string,
  brandId: string,
  productId: string,
  skuId: string,
  slug: string;
const address = {
  name: "Test Customer",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Test Area",
  line1: "Test Building 1",
  area: "Downtown Dubai",
  zone: "Business district",
  postalCode: "",
  location: {
    latitude: 25.1972,
    longitude: 55.2744,
    accuracy: 18,
    confirmed: true,
  },
};
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("inforteks_test"))
    throw new Error(
      "Integration tests require the isolated inforteks_test database.",
    );
  process.env.DEV_PAYMENT_SIMULATOR = "true";
  for (const [role, id] of [
    ["OWNER", `${prefix}-owner`],
    ["EDITOR", `${prefix}-editor`],
  ])
    await db.user.create({
      data: { id, email: `${id}@example.test`, name: id, role },
    });
  owner = await actorForUser(`${prefix}-owner`);
  editor = await actorForUser(`${prefix}-editor`);
  categoryId = (
    await db.category.create({
      data: { name: prefix, slug: prefix.toLowerCase() },
    })
  ).id;
  brandId = (
    await db.brand.create({
      data: { name: prefix, slug: prefix.toLowerCase() },
    })
  ).id;
  await db.shippingZone.create({
    data: {
      name: prefix,
      emirates: ["Dubai"],
      rate: 2500,
      freeAbove: 50000,
      estimate: "Development only",
    },
  });
  const p = await createProduct(owner, {
    name: `${prefix} laptop`,
    brandId,
    categoryId,
    skus: [
      { code: `${prefix}-16`, price: 10000, specs: { ram: 16, storage: 256 } },
      { code: `${prefix}-8`, price: 9000, specs: { ram: 8, storage: 512 } },
    ],
  });
  productId = p.id;
  slug = p.slug;
  skuId = (
    await db.sku.findFirstOrThrow({
      where: { productId, code: `${prefix}-16` },
    })
  ).id;
});
afterAll(async () => {
  await db.$disconnect();
});
describe("shared services against PostgreSQL", () => {
  it("keeps drafts out of every public catalogue", async () => {
    expect(await getProduct(slug)).toBeNull();
    expect((await catalogue({ q: prefix })).total).toBe(0);
  });
  it("prevents editor prices and AI permission escalation", async () => {
    await expect(
      createProduct(editor, {
        name: "Rejected editor draft",
        brandId,
        categoryId,
        skus: [{ code: `${prefix}-BAD`, price: 5 }],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executeTool(editor, "propose_price_change", {
        skuId,
        price: 1,
        compareAt: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executeTool(owner, "execute_sql", { query: "anything" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects publication without images", async () => {
    await expect(
      propose(owner, "product.publish", productId, {}),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("stages and approves publication with audit in the same transaction", async () => {
    await db.media.create({
      data: { productId, key: `${prefix}.webp`, alt: "Test laptop" },
    });
    const p = await propose(owner, "product.publish", productId, {});
    expect(await getProduct(slug)).toBeNull();
    await approve(owner, p.id);
    expect((await getProduct(slug))?.name).toContain(prefix);
    expect(
      await db.auditEvent.count({
        where: { operation: "product.publish", proposalId: p.id },
      }),
    ).toBe(1);
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
  });
  it("matches combined filters against a real SKU combination", async () => {
    expect(
      (await catalogue({ q: prefix, ram: "16", storage: "512" })).total,
    ).toBe(0);
    expect(
      (await catalogue({ q: prefix, ram: "16", storage: "256" })).total,
    ).toBe(1);
  });
  it("never leaks cost or reserved quantities in public DTOs", async () => {
    await db.sku.update({ where: { id: skuId }, data: { cost: 7500 } });
    const p = await getProduct(slug);
    expect(JSON.stringify(p)).not.toContain('"cost"');
    expect(JSON.stringify(p)).not.toContain('"reserved"');
  });
  it("requires exact human approval and rejects stale proposals", async () => {
    const p = await propose(owner, "price.change", skuId, {
      price: 12345,
      compareAt: null,
    });
    await expect(
      approve({ ...owner, human: false, source: "api" }, p.id),
    ).rejects.toMatchObject({ status: 403 });
    await db.sku.update({
      where: { id: skuId },
      data: { version: { increment: 1 } },
    });
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).price,
    ).toBe(10000);
  });
  it("applies approved prices immediately and does not trust AI confirmation", async () => {
    const p = (await executeTool(owner, "propose_price_change", {
      skuId,
      price: 10100,
      compareAt: null,
    })) as { id: string };
    expect(
      (await getProduct(slug))?.skus.find((s) => s.id === skuId)?.price,
    ).toBe(10000);
    await approve(owner, p.id);
    expect(
      (await getProduct(slug))?.skus.find((s) => s.id === skuId)?.price,
    ).toBe(10100);
  });
  it("prevents two customers reserving the last unit", async () => {
    const proposal = await propose(owner, "inventory.adjust", skuId, {
      delta: 1,
      reason: "Test last unit",
    });
    await approve(owner, proposal.id);
    const a = await ensureCart();
    const b = await ensureCart();
    await setCartItem(a.cart.id, { skuId, quantity: 1 });
    await setCartItem(b.cart.id, { skuId, quantity: 1 });
    const body = {
      email: "guest@example.test",
      address,
      paymentMethod: "SIMULATOR",
    };
    const results = await Promise.allSettled([
      checkout(a.cart.id, undefined, body, randomUUID()),
      checkout(b.cart.id, undefined, body, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const sku = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
    const placed = await db.order.findFirstOrThrow({
      where: { items: { some: { skuId } } },
    });
    expect(placed.address).toMatchObject(address);
    expect(sku.reserved).toBe(1);
    expect(sku.onHand).toBe(1);
  });
  it("protects order ownership and releases allocations once on cancellation", async () => {
    const order = await db.order.findFirstOrThrow({
      where: { items: { some: { skuId } } },
    });
    await expect(ownedOrder(order.id)).rejects.toMatchObject({ status: 404 });
    await expect(ownedOrder(order.id, editor.id)).rejects.toMatchObject({
      status: 404,
    });
    const p = await propose(owner, "order.cancel", order.id, {
      reason: "Concurrency test completed",
    });
    await approve(owner, p.id);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
    ).toBe(0);
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
  });
  it("makes checkout retries idempotent and binds keys to payload", async () => {
    const a = await ensureCart();
    await setCartItem(a.cart.id, { skuId, quantity: 1 });
    const key = randomUUID();
    const data = {
      email: "guest@example.test",
      address,
      paymentMethod: "SIMULATOR",
    };
    const first = await checkout(a.cart.id, undefined, data, key);
    const second = await checkout(a.cart.id, undefined, data, key);
    expect(second).toEqual(first);
    await expect(
      checkout(
        a.cart.id,
        undefined,
        { ...data, email: "changed@example.test" },
        key,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await ownedOrder(first.id, undefined, first.guestToken)).total,
    ).toBe(12600);
  });
  it("rejects stock adjustments below reservations and client-submitted totals", async () => {
    const p = await propose(owner, "inventory.adjust", skuId, {
      delta: -1,
      reason: "Invalid below allocation",
    });
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
    const a = await ensureCart();
    await expect(
      checkout(
        a.cart.id,
        undefined,
        {
          email: "a@example.test",
          address,
          paymentMethod: "SIMULATOR",
          total: 1,
        },
        randomUUID(),
      ),
    ).rejects.toThrow();
  });
  it("consumes a shipment exactly once and preserves commercial snapshots", async () => {
    const order = await db.order.findFirstOrThrow({
      where: { items: { some: { skuId } }, status: "PLACED" },
      include: { items: true },
    });
    const original = order.items[0].unitPrice;
    const p = await propose(owner, "order.fulfil", order.id, {
      carrier: "Development fulfillment",
      items: order.items.map((i) => ({ itemId: i.id, quantity: i.quantity })),
    });
    await approve(owner, p.id);
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).onHand,
    ).toBe(0);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
    ).toBe(0);
    await db.sku.update({ where: { id: skuId }, data: { price: 99999 } });
    expect(
      (
        await db.orderItem.findUniqueOrThrow({
          where: { id: order.items[0].id },
        })
      ).unitPrice,
    ).toBe(original);
  });
  it("hashes API keys, enforces read-only scopes and checks immediate revocation", async () => {
    const result = await issueKey(owner, {
      name: prefix,
      scopes: ["catalog:read"],
      days: 1,
    });
    const key = await db.apiKey.findUniqueOrThrow({
      where: { hash: hash(result.key) },
    });
    expect(key.hash).not.toBe(result.key);
    const actor = await authenticateKey(result.key);
    expect(actor.scopes).toEqual(["catalog:read"]);
    await expect(createProduct(actor, {})).rejects.toMatchObject({
      status: 403,
    });
    await db.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    await expect(authenticateKey(result.key)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("validates imports without modifying catalogue data", async () => {
    const before = await db.product.count();
    const csv = `name,sku,brand,category,price_aed,description\n${prefix} import,${prefix}-IMPORT,${prefix.toLowerCase()},${prefix.toLowerCase()},123.45,Development import`;
    const result = await importPreview(owner, { csv });
    expect(result.errors).toEqual([]);
    expect(await db.product.count()).toBe(before);
  });
  it("revoked user authority invalidates a pending proposal", async () => {
    const p = await propose(owner, "price.change", skuId, {
      price: 1000,
      compareAt: null,
    });
    await db.user.update({
      where: { id: owner.id },
      data: { role: "ANALYST" },
    });
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: owner.id }, data: { role: "OWNER" } });
  });
  it("restocks only received inspected returns and rejects replay", async () => {
    const order = await db.order.findFirstOrThrow({
      where: { items: { some: { skuId } }, status: "COMPLETED" },
      include: { items: true },
    });
    await db.order.update({
      where: { id: order.id },
      data: { userId: editor.id },
    });
    const r = await requestReturn(editor.id, {
      orderId: order.id,
      itemId: order.items[0].id,
      quantity: 1,
      reason: "Development return verification",
    });
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).onHand,
    ).toBe(0);
    await reviewReturn(owner, r.id, { status: "APPROVED" });
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).onHand,
    ).toBe(0);
    const p = await propose(owner, "return.receive", r.id, {
      disposition: "RESTOCK",
    });
    await approve(owner, p.id);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).onHand,
    ).toBe(1);
    await expect(approve(owner, p.id)).rejects.toMatchObject({ status: 409 });
    await expect(
      requestReturn(editor.id, {
        orderId: order.id,
        itemId: order.items[0].id,
        quantity: 1,
        reason: "Repeated return test",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("expires unpaid unshipped reservations exactly once", async () => {
    const c = await ensureCart();
    await setCartItem(c.cart.id, { skuId, quantity: 1 });
    const result = await checkout(
      c.cart.id,
      undefined,
      { email: "expiry@example.test", address, paymentMethod: "SIMULATOR" },
      randomUUID(),
    );
    await db.order.update({
      where: { id: result.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expireReservations();
    await expireReservations();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: result.id } })).status,
    ).toBe("EXPIRED");
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
    ).toBe(0);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).onHand,
    ).toBe(1);
  });
  it("commits a validated import through a durable worker job", async () => {
    const batch = await db.importBatch.findFirstOrThrow({
      where: { actorId: owner.id, status: "PREVIEW" },
      orderBy: { createdAt: "desc" },
    });
    const job = await commitImport(owner, batch.id);
    for (let i = 0; i < 100; i++) {
      await runOneJob();
      if (
        (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status ===
        "COMPLETED"
      )
        break;
    }
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe("COMPLETED");
    expect(
      (
        await db.sku.findUniqueOrThrow({
          where: { code: `${prefix}-IMPORT` },
          include: { product: true },
        })
      ).product.status,
    ).toBe("DRAFT");
    await expect(commitImport(owner, batch.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
