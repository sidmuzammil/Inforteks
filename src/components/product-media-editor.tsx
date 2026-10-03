"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Star } from "lucide-react";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";
import { api } from "./store-client";

type ProductImage = { id: string; alt: string; key: string; public: boolean };
type SavedImages = { version: number; media: ProductImage[] };
const imageUrl = (image: ProductImage) =>
  image.key.startsWith("illustrations/")
    ? `/${image.key}`
    : `/media/${image.id}`;

export function ProductMediaEditor({
  productId,
  initialVersion,
  initialMedia,
  canEdit,
  published,
}: {
  productId: string;
  initialVersion: number;
  initialMedia: ProductImage[];
  canEdit: boolean;
  published: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedImages>({
    version: initialVersion,
    media: initialMedia,
  });
  const [images, setImages] = useState(initialMedia);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty =
    images.length !== saved.media.length ||
    images.some(
      (image, i) =>
        image.id !== saved.media[i]?.id || image.alt !== saved.media[i]?.alt,
    );

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  function move(from: number, to: number) {
    if (busy || !canEdit || to < 0 || to >= images.length) return;
    const next = [...images];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setImages(next);
    setMessage("Image order updated in the preview. Save images to apply.");
    setError("");
  }

  function accept(result: SavedImages) {
    setSaved({ version: result.version, media: result.media });
    setImages(result.media);
  }

  return (
    <section id="media" className="editor-section panel product-media-editor">
      <h2>Product images</h2>
      <p className="form-help">
        Choose your main image, move photos into order and edit their
        descriptions. Save images to apply your changes. The first published
        image is the storefront cover.
      </p>
      {!canEdit && (
        <p className="notice">
          You need product editing permission
          {published ? " and publishing permission" : ""} to change these
          images.
        </p>
      )}
      {images[0] && (
        <figure className="product-media-cover">
          <img src={imageUrl(images[0])} alt={images[0].alt} />
          <figcaption>
            <strong>Main image preview</strong>
            {published && !images[0].public && <span>Pending publication</span>}
          </figcaption>
        </figure>
      )}
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!dirty || !canEdit || busy) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const result = await api<SavedImages>(
              `admin/products/${productId}/media`,
              {
                version: saved.version,
                images: images.map(({ id, alt }) => ({ id, alt })),
              },
              "PATCH",
            );
            accept(result);
            setMessage(
              "Images saved. The new order and descriptions are now applied.",
            );
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ol className="product-image-list">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="product-image-card"
              aria-label={`Image ${index + 1}`}
            >
              <div className="product-image-heading">
                <strong>
                  {index === 0 ? "Main image" : `Image ${index + 1}`}
                </strong>
                <span>
                  {published && image.public ? "Published" : "Not published"}
                </span>
              </div>
              <img src={imageUrl(image)} alt={image.alt} />
              <label>
                Image {index + 1} description
                <input
                  value={image.alt}
                  required
                  maxLength={250}
                  disabled={!canEdit || busy}
                  onChange={(event) => {
                    setImages(
                      images.map((item) =>
                        item.id === image.id
                          ? { ...item, alt: event.target.value }
                          : item,
                      ),
                    );
                    setMessage("");
                    setError("");
                  }}
                />
              </label>
              {canEdit && (
                <div className="product-image-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, 0)}
                  >
                    <Star size={14} aria-hidden="true" />
                    {index === 0 ? "Main image" : "Make main image"}
                  </button>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Move image ${index + 1} earlier`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                    Earlier
                  </button>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Move image ${index + 1} later`}
                    disabled={busy || index === images.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                    Later
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {!images.length && (
          <p className="notice">
            No images yet. Upload your first product image below.
          </p>
        )}
        {canEdit && images.length > 0 && (
          <div className="product-image-actions">
            <button className="button primary" disabled={!dirty || busy}>
              {busy ? "Saving…" : "Save images"}
            </button>
            <button
              type="button"
              className="button"
              disabled={!dirty || busy}
              onClick={() => {
                setImages(saved.media);
                setMessage("Unsaved image changes discarded.");
                setError("");
              }}
            >
              Discard changes
            </button>
          </div>
        )}
      </form>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {error && (
        <div className="notice warning">
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                accept(await api<SavedImages>(`admin/products/${productId}`));
                setError("");
                setMessage("Latest images loaded. You can edit them again.");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Reload images
          </button>
          <small>Reloading discards unsaved image changes.</small>
        </div>
      )}
      {canEdit && (
        <form
          className="form-stack product-image-upload"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || dirty) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            data.set("productId", productId);
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const file = data.get("file");
              if (file instanceof File && file.size > MAX_IMAGE_BYTES)
                throw new Error("Images must be 4 MB or smaller.");
              await api("admin/media", data);
              // Reset immediately after the upload succeeds so a failed refresh cannot repeat it.
              form.reset();
              accept(await api<SavedImages>(`admin/products/${productId}`));
              setMessage(
                "Image uploaded at the end. You can now move it or make it the main image.",
              );
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Add another image</h3>
          <p className="form-help">
            New images stay private until you publish the product. Save or
            discard image edits before uploading.
          </p>
          <div className="form-grid">
            <div>
              <label>
                Product image
                <input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  required
                  disabled={busy || dirty}
                />
              </label>
              <small className="form-help">
                Up to 4 MB. Minimum 100 × 100 pixels.
              </small>
            </div>
            <label>
              Alternative text
              <input
                name="alt"
                required
                maxLength={250}
                disabled={busy || dirty}
              />
            </label>
          </div>
          <div>
            <button className="button" disabled={busy || dirty}>
              {busy ? "Working…" : "Upload image"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
