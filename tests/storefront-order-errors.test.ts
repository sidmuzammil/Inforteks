import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  findReference: vi.fn(),
  findUser: vi.fn(),
  getSession: vi.fn(),
  getCookie: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findFirst: mocks.findOrder,
      findUnique: mocks.findReference,
    },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.getCookie }),
}));

import Page from "../src/app/(store)/[...path]/page";

function loadPage(path: string[]) {
  return Page({
    params: Promise.resolve({ path }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "customer" } });
  mocks.findUser.mockResolvedValue({ role: "CUSTOMER", grants: [] });
  mocks.findReference.mockResolvedValue({ id: "order" });
});

describe.each<[string, string[]]>([
  ["confirmation", ["order-confirmation", "IFT-ORDER"]],
  ["account detail", ["account", "orders", "order"]],
])("%s order loading", (_label, path) => {
  it("keeps missing or inaccessible orders behind the not-found boundary", async () => {
    mocks.findOrder.mockResolvedValue(null);

    await expect(loadPage(path)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it.each([
    new Error("Database connection interrupted"),
    new AppError(503, "Order storage temporarily unavailable"),
    Object.assign(new Error("Unexpected upstream failure"), { status: 404 }),
  ])("preserves the original unexpected error: %s", async (failure) => {
    mocks.findOrder.mockRejectedValue(failure);

    await expect(loadPage(path)).rejects.toBe(failure);
  });
});

it("keeps confirmation access private when neither a session nor guest token exists", async () => {
  mocks.getSession.mockResolvedValue(null);

  await expect(
    loadPage(["order-confirmation", "IFT-ORDER"]),
  ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  expect(mocks.findOrder).not.toHaveBeenCalled();
});
