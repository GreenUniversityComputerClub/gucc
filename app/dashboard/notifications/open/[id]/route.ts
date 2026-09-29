import { NextResponse, type NextRequest } from "next/server";
import { rpc } from "@/lib/api/session";
import { safeLocalPath } from "@/lib/safe-path";

export const dynamic = "force-dynamic";

/** Only paths on this site. */
const samePath = (p: string | null | undefined) => {
  const safe = safeLocalPath(p, "");
  return safe || null;
};

/**
 * Open a notification: mark it read and go where it points (always a path on this site). A
 * cross-site request (a link on another website) only redirects; it doesn't change anything.
 * `to` is the page's own copy of the link, used while an older API doesn't know this route yet.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = req.headers.get("sec-fetch-site");
  const sameSite = !site || site === "same-origin" || site === "same-site" || site === "none";
  const fallback = samePath(req.nextUrl.searchParams.get("to")) ?? "/dashboard/notifications";
  const r = /^ntf_[0-9a-zA-Z_-]{8,64}$/.test(id) ? await rpc<{ link: string }>("notifications.open", { id, markRead: sameSite }) : null;
  const target = r?.ok
    ? samePath(r.data.link) ?? "/dashboard/notifications"
    : r && !r.ok && r.code === "AUTH_REQUIRED" ? `/auth/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}` : fallback;
  return NextResponse.redirect(new URL(target, req.url), { status: 303, headers: { "Cache-Control": "private, no-store" } });
}
