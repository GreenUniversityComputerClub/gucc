import { NextResponse, type NextRequest } from "next/server";
import { callApi } from "@/lib/api/client";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header, without
 * a page or a sign-in; the signed token in the address is the proof. A plain visit (GET) goes to
 * the page with a confirm button instead, because mail scanners open links.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const r = await callApi("email.unsubscribe", { token });
  return new NextResponse(r.ok ? "Unsubscribed." : "This link isn't valid any more.", {
    status: r.ok ? 200 : 400,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function GET(req: NextRequest) {
  const url = new URL("/email/unsubscribe", req.nextUrl);
  url.searchParams.set("t", req.nextUrl.searchParams.get("t") ?? "");
  return NextResponse.redirect(url, 303);
}
