"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";

export type ProductHeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  buttonLabel: string;
  href: string;
  image: string;
  alt: string;
  tone: "navy" | "blue" | "light";
  category?: string;
  price?: string;
  priceNote?: string;
  highlights?: string[];
};

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function ProductHeroCarousel({
  slides,
  autoplay = false,
  preview = false,
}: {
  slides: ProductHeroSlide[];
  autoplay?: boolean;
  preview?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const panelId = useId();
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
  const count = slides.length;
  const active = selected % Math.max(count, 1);
  const slide = slides[active];
  const rotating =
    autoplay &&
    count > 1 &&
    !paused &&
    !hovered &&
    !focused &&
    !hidden &&
    !reducedMotion &&
    !preview;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(
      () => setSelected((current) => (current + 1) % count),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [rotating, count]);

  function move(direction: number) {
    setSelected((current) => (current + direction + count) % count);
  }

  if (!slide) return null;

  return (
    <section
      className={`product-showcase marketplace-campaign showcase-${slide.tone}`}
      role="region"
      aria-roledescription={count > 1 ? "carousel" : undefined}
      aria-label="Product highlights"
      tabIndex={count > 1 ? 0 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (
          count < 2 ||
          (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
        )
          return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        touch.current = point ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        const end = event.changedTouches[0];
        touch.current = null;
        if (!start || !end || count < 2) return;
        const horizontal = end.clientX - start.x;
        const vertical = end.clientY - start.y;
        if (
          Math.abs(horizontal) > 48 &&
          Math.abs(horizontal) > Math.abs(vertical)
        )
          move(horizontal < 0 ? 1 : -1);
      }}
      onTouchCancel={() => {
        touch.current = null;
      }}
    >
      <div
        id={panelId}
        className="showcase-stage"
        aria-live={rotating ? "off" : "polite"}
        aria-atomic="true"
      >
        <article
          key={slide.id}
          className="showcase-slide"
          role="group"
          aria-roledescription={count > 1 ? "slide" : undefined}
          aria-label={count > 1 ? `${active + 1} of ${count}` : undefined}
        >
          <div className="showcase-copy">
            {slide.eyebrow && (
              <p className="showcase-eyebrow">{slide.eyebrow}</p>
            )}
            <h1>{slide.title}</h1>
            {slide.subtitle && (
              <p className="showcase-description">{slide.subtitle}</p>
            )}
            {!!slide.highlights?.length && (
              <ul className="showcase-highlights">
                {slide.highlights.map((highlight, index) => (
                  <li key={index}>{highlight}</li>
                ))}
              </ul>
            )}
            {slide.price && (
              <div className="showcase-price">
                <strong>{slide.price}</strong>
                {slide.priceNote && <span>{slide.priceNote}</span>}
              </div>
            )}
            <Link
              href={slide.href}
              className="showcase-action"
              onClick={preview ? (event) => event.preventDefault() : undefined}
              tabIndex={preview ? -1 : undefined}
            >
              {slide.buttonLabel}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="showcase-visual">
            <div className="showcase-product-frame">
              <img
                src={slide.image}
                alt={slide.alt}
                width="640"
                height="480"
                fetchPriority={active === 0 ? "high" : "auto"}
                draggable="false"
              />
            </div>
            {slide.category && (
              <span className="showcase-category">{slide.category}</span>
            )}
          </div>
        </article>
      </div>
      {count > 1 && (
        <div className="showcase-navigation">
          <div
            className="showcase-selections"
            aria-label="Choose a product highlight"
          >
            {slides.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={`showcase-selection ${active === index ? "is-active" : ""}`}
                aria-label={`Show slide ${index + 1}: ${item.title}`}
                aria-current={active === index ? "true" : undefined}
                aria-controls={panelId}
                onClick={() => setSelected(index)}
                data-preview-control="true"
              >
                <img
                  src={item.image}
                  alt=""
                  width="44"
                  height="44"
                  loading="lazy"
                />
                <span>{item.eyebrow || item.title}</span>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="showcase-controls">
            <span className="showcase-position" aria-hidden="true">
              <b>{String(active + 1).padStart(2, "0")}</b>
              <span>/ {String(count).padStart(2, "0")}</span>
            </span>
            {autoplay && !reducedMotion && !preview && (
              <button
                type="button"
                aria-label={
                  paused
                    ? "Enable automatic banner rotation"
                    : "Pause automatic banner rotation"
                }
                aria-pressed={!paused}
                onClick={() => setPaused((value) => !value)}
                data-preview-control="true"
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
            <button
              type="button"
              aria-label="Previous banner"
              aria-controls={panelId}
              onClick={() => move(-1)}
              data-preview-control="true"
            >
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Next banner"
              aria-controls={panelId}
              onClick={() => move(1)}
              data-preview-control="true"
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
