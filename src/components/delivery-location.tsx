"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MapPin, ChevronDown, X, LocateFixed } from "lucide-react";
import {
  comingSoon,
  countryAt,
  deliveryCountries,
  parseDeliveryLocation,
  type DeliveryLocation,
} from "@/lib/delivery-location";
import { emirates } from "@/lib/utils";

function subscribe(callback: () => void) {
  window.addEventListener("ift-location", callback);
  return () => window.removeEventListener("ift-location", callback);
}
function snapshot() {
  try {
    return decodeURIComponent(
      document.cookie
        .split("; ")
        .find((item) => item.startsWith("ift-location="))
        ?.split("=")
        .slice(1)
        .join("=") ?? "",
    );
  } catch {
    return "";
  }
}
export function saveDeliveryLocation(location: DeliveryLocation) {
  document.cookie = `ift-location=${encodeURIComponent(JSON.stringify(location))}; Path=/; Max-Age=15552000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new Event("ift-location"));
}
export function useDeliveryLocation() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return (
    parseDeliveryLocation(raw) ?? {
      country: "AE" as const,
      source: "manual" as const,
    }
  );
}
export function DeliveryLocationPicker({
  signedIn,
  savedEmirate,
  savedArea,
}: {
  signedIn: boolean;
  savedEmirate?: string;
  savedArea?: string;
}) {
  const location = useDeliveryLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const detection = useRef(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const country = deliveryCountries.find(
    (item) => item.code === location.country,
  )!;
  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  const detect = useCallback(async () => {
    if (!navigator.geolocation) {
      setNotice(
        "Location detection is unavailable. Please choose your country below.",
      );
      return;
    }
    const request = ++detection.current;
    setBusy(true);
    setNotice("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const code =
            coords.accuracy <= 25000
              ? await countryAt(coords.latitude, coords.longitude)
              : null;
          if (request !== detection.current) return;
          if (!code) {
            setNotice(
              "We couldn’t identify a supported country accurately. Please choose below.",
            );
            return;
          }
          saveDeliveryLocation({ country: code, source: "detected" });
          setNotice(
            code === "AE"
              ? "UAE detected. Choose your delivery emirate below."
              : comingSoon(code),
          );
        } catch {
          if (request !== detection.current) return;
          setNotice("We couldn’t detect your country. Please choose below.");
        } finally {
          if (request === detection.current) setBusy(false);
        }
      },
      () => {
        if (request !== detection.current) return;
        setBusy(false);
        setNotice(
          "Location wasn’t shared. You can choose your country manually.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);
  useEffect(() => {
    if (!signedIn || snapshot()) return;
    if (savedEmirate) {
      saveDeliveryLocation({
        country: "AE",
        emirate: savedEmirate,
        area: savedArea,
        source: "manual",
      });
      return;
    }
    // Reuse an existing browser grant; never trigger a permission prompt on login.
    let cancelled = false;
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (!cancelled && !snapshot() && permission.state === "granted")
          void detect();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, savedEmirate, savedArea, detect]);
  return (
    <>
      <button
        ref={trigger}
        className="delivery-trigger"
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={`Delivery location: ${country.short}${location.emirate ? `, ${location.emirate}` : ""}${location.area ? `, ${location.area}` : ""}${country.active ? "" : ", coming soon"}`}
      >
        <MapPin size={13} />
        <span>
          {country.active
            ? `Deliver to ${location.area || location.emirate || "UAE"}`
            : `${country.short} · Coming soon`}
        </span>
        <ChevronDown size={12} />
      </button>
      <dialog
        ref={dialog}
        className="delivery-dialog"
        aria-labelledby="delivery-title"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="delivery-dialog-content">
          <button
            className="delivery-close"
            aria-label="Close delivery location"
            onClick={close}
          >
            <X size={20} />
          </button>
          <span className="eyebrow">WHERE ARE YOU SHOPPING FROM?</span>
          <h2 id="delivery-title">Your delivery location</h2>
          <p>
            Choose your country. Orders are currently available for UAE delivery
            only.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void detect()}
          >
            <LocateFixed size={18} />
            {busy ? "Finding your location…" : "Use my location"}
          </button>
          <small>
            With your permission, we identify your country on this device. Your
            coordinates are never stored or sent to us.
          </small>
          <div className="delivery-countries">
            {deliveryCountries.map((item) => (
              <button
                key={item.code}
                className={item.code === location.country ? "selected" : ""}
                aria-pressed={item.code === location.country}
                onClick={() => {
                  ++detection.current;
                  setBusy(false);
                  saveDeliveryLocation({
                    country: item.code,
                    source: "manual",
                  });
                  setNotice(item.active ? "" : comingSoon(item.code));
                }}
              >
                <b>{item.name}</b>
                <span>{item.active ? "Shop in AED" : "Coming soon"}</span>
              </button>
            ))}
          </div>
          {country.active ? (
            <label className="delivery-emirate">
              Delivery emirate
              <select
                aria-label="Delivery emirate"
                value={location.emirate ?? ""}
                onChange={(event) =>
                  saveDeliveryLocation({
                    country: "AE",
                    emirate: event.target.value,
                    source: "manual",
                  })
                }
              >
                <option value="">Choose an emirate</option>
                {emirates.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="notice warning" role="status">
              {comingSoon(location.country)}
            </p>
          )}
          {notice && country.active && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="button primary" onClick={close}>
            {country.active ? "Continue shopping" : "Browse the UAE catalogue"}
          </button>
        </div>
      </dialog>
    </>
  );
}
