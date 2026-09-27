/**
 * next/image loader.
 *
 * - R2 images (…/media/…) already exist in pre-sized WebP variants, so the
 *   loader points straight at the variant closest to the requested width on
 *   the media origin — no runtime optimisation, no Vercel image quota used.
 * - Everything else (static /public files, GitHub avatars) is returned as is:
 *   with a custom loader Next's own /_next/image optimiser is disabled, and
 *   those files are already small (public/ images are pre-optimised at build).
 */
const VARIANT_FOR_WIDTH: Array<[number, string]> = [
  [400, "thumb"],
  [800, "sm"],
  [1280, "md"],
  [1920, "lg"],
];

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  const isMedia = src.startsWith("/media/") || (MEDIA_BASE && src.startsWith(`${MEDIA_BASE}/media/`));
  if (isMedia) {
    const variant = VARIANT_FOR_WIDTH.find(([max]) => width <= max)?.[1] ?? "master";
    const abs = src.startsWith("/media/") && MEDIA_BASE ? `${MEDIA_BASE}${src}` : src;
    return abs.replace(/\/(thumb|sm|md|lg|master)\.(webp|jpg|png|avif)$/, `/${variant}.$2`);
  }
  void quality;
  // GitHub avatars accept a size parameter.
  if (/^https:\/\/avatars\.githubusercontent\.com\//.test(src)) return `${src}${src.includes("?") ? "&" : "?"}s=${Math.min(width, 460)}`;
  // Static files ignore the query; including the width satisfies next/image's loader contract.
  return src.startsWith("/") && !src.includes("?") ? `${src}?w=${width}` : src;
}
