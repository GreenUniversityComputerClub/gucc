"use client";

/**
 * Profile-photo background removal, entirely in the browser: Google's MediaPipe selfie segmenter
 * (Apache-2.0) finds the person in the framed square, and the background is replaced with a clean
 * colour, a soft blur of the original, or left as it was. Nothing is sent anywhere; the model
 * (≈250 KB) and its WebAssembly runtime are served by this site and loaded only when someone
 * edits a photo (`scripts/copy-mediapipe.mjs` puts the runtime in /mediapipe).
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

export type Backdrop = "original" | "white" | "soft" | "green" | "blue" | "blur";

export const BACKDROPS: Array<{ key: Backdrop; label: string; swatch: string }> = [
  { key: "white", label: "White", swatch: "#ffffff" },
  { key: "soft", label: "Soft grey", swatch: "linear-gradient(135deg,#f8fafc,#e2e8f0)" },
  { key: "green", label: "GUCC green", swatch: "linear-gradient(135deg,#16a34a,#0d9488)" },
  { key: "blue", label: "Formal blue", swatch: "linear-gradient(135deg,#2563eb,#1e3a8a)" },
  { key: "blur", label: "Blurred", swatch: "radial-gradient(circle at 35% 35%,#94a3b8,#475569)" },
  { key: "original", label: "Original", swatch: "repeating-conic-gradient(#cbd5e1 0 25%,#f1f5f9 0 50%) 50%/10px 10px" },
];

const RUNTIME = "/mediapipe";
const MODEL = "/models/selfie_segmenter.tflite";

let segmenter: Promise<ImageSegmenter> | null = null;

/** The segmenter, created once per visit (GPU where it works, otherwise the CPU). */
function loadSegmenter(): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(RUNTIME);
    const make = (delegate: "GPU" | "CPU") => ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })().catch((e: unknown) => {
    segmenter = null;
    throw e;
  });
  return segmenter;
}

/** Start loading early (when the photo editor opens), so the background step is quick. */
export function preloadSegmenter(): void {
  void loadSegmenter().catch(() => undefined);
}

export interface PersonCutout {
  /** The framed photo, as given. */
  photo: HTMLCanvasElement;
  /** The person only (transparent elsewhere), same size. */
  person: HTMLCanvasElement;
  /** Share of the square the person covers (0–1). */
  coverage: number;
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Find the person in a framed square. Returns null when nobody is there (a logo, a landscape),
 * so the caller keeps the original.
 */
export async function cutOutPerson(photo: HTMLCanvasElement): Promise<PersonCutout | null> {
  const seg = await loadSegmenter();
  const { width: w, height: h } = photo;
  const result = seg.segment(photo);
  try {
    const mask = result.confidenceMasks?.[0];
    if (!mask) return null;
    const conf = mask.getAsFloat32Array();
    const mw = mask.width;
    const mh = mask.height;
    // The mask may be smaller than the photo: it's scaled up with smoothing below.
    const alpha = document.createElement("canvas");
    alpha.width = mw;
    alpha.height = mh;
    const ag = alpha.getContext("2d")!;
    const a = ag.createImageData(mw, mh);
    let sum = 0;
    for (let i = 0; i < conf.length; i++) {
      // A soft threshold: confident person → opaque, confident background → clear, soft edge between.
      const v = smooth(0.3, 0.75, conf[i]!);
      sum += v;
      a.data[i * 4 + 3] = Math.round(v * 255);
    }
    ag.putImageData(a, 0, 0);
    const coverage = sum / conf.length;
    if (coverage < 0.05) return null;

    // The person: the photo, kept only where the (feathered) mask is.
    const person = document.createElement("canvas");
    person.width = w;
    person.height = h;
    const pg = person.getContext("2d")!;
    pg.imageSmoothingQuality = "high";
    if ("filter" in pg) pg.filter = `blur(${Math.max(0.6, w / 700)}px)`;
    pg.drawImage(alpha, 0, 0, w, h);
    if ("filter" in pg) pg.filter = "none";
    pg.globalCompositeOperation = "source-in";
    pg.drawImage(photo, 0, 0);
    pg.globalCompositeOperation = "source-over";
    return { photo, person, coverage };
  } finally {
    result.close();
  }
}

/** Whether this browser can blur on a canvas (needed for the "Blurred" backdrop). */
export function canBlur(): boolean {
  if (typeof document === "undefined") return false;
  const g = document.createElement("canvas").getContext("2d");
  return Boolean(g && "filter" in g);
}

/** The finished square: the chosen backdrop with the person on top. */
export function compose(cut: PersonCutout, backdrop: Backdrop): HTMLCanvasElement {
  const { photo, person } = cut;
  const out = document.createElement("canvas");
  out.width = photo.width;
  out.height = photo.height;
  const g = out.getContext("2d")!;
  const { width: w, height: h } = out;
  if (backdrop === "original") {
    g.drawImage(photo, 0, 0);
    return out;
  }
  if (backdrop === "blur") {
    // Portrait mode: the original background, strongly blurred and slightly enlarged (no hard edges).
    g.filter = `blur(${Math.round(w / 40)}px)`;
    g.drawImage(photo, -w * 0.05, -h * 0.05, w * 1.1, h * 1.1);
    g.filter = "none";
  } else {
    const fill: Record<Exclude<Backdrop, "original" | "blur">, [string, string]> = {
      white: ["#ffffff", "#ffffff"],
      soft: ["#f8fafc", "#e2e8f0"],
      green: ["#16a34a", "#0d9488"],
      blue: ["#2563eb", "#1e3a8a"],
    };
    const [from, to] = fill[backdrop];
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(person, 0, 0);
  return out;
}

/**
 * The cut-out as the executives list wants it (like the club's own portraits): the empty
 * transparent margin trimmed, the person standing on the bottom edge, centred, in a square.
 */
export function portraitCutout(person: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = person;
  const data = person.getContext("2d")!.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 24) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return person;
  const bw = right - left + 1;
  const bh = bottom - top + 1;
  const side = Math.max(bw, bh);
  const out = document.createElement("canvas");
  out.width = side;
  out.height = side;
  out.getContext("2d")!.drawImage(person, left, top, bw, bh, Math.round((side - bw) / 2), side - bh, bw, bh);
  return out;
}
