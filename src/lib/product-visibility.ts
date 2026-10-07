/** Public discovery and online purchasing require an active store product. */
export const onlineProductWhere = {
  store: true,
  status: "PUBLISHED",
  category: { visible: true },
} as const;
export function isOnlineProduct(product: {
  store: boolean;
  status: string;
  category: { visible: boolean };
}) {
  return (
    product.store && product.status === "PUBLISHED" && product.category.visible
  );
}
