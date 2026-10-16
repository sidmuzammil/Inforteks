import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { catalogue } from "../src/domains/catalogue";
import { catalogueFacetSelections } from "../src/lib/catalogue-facets";

const prefix = `facets-${randomUUID()}`;
let brandId = "";
let localFixturesAllowed = false;
const categoryIds: string[] = [];
let routerId = "",
  quoteId = "";
let routerSkuIds: string[] = [];

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  localFixturesAllowed = true;
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  for (const [suffix, visible] of [
    ["networking", true],
    ["routers", true],
    ["switches", true],
    ["hidden", false],
  ] as const) {
    const category = await db.category.create({
      data: {
        name: `${prefix} ${suffix}`,
        slug: `${prefix}-${suffix}`,
        visible,
        ...(categoryIds.length ? { parentId: categoryIds[0] } : {}),
      },
    });
    categoryIds.push(category.id);
  }
  await db.attribute.createMany({
    data: [
      {
        categoryId: categoryIds[1],
        key: "ports",
        label: "Network ports",
        type: "number",
      },
      {
        categoryId: categoryIds[1],
        key: "link_speed",
        label: "Link speed",
        unit: "Mbps",
        type: "number",
      },
      {
        categoryId: categoryIds[1],
        key: "wifi_standard",
        label: "Wi-Fi standard",
        scope: "product",
      },
      {
        categoryId: categoryIds[1],
        key: "serial",
        label: "Serial number",
        filterable: false,
      },
      {
        categoryId: categoryIds[2],
        key: "link_speed",
        label: "Link speed",
        unit: "Gbps",
      },
    ],
  });
  const router = await db.product.create({
    data: {
      name: `${prefix} router`,
      slug: `${prefix}-router`,
      brandId,
      categoryId: categoryIds[1],
      status: "PUBLISHED",
      specs: {
        wifi_standard: "Wi-Fi 6",
        ports: 24,
        serial: "NO-FACET-SERIAL",
        dataset: "NO-FACET-DATASET",
        nested: { value: "NO-FACET-OBJECT" },
        bool: true,
      },
      skus: {
        create: [
          {
            code: `${prefix}-4`,
            price: 10000,
            onHand: 5,
            options: { connection: "Ethernet", ports: 12 },
            specs: { ports: 4, link_speed: 1000, ram: 16, storage: 256 },
          },
          {
            code: `${prefix}-8`,
            price: 20000,
            onHand: 0,
            options: { connection: "SFP", ports: 12 },
            specs: { ports: 8, link_speed: 2500, ram: 8, storage: 512 },
          },
          {
            code: `${prefix}-disabled`,
            price: 30000,
            active: false,
            specs: { private_disabled: "NO-FACET-DISABLED" },
          },
          {
            code: `${prefix}-unpriced`,
            price: null,
            specs: { private_unpriced: "NO-FACET-UNPRICED" },
          },
        ],
      },
    },
    include: { skus: { orderBy: { code: "asc" } } },
  });
  routerId = router.id;
  routerSkuIds = router.skus.map((sku) => sku.id);
  quoteId = (
    await db.product.create({
      data: {
        name: `${prefix} quote switch`,
        slug: `${prefix}-quote`,
        brandId,
        categoryId: categoryIds[2],
        status: "PUBLISHED",
        quoteOnly: true,
        specs: { management: "Managed", ports: 48, link_speed: 1 },
        skus: {
          create: {
            code: `${prefix}-quote`,
            price: null,
            onHand: 937,
            cost: 87654321,
            options: { connection: "SFP28" },
          },
        },
      },
    })
  ).id;
  for (const [suffix, data] of [
    [
      "offline",
      { store: false, categoryId: categoryIds[1], status: "PUBLISHED" },
    ],
    ["draft", { categoryId: categoryIds[1], status: "DRAFT" }],
    ["hidden", { categoryId: categoryIds[3], status: "PUBLISHED" }],
  ] as const)
    await db.product.create({
      data: {
        name: `${prefix} ${suffix}`,
        slug: `${prefix}-${suffix}`,
        brandId,
        ...data,
        specs: { private_marker: `NO-FACET-${suffix.toUpperCase()}` },
        skus: { create: { code: `${prefix}-${suffix}`, price: 10000 } },
      },
    });
});

