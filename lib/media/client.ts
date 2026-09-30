"use client";

import { uploadTokenAction } from "./actions";
import { encodeTargets, type EncodeTarget } from "./encode";

/**
 * Browser half of the media pipeline. Decoding with imageOrientation "from-image" applies EXIF
 * rotation; re-encoding produces fresh WebP files with no EXIF/GPS metadata. Only the sizes the
 * purpose needs are made (an avatar never needs a 1920 px copy), nothing is upscaled, and the
 * largest kept size is stored as the master. Encoding runs in a worker where the browser allows
 * it, so the page stays responsive. The server validates every file again; this step saves
 * bandwidth, storage (R2's free 10 GB) and Worker CPU.
 */

export type Purpose = "library" | "lostfound" | "event" | "avatar" | "group";
type VariantName = "thumb" | "sm" | "md" | "lg" | "master";

/**
 * Sizes kept per purpose (longest side, px). The site never shows images wider than 1920 px; the
 * server serves the next larger stored size when a smaller one is missing, so old and new files
 * work the same everywhere.
 */
export const PROFILES: Record<Purpose | "document", Partial<Record<VariantName, number>>> = {
  avatar: { thumb: 400, master: 800 },
  group: { thumb: 400, master: 800 },
  lostfound: { thumb: 400, sm: 800, master: 1280 },
  event: { thumb: 400, sm: 800, md: 1280, master: 1920 },
  library: { thumb: 400, sm: 800, md: 1280, master: 1920 },
  // Recruitment photos and ID cards: legible for reviewers, never public.
  document: { thumb: 400, master: 1600 },
};
const QUALITY: Record<VariantName, number> = { thumb: 0.8, sm: 0.82, md: 0.84, lg: 0.85, master: 0.86 };
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif", "image/gif"];
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const HEIC = /\.(heic|heif)$/i;

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** One shared encoding worker, where the browser has OffscreenCanvas; null means encode on the page. */
let worker: Worker | null | undefined;
let jobs = 0;
function encodingWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype
      ? new Worker(new URL("./encode-worker.ts", import.meta.url), { type: "module" })
      : null;
  } catch {
    worker = null;
  }
  return worker;
}

function encodeInWorker(w: Worker, bitmap: ImageBitmap, targets: EncodeTarget[]): Promise<Array<{ name: string; blob: Blob }>> {
  const id = ++jobs;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; ok: boolean; out?: Array<{ name: string; blob: Blob }>; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      if (e.data.ok && e.data.out) resolve(e.data.out);
      else reject(new Error(e.data.error ?? "Could not encode the image."));
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, bitmap, targets }, [bitmap]);
  });
}

export async function processImage(file: File, purpose: Purpose | "document" = "library"): Promise<{ variants: Partial<Record<VariantName, Blob>>; sourceSha: string; width: number; height: number }> {
  if (!ACCEPTED.includes(file.type) && !/\.(jpe?g|png|webp|avif|heic|heif|gif)$/i.test(file.name)) throw new Error("Choose a JPEG, PNG, WebP or AVIF image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is larger than 40 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // iPhone photos (HEIC) open only in Safari; everywhere else the browser can't read them.
    if (file.type === "image/heic" || file.type === "image/heif" || HEIC.test(file.name)) {
      throw new Error("This is an iPhone HEIC photo, which this browser can't open. Upload it from Safari, or on the iPhone choose Settings → Camera → Formats → Most Compatible (or share the photo as JPEG), then try again.");
    }
    throw new Error("This image couldn't be read. It may be damaged; try another copy.");
  }
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const profile = PROFILES[purpose];
  const targets: EncodeTarget[] = [];
  for (const [name, target] of Object.entries(profile) as Array<[VariantName, number]>) {
    // The master is always made (at most its target size); smaller sizes only when the photo is larger.
    if (name !== "master" && longest <= target) continue;
    const scale = Math.min(1, target / longest);
    targets.push({ name, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: QUALITY[name] });
  }
  const w = encodingWorker();
  let out: Array<{ name: string; blob: Blob }>;
  if (w) {
    try {
      out = await encodeInWorker(w, bitmap, targets);
    } catch {
      // The worker couldn't (an unusual browser): do it here. The bitmap was transferred, so decode again.
      worker = null;
      const again = await createImageBitmap(file, { imageOrientation: "from-image" });
      out = await encodeTargets(again, targets, (cw, ch) => Object.assign(document.createElement("canvas"), { width: cw, height: ch }));
      again.close();
    }
  } else {
    out = await encodeTargets(bitmap, targets, (cw, ch) => Object.assign(document.createElement("canvas"), { width: cw, height: ch }));
    bitmap.close();
  }
  const variants: Partial<Record<VariantName, Blob>> = {};
  for (const { name, blob } of out) variants[name as VariantName] = blob;
  return { variants, sourceSha: await sha256Hex(file), width, height };
}

