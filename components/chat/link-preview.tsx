"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import type { LinkPreview } from "@/lib/link-preview";
import { cn } from "@/lib/utils";

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/i;

/** The first web address in a message, if any. */
export function firstLink(text: string | null | undefined): string | null {
  return text?.match(URL_RE)?.[0] ?? null;
}

/** One request per link per tab, shared by every message that has it. */
const cache = new Map<string, Promise<LinkPreview | null>>();
function load(url: string): Promise<LinkPreview | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ preview: LinkPreview | null }>) : { preview: null }))
      .then((j) => j.preview, () => {
        cache.delete(url);
        return null;
      });
    cache.set(url, p);
  }
  return p;
}

/**
 * The card under a message with a link, as social sites show it: picture, site, title and a line
 * of description; the whole card opens the link. Loaded when the message scrolls into view; a
 * link without a preview shows nothing extra.
 */
export function LinkPreviewCard({ url, mine }: { url: string; mine: boolean }) {
  const [data, setData] = useState<LinkPreview | null>(null);
  const [imageOk, setImageOk] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const go = () => load(url).then((d) => alive && setData(d));
    if (typeof IntersectionObserver === "undefined") {
      void go();
      return () => void (alive = false);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void go();
      }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [url]);

  const picture = data?.image && imageOk ? data.image : null;
  return (
    <div ref={ref} className={cn("w-72 max-w-full", !data && "h-px")}>
      {data && (data.title || picture) && (
        <a href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={data.title ? undefined : `Picture from ${data.host}`}
          className={cn("mt-1 block overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-in motion-safe:fade-in",
            mine ? "rounded-tr-md" : "rounded-tl-md")}>
          {picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageOk(false)} onLoad={() => setImageLoaded(true)}
              className={cn("w-full bg-muted object-cover transition-opacity duration-300", data.title ? "aspect-[1.91/1]" : "max-h-72", !imageLoaded && "opacity-60 motion-safe:animate-pulse")} />
          )}
          {data.title && (
            <span className="block space-y-0.5 px-3 py-2">
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Globe className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{data.siteName ?? data.host}</span>
              </span>
              <span className="line-clamp-2 text-sm font-semibold leading-snug">{data.title}</span>
              {data.description && <span className="line-clamp-2 text-xs text-muted-foreground">{data.description}</span>}
            </span>
          )}
        </a>
      )}
    </div>
  );
}
