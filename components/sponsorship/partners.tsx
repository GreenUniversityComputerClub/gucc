"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export interface Partner {
  name: string;
  logo: string;
}

/**
 * Previous partners' logos, gliding by (paused while pointed at, focused or touched; still for
 * people who prefer less motion). Drag, swipe or use the arrow keys to browse. Each logo sits on
 * a white tile, so dark logos stay readable in dark mode.
 */
export function PartnersStrip({ partners }: { partners: Partner[] }) {
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const loop = partners.length > 3 ? [...partners, ...partners, ...partners] : partners;

  useEffect(() => {
    const el = track.current;
    if (!el || partners.length <= 3 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.scrollLeft = el.scrollWidth / 3;
    let frame = 0;
    const step = () => {
      const w = el.scrollWidth / 3;
      if (!paused.current && !drag.current && w > 0) {
        el.scrollLeft += 0.5;
        if (el.scrollLeft >= w * 2) el.scrollLeft -= w;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [partners.length]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d || !track.current) return;
      if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
      track.current.scrollLeft = d.left - (e.clientX - d.x);
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  return (
    <div className="relative w-full [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)} onTouchEnd={() => (paused.current = false)}>
      <div ref={track} tabIndex={0} role="region" aria-label="Previous partners (use the arrow keys to browse)"
        onFocus={() => (paused.current = true)} onBlur={() => (paused.current = false)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          track.current?.scrollBy({ left: e.key === "ArrowLeft" ? -240 : 240, behavior: "smooth" });
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          drag.current = { x: e.clientX, left: track.current?.scrollLeft ?? 0, moved: false };
          setDragging(true);
        }}
        onClickCapture={(e) => drag.current?.moved && e.preventDefault()}
        className={`flex gap-4 overflow-x-auto px-4 py-3 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden ${partners.length <= 3 ? "justify-center" : ""} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}>
        {loop.map((p, i) => (
          <div key={`${p.name}-${i}`} title={p.name} aria-hidden={i >= partners.length ? true : undefined}
            className="flex h-20 w-40 shrink-0 items-center justify-center rounded-2xl border bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 sm:h-24 sm:w-48 dark:border-white/10">
            <div className="relative h-full w-full">
              <Image src={p.logo} alt={i >= partners.length ? "" : p.name} fill sizes="(max-width: 640px) 160px, 192px" draggable={false} className="pointer-events-none select-none object-contain" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
