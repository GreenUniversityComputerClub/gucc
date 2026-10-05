import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { rpc } from "@/lib/api/session";
import { SESSION_COOKIE } from "@/lib/api/cookies";
import type { NotificationRow } from "@/app/dashboard/notifications/list";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The newest notifications for the header's bell: loaded only when it's opened (not on every
 * page), answered from the session alone by the API. `?unread=1` lists only unread ones.
 */
export async function GET(req: NextRequest) {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ signedIn: false }, { status: 401, headers: NO_STORE });
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 10, 1), 30);
  const r = await rpc<{ rows: NotificationRow[]; unread: number; next: string | null }>("notifications.list", { limit, unread: req.nextUrl.searchParams.get("unread") === "1" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.code === "AUTH_REQUIRED" ? 401 : 503, headers: NO_STORE });
  return NextResponse.json(r.data, { headers: NO_STORE });
}
