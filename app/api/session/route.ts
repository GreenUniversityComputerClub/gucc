import { NextResponse } from "next/server";
import { getSession } from "@/lib/api/session";
import { SIGNED_IN_HINT } from "@/lib/api/cookies";

export const dynamic = "force-dynamic";

/** Who is signed in, for client UI on static pages (navbar, edit toolbars). Never cached. */
export async function GET() {
  const s = await getSession();
  const body = s
    ? {
        signedIn: true,
        id: s.user.id,
        name: s.profile?.name ?? s.user.email,
        email: s.user.email,
        status: s.user.status,
        avatarUrl: s.profile?.avatarUrl ?? null,
        adminAccess: s.adminAccess,
        unread: s.unread,
        caps: Object.fromEntries(Object.entries(s.caps).filter(([, v]) => v)),
      }
    : { signedIn: false };
  const res = NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  // The session ended (expired, signed out elsewhere): drop the hint so this browser stops asking.
  if (!s) res.cookies.delete(SIGNED_IN_HINT);
  return res;
}
