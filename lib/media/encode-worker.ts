/// <reference lib="webworker" />
/**
 * Encodes image variants off the main thread (OffscreenCanvas), so the page stays responsive
 * while large photos are resized. Loaded by lib/media/client.ts only where the browser supports
 * it; otherwise the same work runs on the page.
 */
import { encodeTargets, type EncodeTarget } from "./encode";

interface Job {
  id: number;
  bitmap: ImageBitmap;
  targets: EncodeTarget[];
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, bitmap, targets } = e.data;
  try {
    const out = await encodeTargets(bitmap, targets, (w, h) => new OffscreenCanvas(w, h));
    (self as unknown as Worker).postMessage({ id, ok: true, out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : "Could not encode the image." });
  } finally {
    bitmap.close();
  }
};
