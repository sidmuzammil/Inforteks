import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { actorForUser } from "@/domains/identity";
import { AdminNav } from "@/components/admin-navigation";
import { SignOut } from "@/components/forms";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Staff workspace",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const actor = await actorForUser(session.user.id);
  if (!actor.scopes.length)
    return (
      <main id="main-content" className="page-container">
        <div className="empty-state">
          <h1>Staff access required.</h1>
          <p>
            This is a customer account. Only staff accounts created by the store
            Owner can manage Inforteks.
          </p>
          <Link href="/account" className="button primary">
            My account
          </Link>
        </div>
      </main>
    );
  return (
    <div className="erp-shell">
      <header className="erp-topbar">
        <Link className="erp-logo" href="/admin">
          <img
            src="/brand/inforteks.png"
            width="140"
            height="47"
            alt="inforteks"
          />
        </Link>
        <span className="erp-workspace-label">Business workspace</span>
        <div className="erp-user">
          <Link href="/" className="erp-store-link">
            View store <ArrowUpRight size={14} />
          </Link>
          <span className="admin-avatar">
            {session.user.name[0].toUpperCase()}
          </span>
          <span className="erp-user-name">
            {session.user.name}
            <small>{actor.role?.replaceAll("_", " ").toLowerCase()}</small>
          </span>
          <SignOut staff />
        </div>
      </header>
      <AdminNav scopes={[...actor.scopes]} />
      <main id="main-content" className="admin-content erp-content">
        {children}
      </main>
    </div>
  );
}
