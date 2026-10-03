import { describe, it, expect } from "vitest";
import { aedToFils, readPrices } from "../src/lib/merchant-pricing";
import { cleanBannerHtml } from "../src/domains/home-sections";
import { productInput } from "../src/domains/catalogue";
describe("merchant prices", () => {
  it("preserves exact fils and rejects invalid or inverted discounts", () => {
    expect(aedToFils("1999.95")).toBe(199995);
    expect(aedToFils("0.29")).toBe(29);
    expect(aedToFils("")).toBeNull();
    for (const value of ["1e3", "-1", "1.999", "1000000.01", "Infinity"])
      expect(() => aedToFils(value)).toThrow();
    const fd = new FormData();
    fd.set("price", "100");
    fd.set("compareAt", "90");
    expect(() => readPrices(fd)).toThrow(/higher/);
    fd.set("compareAt", "125");
    expect(readPrices(fd)).toEqual({ price: 10000, compareAt: 12500 });
    fd.set("compareAt", "");
    expect(readPrices(fd).compareAt).toBeNull();
  });
  it("validates discount data on product creation even when bypassing the form", () => {
    const product = {
      name: "Test product",
      brandId: "brand",
      categoryId: "category",
      skus: [{ code: "TEST", price: 10000, compareAt: 9000 }],
    };
    expect(productInput.safeParse(product).success).toBe(false);
    expect(
      productInput.safeParse({
        ...product,
        skus: [{ code: "TEST", price: 10000, compareAt: 12000 }],
      }).success,
    ).toBe(true);
  });
});
it("sanitizes pasted HTML while preserving safe merchant layout and uploaded images", () => {
  const html = cleanBannerHtml(
    '<section style="background-color:#001122;padding:32px;position:fixed;inset:0"><h2 onclick="alert(1)">Offer</h2><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="/api/auth/sign-out"><input></form><img src="https://evil.test/track" onerror="alert(1)"><img src="/media/banner-id" alt="Laptop"><a href="javascript:alert(1)">Bad</a><a href="//evil.test">External</a><a href="/offers">Shop</a></section>',
  );
  expect(html).toContain("background-color:#001122");
  expect(html).toContain("padding:32px");
  expect(html).toContain('src="/media/banner-id"');
  expect(html).toContain('href="/offers"');
  for (const forbidden of [
    "<script",
    "<iframe",
    "<form",
    "onclick",
    "onerror",
    "position:",
    "evil.test",
    "javascript:",
  ])
    expect(html).not.toContain(forbidden);
});
