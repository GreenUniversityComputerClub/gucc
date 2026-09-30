"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  url: string;
  thumb: string;
  alt: string | null;
}

/**
 * A photo grid that opens each photo large, in the page: arrows and swipes move between photos,
 * Escape closes, and focus returns to the photo you opened. Without JavaScript each thumbnail is
 * still a plain link to the large image.
 */
export function GalleryLightbox({ images, label }: { images: GalleryImage[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = images.length;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);
  const close = useCallback(() => {
    setOpen(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, go, close]);

  const current = open === null ? null : images[open];

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((g, i) => (
          <li key={g.url}>
            <a href={g.url} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); opener.current = e.currentTarget; setOpen(i); }}
              className="group block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open photo ${i + 1} of ${n}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.thumb} alt={g.alt ?? `${label} photo ${i + 1}`} loading="lazy" decoding="async" width={400} height={300}
                className="aspect-4/3 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </a>
          </li>
        ))}
      </ul>
      {current && (
        <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${label}: photo ${open! + 1} of ${n}`} tabIndex={-1}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-2 outline-none motion-safe:animate-in motion-safe:fade-in"
          onClick={(e) => e.target === e.currentTarget && close()}
          onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touch.current !== null && x !== undefined && Math.abs(x - touch.current) > 50) go(x < touch.current ? 1 : -1); touch.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={current.url} src={current.url} alt={current.alt ?? `${label} photo ${open! + 1}`} className="max-h-[88dvh] max-w-full rounded-lg object-contain shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm tabular-nums">{open! + 1} / {n}</span>
            <div className="flex gap-2">
              <a href={current.url} target="_blank" rel="noopener" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70" aria-label="Open full size"><Download className="h-5 w-5" /></a>
              <button type="button" onClick={close} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 hover:bg-black/70" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
          </div>
          {n > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={cn("absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70")}><ChevronLeft className="h-6 w-6" /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"><ChevronRight className="h-6 w-6" /></button>
            </>
          )}
          {current.alt && <p className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white">{current.alt}</p>}
        </div>
      )}
    </>
  );
}
