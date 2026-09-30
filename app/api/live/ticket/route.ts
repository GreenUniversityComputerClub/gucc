import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rpc } from "@/lib/api/session";
import { SESSION_COOKIE } from "@/lib/api/cookies";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * A two-minute ticket for the browser's live connection to the API Worker (the session cookie
 * never leaves this site). `mode: "poll"` when live updates are switched off or unreachable:
 * the page then checks for news on a timer.
 */
export async function GET() {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ signedIn: false }, { headers: noStore });
  const r = await rpc<{ mode: "live"; ticket: string } | { mode: "poll" }>("live.ticket");
  if (!r.ok) {
    if (r.code === "AUTH_REQUIRED") return NextResponse.json({ signedIn: false }, { headers: noStore });
    // An older API without live updates, or a brief outage: poll for now.
    return NextResponse.json({ signedIn: true, mode: "poll" }, { status: r.code === "UNKNOWN_PROCEDURE" ? 200 : 503, headers: noStore });
  }
  return NextResponse.json({ signedIn: true, ...r.data }, { headers: noStore });
}
