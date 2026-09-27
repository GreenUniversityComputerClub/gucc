/**
 * Where the backend lives. Safe for client and server code: only public
 * origins here, never the shared secret.
 *
 *   NEXT_PUBLIC_API_BASE_URL    the API Worker (browser uploads go straight to it)
 *   NEXT_PUBLIC_MEDIA_BASE_URL  origin serving /media/* (defaults to the API Worker;
 *                               set to an R2 custom domain later without code changes)
 */
const trim = (v: string | undefined) => (v ?? "").trim().replace(/\/+$/, "");

export const API_PUBLIC_BASE_URL = trim(process.env.NEXT_PUBLIC_API_BASE_URL) || "http://localhost:8787";
export const MEDIA_BASE_URL = trim(process.env.NEXT_PUBLIC_MEDIA_BASE_URL) || API_PUBLIC_BASE_URL;

/** Absolute URL for a /media/… path from the API; anything else is returned unchanged. */
export function mediaHref(url: string): string;
export function mediaHref(url: string | null | undefined): string | undefined;
export function mediaHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("/media/") ? `${MEDIA_BASE_URL}${url}` : url;
}

/** Recursively rewrite every "/media/…" string in an API payload to an absolute URL. */
export function absolutizeMedia<T>(value: T): T {
  if (typeof value === "string") return (value.startsWith("/media/") ? `${MEDIA_BASE_URL}${value}` : value) as T;
  if (Array.isArray(value)) return value.map((v) => absolutizeMedia(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = absolutizeMedia(v);
    return out as T;
  }
  return value;
}
