"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HomeSectionView, type SectionPreviewData } from "./home-section-view";
export function SectionPreview({
  data,
  width,
}: {
  data: SectionPreviewData;
  width: number;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(700);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setScale(Math.min(1, el.clientWidth / width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  useEffect(() => {
    if (!mount) return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.max(180, mount.getBoundingClientRect().height + 32)),
    );
    observer.observe(mount);
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    mount.ownerDocument.addEventListener("click", stop, true);
    return () => {
      observer.disconnect();
      mount.ownerDocument.removeEventListener("click", stop, true);
    };
  }, [mount]);
  return (
    <div
      ref={host}
      className="isolated-preview"
      style={{ height: height * scale + 4 }}
    >
      <iframe
        ref={iframe}
        title="Selected homepage section preview"
        sandbox="allow-same-origin"
        srcDoc={
          '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="preview-root" style="padding:16px;overflow:hidden"></div></body></html>'
        }
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: 0,
        }}
        onLoad={() => {
          const doc = iframe.current?.contentDocument;
          if (!doc) return;
          for (const style of document.querySelectorAll(
            'link[rel="stylesheet"], style',
          ))
            doc.head.appendChild(style.cloneNode(true));
          setMount(doc.getElementById("preview-root"));
        }}
      />
      {mount && createPortal(<HomeSectionView {...data} preview />, mount)}
    </div>
  );
}