export type UploadResult = { ok: true; id: string; url: string | null; deduplicated: boolean } | { ok: false; error: string; retryable?: boolean };
type Progress = (fraction: number) => void;

/**
 * Send one multipart upload straight to the API Worker with a signed token.
 * XMLHttpRequest (not fetch) so large files can report upload progress.
 */
export function sendUpload(url: string, token: string, fd: FormData, onProgress?: Progress, signal?: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    if (signal?.aborted) return resolve({ ok: false, error: "Upload cancelled." });
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => resolve({ ok: false, error: "Upload cancelled." });
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";
    xhr.timeout = 180_000;
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { ok?: boolean; error?: string; data?: { id: string; url: string | null; deduplicated: boolean } };
      if (xhr.status >= 200 && xhr.status < 300 && body.data) {
        const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const abs = body.data.url && body.data.url.startsWith("/media/") ? `${base.replace(/\/+$/, "")}${body.data.url}` : body.data.url;
        resolve({ ok: true, ...body.data, url: abs });
      } else resolve({ ok: false, error: body.error ?? `Upload failed (${xhr.status || "network error"}).`, retryable: xhr.status === 429 || xhr.status >= 500 });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error. Check your connection and try again.", retryable: true });
    xhr.ontimeout = () => resolve({ ok: false, error: "The upload timed out. Try a smaller file or a better connection.", retryable: true });
    xhr.send(fd);
  });
}

async function tokenFor(purpose: Purpose, eventId?: string, replaceId?: string) {
  const t = await uploadTokenAction(purpose, eventId, replaceId);
  if (!t.ok || !t.data) throw new Error(t.ok ? "Could not start the upload." : t.error);
  return t.data;
}

/** Resize + re-encode in the browser, then append the variants to a form. */
export async function imageForm(file: File, extra: Record<string, string | undefined> = {}, purpose: Purpose | "document" = "library"): Promise<FormData> {
  const { variants, sourceSha } = await processImage(file, purpose);
  const fd = new FormData();
  for (const [name, blob] of Object.entries(variants)) fd.append(`file_${name}`, blob, `${name}.${blob.type === "image/webp" ? "webp" : "jpg"}`);
  fd.append("filename", file.name);
  fd.append("sourceSha", sourceSha);
  for (const [k, v] of Object.entries(extra)) if (v) fd.append(k, v);
  return fd;
}

export async function uploadImage(
  file: File,
  opts: { purpose?: Purpose; eventId?: string; alt?: string; visibility?: "PUBLIC" | "PRIVATE" | "RESTRICTED"; onProgress?: Progress; replaceId?: string; signal?: AbortSignal; onPrepared?: () => void } = {},
): Promise<UploadResult> {
  try {
    const fd = await imageForm(file, { alt: opts.alt, visibility: opts.visibility }, opts.purpose ?? "library");
    if (opts.signal?.aborted) return { ok: false, error: "Upload cancelled." };
    opts.onPrepared?.();
    const { token, url } = await tokenFor(opts.purpose ?? "library", opts.eventId, opts.replaceId);
    return await sendUpload(url, token, fd, opts.onProgress, opts.signal);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export async function uploadDocument(file: File, opts: { visibility?: "PUBLIC" | "PRIVATE" | "RESTRICTED"; eventId?: string; onProgress?: Progress; signal?: AbortSignal } = {}): Promise<UploadResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return { ok: false, error: "Only PDF documents are accepted." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "PDFs can be at most 10 MB." };
  try {
    const fd = new FormData();
    fd.append("file_master", file, file.name);
    fd.append("filename", file.name);
    fd.append("visibility", opts.visibility ?? "PRIVATE");
    const { token, url } = await tokenFor(opts.eventId ? "event" : "library", opts.eventId);
    return await sendUpload(url, token, fd, opts.onProgress, opts.signal);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
