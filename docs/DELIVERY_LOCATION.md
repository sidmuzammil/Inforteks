# Delivery addresses and location

Customers enter their city, area/neighbourhood, building/street/apartment and phone at checkout or in **Account → Addresses**. Zone/district, landmark and postal/ZIP code are optional. Leave a missing postal code blank; never invent `00000` or treat a PO box as a building location. Existing addresses remain readable after the additive migration.

**Use my current delivery location** requests a fresh, high-accuracy browser position only after a click. Use it while at the delivery address. The device must report accuracy of 200 metres or better and the approximate country check must identify UAE. Otherwise manual entry remains available. The customer can open the pin in Google Maps, remove it or retry. Saving a pin requires a separate confirmation checkbox; changing address details invalidates that confirmation. GPS cannot establish a building entrance, floor or apartment and is not proof of a verified delivery address.

The pin is not put into cookies, local storage or analytics. It is stored only with the confirmed saved address or order. The header remembers only the country, emirate and optional area; its older country-only detection keeps coordinates on the device. Customers can edit/delete only their own saved addresses and choose one during checkout. Updating the address book never updates an existing order's address snapshot. Authorized staff see the address and a customer-confirmed map link on the order page. Map links open Google only when clicked.

## Optional automatic address suggestions

The default is manual address entry plus the browser delivery pin. Automatic reverse geocoding requires both `ADDRESS_LOOKUP_ENABLED=true` and a server-only `GOOGLE_GEOCODING_API_KEY`. Google OAuth/Firebase sign-in credentials do not provide this service. The current implementation opens a map link; it does not embed an interactive map or offer Places autocomplete, so Maps JavaScript and Places keys are not required for it.

To activate on the existing `inforteks-3da17` project:

1. In Google Cloud, verify the selected project and its billing account. Enable **Geocoding API**. Set a daily quota and billing alerts; an alert alone is not a spending cap.
2. Create a separate key restricted to **Geocoding API**. Use the Railway web service's fixed outbound IP for an IP application restriction when static outbound networking is configured. HTTP referrer restrictions are for browser keys and cannot authorize this server adapter. Do not reuse the Google OAuth client secret.
3. Save `GOOGLE_GEOCODING_API_KEY` securely on the Railway **web** service, along with `ADDRESS_LOOKUP_ENABLED=true`; workers do not need it. Keep staging and production configuration deliberate. Never paste the key into chat, source, browser JavaScript or saved setup instructions.
4. Deploy staging, allow location access from a real device at a UAE address and check the actual suggested area/street, incomplete/missing components, provider attribution, quota failure and manual fallback. Then activate production and repeat a consented check. Provider mocks do not establish live accuracy or billing access.

With the feature enabled, the button explains that Google receives coordinates to suggest an address. The API requires `consent: true` and same-origin POST, validates coordinates, uses a fixed Google endpoint, returns no-store responses, has an eight-second timeout, no retry, and limits usage to five requests per requester per minute and 1,000 per store per day. Requester limits use a session ID or a hash of the supplied client-IP header; the shared store limit still applies if a proxy header is spoofed. Provider URLs, keys, coordinates and raw error responses are not logged. Suggestions fill only empty fields and require customer review. No postal code, zone or apartment is inferred when Google omits it. Google Maps attribution is shown when a suggestion is returned. There is no server cache of Google responses.

The merchant must include this optional location use, third-party lookup and retained delivery details in its approved privacy/retention policy before enabling the provider for public orders. Delivery country restrictions remain UAE-only; Saudi Arabia, Qatar and Oman are coming soon.

References: [Google reverse geocoding](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding), [API key security](https://developers.google.com/maps/api-security-best-practices), [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies).
