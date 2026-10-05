import { NextResponse, type NextRequest } from "next/server";
import { getFormSource } from "@/lib/public/data";
import { resolveForm } from "@/lib/forms/resolve";
import { formState } from "@/lib/forms/providers";

/**
 * The address a form page puts in its frame. The page itself never contains it (not in the cached
 * HTML, the search index or a link preview): the page's own script asks here once the form is
 * open. Nothing is given for a form that is closed or not open yet, and typing this address into a
 * browser, or asking from another site, gets nothing (a frame's address is still visible to the
 * visitor's own browser tools once it is shown: that can't be hidden from the person using it).
 */
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Sec-Fetch-Site, Sec-Fetch-Dest" };
const deny = (status: number, state: string) => NextResponse.json({ state }, { status, headers: HEADERS });

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const site = req.headers.get("sec-fetch-site");
  const dest = req.headers.get("sec-fetch-dest");
  const origin = req.headers.get("origin");
  const ours = !origin || origin === req.nextUrl.origin;
  // A fetch from the page (same origin, no navigation or frame) that says so with its own header.
  if ((site && site !== "same-origin") || (dest && dest !== "empty") || !ours || req.headers.get("x-requested-with") !== "gucc-form") return deny(403, "forbidden");

  const { slug } = await params;
  if (!slug || slug.length > 120) return deny(404, "missing");
  const source = await getFormSource(slug).catch(() => null);
  if (!source) return deny(404, "missing");

  const state = formState({ opensAt: source.opensAt, closesAt: source.closesAt, accepting: source.accepting });
  if (state !== "open") return NextResponse.json({ state }, { headers: HEADERS });

  const form = await resolveForm(source);
  if (form.closed) return NextResponse.json({ state: "closed" }, { headers: HEADERS });
  if (!form.embedUrl) return NextResponse.json({ state: "unavailable" }, { headers: HEADERS });
  return NextResponse.json({ state: "open", src: form.embedUrl, signIn: form.requiresSignIn }, { headers: HEADERS });
}
