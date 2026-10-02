import type { ProductInput, PublicProduct } from "@/domains/catalogue";
export function createInforteksClient(baseUrl: string, key: string) {
  async function call<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `${response.status}: ${result.error?.message ?? "Request failed"}`,
      );
    return result.data;
  }
  return {
    listProducts: (q = "") =>
      call<{ products: PublicProduct[]; total: number }>(
        `storefront/products?q=${encodeURIComponent(q)}`,
      ),
    createProduct: (data: ProductInput) =>
      call<{ id: string }>("admin/products", "POST", data),
    propose: (operation: string, targetId: string, payload: unknown) =>
      call<{ id: string; status: string }>("admin/proposals", "POST", {
        operation,
        targetId,
        payload,
      }),
    permissions: () => call<{ scopes: string[] }>("admin/me/permissions"),
  };
}
