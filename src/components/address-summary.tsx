import { deliveryMapUrl, deliveryPinInput } from "@/lib/address";

export function AddressSummary({ address }: { address: unknown }) {
  if (!address || typeof address !== "object") return null;
  const value = address as Record<string, unknown>;
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  const pin = deliveryPinInput.safeParse(value.location);
  return (
    <div className="notice address-summary">
      <b>Delivery address</b>
      <p>
        {text("name")} · {text("phone")}
        <br />
        {text("line1")}
        <br />
        {[text("area"), text("zone"), text("city"), text("emirate")]
          .filter(Boolean)
          .join(", ")}
      </p>
      {text("postalCode") && <p>Postal code: {text("postalCode")}</p>}
      {text("landmark") && <p>Landmark: {text("landmark")}</p>}
      {pin.success && (
        <>
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
            href={deliveryMapUrl(pin.data)}
          >
            Open customer-confirmed delivery pin
          </a>
          <p className="form-help">
            Device-reported accuracy: approximately{" "}
            {Math.ceil(pin.data.accuracy)} metres. Confirm building and
            apartment with the written address.
          </p>
        </>
      )}
    </div>
  );
}
