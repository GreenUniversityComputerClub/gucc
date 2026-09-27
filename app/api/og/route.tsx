import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { MEDIA_BASE_URL } from "@/lib/api/config";
import { OG_SIZE, ogCardElement } from "@/lib/seo/og-card";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { ogSignatureOk } from "@/lib/seo/og-sign";

/**
 * GET /api/og?title=…&subtitle=…&eyebrow=…&photo=…&variant=portrait
 * Deterministic per URL, so each card renders once and then lives in the CDN.
 */

/** Only our own site and media origin; the renderer must not fetch arbitrary URLs. */
function allowedPhoto(photo: string | null): string | null {
  if (!photo) return null;
  const url = photo.startsWith("/") && !photo.startsWith("//") ? (photo.startsWith("/media/") ? `${MEDIA_BASE_URL}${photo}` : absoluteUrl(photo)) : photo;
  return url.startsWith(`${SITE_URL}/`) || url.startsWith(`${MEDIA_BASE_URL}/media/`) ? url : null;
}

/** Satori reads PNG/JPEG only; R2 portraits are WebP, so convert (or drop the photo). */
async function photoData(photo: string | null): Promise<string | undefined> {
  const url = allowedPhoto(photo);
  if (!url) return undefined;
  try {
    const res = await fetch(url.replace(/\/(master|lg|md)\.webp$/, "/sm.webp"), { next: { revalidate: 86400 } });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return undefined;
    if (type === "image/png" || type === "image/jpeg") return `data:${type};base64,${buf.toString("base64")}`;
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf).resize(480, 480, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  // Only cards the site linked to are rendered; anything else gets the static card (cheap, cached).
  if (!ogSignatureOk(p)) {
    return new Response(null, { status: 302, headers: { Location: `${SITE_URL}/og-default.png`, "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  }
  const clip = (v: string | null, n: number) => (v ?? "").slice(0, n) || undefined;
  const photo = await photoData(p.get("photo"));
  const image = new ImageResponse(
    ogCardElement({
      title: clip(p.get("title"), 120) ?? "",
      subtitle: clip(p.get("subtitle"), 180),
      eyebrow: clip(p.get("eyebrow"), 60),
      photo,
      variant: p.get("variant") === "portrait" ? "portrait" : "default",
    }),
    { ...OG_SIZE },
  );
  const response = new Response(image.body, image);
  response.headers.set("Cache-Control", "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
