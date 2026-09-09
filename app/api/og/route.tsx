import type { NextRequest } from "next/server";
import { renderOgCard } from "@/lib/seo/og-card";

export const runtime = "nodejs";

/**
 * On-demand Open Graph card. Built lazily and then held in the CDN cache, so
 * hundreds of executive/event cards cost nothing at build time.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const image = renderOgCard({
    title: searchParams.get("title") ?? "",
    subtitle: searchParams.get("subtitle") ?? undefined,
    eyebrow: searchParams.get("eyebrow") ?? undefined,
    photo: searchParams.get("photo") ?? undefined,
    variant: searchParams.get("variant") === "portrait" ? "portrait" : "default",
  });

  const response = new Response(image.body, image);
  response.headers.set(
    "Cache-Control",
    "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400"
  );
  return response;
}