afterAll(async () => {
  if (!localFixturesAllowed) return;
  if (brandId) {
    await db.sku.deleteMany({ where: { product: { brandId } } });
    await db.product.deleteMany({ where: { brandId } });
    await db.brand.delete({ where: { id: brandId } });
  }
  await db.attribute.deleteMany({ where: { categoryId: { in: categoryIds } } });
  for (const id of [...categoryIds].reverse())
    await db.category.delete({ where: { id } });
  await db.$disconnect();
});

const values = (result: Awaited<ReturnType<typeof catalogue>>, key: string) =>
  result.facets.specifications
    .find((facet) => facet.key === key)
    ?.values.map(({ value }) => value);

it("derives category facets only from eligible scalar facts with configured labels, units and overrides", async () => {
  const result = await catalogue({ category: `${prefix}-routers` });
  expect(result.products.map((product) => product.id)).toEqual([routerId]);
  expect(values(result, "ports")).toEqual(["4", "8"]);
  expect(values(result, "connection")).toEqual(["Ethernet", "SFP"]);
  expect(values(result, "wifi_standard")).toEqual(["Wi-Fi 6"]);
  expect(
    result.facets.specifications.find((facet) => facet.key === "link_speed"),
  ).toMatchObject({
    label: "Link speed",
    unit: "Mbps",
    parameter: "spec.link_speed",
  });
  expect(
    result.facets.specifications.find((facet) => facet.key === "ports")?.values,
  ).toEqual([
    { value: "4", count: 1 },
    { value: "8", count: 1 },
  ]);
  expect(JSON.stringify(result.facets)).not.toContain("NO-FACET");
  for (const key of ["serial", "dataset", "nested", "bool", "management"])
    expect(values(result, key)).toBeUndefined();
  expect(result.facets.ram).toEqual(["8", "16"]);
});

it("matches all facts, price and availability against the same individual SKU", async () => {
  const category = `${prefix}-routers`;
  expect(
    (await catalogue({ category, "spec.ports": "4", "spec.connection": "SFP" }))
      .total,
  ).toBe(0);
  const result = await catalogue({
    category,
    "spec.wifi_standard": "Wi-Fi 6",
    "spec.ports": "8",
    "spec.connection": "SFP",
  });
  expect(result.products.map((product) => product.id)).toEqual([routerId]);
  expect(result.products[0].skus[0].id).toBe(routerSkuIds[1]);
  expect(
    (await catalogue({ category, "spec.ports": "8", available: "true" })).total,
  ).toBe(0);
  expect(
    (await catalogue({ category, "spec.ports": "8", max: "100" })).total,
  ).toBe(0);
  expect(
    (await catalogue({ category, "spec.serial": "NO-FACET-SERIAL" })).total,
  ).toBe(0);
  expect((await catalogue({ category, ram: "16", storage: "512" })).total).toBe(
    0,
  );
  expect((await catalogue({ category, ram: "16", storage: "256" })).total).toBe(
    1,
  );
});

