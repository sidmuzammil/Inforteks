import { Header, Footer } from "@/components/store";
export const dynamic = "force-dynamic";
export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="storefront-shell">
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  );
}
