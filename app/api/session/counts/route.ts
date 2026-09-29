import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rpc } from "@/lib/api/session";
import { SESSION_COOKIE } from "@/lib/api/cookies";

export const dynamic = "force-dynamic";

/**
 * The live badges (unread notifications, unread conversations, open tasks) for the navbar and the
 * dashboard menu. One cheap API call (the session only); never cached.
 */
export async function GET() {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
  const r = await rpc<{ unread: number; unreadMessages: number; openTasks: number }>("session.counts");
  if (!r.ok) return NextResponse.json({ signedIn: r.code !== "AUTH_REQUIRED" ? undefined : false }, { status: r.code === "AUTH_REQUIRED" ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ signedIn: true, ...r.data }, { headers: { "Cache-Control": "private, no-store" } });
}
