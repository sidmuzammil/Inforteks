export const dictionaries = {
  en: {
    search: "Search products, brands and more…",
    cart: "Cart",
    account: "Account",
    wishlist: "Wishlist",
    compare: "Compare",
    addToCart: "Add to cart",
    outOfStock: "Out of stock",
    currency: "AED",
  },
};
export type Locale = keyof typeof dictionaries;
export const direction = (locale: string) => (locale === "ar" ? "rtl" : "ltr");
export function dictionary(locale: Locale = "en") {
  return dictionaries[locale];
}
