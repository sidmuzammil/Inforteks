"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "./store-client";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";
import {
  sectionContent,
  sectionTypes,
  type HomeSectionData,
  type BannerCard,
  type HeroSlide,
} from "@/lib/home-sections";
import type { PublicProduct } from "@/domains/catalogue";
import { SectionPreview } from "./section-preview";
import type { SectionPreviewData } from "./home-section-view";
const htmlTemplate =
  '<section style="background-color:#0b1434;color:#ffffff;padding:48px;border-radius:20px"><p>THE INFORTEKS EDIT</p><h2>Make space for something better.</h2><p>Discover technology for your everyday.</p><a href="/categories" style="display:inline-block;background-color:#ffffff;color:#0b1434;padding:16px;border-radius:8px">Explore products</a></section>';
function gulfInput(raw: unknown) {
  return raw
    ? new Date(new Date(String(raw)).getTime() + 4 * 3600_000)
        .toISOString()
        .slice(0, 16)
    : "";
}
function ImageUpload({
  label,
  mediaId,
  alt,
  onChange,
  onPending,
}: {
  label: string;
  mediaId: string | null;
  alt: string;
  onChange: (id: string | null, alt: string) => void;
  onPending: (pending: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const description = alt;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <section className="banner-editor">
      <h3>{label}</h3>
      <p className="form-help">
        JPEG, PNG, WebP or AVIF; up to 4 MB and at least 100 × 100 pixels.
        Uploads stay private until this section is visible.
      </p>
      {mediaId && (
        <div className="banner-preview">
          <img src={`/media/${mediaId}`} alt={alt || "Selected banner"} />
          <code>/media/{mediaId}</code>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => onChange(null, description)}
          >
            Remove image
          </button>
        </div>
      )}
      <div className="form-grid">
        <label>
          {label === "Hero banner image" ? "Banner image" : `${label} file`}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setFile(next);
              onPending(Boolean(next));
            }}
          />
        </label>
        <label>
          {label === "Hero banner image"
            ? "Image description"
            : `${label} description`}
          <input
            value={description}
            maxLength={250}
            disabled={busy}
            onChange={(e) => {
              onChange(mediaId, e.target.value);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="button"
        disabled={busy || !file}
        onClick={async () => {
          if (!file) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            if (file.size > MAX_IMAGE_BYTES)
              throw new Error("Choose an image smaller than 4 MB.");
            if (description.trim().length < 3)
              throw new Error("Describe what this image shows.");
            const fd = new FormData();
            fd.set("file", file);
            fd.set("alt", description);
            const m = await api<{ id: string }>("admin/banner-media", fd);
            onChange(m.id, description);
            setFile(null);
            onPending(false);
            setMessage(
              "Image uploaded privately. Save the section to apply it to your storefront.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Uploading…" : "Upload image"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function HeroProductPicker({
  slide,
  index,
  onSelect,
}: {
  slide: HeroSlide;
  index: number;
  onSelect: (product: PublicProduct | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="form-stack">
      <h3>Product photo and details</h3>
      <p className="form-help">
        Link a published Online Store product to use its current product photo,
        price or request-a-quote status. Hidden products and sample
        illustrations cannot appear in a carousel.
      </p>
      {slide.productId && (
        <div className="notice">
          Linked to {slide.title}. Product availability is checked again when
          the storefront loads.
          <button
            className="text-button"
            type="button"
            onClick={() => onSelect(null)}
          >
            Unlink product
          </button>
        </div>
      )}
      <div className="form-grid">
        <label>
          Slide {index + 1} product search
          <input
            value={query}
            maxLength={100}
            placeholder="Product name, model or SKU"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api<{ products: PublicProduct[] }>(
                `storefront/products?${new URLSearchParams({ q: query, limit: "12" })}`,
              );
              setResults(
                result.products.filter(
                  (product) =>
                    !product.demo &&
                    product.skus.length > 0 &&
                    product.media.some((media) =>
                      media.url.startsWith("/media/"),
                    ),
                ),
              );
              setSearched(true);
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Finding products…" : "Find published products"}
        </button>
      </div>
      <div className="form-stack" aria-live="polite">
        {results.map((product) => (
          <button
            className="button"
            type="button"
            key={product.id}
            onClick={() => {
              onSelect(product);
              setResults([]);
              setSearched(false);
            }}
          >
            Use {product.name}
          </button>
        ))}
        {searched && !results.length && (
          <p className="notice">
            No published products with a real product photo matched. Publish
            verified products and their photos first, or upload a banner below.
          </p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function HomeSectionEditor({
  values = {},
  categories = [],
  collections = [],
}: {
  values?: Record<string, unknown>;
  categories?: { name: string; slug: string }[];
  collections?: { name: string; slug: string }[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<HomeSectionData>(() => ({
    id: values.id as string | undefined,
    version: values.version as number | undefined,
    title: String(values.title ?? ""),
    subtitle: String(values.subtitle ?? ""),
    kind: String(values.kind ?? "hero"),
    href: String(values.href ?? "/categories"),
    buttonLabel: String(values.buttonLabel ?? "Explore products"),
    bannerMediaId: (values.bannerMediaId as string) ?? null,
    position: Number(values.position ?? 0),
    visible: Boolean(values.visible ?? false),
    content: sectionContent(values.content),
  }));
  const [startsAt, setStartsAt] = useState(gulfInput(values.startsAt));
  const [endsAt, setEndsAt] = useState(gulfInput(values.endsAt));
  const [preview, setPreview] = useState<SectionPreviewData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [width, setWidth] = useState(1150);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImages, setPendingImages] = useState<Record<string, boolean>>(
    {},
  );
  const hasPendingImage = Object.values(pendingImages).some(Boolean);
  function pending(key: string, value: boolean) {
    setPendingImages((old) => ({ ...old, [key]: value }));
  }
  function change(update: Partial<HomeSectionData>) {
    setSection((s) => ({ ...s, ...update }));
    setDirty(true);
    setMessage("");
  }
  function content(update: Partial<HomeSectionData["content"]>) {
    setSection((s) => ({ ...s, content: { ...s.content, ...update } }));
    setDirty(true);
    setMessage("");
  }
  function mainImage(bannerMediaId: string | null, imageAlt: string) {
    setSection((s) => ({
      ...s,
      bannerMediaId,
      content: { ...s.content, imageAlt },
    }));
    setDirty(true);
    setMessage("");
  }
  function side(index: number, update: Partial<BannerCard>) {
    setSection((s) => ({
      ...s,
      content: {
        ...s.content,
        sideCards: s.content.sideCards.map((c, i) =>
          i === index ? { ...c, ...update } : c,
        ),
      },
    }));
    setDirty(true);
    setMessage("");
  }
  function slide(index: number, update: Partial<HeroSlide>) {
    setSection((current) => ({
      ...current,
      content: {
        ...current.content,
        heroSlides: current.content.heroSlides.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...update } : item,
        ),
      },
    }));
    setDirty(true);
    setMessage("");
  }
  function moveSlide(index: number, direction: -1 | 1) {
    const next = [...section.content.heroSlides];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    content({ heroSlides: next });
  }
  function payload() {
    const data = { ...section };
    delete data.id;
    return {
      ...data,
      startsAt: startsAt
        ? new Date(`${startsAt}:00+04:00`).toISOString()
        : null,
      endsAt: endsAt ? new Date(`${endsAt}:00+04:00`).toISOString() : null,
    };
  }
  async function showPreview() {
    if (hasPendingImage) {
      setError("Upload selected images before previewing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<SectionPreviewData>(
        "admin/home-sections/preview",
        payload(),
      );
      setPreview(result);
      setDirty(false);
      if (
        section.kind === "html" &&
        result.section.content.html !== section.content.html
      )
        setMessage(
          "Unsupported HTML was removed. The preview shows exactly the safe content that will be saved.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasPendingImage) {
      setError("Upload selected images before saving.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<HomeSectionData>(
        `admin/home-sections${section.id ? `/${section.id}` : ""}`,
        payload(),
        section.id ? "PATCH" : "POST",
      );
      setSection({ ...result, content: sectionContent(result.content) });
      setMessage(
        result.visible
          ? "Homepage section saved. Visibility follows its schedule."
          : "Homepage section saved as hidden. Preview it, then enable Visible to publish.",
      );
      setDirty(true);
      if (!section.id) router.replace(`/admin/home-sections/${result.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="form-stack homepage-builder"
      onSubmit={save}
      aria-busy={busy}
    >
      <div className="notice">
        Editing one homepage area. Position controls its order; hidden sections
        are visible only to staff in previews.
      </div>
      <fieldset className="form-stack" disabled={busy}>
        <div className="form-grid">
          <label>
            Section type
            <select
              aria-label="Section type"
              value={section.kind}
              disabled={hasPendingImage}
              onChange={(e) => change({ kind: e.target.value })}
            >
              {Object.entries(sectionTypes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Position
            <input
              type="number"
              min="0"
              max="10000"
              value={section.position}
              onChange={(e) => change({ position: Number(e.target.value) })}
            />
          </label>
          <label>
            Headline
            <input
              required
              minLength={2}
              maxLength={150}
              value={section.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label>
            Supporting text
            <input
              maxLength={350}
              value={section.subtitle}
              onChange={(e) => change({ subtitle: e.target.value })}
            />
          </label>
          <label>
            Destination path
            <input
              required
              value={section.href}
              onChange={(e) => change({ href: e.target.value })}
            />
          </label>
          <label>
            Button text
            <input
              required
              minLength={2}
              maxLength={60}
              value={section.buttonLabel}
              onChange={(e) => change({ buttonLabel: e.target.value })}
            />
          </label>
        </div>
        <section className="merchandising-controls">
          <h2>Storefront presentation</h2>
          <p className="form-help">
            Use the same design on desktop and mobile. Preview changes before
            saving.
          </p>
          <div className="form-grid">
            {["hero", "cta"].includes(section.kind) && (
              <label>
                Banner colour
                <select
                  value={section.content.tone}
                  onChange={(e) =>
                    content({
                      tone: e.target
                        .value as HomeSectionData["content"]["tone"],
                    })
                  }
                >
                  <option value="navy">Midnight navy</option>
                  <option value="blue">Jade green</option>
                  <option value="light">Soft pearl</option>
                </select>
              </label>
            )}
            {["featured", "offers", "new", "collection"].includes(
              section.kind,
            ) && (
              <>
                <label>
                  Product layout
                  <select
                    value={section.content.layout}
                    onChange={(e) =>
                      content({ layout: e.target.value as "grid" | "rail" })
                    }
                  >
                    <option value="grid">Responsive grid</option>
                    <option value="rail">Scrollable product row</option>
                  </select>
                </label>
                <label>
                  Number of products
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={section.content.productLimit}
                    onChange={(e) =>
                      content({ productLimit: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Department selection
                  <select
                    value={section.content.categorySlug}
                    onChange={(e) => content({ categorySlug: e.target.value })}
                  >
                    <option value="">All departments</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Collection selection
                  <select
                    value={section.content.collectionSlug}
                    onChange={(e) =>
                      content({ collectionSlug: e.target.value })
                    }
                  >
                    <option value="">All collections</option>
                    {collections.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="form-help">
                  Selections combine. Only published Online Store products
                  appear; drafts and Direct Sales only products stay private. An
                  empty selection is hidden on the storefront.
                </p>
              </>
            )}
          </div>
        </section>
        {["hero", "cta"].includes(section.kind) && (
          <>
            <div className="form-grid">
              <label>
                Eyebrow text
                <input
                  value={section.content.eyebrow}
                  maxLength={100}
                  onChange={(e) => content({ eyebrow: e.target.value })}
                />
              </label>
              <label>
                Decorative footer text
                <input
                  value={section.content.footer}
                  maxLength={100}
                  onChange={(e) => content({ footer: e.target.value })}
                />
              </label>
            </div>
            <ImageUpload
              onPending={(value) => pending("main", value)}
              label="Hero banner image"
              mediaId={section.bannerMediaId}
              alt={section.content.imageAlt}
              onChange={mainImage}
            />
          </>
        )}
        {section.kind === "hero" && (
          <>
            <section className="form-stack merchandising-controls">
              <h2>Product carousel</h2>
              <p className="form-help">
                Add up to six slides with genuine product photos or uploaded
                campaign artwork. Slide order is shared by desktop and mobile.
                Custom slides replace the single hero image above.
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={section.content.autoProductHero}
                  onChange={(event) =>
                    content({ autoProductHero: event.target.checked })
                  }
                />
                Automatically feature published products when no custom slides
                or hero image are selected
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={section.content.autoplay}
                  onChange={(event) =>
                    content({ autoplay: event.target.checked })
                  }
                />
                Automatically advance every seven seconds
              </label>
              <p className="form-help">
                Automatic slides use current public product information and real
                photos. Playback supports pausing and reduced motion. With no
                eligible products, the storefront shows a compact discovery
                area.
              </p>
              {section.content.heroSlides.map((item, index) => (
                <details className="panel" key={index} open>
                  <summary>
                    Slide {index + 1} · {item.title || "New slide"}
                  </summary>
                  <div className="form-grid">
                    <label>
                      Slide {index + 1} headline
                      <input
                        value={item.title}
                        required
                        minLength={2}
                        maxLength={150}
                        onChange={(event) =>
                          slide(index, { title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Slide {index + 1} supporting text
                      <input
                        value={item.subtitle}
                        maxLength={350}
                        onChange={(event) =>
                          slide(index, { subtitle: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Slide {index + 1} eyebrow
                      <input
                        value={item.eyebrow}
                        maxLength={100}
                        onChange={(event) =>
                          slide(index, { eyebrow: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Slide {index + 1} button text
                      <input
                        value={item.buttonLabel}
                        required
                        minLength={2}
                        maxLength={60}
                        onChange={(event) =>
                          slide(index, { buttonLabel: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Slide {index + 1} destination
                      <input
                        value={item.href}
                        required
                        onChange={(event) =>
                          slide(index, { href: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Slide {index + 1} colour
                      <select
                        value={item.tone}
                        onChange={(event) =>
                          slide(index, {
                            tone: event.target.value as HeroSlide["tone"],
                          })
                        }
                      >
                        <option value="navy">Midnight navy</option>
                        <option value="blue">Jade green</option>
                        <option value="light">Soft pearl</option>
                      </select>
                    </label>
                  </div>
                  <HeroProductPicker
                    slide={item}
                    index={index}
                    onSelect={(product) =>
                      slide(
                        index,
                        product
                          ? {
                              productId: product.id,
                              mediaId: null,
                              alt: "",
                              title: product.name.slice(0, 150),
                              eyebrow: product.brand.name.slice(0, 100),
                              href: `/product/${product.slug}`,
                              buttonLabel: product.quoteOnly
                                ? "Request a quote"
                                : "Explore product",
                            }
                          : { productId: null },
                      )
                    }
                  />
                  <ImageUpload
                    label={`Slide ${index + 1} banner image`}
                    mediaId={item.mediaId}
                    alt={item.alt}
                    onPending={(value) => pending(`slide-${index}`, value)}
                    onChange={(mediaId, alt) => slide(index, { mediaId, alt })}
                  />
                  <div className="builder-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={hasPendingImage || index === 0}
                      onClick={() => moveSlide(index, -1)}
                    >
                      Move slide earlier
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={
                        hasPendingImage ||
                        index === section.content.heroSlides.length - 1
                      }
                      onClick={() => moveSlide(index, 1)}
                    >
                      Move slide later
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={hasPendingImage}
                      onClick={() =>
                        content({
                          heroSlides: section.content.heroSlides.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      Remove slide {index + 1}
                    </button>
                  </div>
                </details>
              ))}
              <button
                className="button"
                type="button"
                disabled={
                  hasPendingImage || section.content.heroSlides.length >= 6
                }
                onClick={() =>
                  content({
                    heroSlides: [
                      ...section.content.heroSlides,
                      {
                        title: section.title,
                        subtitle: "",
                        eyebrow: "",
                        buttonLabel: "Explore product",
                        href: "/categories",
                        mediaId: null,
                        productId: null,
                        alt: "",
                        tone: "light",
                      },
                    ],
                  })
                }
              >
                Add carousel slide
              </button>
            </section>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={section.content.showSideCards}
                onChange={(e) => content({ showSideCards: e.target.checked })}
              />
              Show two side banners
            </label>
            {section.content.showSideCards &&
              section.content.sideCards.map((c, i) => (
                <details className="panel" key={i}>
                  <summary>
                    Side banner {i + 1} · {c.title}
                  </summary>
                  <div className="form-grid">
                    <label>
                      Side banner {i + 1} headline
                      <input
                        maxLength={150}
                        value={c.title}
                        onChange={(e) => side(i, { title: e.target.value })}
                      />
                    </label>
                    <label>
                      Side banner {i + 1} eyebrow
                      <input
                        maxLength={100}
                        value={c.eyebrow}
                        onChange={(e) => side(i, { eyebrow: e.target.value })}
                      />
                    </label>
                    <label>
                      Side banner {i + 1} button
                      <input
                        maxLength={60}
                        value={c.buttonLabel}
                        onChange={(e) =>
                          side(i, { buttonLabel: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Side banner {i + 1} destination
                      <input
                        value={c.href}
                        onChange={(e) => side(i, { href: e.target.value })}
                      />
                    </label>
                  </div>
                  <ImageUpload
                    onPending={(value) => pending(`side-${i}`, value)}
                    label={`Side banner ${i + 1} image`}
                    mediaId={c.mediaId}
                    alt={c.alt}
                    onChange={(mediaId, alt) => side(i, { mediaId, alt })}
                  />
                </details>
              ))}
          </>
        )}
        {section.kind === "html" && (
          <section className="form-stack">
            <h2>Custom HTML</h2>
            <p className="form-help">
              Paste presentation HTML with headings, text, links, images and
              inline colours or spacing. Scripts, forms, embeds and external
              URLs are removed. Uploaded image paths appear below; paste them
              into an img src attribute.
            </p>
            <button
              className="button"
              type="button"
              onClick={() => content({ html: htmlTemplate })}
            >
              Insert starter HTML
            </button>
            <label>
              Banner HTML
              <textarea
                className="code-editor"
                value={section.content.html}
                maxLength={40000}
                onChange={(e) => content({ html: e.target.value })}
              />
            </label>
            <ImageUpload
              onPending={(value) => pending("html", value)}
              label="HTML banner image"
              mediaId={section.bannerMediaId}
              alt={section.content.imageAlt}
              onChange={mainImage}
            />
          </section>
        )}
        {section.kind === "featured" && (
          <p className="notice">
            Shows published products marked “Feature on homepage” in the product
            editor.
          </p>
        )}
        {section.kind === "offers" && (
          <p className="notice">
            Shows published products whose previous price is higher than their
            current price.
          </p>
        )}
        <div className="form-grid">
          <label className="checkbox-row">
            <input
              aria-label="Visible"
              type="checkbox"
              checked={section.visible}
              onChange={(e) => change({ visible: e.target.checked })}
            />
            Visible on storefront
          </label>
          <label>
            Starts at (Dubai time, optional)
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            Ends at (Dubai time, optional)
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => {
                setEndsAt(e.target.value);
                setDirty(true);
              }}
            />
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {hasPendingImage && (
        <p className="notice">
          Upload the selected images before saving or previewing this section.
        </p>
      )}
      <div className="builder-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void showPreview()}
        >
          Preview this section
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save homepage section"}
        </button>
      </div>
      {preview && (
        <section className="section-preview-panel">
          <div className="section-preview-toolbar">
            <h2>
              {sectionTypes[preview.section.kind as keyof typeof sectionTypes]}{" "}
              preview
            </h2>
            <label>
              Preview size
              <select
                aria-label="Preview size"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              >
                <option value={1150}>Desktop</option>
                <option value={390}>Mobile</option>
              </select>
            </label>
          </div>
          <p className="form-help">
            Only this area is shown. Links and shopping buttons are disabled in
            previews.
            {dirty
              ? " You have newer edits; click Preview this section to refresh."
              : " Preview is up to date."}
          </p>
          <SectionPreview data={preview} width={width} />
        </section>
      )}
    </form>
  );
}
