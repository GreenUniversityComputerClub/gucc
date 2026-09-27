import { type NextRequest } from "next/server";
import { forward, readJson } from "@/lib/api/route";
import { SESSION_COOKIE } from "@/lib/api/cookies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const res = await forward(req, "lostfound.list", { status: q.get("status") ?? undefined, type: q.get("type") ?? undefined, category: q.get("category") ?? undefined, q: q.get("q") ?? undefined,
    location: q.get("location") ?? undefined, mine: q.get("mine") === "1" });
  // Lists for visitors who aren't signed in are the same for everyone: the CDN keeps them 30 s.
  // Signed-in browsers ask with m=1 and always get their own, uncached answer.
  if (res.ok && q.get("m") !== "1" && q.get("mine") !== "1" && !req.cookies.get(SESSION_COOKIE)) {
    res.headers.set("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=30");
  }
  return res;
}

export async function POST(req: NextRequest) {
  return forward(req, "lostfound.create", { input: await readJson(req) }, { status: 201 });
}