it("retains eligible alternatives for empty combinations and across pagination, sorting and descendant categories", async () => {
  const category = `${prefix}-networking`;
  const result = await catalogue({
    category,
    "spec.ports": "4",
    "spec.connection": "SFP",
    page: "2",
    limit: "1",
  });
  expect(result.total).toBe(0);
  expect(values(result, "ports")).toEqual(["4", "8", "48"]);
  expect(values(result, "connection")).toEqual(["Ethernet", "SFP", "SFP28"]);
  expect(
    result.facets.specifications.find((facet) => facet.key === "link_speed")
      ?.unit,
  ).toBeNull();
  const first = await catalogue({ category, limit: "1", sort: "price-asc" });
  const second = await catalogue({
    category,
    limit: "1",
    sort: "price-asc",
    page: "2",
  });
  expect(first.total).toBe(2);
  expect(first.products[0].id).toBe(routerId);
  expect(second.products[0].id).toBe(quoteId);
  expect(second.facets.specifications).toEqual(first.facets.specifications);
  expect(
    values(await catalogue({ q: `${prefix} quote` }), "connection"),
  ).toEqual(["SFP28"]);
});

it("includes public quote configuration facts without leaking direct-sales price or stock eligibility", async () => {
  const category = `${prefix}-networking`;
  const quote = await catalogue({ category, "spec.management": "Managed" });
  expect(quote.products.map((product) => product.id)).toEqual([quoteId]);
  expect(quote.products[0].skus[0]).toMatchObject({
    price: null,
    compareAt: null,
    available: 0,
  });
  expect(JSON.stringify(quote)).not.toContain("87654321");
  for (const input of [
    { min: "0" },
    { available: "true" },
    { offers: "true" },
  ]) {
    const result = await catalogue({ category, ...input });
    expect(values(result, "management")).toBeUndefined();
    expect(values(result, "connection") ?? []).not.toContain("SFP28");
  }
});

it("bounds response facets and omits high-cardinality fields without inventing or truncating value choices", async () => {
  const category = await db.category.create({
    data: { name: `${prefix} bounded`, slug: `${prefix}-bounded` },
  });
  categoryIds.push(category.id);
  const specs = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `key_${String(i).padStart(2, "0")}`,
      "actual",
    ]),
  );
  for (const count of [50, 1])
    await db.product.create({
      data: {
        name: `${prefix} bounded ${count}`,
        slug: `${prefix}-bounded-${count}`,
        brandId,
        categoryId: category.id,
        status: "PUBLISHED",
        specs,
        skus: {
          create: Array.from({ length: count }, (_, i) => ({
            code: `${prefix}-bounded-${count}-${i}`,
            price: 10000,
            specs: { serial_number: `${count}-${i}` },
          })),
        },
      },
    });
  const result = await catalogue({
    category: category.slug,
    "spec.key_29": "actual",
  });
  expect(result.total).toBe(2);
  expect(result.facets.specifications).toHaveLength(24);
  expect(values(result, "serial_number")).toBeUndefined();
  expect(values(result, "key_29")).toEqual(["actual"]);
});

it("validates bounded facet keys and values while retaining exact stored case and SQL-safe values", async () => {
  for (const input of [
    { "spec.__proto__": "x" },
    { "spec.constructor": "x" },
    { "spec.ports; DROP TABLE": "4" },
    { "spec.ports": ["4"] },
    { "spec.ports": "x".repeat(201) },
    Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`spec.key${i}`, "value"]),
    ),
  ])
    expect(() => catalogueFacetSelections(input)).toThrow();
  expect(
    (
      await catalogue({
        category: `${prefix}-routers`,
        "spec.connection": "SFP' OR true --",
      })
    ).total,
  ).toBe(0);
  expect(
    (
      await catalogue({
        category: `${prefix}-routers`,
        "spec.Connection": "SFP",
      })
    ).total,
  ).toBe(0);
  expect(catalogueFacetSelections({ ram: "16", "spec.ram": "8" })).toEqual([
    { parameter: "spec.ram", key: "ram", value: "8" },
  ]);
  expect(
    catalogueFacetSelections({
      ...Object.fromEntries(
        Array.from({ length: 24 }, (_, i) => [`spec.key${i}`, ""]),
      ),
      "spec.selected": "actual",
    }),
  ).toEqual([{ parameter: "spec.selected", key: "selected", value: "actual" }]);
});
