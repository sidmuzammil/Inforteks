import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { actorForUser } from "@/domains/identity";
import { modules } from "@/domains/administration";
import { AdminNav } from "@/components/admin-client";
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
  if (!session) redirect("/login?next=/admin");
  const actor = await actorForUser(session.user.id);
  if (!actor.scopes.length)
    return (
      <main id="main-content" className="page-container">
        <div className="empty-state">
          <h1>Staff access required.</h1>
          <p>
            This account has customer access. An Owner can grant a named staff
            role.
          </p>
          <Link href="/account" className="button primary">
            My account
          </Link>
        </div>
      </main>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-logo" href="/admin">
          <img
            src="/brand/inforteks.png"
            width="164"
            height="55"
            alt="inforteks"
          />
        </Link>
        <div className="admin-label">Store workspace</div>
        <AdminNav
          modules={modules.filter((m) => actor.scopes.includes(m.scope))}
        />
        <Link href="/" className="admin-back">
          View storefront
          <ArrowUpRight size={14} />
        </Link>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>
            Workspace <span style={{ marginInline: 9 }}>/</span> Inforteks UAE
          </span>
          <div className="admin-user">
            <span className="admin-avatar">
              {session.user.name[0].toUpperCase()}
            </span>
            {session.user.name}
            <span className="badge">{actor.role}</span>
          </div>
        </header>
        <main id="main-content" className="admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}
