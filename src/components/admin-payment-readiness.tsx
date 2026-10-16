import { CreditCard, FlaskConical, ReceiptText, Wallet } from "lucide-react";
import styles from "./admin-payment-readiness.module.css";

export function AdminPaymentReadiness({ methods }: { methods: string[] }) {
  const offline = methods.includes("OFFLINE");
  const simulator = methods.includes("SIMULATOR");

  return (
    <section className={styles.panel} aria-labelledby="payment-setup-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CHECKOUT & COLLECTION</p>
          <h2 id="payment-setup-title">Payment setup</h2>
          <p>See which methods customers can use and what still needs setup.</p>
        </div>
        <span className={styles.summary}>
          {offline
            ? "Offline checkout enabled"
            : simulator
              ? "Development checkout only"
              : "Online checkout unavailable"}
        </span>
      </div>

      <div className={styles.grid}>
        <article className={styles.method} aria-labelledby="offline-title">
          <div className={styles.methodHeading}>
            <span className={styles.icon}>
              <Wallet size={21} aria-hidden="true" />
            </span>
            <span className={offline ? styles.enabled : styles.status}>
              {offline ? "Enabled" : "Disabled"}
            </span>
          </div>
          <h3 id="offline-title">Offline payments</h3>
          <p>
            {offline
              ? "Customers can place an unpaid order with the offline option. Record payment only after verifying receipt."
              : "This checkout option is currently hidden. Confirm your collection arrangement before enabling it."}
          </p>
          <div className={styles.methodFooter}>
            Managed through approved server configuration.
          </div>
        </article>

        <article className={styles.method} aria-labelledby="card-title">
          <div className={styles.methodHeading}>
            <span className={styles.icon}>
              <CreditCard size={21} aria-hidden="true" />
            </span>
            <span className={styles.status}>Not connected</span>
          </div>
          <h3 id="card-title">Card payments</h3>
          <p id="card-setup-help">
            An approved provider integration and payment verification are
            required. Customers cannot enter card details or pay by card yet.
          </p>
          <div className={styles.methodFooter}>
            <button
              type="button"
              disabled
              aria-describedby="card-setup-help"
              className={styles.unavailable}
            >
              Card setup unavailable
            </button>
          </div>
        </article>

        <article className={styles.method} aria-labelledby="refund-title">
          <div className={styles.methodHeading}>
            <span className={styles.icon}>
              <ReceiptText size={21} aria-hidden="true" />
            </span>
            <span className={styles.status}>Not connected</span>
          </div>
          <h3 id="refund-title">Automated refunds</h3>
          <p id="refund-setup-help">
            Refund requests can be reviewed, but this app cannot send money
            back. A reviewed request is not a completed refund.
          </p>
          <div className={styles.methodFooter}>
            <button
              type="button"
              disabled
              aria-describedby="refund-setup-help"
              className={styles.unavailable}
            >
              Refund setup unavailable
            </button>
          </div>
        </article>
      </div>

      {simulator && (
        <div className={styles.simulator}>
          <FlaskConical size={19} aria-hidden="true" />
          <div>
            <strong>Development simulator enabled</strong>
            <p>
              Test payments move no money. The simulator cannot be used in
              production.
            </p>
          </div>
        </div>
      )}

      <div className={styles.note}>
        <strong>Quote requests stay separate.</strong> Quote-only products
        create an inquiry, with no order or payment. Direct Sales payment
        recording uses its existing staff permissions, independently of these
        online checkout methods.
      </div>
      <details className={styles.preparation}>
        <summary>What is needed before accepting card payments?</summary>
        <ol>
          <li>Choose and approve a payment provider for the business.</li>
          <li>
            Complete the secure server integration and confirm the agreed
            payment and refund arrangements.
          </li>
          <li>
            Verify successful, failed and interrupted payments before enabling
            the method for customers.
          </li>
        </ol>
        <p>Provider credentials are never entered or saved on this page.</p>
      </details>
    </section>
  );
}
