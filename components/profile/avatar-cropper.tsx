"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const VIEW = 280; // on-screen frame, px
const OUT = 800; // saved square, px

/**
 * Frame a photo before it's uploaded: drag to move, slider or wheel to zoom. The result is a
 * square image, so it looks right everywhere it's shown (round avatars, executive cards).
 */
export function AvatarCropper({ file, onCancel, onCropped }: { file: File; onCancel: () => void; onCropped: (f: File) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const base = natural ? VIEW / Math.min(natural.w, natural.h) : 1;
  const dispW = natural ? natural.w * base * zoom : VIEW;
  const dispH = natural ? natural.h * base * zoom : VIEW;
  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(-(dispW - VIEW) / 2, Math.min((dispW - VIEW) / 2, x)),
    y: Math.max(-(dispH - VIEW) / 2, Math.min((dispH - VIEW) / 2, y)),
  }), [dispW, dispH]);

  useEffect(() => setOffset((o) => clamp(o.x, o.y)), [zoom, clamp]);

  async function save() {
    if (!natural || !imgRef.current) return;
    setBusy(true);
    const k = base * zoom;
    const sx = (dispW / 2 - VIEW / 2 - offset.x) / k;
    const sy = (dispH / 2 - VIEW / 2 - offset.y) / k;
    const size = VIEW / k;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const g = canvas.getContext("2d");
    if (!g) return setBusy(false);
    g.imageSmoothingQuality = "high";
    g.drawImage(imgRef.current, sx, sy, size, size, 0, 0, OUT, OUT);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    setBusy(false);
    if (blob) onCropped(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" }));
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Frame your photo" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-popover p-5 text-popover-foreground shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Frame your photo</h2>
        <p className="mb-4 text-sm text-muted-foreground">Drag to move, and zoom until your face fills the circle.</p>
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-muted"
          style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; }}
          onPointerMove={(e) => { if (drag.current) setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y)); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.002)))}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={url}
              alt="Your photo"
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: dispW, height: dispH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: `0 0 0 9999px rgb(0 0 0 / 0.45)`, borderRadius: "9999px" }} aria-hidden />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <span className="w-12 text-muted-foreground">Zoom</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" aria-label="Zoom" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy || !natural}>{busy ? "Saving…" : "Use this photo"}</Button>
        </div>
      </div>
    </div>
  );
}
