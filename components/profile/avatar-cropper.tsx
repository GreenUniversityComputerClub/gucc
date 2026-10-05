"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BACKDROPS, canBlur, compose, cutOutPerson, portraitCutout, preloadSegmenter, type Backdrop, type PersonCutout } from "@/lib/media/background";
import { cn } from "@/lib/utils";

const VIEW = 280; // on-screen frame, px
const OUT = 800; // saved square, px
/** Formats that can carry transparency (a cut-out made elsewhere). */
const MAY_HAVE_ALPHA = /^image\/(png|webp|gif|avif)$/;

/** A copy on white: JPEG has no transparency, and an unfilled canvas would turn it black. */
function onWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const g = out.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(src, 0, 0);
  return out;
}

/** Share of a canvas that is opaque (0–1), measured on a small copy. */
function opaqueShare(src: HTMLCanvasElement): number {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return 1;
  g.drawImage(src, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  let solid = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]! >= 16) solid++;
  return solid / (S * S);
}

type BgState = { status: "working" } | { status: "ready"; cut: PersonCutout } | { status: "none"; reason: string };

/**
 * Edit a photo before it's uploaded.
 *
 * 1. Frame: drag (or arrow keys) to move, slider, wheel or +/- to zoom, rotate a sideways photo.
 *    The result is a square, so it looks right everywhere (round avatars, executive cards).
 * 2. Background (profile photos): the person is found in the browser and the background becomes
 *    white, soft grey, GUCC green, formal blue or a blur of the original, or stays as it was.
 */
