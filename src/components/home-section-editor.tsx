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
} from "@/lib/home-sections";
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
  const [description, setDescription] = useState(alt);
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
            onClick={() => onChange(null, description)}
          >
            Use default image
          </button>
        </div>
      )}
      <div className="form-grid">
        <label>
          {label === "Hero banner image" ? "Banner image" : `${label} file`}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
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
            onChange={(e) => {
              setDescription(e.target.value);
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
                    tone: e.target.value as HomeSectionData["content"]["tone"],
                  })
                }
              >
                <option value="navy">Midnight navy</option>
                <option value="blue">Inforteks blue</option>
                <option value="light">Soft ice</option>
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
                  onChange={(e) => content({ collectionSlug: e.target.value })}
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
                Selections combine. Only published Online Store products appear;
                drafts and Direct Sales only products stay private. An empty
                selection is hidden on the storefront.
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
                      onChange={(e) => side(i, { buttonLabel: e.target.value })}
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
            inline colours or spacing. Scripts, forms, embeds and external URLs
            are removed. Uploaded image paths appear below; paste them into an
            img src attribute.
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
