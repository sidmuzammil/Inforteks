import { afterEach, expect, it, vi } from "vitest";
import { isOnlineProduct } from "../src/lib/product-visibility";
afterEach(() => vi.unstubAllEnvs());
it("keeps demonstration records off the production storefront without changing real product visibility", () => {
  const product = {
    store: true,
    status: "PUBLISHED",
    category: { visible: true },
    demo: true,
  };
  vi.stubEnv("NODE_ENV", "development");
  expect(isOnlineProduct(product)).toBe(true);
  vi.stubEnv("NODE_ENV", "production");
  expect(isOnlineProduct(product)).toBe(false);
  expect(isOnlineProduct({ ...product, demo: false })).toBe(true);
  expect(isOnlineProduct({ ...product, demo: false, store: false })).toBe(
    false,
  );
});