export function AvatarCropper({ file, onCancel, onCropped, title = "Frame your photo", hint = "Drag to move, and zoom until your face fills the circle.", backgrounds = false }: {
  file: File;
  onCancel: () => void;
  /** The framed photo; with background removal, also the person alone on transparency (PNG). */
  onCropped: (f: File, cutout?: File) => void;
  title?: string;
  hint?: string;
  /** Offer background removal (profile photos). */
  backgrounds?: boolean;
}) {
  const [rotation, setRotation] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"frame" | "background">("frame");
  const [bg, setBg] = useState<BgState>({ status: "working" });
  const [backdrop, setBackdrop] = useState<Backdrop>("soft");
  const [blurOk, setBlurOk] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // The background remover loads while the photo is being framed.
  useEffect(() => {
    if (!backgrounds) return;
    preloadSegmenter();
    setBlurOk(canBlur());
  }, [backgrounds]);

  // The picture shown in the frame: the file, turned by `rotation` when asked.
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    const original = URL.createObjectURL(file);
    if (rotation === 0) {
      setUrl(original);
      return () => URL.revokeObjectURL(original);
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const turned = rotation % 180 !== 0;
      c.width = turned ? img.naturalHeight : img.naturalWidth;
      c.height = turned ? img.naturalWidth : img.naturalHeight;
      const g = c.getContext("2d")!;
      g.translate(c.width / 2, c.height / 2);
      g.rotate((rotation * Math.PI) / 180);
      g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      c.toBlob((b) => {
        if (!alive || !b) return;
        made = URL.createObjectURL(b);
        setNatural(null);
        setUrl(made);
      }, MAY_HAVE_ALPHA.test(file.type) ? "image/png" : "image/jpeg", 0.95);
    };
    img.src = original;
    return () => {
      alive = false;
      URL.revokeObjectURL(original);
      if (made) URL.revokeObjectURL(made);
    };
  }, [file, rotation]);

  const base = natural ? VIEW / Math.min(natural.w, natural.h) : 1;
  const dispW = natural ? natural.w * base * zoom : VIEW;
  const dispH = natural ? natural.h * base * zoom : VIEW;
  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(-(dispW - VIEW) / 2, Math.min((dispW - VIEW) / 2, x)),
    y: Math.max(-(dispH - VIEW) / 2, Math.min((dispH - VIEW) / 2, y)),
  }), [dispW, dispH]);

  useEffect(() => setOffset((o) => clamp(o.x, o.y)), [zoom, clamp]);

  /** The framed square, full size. */
  function framed(): HTMLCanvasElement | null {
    if (!natural || !imgRef.current) return null;
    const k = base * zoom;
    const sx = (dispW / 2 - VIEW / 2 - offset.x) / k;
    const sy = (dispH / 2 - VIEW / 2 - offset.y) / k;
    const size = VIEW / k;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.imageSmoothingQuality = "high";
    g.drawImage(imgRef.current, sx, sy, size, size, 0, 0, OUT, OUT);
    return canvas;
  }

  async function finish(canvas: HTMLCanvasElement, person?: HTMLCanvasElement) {
    setBusy(true);
    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    const flat = onWhite(canvas);
    const [blob, cut] = await Promise.all([
      new Promise<Blob | null>((resolve) => flat.toBlob(resolve, "image/jpeg", 0.92)),
      person ? new Promise<Blob | null>((resolve) => person.toBlob(resolve, "image/png")) : Promise.resolve(null),
    ]);
    setBusy(false);
    if (blob) onCropped(new File([blob], `${stem}.jpg`, { type: "image/jpeg" }), cut ? new File([cut], `${stem}-cutout.png`, { type: "image/png" }) : undefined);
  }

  async function next() {
    const canvas = framed();
    if (!canvas) return;
    if (!backgrounds) return finish(canvas);
    originalRef.current = onWhite(canvas);
    setStep("background");
    setBg({ status: "working" });
    // A picture that already has its background removed: its own transparency is the cut-out.
    const coverage = MAY_HAVE_ALPHA.test(file.type) ? opaqueShare(canvas) : 1;
    if (coverage < 0.95 && coverage > 0.05) {
      setBg({ status: "ready", cut: { photo: originalRef.current, person: canvas, coverage } });
      setBackdrop("soft");
      return;
    }
    try {
      const cut = await cutOutPerson(originalRef.current);
      if (cut) setBg({ status: "ready", cut });
      else {
        setBg({ status: "none", reason: "No person found in the framed part, so the background stays as it is." });
        setBackdrop("original");
      }
    } catch {
      setBg({ status: "none", reason: "The background remover couldn't start on this device, so the background stays as it is." });
      setBackdrop("original");
    }
  }

  // The framed square on white, kept for when the background stays as it is.
  const originalRef = useRef<HTMLCanvasElement | null>(null);

  // The preview follows the chosen backdrop at once (no new segmentation).
  useEffect(() => {
    const view = previewRef.current;
    if (step !== "background" || !view) return;
    const out = bg.status === "ready" ? compose(bg.cut, backdrop) : bg.status === "none" ? originalRef.current : null;
    if (!out) return;
    const p = view.getContext("2d")!;
    p.clearRect(0, 0, view.width, view.height);
    p.drawImage(out, 0, 0, view.width, view.height);
  }, [step, bg, backdrop]);

  async function save() {
    if (step === "frame") return next();
    const canvas = bg.status === "ready" ? compose(bg.cut, backdrop) : originalRef.current;
    // With the background removed, the person alone goes too (the executives list shows it).
    if (canvas) await finish(canvas, bg.status === "ready" && backdrop !== "original" ? portraitCutout(bg.cut.person) : undefined);
  }

  // Keyboard: arrows move, + and - zoom (when the frame has the focus).
  function onKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key]!;
      setOffset((o) => clamp(o.x + dx, o.y + dy));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom((z) => Math.min(4, z + 0.1));
    } else if (e.key === "-") {
      e.preventDefault();
      setZoom((z) => Math.max(1, z - 0.1));
    }
  }

  const heading = step === "frame" ? title : "Choose a background";
  return (
    <div role="dialog" aria-modal="true" aria-label={heading} className="fixed inset-0 z-60 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) onCancel(); }}>
      <div className="max-h-dvh w-full max-w-sm overflow-y-auto rounded-t-2xl bg-popover p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-xl sm:rounded-2xl">
        {backgrounds && (
          <ol className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground" aria-label="Steps">
            <li className={cn("rounded-full px-2 py-0.5", step === "frame" ? "bg-primary text-primary-foreground" : "bg-muted")} aria-current={step === "frame" ? "step" : undefined}>1 Frame</li>
            <li aria-hidden>→</li>
            <li className={cn("rounded-full px-2 py-0.5", step === "background" ? "bg-primary text-primary-foreground" : "bg-muted")} aria-current={step === "background" ? "step" : undefined}>2 Background</li>
          </ol>
        )}
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {step === "frame" ? hint : bg.status === "none" ? bg.reason : "The background is removed on your device; nothing is sent until you save."}
        </p>

        {step === "frame" ? (
          <>
            <div
              ref={frameRef}
              tabIndex={0}
              role="application"
              aria-label="Photo frame. Arrow keys move the photo, plus and minus zoom."
              className="relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
              onKeyDown={onKey}
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
            <div className="mt-4 flex items-center gap-3 text-sm">
              <label className="flex flex-1 items-center gap-3">
                <span className="w-12 text-muted-foreground">Zoom</span>
                <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-primary" aria-label="Zoom" />
              </label>
              <button type="button" onClick={() => { setRotation((r) => (r + 90) % 360); setZoom(1); setOffset({ x: 0, y: 0 }); }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Rotate a quarter turn" title="Rotate">
                <RotateCw className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="relative mx-auto overflow-hidden rounded-full border bg-muted shadow-inner" style={{ width: 220, height: 220 }}>
              <canvas ref={previewRef} width={440} height={440} className="h-full w-full" aria-label="Preview of your photo" role="img" />
              {bg.status === "working" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-sm" role="status">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />Removing the background…
                </div>
              )}
            </div>
            {bg.status === "ready" && (
              <fieldset className="mt-5">
                <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" aria-hidden />Background</legend>
                <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Background">
                  {BACKDROPS.filter((b) => b.key !== "blur" || blurOk).map((b) => (
                    <button key={b.key} type="button" role="radio" aria-checked={backdrop === b.key} aria-label={b.label} title={b.label} onClick={() => setBackdrop(b.key)}
                      className={cn("aspect-square w-full rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        backdrop === b.key ? "scale-110 border-primary" : "border-border hover:scale-105")}
                      style={{ background: b.swatch }} />
                  ))}
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">{BACKDROPS.find((b) => b.key === backdrop)?.label}</p>
              </fieldset>
            )}
          </>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {step === "background" ? (
            <Button type="button" variant="ghost" onClick={() => setStep("frame")} disabled={busy}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden />Back</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={save} disabled={busy || !natural || (step === "background" && bg.status === "working")}>
              {busy ? "Saving…" : step === "frame" && backgrounds ? "Next" : "Use this photo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
