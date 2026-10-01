import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api/cookies";
import { fetchPreview, previewableUrl, type LinkPreview } from "@/lib/link-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent answers in this server instance (the CDN and browsers cache them too). */
const recent = new Map<string, { at: number; data: LinkPreview | null }>();
const KEEP_MS = 60 * 60_000;
const MAX_KEPT = 500;

/**
 * GET /api/link-preview?url=… → the preview of a link someone sent in a message: { preview }
 * (null when the page has none). Signed-in members only; this reads no database. Answers are
 * cached for a day (an hour when there was nothing to show).
 */
export async function GET(req: NextRequest) {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ error: "Sign in to see link previews." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  const url = previewableUrl(raw);
  if (!url) return NextResponse.json({ preview: null }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });

  const key = url.href;
  const hit = recent.get(key);
  let data: LinkPreview | null;
  if (hit && Date.now() - hit.at < KEEP_MS) data = hit.data;
  else {
    data = await fetchPreview(key);
    if (recent.size >= MAX_KEPT) recent.delete(recent.keys().next().value!);
    recent.set(key, { at: Date.now(), data });
  }
  const useful = Boolean(data && (data.title || data.image));
  return NextResponse.json({ preview: useful ? data : null }, {
    headers: { "Cache-Control": useful ? "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=3600, s-maxage=3600" },
  });
}
