import "dotenv/config";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { roles, type Actor } from "../src/domains/identity";
import {
  homeSectionInput,
  prepareHomeSection,
  previewHomeSection,
  resolveHeroProducts,
} from "../src/domains/home-sections";
import { saveResource } from "../src/domains/administration";
import { readImage, storeImage } from "../src/domains/storage";
import { defaultContent, type HeroSlide } from "../src/lib/home-sections";

const key = `carousel-${randomUUID()}`;
const actor: Actor = {
  id: key,
  role: "CONTENT",
  scopes: roles.CONTENT,
  human: true,
  source: "admin",
};
const directory = `.data/${key}`;
const original = {
  driver: process.env.STORAGE_DRIVER,
  directory: process.env.UPLOAD_DIR,
};
let categoryId = "";
let brandId = "";
const productIds: string[] = [];
const sectionIds: string[] = [];
const bannerIds: string[] = [];
const base = {
  title: "Explore our products",
  subtitle: "",
  kind: "hero",
  href: "/categories",
  buttonLabel: "Explore products",
  bannerMediaId: null,
  position: 999,
  visible: false,
  content: { ...defaultContent, showSideCards: false },
};
function slide(
  productId: string | null,
  mediaId: string | null = null,
): HeroSlide {
  return {
    title: "Technology for work",
    subtitle: "",
    eyebrow: "INFORTEKS",
    buttonLabel: "Explore product",
    href: "/categories",
    productId,
    mediaId,
    alt: mediaId ? "Genuine product campaign" : "",
    tone: "light",
  };
}
async function product(
  suffix: string,
  flags: {
    status?: "DRAFT" | "PUBLISHED";
    store?: boolean;
    demo?: boolean;
    quoteOnly?: boolean;
    active?: boolean;
    photoPublic?: boolean;
    illustration?: boolean;
  } = {},
) {
  const record = await db.product.create({
    data: {
      name: `${key}-${suffix}`,
      slug: `${key}-${suffix}`,
      brandId,
      categoryId,
      status: flags.status ?? "PUBLISHED",
      store: flags.store ?? true,
      demo: flags.demo ?? false,
      quoteOnly: flags.quoteOnly ?? false,
      featured: true,
      skus: {
        create: {
          code: `${key}-${suffix}`,
          price: 12345,
          cost: 4500,
          onHand: 67,
          active: flags.active ?? true,
        },
      },
      media: {
        create: {
          key: flags.illustration
            ? "illustrations/laptop.svg"
            : `${randomUUID()}.webp`,
          alt: "Product photograph",
          public: flags.photoPublic ?? true,
          width: 300,
          height: 300,
        },
      },
    },
    include: { media: true },
  });
  productIds.push(record.id);
  return record;
}
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error(
      "Carousel tests require the isolated inforteks_test database.",
    );
  process.env.STORAGE_DRIVER = "local";
  process.env.UPLOAD_DIR = directory;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
});
afterAll(async () => {
  await db.homeSection.deleteMany({ where: { id: { in: sectionIds } } });
  await db.media.deleteMany({
    where: {
      OR: [{ productId: { in: productIds } }, { id: { in: bannerIds } }],
    },
  });
  await db.sku.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  await rm(directory, { recursive: true, force: true });
  if (original.driver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = original.driver;
  if (original.directory === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = original.directory;
  await db.$disconnect();
});

it("uses only current public product photos and redacts private quote prices in the exact preview", async () => {
  const quoted = await product("quote", { quoteOnly: true });
  const raw = {
    ...base,
    content: { ...base.content, heroSlides: [slide(quoted.id)] },
  };
  const count = await db.homeSection.count();
  const preview = await previewHomeSection(actor, raw);
  expect(preview.heroProducts).toHaveLength(1);
  expect(preview.heroProducts[0]).toMatchObject({
    id: quoted.id,
    quoteOnly: true,
  });
  expect(preview.heroProducts[0].skus[0]).toMatchObject({
    price: null,
    compareAt: null,
    available: 0,
  });
  expect(preview.heroProducts[0].skus[0]).not.toHaveProperty("cost");
  expect(preview.heroProducts[0].media[0].url).toBe(
    `/media/${quoted.media[0].id}`,
  );
  expect(await resolveHeroProducts(preview.section)).toEqual(
    preview.heroProducts,
  );
  expect(await db.homeSection.count()).toBe(count);
  await expect(
    previewHomeSection({ ...actor, scopes: [] }, raw),
  ).rejects.toMatchObject({ status: 403 });

  await db.product.update({ where: { id: quoted.id }, data: { store: false } });
  expect(await resolveHeroProducts(preview.section)).toEqual([]);
  await expect(prepareHomeSection(raw)).rejects.toMatchObject({ status: 422 });
});

it("rejects draft, Direct-only, inactive, sample and private-photo bindings", async () => {
  for (const [suffix, flags] of [
    ["draft", { status: "DRAFT" }],
    ["direct", { store: false }],
    ["inactive", { active: false }],
    ["sample", { demo: true }],
    ["private-photo", { photoPublic: false }],
    ["illustration", { illustration: true }],
  ] as const) {
    const record = await product(suffix, flags);
    await expect(
      prepareHomeSection({
        ...base,
        content: { ...base.content, heroSlides: [slide(record.id)] },
      }),
    ).rejects.toMatchObject({ status: 422 });
  }
  const visible = await product("hidden-category");
  await db.category.update({
    where: { id: categoryId },
    data: { visible: false },
  });
  expect(
    await resolveHeroProducts({
      ...base,
      content: { ...base.content, heroSlides: [slide(visible.id)] },
    }),
  ).toEqual([]);
  await db.category.update({
    where: { id: categoryId },
    data: { visible: true },
  });
});

it("automatically selects real published products without inheriting legacy illustrative copy or image URLs", async () => {
  const record = await product("automatic");
  const products = await resolveHeroProducts(base);
  expect(products.some((item) => item.id === record.id)).toBe(true);
  expect(
    products.every(
      (item) =>
        !item.demo &&
        item.media.every((media) => media.url.startsWith("/media/")),
    ),
  ).toBe(true);
  expect(
    await resolveHeroProducts({
      ...base,
      content: { ...base.content, autoProductHero: false },
    }),
  ).toEqual([]);
  expect(
    await resolveHeroProducts({ ...base, bannerMediaId: "legacy-upload" }),
  ).toEqual([]);
});

it("tracks carousel upload visibility, schedules and stale edits through the existing content workflow", async () => {
  const bytes = await sharp({
    create: { width: 300, height: 120, channels: 3, background: "#1255aa" },
  })
    .png()
    .toBuffer();
  const media = await storeImage(
    actor,
    new File([new Uint8Array(bytes)], "campaign.png", { type: "image/png" }),
    "",
    "Campaign photograph",
    true,
  );
  bannerIds.push(media.id);
  const raw = {
    ...base,
    content: { ...base.content, heroSlides: [slide(null, media.id)] },
  };
  const created = (await saveResource(actor, "home-sections", raw)) as {
    id: string;
    version: number;
  };
  sectionIds.push(created.id);
  await expect(readImage(media.id)).rejects.toThrow();
  const live = (await saveResource(
    actor,
    "home-sections",
    { ...raw, visible: true, version: created.version },
    created.id,
  )) as { version: number };
  expect((await readImage(media.id)).public).toBe(true);
  await expect(
    saveResource(
      actor,
      "home-sections",
      { ...raw, version: created.version },
      created.id,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const scheduled = (await saveResource(
    actor,
    "home-sections",
    {
      ...raw,
      visible: true,
      version: live.version,
      startsAt: new Date(Date.now() + 3_600_000),
    },
    created.id,
  )) as { version: number };
  await expect(readImage(media.id)).rejects.toThrow();
  await saveResource(
    actor,
    "home-sections",
    {
      ...raw,
      visible: true,
      version: scheduled.version,
      content: { ...raw.content, heroSlides: [] },
    },
    created.id,
  );
  await expect(readImage(media.id)).rejects.toThrow();
  const record = await product("foreign-photo");
  await expect(
    prepareHomeSection({
      ...raw,
      content: {
        ...raw.content,
        heroSlides: [slide(null, record.media[0].id)],
      },
    }),
  ).rejects.toThrow(/homepage editor/);
});

it("bounds slides and destinations while keeping old hero JSON compatible", () => {
  expect(homeSectionInput.parse(base).content).toMatchObject({
    heroSlides: [],
    autoplay: false,
    autoProductHero: true,
  });
  for (const slides of [
    Array.from({ length: 7 }, () => slide("product")),
    [slide(null)],
    [{ ...slide("product"), href: "//outside.test" }],
    [{ ...slide(null, "banner"), alt: "" }],
  ])
    expect(
      homeSectionInput.safeParse({
        ...base,
        content: { ...base.content, heroSlides: slides },
      }).success,
    ).toBe(false);
});
