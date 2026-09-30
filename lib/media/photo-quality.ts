"use client";

/**
 * Is this a real photo? Profile and group photos are checked in the browser before anything is
 * uploaded (the API Worker has 10 ms of CPU and can't decode images), on a small copy of the
 * picture, in a few milliseconds:
 *
 *   refused  blank or placeholder pictures: nearly all one colour (white, black, grey), mostly
 *            transparent, a handful of colours with no detail (default "person" silhouettes,
 *            flat logos of a letter), or too small to show anyone
 *   warned   blurry, a very long strip, or (where the browser can look for faces) no face found:
 *            the person can still choose "Use anyway"
 *
 * The same check runs again on the framed square, because framing can land on an empty wall.
 */

export type PhotoVerdict = "ok" | "warn" | "block";

export interface PhotoCheck {
  verdict: PhotoVerdict;
  /** What to tell the person (null when the photo looks fine). */
  message: string | null;
  /** Machine-readable reasons, for tests and diagnostics. */
  reasons: string[];
  metrics: {
    width: number;
    height: number;
    transparent: number;
    lumaStd: number;
    dominant: number;
    topTwo: number;
    colours: number;
    edges: number;
    sharpness: number;
    faces: number | null;
  };
}

/** Shortest side a profile photo needs to look sharp in a circle. */
export const MIN_SIDE = 200;
const SAMPLE = 64;
const SHARP_SAMPLE = 128;

type Source = File | Blob | HTMLCanvasElement | ImageBitmap;

async function toBitmap(src: Source): Promise<{ bitmap: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement) return { bitmap: src, width: src.width, height: src.height };
  if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) return { bitmap: src, width: src.width, height: src.height };
  const blob = src as Blob;
  if (typeof createImageBitmap === "function") {
    try {
      const b = await createImageBitmap(blob);
      return { bitmap: b, width: b.width, height: b.height, close: () => b.close() };
    } catch {
      // Some formats (HEIC in most browsers) only decode through an <img>, or not at all.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pixels(bitmap: CanvasImageSource, w: number, h: number): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "medium";
  g.drawImage(bitmap, 0, 0, w, h);
  try {
    return g.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

/** The measurements behind the verdict, from RGBA pixels (exported for tests). */
export function measure(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  let transparent = 0;
  let opaque = 0;
  let sum = 0;
  let sumSq = 0;
  const bins = new Map<number, number>();
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]!, gg = data[i * 4 + 1]!, b = data[i * 4 + 2]!, a = data[i * 4 + 3]!;
    // Transparent areas count as white, which is how most pages would show them.
    const k = a / 255;
    const R = r * k + 255 * (1 - k), G = gg * k + 255 * (1 - k), B = b * k + 255 * (1 - k);
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    luma[i] = y;
    if (a < 16) {
      transparent++;
      continue;
    }
    opaque++;
    sum += y;
    sumSq += y * y;
    const bin = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const mean = opaque ? sum / opaque : 255;
  const lumaStd = opaque ? Math.sqrt(Math.max(0, sumSq / opaque - mean * mean)) : 0;
  const counts = [...bins.values()].sort((x, y) => y - x);
  const dominant = opaque ? (counts[0] ?? 0) / opaque : 1;
  const topTwo = opaque ? ((counts[0] ?? 0) + (counts[1] ?? 0)) / opaque : 1;
  // Colours that cover at least two sample pixels (anti-aliasing noise doesn't count).
  const colours = counts.filter((c) => c >= 2).length;
  let edges = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w) edges += Math.abs(luma[i]! - luma[i + 1]!);
      if (y + 1 < h) edges += Math.abs(luma[i]! - luma[i + w]!);
    }
  }
  return { transparent: transparent / n, lumaStd, dominant, topTwo, colours, edges: edges / (2 * n) };
}

