import "dotenv/config";
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { defaultContent, type HeroSlide } from "../../src/lib/home-sections";
import { submitEmailSignIn } from "./sign-in";

const key = `carousel-browser-${Date.now()}`;
const email = `${key}@example.test`;
const password = randomBytes(24).toString("base64url");
const sectionId = `000-${key}`;
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads");
const products: { id: string; name: string; mediaId: string }[] = [];
const imagePaths: string[] = [];
let brandId = "";
let categoryId = "";
let userId = "";
let localFixturesAllowed = false;
const slides: HeroSlide[] = [];

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/inforteks" ||
    (process.env.STORAGE_DRIVER && process.env.STORAGE_DRIVER !== "local")
  )
    throw new Error(
      "Carousel fixtures require local development data and storage.",
    );
  localFixturesAllowed = true;

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Local carousel content editor" },
  });
  userId = result.user.id;
  await db.user.update({ where: { id: userId }, data: { role: "CONTENT" } });
  const brand = await db.brand.create({
    data: { name: `${key} local fixture brand`, slug: key },
  });
  brandId = brand.id;
  const category = await db.category.create({
    data: { name: `${key} local fixture category`, slug: key, visible: true },
  });
  categoryId = category.id;
  await mkdir(uploadDirectory, { recursive: true });
  await mkdir(".data/screenshots", { recursive: true });

  for (let index = 0; index < 3; index++) {
    const mediaKey = `${randomUUID()}.webp`;
    const imagePath = path.join(uploadDirectory, mediaKey);
    imagePaths.push(imagePath);
    // Deliberately synthetic local test assets, never a live catalogue import.
    await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: ["#dce8f5", "#e8edf0", "#dce9e2"][index],
      },
    })
      .webp()
      .toFile(imagePath);
    const product = await db.product.create({
      data: {
        name: `${key} local fixture product ${index + 1}`,
        slug: `${key}-${index + 1}`,
        description:
          "Temporary local browser fixture; not a real retail listing.",
        status: "PUBLISHED",
        store: true,
        quoteOnly: true,
        demo: false,
        brandId,
        categoryId,
        skus: { create: { code: `${key}-${index + 1}`, price: null } },
        media: {
          create: {
            key: mediaKey,
            alt: `Local carousel test image ${index + 1}`,
            public: true,
            width: 640,
            height: 480,
          },
        },
      },
      include: { media: true },
    });
    products.push({
      id: product.id,
      name: product.name,
      mediaId: product.media[0].id,
    });
    slides.push({
      title: `${key} local campaign ${index + 1}`,
      subtitle: "A temporary local test of product-led merchandising.",
      eyebrow: "LOCAL BROWSER FIXTURE",
      buttonLabel: "Explore fixture product",
      href: `/product/${product.slug}`,
      mediaId: null,
      productId: product.id,
      alt: "",
      tone: ["navy", "blue", "light"][index] as HeroSlide["tone"],
    });
  }
  await db.homeSection.create({
    data: {
      id: sectionId,
      title: `${key} local carousel`,
      subtitle: "Local browser verification only.",
      kind: "hero",
      href: "/categories",
      position: 0,
      visible: true,
      content: {
        ...defaultContent,
        heroSlides: slides,
        autoplay: false,
        autoProductHero: false,
        showSideCards: false,
      },
    },
  });
});

test.beforeEach(async () => {
  await db.product.updateMany({
    where: { id: { in: products.map((product) => product.id) } },
    data: { store: true, status: "PUBLISHED" },
  });
  await db.media.updateMany({
    where: { id: { in: products.map((product) => product.mediaId) } },
    data: { public: true },
  });
});

