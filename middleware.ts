import { NextResponse, type NextRequest } from "next/server";
import { SECURE_SITE, SESSION_COOKIE, SIGNED_IN_HINT } from "@/lib/api/cookies";

/**
 * Cheap gate for signed-in areas: without a session cookie, go to the login
 * page. The cookie is only a hint — every page and action re-validates the
 * session against D1 and authorizes server-side — so this never grants access
 * by itself. Public pages are not matched, so they pay no cost.
 */
export function middleware(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // Sessions from before the hint existed: set it, so public pages show the signed-in navbar.
  if (!request.cookies.get(SIGNED_IN_HINT)) {
    res.cookies.set(SIGNED_IN_HINT, "1", { path: "/", sameSite: "lax", secure: SECURE_SITE || process.env.NODE_ENV === "production", maxAge: 30 * 86_400 });
  }
  return res;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/forms/dashboard/:path*"],
};