/** Variance of the Laplacian of a grey image: low means blurry. */
export function sharpnessOf(data: Uint8ClampedArray, w: number, h: number): number {
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/** The verdict from measurements (exported for tests). */
export function judge(m: PhotoCheck["metrics"], opts: { kind?: "profile" | "group" } = {}): Pick<PhotoCheck, "verdict" | "message" | "reasons"> {
  const who = opts.kind === "group" ? "the group" : "you";
  const block: string[] = [];
  const warn: string[] = [];
  if (Math.min(m.width, m.height) < MIN_SIDE) block.push("too-small");
  if (m.transparent > 0.4) block.push("transparent");
  if (m.lumaStd < 6 || m.dominant >= 0.92) block.push("blank");
  else if (m.colours < 12 || m.topTwo >= 0.9 || m.edges < 1.2) block.push("placeholder");
  if (!block.length) {
    if (m.sharpness < 25) warn.push("blurry");
    const ratio = Math.max(m.width, m.height) / Math.max(1, Math.min(m.width, m.height));
    if (ratio > 3) warn.push("strip");
    if (opts.kind !== "group" && m.faces === 0) warn.push("no-face");
  }
  if (block.includes("too-small")) {
    return { verdict: "block", reasons: block, message: `This picture is too small (${m.width}×${m.height} px). Please choose a photo at least ${MIN_SIDE} px on each side, so ${who === "you" ? "your face" : "it"} looks sharp.` };
  }
  if (block.length) {
    return {
      verdict: "block",
      reasons: block,
      message: opts.kind === "group"
        ? "This picture looks blank. Please choose a real photo or image for the group."
        : "This picture looks blank or like a placeholder. Please upload your real photo: a clear picture of your face helps members recognise you.",
    };
  }
  if (warn.length) {
    const say = warn.includes("no-face") ? "We couldn't find a face in this picture. A clear photo of your face works best."
      : warn.includes("blurry") ? "This picture looks blurry. A sharper photo will look better everywhere it's shown."
        : "This picture is very long and thin, so most of it will be cut off in the circle.";
    return { verdict: "warn", reasons: warn, message: say };
  }
  return { verdict: "ok", reasons: [], message: null };
}

async function countFaces(bitmap: CanvasImageSource): Promise<number | null> {
  const FD = (globalThis as unknown as { FaceDetector?: new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect(img: CanvasImageSource): Promise<unknown[]> } }).FaceDetector;
  if (!FD) return null;
  try {
    const faces = await new FD({ fastMode: true, maxDetectedFaces: 3 }).detect(bitmap);
    return faces.length;
  } catch {
    return null;
  }
}

/** Check a picture before it is uploaded. Never throws: an unreadable file comes back as a block. */
export async function checkPhoto(src: Source, opts: { kind?: "profile" | "group" } = {}): Promise<PhotoCheck> {
  let decoded: Awaited<ReturnType<typeof toBitmap>>;
  try {
    decoded = await toBitmap(src);
  } catch {
    return {
      verdict: "block", reasons: ["unreadable"], message: "This file couldn't be opened as a picture. Try a JPEG, PNG or WebP photo.",
      metrics: { width: 0, height: 0, transparent: 0, lumaStd: 0, dominant: 0, topTwo: 0, colours: 0, edges: 0, sharpness: 0, faces: null },
    };
  }
  try {
    const { bitmap, width, height } = decoded;
    const small = pixels(bitmap, SAMPLE, SAMPLE);
    const sharp = pixels(bitmap, SHARP_SAMPLE, SHARP_SAMPLE);
    if (!small || !sharp) {
      // A browser that won't let us read the pixels: don't stop anyone.
      return { verdict: "ok", reasons: [], message: null, metrics: { width, height, transparent: 0, lumaStd: 99, dominant: 0, topTwo: 0, colours: 99, edges: 99, sharpness: 999, faces: null } };
    }
    const m = measure(small, SAMPLE, SAMPLE);
    const metrics: PhotoCheck["metrics"] = { width, height, ...m, sharpness: sharpnessOf(sharp, SHARP_SAMPLE, SHARP_SAMPLE), faces: opts.kind === "group" ? null : await countFaces(bitmap) };
    return { ...judge(metrics, opts), metrics };
  } finally {
    decoded.close?.();
  }
}
