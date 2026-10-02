import type { Metadata } from "next";
import "./globals.css";
import { ShopProvider } from "@/components/store-client";
import { getSession } from "@/lib/session";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ??
      process.env.BETTER_AUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000",
  ),
  title: {
    default: "Inforteks | Technology. Thoughtfully selected.",
    template: "%s | Inforteks",
  },
  description:
    "Explore technology for the way you work, play and create. Laptops, components, monitors and everyday essentials in the UAE.",
  robots:
    process.env.NODE_ENV === "production"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return (
    <html lang="en" dir="ltr">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <ShopProvider userId={session?.user.id}>{children}</ShopProvider>
      </body>
    </html>
  );
}
