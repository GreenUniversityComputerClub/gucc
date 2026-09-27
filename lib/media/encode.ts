/**
 * Image variant encoding, shared by the page and the encoding worker. WebP where the browser
 * can write it (JPEG otherwise; both carry no EXIF or GPS data). The quality starts high and is
 * lowered in small steps only for unusually heavy images, never below MIN_QUALITY, so photos
 * look the same while typical files stay small.
 */

export interface EncodeTarget {
  name: string;
  width: number;
  height: number;
  quality: number;
}

/** Never lower than this: below it, compression starts to show on photos. */
export const MIN_QUALITY = 0.8;
/** Bytes per pixel above which a variant counts as unusually heavy (noisy photos, confetti, foliage). */
const HEAVY_BYTES_PER_PIXEL = 0.28;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

async function toBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}

export async function encodeTargets(bitmap: ImageBitmap, targets: EncodeTarget[], makeCanvas: (w: number, h: number) => AnyCanvas): Promise<Array<{ name: string; blob: Blob }>> {
  const out: Array<{ name: string; blob: Blob }> = [];
  for (const t of targets) {
    const canvas = makeCanvas(t.width, t.height);
    const g = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!g) throw new Error("Canvas is not available in this browser.");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, t.width, t.height);
    let quality = t.quality;
    let blob = await toBlob(canvas, "image/webp", quality);
    // Browsers without a WebP encoder return PNG: use JPEG instead.
    const type = blob?.type === "image/webp" ? "image/webp" : "image/jpeg";
    if (type === "image/jpeg") blob = await toBlob(canvas, "image/jpeg", quality);
    if (!blob) throw new Error("Could not encode the image.");
    const budget = t.width * t.height * HEAVY_BYTES_PER_PIXEL;
    for (let tries = 0; blob.size > budget && quality > MIN_QUALITY + 1e-9 && tries < 2; tries++) {
      quality = Math.max(MIN_QUALITY, Math.round((quality - 0.03) * 100) / 100);
      const smaller = await toBlob(canvas, type, quality);
      if (!smaller) break;
      blob = smaller;
    }
    out.push({ name: t.name, blob });
  }
  return out;
}
