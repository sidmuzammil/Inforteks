# Merchant editor decisions — 3 October 2026

The implementation follows a section-based storefront and a single-merchant catalogue. Research informed concrete controls rather than copying another shop's theme.

- [Shopify Dawn image banner source](https://github.com/Shopify/dawn/blob/main/sections/image-banner.liquid): its actual section schema exposes image selection, text blocks, buttons and mobile/desktop layout settings. Inforteks uses explicit named hero, side-banner and CTA areas, a shared live/preview renderer, and isolated desktop/mobile previews so staff know which area they are changing.
- [Shopify Dawn price source](https://github.com/Shopify/dawn/blob/main/snippets/price.liquid): sale treatment compares the previous price with the current price. Inforteks validates that relationship server-side, accepts AED decimal input, stores integer fils and shows the genuine previous price struck through. A featured flag selects products independently from offers.
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html): merchant-authored HTML requires sanitization. Inforteks uses `sanitize-html` with a limited tag/style/URL allowlist on save, preview and rendering. Pasted HTML cannot provide scripts, forms, embedded frames, external resources or page-covering fixed positioning. The preview iframe has no script or form permission.

Shopify help-centre URLs were blocked by the environment's network policy; the public Dawn source was read through GitHub. This is design research and targeted testing, not a certification or independent security audit.

The empty-store failure had two concrete causes: required taxonomy selects had no options or inline creation, and the category domain incorrectly treated an omitted parent and omitted new-record ID as self-parenting. Both paths are fixed and tested. Initial uploads now belong to the draft-creation workflow. A partial upload failure retains the created draft so retrying cannot create a second product.

Migration six preserves existing offer sections, moves the previously hardcoded CTA into content records, and supplies editable homepage templates where absent. It inserts no products, prices, reviews or customer data. Existing custom sections remain intact. New sections created in the editor start hidden; saving a visible section updates its public content.
