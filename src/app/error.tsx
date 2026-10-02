"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="page-container">
      <div className="empty-state" style={{ marginBlock: 55 }}>
        <h1>We hit a small interruption.</h1>
        <p>The service couldn’t finish this request. Please try again.</p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
      </div>
    </section>
  );
}
