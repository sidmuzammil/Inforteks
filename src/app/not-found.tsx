import Link from "next/link";
export default function NotFound() {
  return (
    <section className="page-container">
      <div className="empty-state" style={{ marginBlock: 65 }}>
        <p className="eyebrow">404 · A LITTLE OFF TRACK</p>
        <h1>Let’s find your way back.</h1>
        <p>
          This page or private record isn’t available. Try the catalogue or sign
          in to your account.
        </p>
        <Link className="button primary" href="/">
          Back to Inforteks
        </Link>
        <Link className="text-button" href="/account">
          My account
        </Link>
      </div>
    </section>
  );
}