test.afterAll(async () => {
  if (!localFixturesAllowed) return;
  await db.homeSection.deleteMany({ where: { id: sectionId } });
  const ids = products.map((product) => product.id);
  await db.media.deleteMany({ where: { productId: { in: ids } } });
  await db.sku.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: ids } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (userId) {
    await db.auditEvent.deleteMany({ where: { actorId: userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await Promise.all(imagePaths.map((file) => rm(file, { force: true })));
  await db.$disconnect();
});

function carousel(page: Page) {
  // The fixture ID sorts before existing sections with the same position.
  return page.getByRole("region", { name: "Product highlights" }).first();
}

async function expectSlide(region: Locator, index: number) {
  await expect(
    region.getByRole("heading", { name: slides[index].title, exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("button", {
      name: `Show slide ${index + 1}: ${slides[index].title}`,
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "true");
  const image = region.locator(".showcase-product-frame img");
  await expect(image).toHaveAttribute(
    "src",
    `/media/${products[index].mediaId}`,
  );
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
}

async function finishCarouselAnimations(region: Locator) {
  await region.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished),
    );
  });
}

test("product banners support keyboard, slide selection and mobile swipe without overflow", async ({
  page,
}) => {
  await page.goto("/");
  const region = carousel(page);
  await expectSlide(region, 0);
  await expect(region).toContainText("Request a quote");
  await expect(region).not.toContainText(/AED|In stock|Out of stock/);
  await page.screenshot({
    path: ".data/screenshots/product-carousel-desktop.png",
    animations: "disabled",
  });
  await region.getByRole("button", { name: "Next banner" }).click();
  await expectSlide(region, 1);
  await region.getByRole("button", { name: "Previous banner" }).click();
  await expectSlide(region, 0);
  await region.press("ArrowLeft");
  await expectSlide(region, 2);
  const firstSelection = region.getByRole("button", {
    name: `Show slide 1: ${slides[0].title}`,
    exact: true,
  });
  await firstSelection.focus();
  await page.keyboard.press("Enter");
  await expectSlide(region, 0);
  await page.keyboard.press("Tab");
  await expect(
    region.getByRole("button", {
      name: `Show slide 2: ${slides[1].title}`,
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expectSlide(region, 1);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await firstSelection.click();
    await region.evaluate((element) => {
      const start = new Touch({
        identifier: 1,
        target: element,
        clientX: 250,
        clientY: 250,
      });
      const end = new Touch({
        identifier: 1,
        target: element,
        clientX: 100,
        clientY: 260,
      });
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [start],
          changedTouches: [start],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [end],
        }),
      );
    });
    await expectSlide(region, 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await region.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width === 390)
      await region.screenshot({
        path: ".data/screenshots/product-carousel-mobile.png",
        animations: "disabled",
      });
  }
  for (const [index, slide] of slides.entries()) {
    await test.step(`${slide.tone} carousel accessibility`, async () => {
      await region
        .getByRole("button", {
          name: `Show slide ${index + 1}: ${slide.title}`,
          exact: true,
        })
        .click();
      await expectSlide(region, index);
      await expect(region).toHaveClass(new RegExp(`showcase-${slide.tone}`));
      await finishCarouselAnimations(region);
      const accessibility = await new AxeBuilder({ page })
        .include(".product-showcase")
        .analyze();
      expect(
        accessibility.violations.filter((violation) =>
          ["critical", "serious"].includes(violation.impact ?? ""),
        ),
      ).toEqual([]);
    });
  }
  // The maximum six slides and optional rotation controls still fit a phone.
  const sixSlides = [
    ...slides,
    ...slides.map((slide) => ({ ...slide, title: `${slide.title} alternate` })),
  ];
  try {
    await db.homeSection.update({
      where: { id: sectionId },
      data: {
        content: {
          ...defaultContent,
          heroSlides: sixSlides,
          autoProductHero: false,
          autoplay: true,
        },
      },
    });
    await page.reload();
    const controls = region.locator(".showcase-navigation button");
    await expect(controls).toHaveCount(9);
    const bounds = await region.boundingBox();
    for (const control of await controls.all()) {
      const target = await control.boundingBox();
      expect(target).not.toBeNull();
      expect(target!.width).toBeGreaterThanOrEqual(24);
      expect(target!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(target!.x + target!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width,
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      region.getByRole("button", { name: /automatic banner rotation/ }),
    ).toHaveCount(0);
  } finally {
    await db.homeSection.update({
      where: { id: sectionId },
      data: {
        content: {
          ...defaultContent,
          heroSlides: slides,
          autoProductHero: false,
          autoplay: false,
        },
      },
    });
  }
});

test("content staff can operate the carousel preview without navigating or publishing edits", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/home-sections/${sectionId}`);
  await page.getByLabel("Slide 1 product search").fill(products[0].name);
  const lookupResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/storefront/products" &&
      url.searchParams.get("q") === products[0].name
    );
  });
  await page
    .getByRole("button", { name: "Find published products" })
    .first()
    .click();
  const lookup = await lookupResponse;
  expect(lookup.status()).toBe(200);
  expect((await lookup.json()).data.products).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: products[0].id })]),
  );
  await page
    .getByRole("button", { name: `Use ${products[0].name}`, exact: true })
    .click();
  const unsavedTitle = `${key} unsaved preview campaign`;
  await page.getByLabel("Slide 1 headline", { exact: true }).fill(unsavedTitle);
  await page
    .getByRole("button", { name: "Preview this section", exact: true })
    .click();
  const frame = page.frameLocator(
    'iframe[title="Selected homepage section preview"]',
  );
  await expect(frame.locator("#preview-root")).toHaveClass(/storefront-shell/);
  const preview = frame.getByRole("region", { name: "Product highlights" });
  await expect(
    preview.getByRole("heading", { name: unsavedTitle, exact: true }),
  ).toBeVisible();
  // Bring the isolated iframe into view before awaiting its animation frames.
  await preview.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await finishCarouselAnimations(preview);
  await preview.getByRole("button", { name: "Next banner" }).click();
  await expect(
    preview.getByRole("heading", { name: slides[1].title, exact: true }),
  ).toBeVisible();
  await finishCarouselAnimations(preview);
  await preview.getByRole("button", { name: "Previous banner" }).click();
  await expect(
    preview.getByRole("heading", { name: unsavedTitle, exact: true }),
  ).toBeVisible();
  const previewLink = preview.getByRole("link", {
    name: "Request a quote",
    exact: true,
  });
  // Offscreen iframe animation frames can be throttled; scrolling first avoids
  // waiting for a moving target before Playwright has brought it into view.
  await previewLink.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await finishCarouselAnimations(preview);
  await expect(previewLink).toBeInViewport();
  await previewLink.click();
  const previewAccent = await preview.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--market-accent").trim(),
  );
  expect(previewAccent).not.toBe("");
  await expect(page).toHaveURL(
    new RegExp(`/admin/home-sections/${sectionId}$`),
  );
  await expect(
    preview.getByRole("heading", { name: unsavedTitle, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Preview size").selectOption("390");
  await expect(page.locator("iframe")).toHaveCSS("width", "390px");
  const saved = await db.homeSection.findUniqueOrThrow({
    where: { id: sectionId },
  });
  expect(saved.content).toMatchObject({
    heroSlides: [{ title: slides[0].title }, {}, {}],
  });
  await page.goto("/");
  await expectSlide(carousel(page), 0);
  expect(
    await carousel(page).evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--market-accent").trim(),
    ),
  ).toBe(previewAccent);
  await expect(page.locator("main")).not.toContainText(unsavedTitle);
});

test("a saved product banner loses access when its product or photo becomes private", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expectSlide(carousel(page), 0);
  await db.product.update({
    where: { id: products[0].id },
    data: { store: false },
  });
  await page.reload();
  await expect(
    carousel(page).getByRole("heading", { name: slides[1].title, exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(slides[0].title);
  expect((await request.get(`/media/${products[0].mediaId}`)).status()).toBe(
    404,
  );

  await db.product.update({
    where: { id: products[1].id },
    data: { status: "DRAFT" },
  });
  await page.reload();
  await expect(
    carousel(page).getByRole("heading", { name: slides[2].title, exact: true }),
  ).toBeVisible();
  await expect(
    carousel(page).getByRole("button", { name: "Next banner" }),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(slides[1].title);
  expect((await request.get(`/media/${products[1].mediaId}`)).status()).toBe(
    404,
  );

  await db.media.update({
    where: { id: products[2].mediaId },
    data: { public: false },
  });
  await page.reload();
  for (const slide of slides)
    await expect(page.locator("main")).not.toContainText(slide.title);
  for (const product of products)
    await expect(
      page.locator(`.product-showcase img[src="/media/${product.mediaId}"]`),
    ).toHaveCount(0);
  expect((await request.get(`/media/${products[2].mediaId}`)).status()).toBe(
    404,
  );
});
