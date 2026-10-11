import { Banknote, CreditCard, FlaskConical } from "lucide-react";
import Link from "next/link";

export const checkoutPaymentMethods = ["OFFLINE", "SIMULATOR"] as const;
export type CheckoutPaymentMethod = (typeof checkoutPaymentMethods)[number];

export function CheckoutPayment({
  methods,
  selected,
  onSelect,
  pending,
}: {
  methods: CheckoutPaymentMethod[];
  selected: CheckoutPaymentMethod | undefined;
  onSelect: (method: CheckoutPaymentMethod) => void;
  pending: boolean;
}) {
  return (
    <fieldset className="checkout-payment" aria-describedby="payment-guidance">
      <legend>
        <span className="checkout-section-number" aria-hidden="true">
          2
        </span>
        Payment method
      </legend>
      <p
        id="payment-guidance"
        className="checkout-section-help"
        aria-live="polite"
      >
        {pending
          ? "Available methods will appear after your order total is updated."
          : methods.length
            ? "No online payment is collected at checkout. Review your selected method before placing the order."
            : "Ordering is currently unavailable. You can keep your cart and contact us about these items."}
      </p>
      <div className="checkout-payment-options">
        {methods.map((method) => {
          const offline = method === "OFFLINE";
          const Icon = offline ? Banknote : FlaskConical;
          return (
            <label className="checkout-payment-option" key={method}>
              <input
                type="radio"
                name="paymentMethod"
                value={method}
                aria-label={
                  offline ? "Offline payment" : "Development simulator"
                }
                aria-describedby={`payment-${method}-help`}
                checked={selected === method}
                onChange={() => onSelect(method)}
                required
              />
              <Icon size={22} aria-hidden="true" />
              <span className="checkout-payment-copy">
                <strong>
                  {offline ? "Offline payment" : "Development simulator"}
                </strong>
                <span id={`payment-${method}-help`}>
                  {offline
                    ? "Arrange payment with the store. Your order remains unpaid until payment is verified."
                    : "For development only. No money is transferred and the order remains unpaid."}
                </span>
              </span>
            </label>
          );
        })}
        <label className="checkout-payment-option is-unavailable">
          <input
            type="radio"
            aria-label="Card payment"
            aria-describedby="card-payment-help"
            disabled
          />
          <CreditCard size={22} aria-hidden="true" />
          <span className="checkout-payment-copy">
            <strong>
              Card payment{" "}
              <span className="checkout-method-status">Unavailable</span>
            </strong>
            <span id="card-payment-help">
              Online card payments are not available. No card details are
              collected here.
            </span>
          </span>
        </label>
      </div>
      {!pending && methods.length === 0 && (
        <Link className="text-button checkout-contact-link" href="/contact">
          Contact us about your order
        </Link>
      )}
    </fieldset>
  );
}
