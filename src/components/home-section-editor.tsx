"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowRight } from "lucide-react";
import { api } from "./store-client";
import { Fields, readFields, type Field } from "./forms";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";

export function HomeSectionEditor({
  fields,
  values = {},
}: {
  fields: Field[];
  values?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [mediaId, setMediaId] = useState<string | null>(
    typeof values.bannerMediaId === "string" ? values.bannerMediaId : null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  async function upload() {
    if (!file || !alt.trim()) {
      setError(
        "Choose an image and describe it for people using screen readers.",
      );
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image smaller than 4 MB.");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("alt", alt.trim());
      const media = await api<{ id: string }>("admin/banner-media", form);
      setMediaId(media.id);
      setFile(null);
      setMessage(
        "Image uploaded privately. Save the section to apply it to your storefront.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    if (file) {
      setError(
        "Upload the selected image before saving, or clear the file selection.",
      );
      return;
    }
    const payload = {
      ...readFields(e.currentTarget, fields),
      bannerMediaId: mediaId,
    };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const section = await api<{ id: string }>(
        `admin/home-sections${values.id ? `/${values.id}` : ""}`,
        payload,
        values.id ? "PATCH" : "POST",
      );
      setMessage("Homepage section saved.");
      router.replace(`/admin/home-sections/${section.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={save} aria-busy={busy || uploading}>
      <div className="form-grid">
        <Fields fields={fields} values={values} />
      </div>
      <section className="banner-editor">
        <h2>Hero banner image</h2>
        <p>
          Used for hero sections. Choose a wide image, at least 100 × 100
          pixels. JPEG, PNG, WebP or AVIF; up to 4 MB.
        </p>
        {mediaId && (
          <div className="banner-preview">
            <img
              src={`/media/${mediaId}`}
              alt="Selected homepage banner preview"
            />
            <button
              type="button"
              className="text-button"
              disabled={busy || uploading}
              onClick={() => {
                setMediaId(null);
                setMessage("Save to use the default banner image.");
              }}
            >
              Use default image
            </button>
          </div>
        )}
        <div className="form-grid">
          <label>
            Banner image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy || uploading}
            />
          </label>
          <label>
            Image description
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={250}
              placeholder="Describe what the image shows"
              disabled={busy || uploading}
            />
          </label>
        </div>
        <button
          type="button"
          className="button"
          disabled={busy || uploading || !file}
          onClick={() => void upload()}
        >
          <Upload size={16} />
          {uploading ? "Uploading…" : "Upload image"}
        </button>
      </section>
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
      <div>
        <button
          type="submit"
          className="button primary"
          disabled={busy || uploading}
        >
          {busy ? "Saving…" : "Save homepage section"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
