import { NextResponse, type NextRequest } from "next/server";
import { normalizeCode } from "@/lib/certificates/code";

/**
 * The verify form without JavaScript (and any old `/c?code=` link): a typed code goes to its page;
 * anything else back to the form, which explains what a code looks like.
 */
export function GET(req: NextRequest) {
  const typed = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  const code = typed ? normalizeCode(typed) : null;
  const url = new URL(code ? `/c/${code}` : "/c", req.nextUrl);
  if (!code && typed) url.searchParams.set("code", typed.slice(0, 80));
  return NextResponse.redirect(url, 303);
}
