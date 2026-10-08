/** Public discovery and online purchasing require an active store product. */
export const onlineProductWhere = {
  store: true,
  status: "PUBLISHED",
  category: { visible: true },
  ...(process.env.NODE_ENV === "production" ? { demo: false } : {}),
} as const;
export function isOnlineProduct(product: {
  store: boolean;
  status: string;
  demo?: boolean;
  category: { visible: boolean };
}) {
  return (
    product.store &&
    product.status === "PUBLISHED" &&
    product.category.visible &&
    (process.env.NODE_ENV !== "production" || product.demo !== true)
  );
}
