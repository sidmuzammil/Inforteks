"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin } from "lucide-react";
import { api } from "./store-client";
import { saveDeliveryLocation } from "./delivery-location";
import { countryAt } from "@/lib/delivery-location";
import { emirates } from "@/lib/utils";
import {
  deliveryMapUrl,
  deliveryPinInput,
  readDeliveryAddress,
  type AddressSuggestion,
  type DeliveryAddress,
  type DeliveryPin,
} from "@/lib/address";

type SavedAddress = Omit<
  DeliveryAddress,
  "location" | "area" | "zone" | "postalCode" | "landmark"
> & {
  id: string;
  landmark?: string | null;
  location?: unknown;
  area?: string | null;
  zone?: string | null;
  postalCode?: string | null;
};
const empty = {
  name: "",
  phone: "",
  city: "",
  area: "",
  zone: "",
  postalCode: "",
  line1: "",
  landmark: "",
};

export function DeliveryAddressFields({
  emirate,
  onEmirateChange,
  initial,
  saved = [],
}: {
  emirate: string;
  onEmirateChange: (value: string) => void;
  initial?: SavedAddress;
  saved?: SavedAddress[];
}) {
  const [fields, setFields] = useState(
    () =>
      ({
        ...empty,
        ...Object.fromEntries(
          Object.keys(empty).map((k) => [
            k,
            initial?.[k as keyof SavedAddress] ?? "",
          ]),
        ),
      }) as typeof empty,
  );
  const [pin, setPin] = useState<DeliveryPin | null>(() => {
    const parsed = deliveryPinInput.safeParse(initial?.location);
    return parsed.success ? parsed.data : null;
  });
  const [confirmed, setConfirmed] = useState("");
  const confirmation = JSON.stringify({ fields, emirate, pin });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [googleSuggestion, setGoogleSuggestion] = useState(false);
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void api<{ enabled: boolean }>("storefront/location")
      .then((r) => {
        if (active) setLookupEnabled(r.enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);
  function changed() {
    generation.current++;
    setBusy(false);
    setConfirmed("");
    setGoogleSuggestion(false);
  }
  async function detect() {
    const request = ++generation.current;
    setBusy(true);
    setNotice("");
    setConfirmed("");
    setPin(null);
    setGoogleSuggestion(false);
    if (!navigator.geolocation) {
      setNotice(
        "Location is unavailable on this device. Enter your address below.",
      );
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (request !== generation.current || !mounted.current) return;
        try {
          if (coords.accuracy > 200) {
            setNotice(
              "Your device could only find a broad area. Try again outdoors, or enter your address manually.",
            );
            return;
          }
          const country = await countryAt(coords.latitude, coords.longitude);
          if (request !== generation.current || !mounted.current) return;
          if (country !== "AE") {
            setNotice(
              "We couldn’t confirm a UAE delivery location. Enter your UAE address manually. Saudi Arabia, Qatar and Oman are coming soon.",
            );
            return;
          }
          if (request !== generation.current || !mounted.current) return;
          const nextPin: DeliveryPin = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            confirmed: true,
          };
          setPin(nextPin);
          setNotice(
            "Location found. Check the map, enter your delivery details and confirm the pin below.",
          );
          if (lookupEnabled) {
            try {
              const result = await api<{
                suggestion: AddressSuggestion | null;
              }>("storefront/location", {
                latitude: coords.latitude,
                longitude: coords.longitude,
                consent: true,
              });
              if (request !== generation.current || !mounted.current) return;
              if (result.suggestion) {
                const { emirate: suggestedEmirate, ...suggestion } =
                  result.suggestion;
                // Only fill empty text fields; keep details already entered by the customer.
                setFields((old) => ({
                  ...old,
                  ...Object.fromEntries(
                    Object.entries(suggestion).filter(
                      ([k]) => !old[k as keyof typeof old],
                    ),
                  ),
                }));
                if (suggestedEmirate) onEmirateChange(suggestedEmirate);
                setGoogleSuggestion(true);
                setNotice(
                  "Address suggested by Google Maps. Check every field and add your building and apartment before confirming.",
                );
              }
            } catch {
              if (request === generation.current && mounted.current)
                setNotice(
                  "Your pin is ready, but address lookup is unavailable. Enter your delivery details below.",
                );
            }
          }
        } catch {
          if (request === generation.current && mounted.current)
            setNotice(
              "We couldn’t use this location. Please enter your delivery address.",
            );
        } finally {
          if (request === generation.current && mounted.current) setBusy(false);
        }
      },
      () => {
        if (request !== generation.current || !mounted.current) return;
        setBusy(false);
        setNotice(
          "Location wasn’t shared. Enter your address manually, or allow location access in your browser and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  function choose(id: string) {
    const a = saved.find((s) => s.id === id);
    changed();
    setNotice("");
    setFields(
      a
        ? (Object.fromEntries(
            Object.keys(empty).map((k) => [
              k,
              a[k as keyof SavedAddress] ?? "",
            ]),
          ) as typeof empty)
        : empty,
    );
    const parsed = deliveryPinInput.safeParse(a?.location);
    setPin(parsed.success ? parsed.data : null);
    if (a) {
      onEmirateChange(a.emirate);
      saveDeliveryLocation({
        country: "AE",
        emirate: a.emirate,
        area: a.area ?? undefined,
        source: "manual",
      });
    }
  }
  return (
    <>
      {saved.length > 0 && (
        <label>
          Saved delivery address
          <select
            aria-label="Saved delivery address"
            defaultValue=""
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Enter a new address</option>
            {saved.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.area || a.city}, {a.emirate}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="address-location-box">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void detect()}
        >
          <LocateFixed size={18} />
          {busy
            ? "Finding your delivery location…"
            : "Use my current delivery location"}
        </button>
        <p className="form-help">
          Use this only when you are at the delivery address. We save the pin
          only when you confirm it and save the address or place your order.
          {lookupEnabled
            ? " With your permission, Google Maps receives your coordinates to suggest an address."
            : " Enter your area, building and apartment below."}
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {googleSuggestion && (
          <small className="maps-attribution">Google Maps</small>
        )}
        {pin && (
          <div className="address-pin">
            <a
              href={deliveryMapUrl(pin)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              <MapPin size={16} />
              Check delivery pin in Google Maps
            </a>
            <small>
              Device-reported accuracy: approximately {Math.ceil(pin.accuracy)}{" "}
              metres. This does not identify your apartment.
            </small>
            <label className="address-confirm">
              <input
                type="checkbox"
                required
                checked={confirmed === confirmation}
                onChange={(e) =>
                  setConfirmed(e.target.checked ? confirmation : "")
                }
              />
              I checked the pin and address. This is my delivery location.
            </label>
            <button
              className="button small"
              type="button"
              onClick={() => {
                changed();
                setPin(null);
                setNotice("");
              }}
            >
              Remove delivery pin
            </button>
          </div>
        )}
        <input
          type="hidden"
          name="location"
          value={pin && confirmed === confirmation ? JSON.stringify(pin) : ""}
        />
      </div>
      <div className="form-grid">
        {(
          [
            ["name", "Full name", true, 100, "name"],
            ["phone", "UAE mobile number", true, 30, "tel"],
          ] as const
        ).map(([name, label, required, maxLength, autoComplete]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              aria-label={label}
              required={required}
              maxLength={maxLength}
              autoComplete={autoComplete}
              type={name === "phone" ? "tel" : "text"}
              value={fields[name]}
              onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Emirate
          <select
            name="emirate"
            aria-label="Emirate"
            value={emirate}
            required
            onChange={(e) => {
              changed();
              onEmirateChange(e.target.value);
            }}
          >
            {emirates.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {(
          [
            ["city", "City", true, 100, "address-level2"],
            ["area", "Area / neighbourhood", true, 100, "address-level3"],
            ["zone", "Zone / district (optional)", false, 100, "off"],
            [
              "postalCode",
              "Postal / ZIP code (if applicable)",
              false,
              20,
              "postal-code",
            ],
            [
              "line1",
              "Building, street & apartment",
              true,
              250,
              "address-line1",
            ],
            ["landmark", "Landmark (optional)", false, 200, "off"],
          ] as const
        ).map(([name, label, required, maxLength, autoComplete]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              aria-label={label}
              required={required}
              maxLength={maxLength}
              autoComplete={autoComplete}
              value={fields[name]}
              onChange={(e) => {
                changed();
                setFields({ ...fields, [name]: e.target.value });
              }}
            />
            {name === "postalCode" && (
              <small className="form-help">
                Leave blank if your address has no postal code. Do not enter a
                made-up code.
              </small>
            )}
            {name === "line1" && (
              <small className="form-help">
                Include the building or villa, street, apartment and floor.
              </small>
            )}
          </label>
        ))}
      </div>
    </>
  );
}

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const [selected, setSelected] = useState<SavedAddress | undefined>();
  const [emirate, setEmirate] = useState("Dubai");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  function reset() {
    setSelected(undefined);
    setEmirate("Dubai");
    setVersion((v) => v + 1);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const address = readDeliveryAddress(new FormData(event.currentTarget));
      await api(
        `account/addresses${selected ? `/${selected.id}` : ""}`,
        address,
        selected ? "PATCH" : "POST",
      );
      saveDeliveryLocation({
        country: "AE",
        emirate: address.emirate,
        area: address.area,
        source: "manual",
      });
      setMessage("Delivery address saved.");
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the address.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="address-book-list">
        {addresses.map((address) => (
          <div className="notice" key={address.id}>
            <b>{address.name}</b>
            <p>
              {[
                address.line1,
                address.area,
                address.zone,
                address.city,
                address.emirate,
                address.postalCode,
              ]
                .filter(Boolean)
                .join(", ")}
              <br />
              {address.phone}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={() => {
                  setSelected(address);
                  setEmirate(address.emirate);
                  setVersion((v) => v + 1);
                  setMessage("");
                  setError("");
                }}
              >
                Edit address
              </button>
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Remove this saved address? Existing orders will keep their delivery address.",
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  setMessage("");
                  try {
                    await api(
                      `account/addresses/${address.id}`,
                      undefined,
                      "DELETE",
                    );
                    if (selected?.id === address.id) reset();
                    setMessage("Address removed.");
                    router.refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove address
              </button>
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ marginBlock: 22 }}>
        {selected ? "Edit delivery address" : "Add a delivery address"}
      </h3>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
        <DeliveryAddressFields
          key={version}
          emirate={emirate}
          onEmirateChange={setEmirate}
          initial={selected}
        />
        <div className="button-row">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save delivery address"}
          </button>
          {selected && (
            <button
              type="button"
              className="button"
              onClick={reset}
              disabled={busy}
            >
              Cancel editing
            </button>
          )}
        </div>
      </form>
    </>
  );
}
