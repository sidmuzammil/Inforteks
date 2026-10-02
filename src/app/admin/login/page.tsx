import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, Package, PanelsTopLeft, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { actorForUser } from "@/domains/identity";
import { AuthForm } from "@/components/auth-forms";
import { SignOut } from "@/components/forms";
import { safeReturnPath } from "@/lib/auth-navigation";
import { emailDeliveryEnabled } from "@/lib/email-policy";

export const metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};
export default async function StaffLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeReturnPath(
    typeof query.next === "string" ? query.next : undefined,
    true,
  );
  const session = await getSession();
  if (session && (await actorForUser(session.user.id)).scopes.length)
    redirect(next);
  return (
    <main id="main-content" className="staff-login-page">
      <header className="staff-login-header">
        <Link href="/" aria-label="Inforteks store">
          <img
            src="/brand/inforteks.png"
            width="180"
            height="60"
            alt="Inforteks"
          />
        </Link>
        <Link href="/">Back to store →</Link>
      </header>
      <div className="auth-shell staff-auth-shell">
        <aside className="auth-story">
          <span className="auth-kicker">
            <LockKeyhole size={15} /> STAFF WORKSPACE
          </span>
          <h1>
            Your store.
            <br />
            Everything in place.
          </h1>
          <p>Manage Inforteks with the tools and access your role needs.</p>
          <ul className="auth-benefits">
            <li>
              <Package />
              <div>
                <b>Products & inventory</b>
                <span>Keep listings, prices and stock up to date.</span>
              </div>
            </li>
            <li>
              <PanelsTopLeft />
              <div>
                <b>Storefront & content</b>
                <span>Manage homepage banners and store pages.</span>
              </div>
            </li>
            <li>
              <Users />
              <div>
                <b>Access you control</b>
                <span>The Owner assigns each colleague’s role.</span>
              </div>
            </li>
          </ul>
          <small>Private workspace · Authorized staff only</small>
        </aside>
        <section className="auth-card">
          <div className="auth-icon">
            <LockKeyhole size={23} />
          </div>
          <div className="eyebrow">INFORTEKS ADMINISTRATION</div>
          <h2>Staff sign in</h2>
          <p>Use the staff account created by your store Owner.</p>
          {session ? (
            <div className="auth-result">
              <div className="notice warning" role="alert">
                You’re signed in with a customer account. It has no access to
                the staff workspace.
              </div>
              <SignOut staff />
              <Link href="/account" className="text-button">
                Back to my customer account
              </Link>
            </div>
          ) : (
            <AuthForm
              mode="login"
              staff
              next={next}
              emailEnabled={emailDeliveryEnabled()}
            />
          )}
          <div className="auth-footnote">
            Need staff access? Contact your store Owner.
          </div>
        </section>
      </div>
    </main>
  );
}
