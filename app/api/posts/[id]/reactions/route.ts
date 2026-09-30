import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rpc } from "@/lib/api/session";
import { SESSION_COOKIE } from "@/lib/api/cookies";
import { sameOrigin } from "@/lib/api/route";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

/** Reaction counts and mine (signed in only: visitors get the counts from the cached page). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ signedIn: false }, { headers: noStore });
  const r = await rpc("posts.reactions", { id: (await params).id });
  return NextResponse.json(r.ok ? { signedIn: true, ...(r.data as object) } : { signedIn: true, error: r.error }, { status: r.ok ? 200 : 400, headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return NextResponse.json({ error: "Sign in to react." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { emoji?: string | null };
  const r = await rpc("posts.react", { id: (await params).id, emoji: body.emoji ?? null });
  return NextResponse.json(r.ok ? r.data : { error: r.error, code: r.code }, { status: r.ok ? 200 : r.code === "AUTH_REQUIRED" ? 401 : 400, headers: noStore });
}
