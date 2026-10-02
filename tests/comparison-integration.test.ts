import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { db } from "../src/lib/db";
import { compareProducts, comparisonInsights } from "../src/domains/comparison";
import { ensureCart, getCart, setCartItem } from "../src/domains/commerce";
const completion = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: completion } };
  },
}));
const key = `compare-${randomUUID()}`;
let categoryId: string, otherId: string, brandId: string, productId: string;
const ids: string[] = [];
beforeAll(async () => {
  vi.stubEnv("AI_COMPARE_ENABLED", "false");
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Use inforteks_test");
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  otherId = (
    await db.category.create({
      data: { name: `${key}-other`, slug: `${key}-other` },
    })
  ).id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  const product = await db.product.create({
    data: {
      name: "Comparison fixture",
      slug: key,
      categoryId,
      brandId,
      status: "PUBLISHED",
      specs: { CPU: "Listed processor", weight: "1.4 kg", dataset: "internal" },
      skus: {
        create: [
          {
            code: `${key}-16`,
            price: 100000,
            onHand: 3,
            options: { colour: "Blue" },
            specs: { ram: 16, weight: "1.5 kg" },
          },
          {
            code: `${key}-32`,
            price: 130000,
            onHand: 2,
            options: { colour: "Blue" },
            specs: { ram: 32 },
          },
        ],
      },
    },
    include: { skus: { orderBy: { price: "asc" } } },
  });
  productId = product.id;
  ids.push(...product.skus.map((s) => s.id));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.cart.deleteMany({
    where: { userId: { in: [key, `${key}-other`] } },
  });
  await db.user.deleteMany({ where: { id: { in: [key, `${key}-other`] } } });
  await db.sku.deleteMany({ where: { product: { brandId } } });
  await db.product.deleteMany({ where: { brandId } });
  await db.category.deleteMany({
    where: { id: { in: [categoryId, otherId] } },
  });
  await db.brand.delete({ where: { id: brandId } });
  await db.rateLimit.deleteMany({
    where: { key: { in: [`comparison-ai:${key}`, "comparison-ai:daily"] } },
  });
  await db.$disconnect();
});
describe("live comparison and customer cart persistence", () => {
  it("merges product, option and SKU facts, distinguishes variants, and refreshes prices", async () => {
    const first = await compareProducts({ skuIds: ids });
    expect(first.items).toHaveLength(2);
    expect(first.rows.find((r) => r.key === "spec:cpu")?.values).toEqual([
      "Listed processor",
      "Listed processor",
    ]);
    expect(first.rows.find((r) => r.key === "spec:weight")?.values).toEqual([
      "1.5 kg",
      "1.4 kg",
    ]);
    expect(first.rows.find((r) => r.key === "spec:colour")?.different).toBe(
      false,
    );
    expect(first.rows.find((r) => r.key === "spec:ram")?.different).toBe(true);
    expect(first.rows.some((r) => r.key.includes("dataset"))).toBe(false);
    await db.sku.update({ where: { id: ids[0] }, data: { price: 110000 } });
    const fresh = await compareProducts({ skuIds: ids });
    expect(
      fresh.items[0].product.skus.find((s) => s.id === ids[0])?.price,
    ).toBe(110000);
    expect(fresh.summary[0].replaceAll("\u00a0", " ")).toContain("AED 200.00");
  });
  it("bounds AI explanations to current public facts, validates responses, and enforces the daily user limit", async () => {
    vi.stubEnv("AI_COMPARE_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("OPENAI_MODEL", "test-only-model");
    await db.sku.update({ where: { id: ids[0] }, data: { cost: 12345 } });
    completion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "The listed memory differs.",
              cautions: ["Benchmarks are not listed."],
            }),
          },
        },
      ],
    });
    const answer = await comparisonInsights(key, {
      skuIds: ids,
      purpose: "work",
    });
    expect(answer.summary).toBe("The listed memory differs.");
    const request = completion.mock.calls[0][0];
    expect(request.max_completion_tokens).toBe(700);
    expect(request.tools).toBeUndefined();
    const facts = request.messages[1].content;
    expect(facts).toContain("ram");
    expect(facts).not.toContain("12345");
    expect(facts).not.toContain('"cost"');
    completion.mockResolvedValue({
      choices: [{ message: { content: "invalid JSON" } }],
    });
    await expect(
      comparisonInsights(key, { skuIds: ids, purpose: "work" }),
    ).rejects.toMatchObject({ status: 503 });
    completion.mockRejectedValue(new Error("Provider unavailable"));
    for (let i = 0; i < 3; i++)
      await expect(
        comparisonInsights(key, { skuIds: ids, purpose: "work" }),
      ).rejects.toMatchObject({ status: 503 });
    await expect(
      comparisonInsights(key, { skuIds: ids, purpose: "work" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(completion).toHaveBeenCalledTimes(5);
    vi.stubEnv("AI_COMPARE_ENABLED", "false");
  });
  it("filters private/inactive products and rejects invalid mixed or oversized comparisons", async () => {
    expect(
      (await compareProducts({ skuIds: [ids[0], ids[0]] })).items,
    ).toHaveLength(1);
    await expect(
      compareProducts({ skuIds: [...ids, ...ids, ids[0]] }),
    ).rejects.toThrow();
    const other = await db.product.create({
      data: {
        name: "Other fixture",
        slug: `${key}-other`,
        brandId,
        categoryId: otherId,
        status: "PUBLISHED",
        skus: { create: { code: `${key}-other`, price: 10000, onHand: 1 } },
      },
      include: { skus: true },
    });
    await expect(
      compareProducts({ skuIds: [ids[0], other.skus[0].id] }),
    ).rejects.toMatchObject({ status: 422 });
    await db.sku.update({ where: { id: ids[1] }, data: { active: false } });
    expect((await compareProducts({ skuIds: ids })).unavailableIds).toEqual([
      ids[1],
    ]);
    await db.product.update({
      where: { id: productId },
      data: { status: "DRAFT" },
    });
    const privateResult = await compareProducts({ skuIds: ids });
    expect(privateResult.items).toEqual([]);
    expect(JSON.stringify(privateResult)).not.toContain("Listed processor");
    await db.product.update({
      where: { id: productId },
      data: { status: "PUBLISHED" },
    });
    await expect(
      comparisonInsights(key, { skuIds: ids, purpose: "work" }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("restores the same customer's cart without a cookie while isolating other customers", async () => {
    await db.user.createMany({
      data: [
        { id: key, name: "Cart customer", email: `${key}@example.test` },
        {
          id: `${key}-other`,
          name: "Other customer",
          email: `${key}-other@example.test`,
        },
      ],
    });
    const first = await ensureCart(undefined, key);
    await setCartItem(first.cart.id, { skuId: ids[0], quantity: 2 });
    expect((await getCart(undefined, key))?.items[0].quantity).toBe(2);
    const restored = await ensureCart(undefined, key);
    expect(restored.cart.id).toBe(first.cart.id);
    expect(restored.token).not.toBe(first.token);
    expect(await getCart(first.token)).toBeNull();
    expect(await getCart(restored.token, `${key}-other`)).toBeNull();
    expect((await getCart(restored.token, key))?.items[0].quantity).toBe(2);
  });
});
