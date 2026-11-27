import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** Returns finalized leaderboard and caller's own question-by-question answers using HttpOnly session cookie. */
export async function GET(_req: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Session is required." }, { status: 400, headers: noStore });
  }
  const participantToken = (await cookies()).get(quizParticipantCookie(sessionId))?.value ?? null;
  const r = await rpc("quizzes.results", { sessionId, participantToken });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.status ?? 404, headers: noStore });
  }
  return NextResponse.json({ ok: true, data: r.data }, { headers: noStore });
}
