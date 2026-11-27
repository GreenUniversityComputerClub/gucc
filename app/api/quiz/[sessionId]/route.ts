import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { rpc } from "@/lib/api/session";
import type { QuizStateSnapshot } from "@/lib/quiz/types";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Polling/resync fallback endpoint returning sanitized Quiz Arena session state
 * (omits answer keys until REVEAL or FINALIZED unless requested by authorized host).
 */
export async function GET(req: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Session is required." }, { status: 400, headers: noStore });
  }
  const url = new URL(req.url);
  const asHost = url.searchParams.get("asHost") === "1";
  const participantToken = (await cookies()).get(quizParticipantCookie(sessionId))?.value ?? null;

  const r = await rpc<QuizStateSnapshot>("quizzes.state", {
    sessionId,
    participantToken,
    asHost,
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.status ?? 404, headers: noStore });
  }
  return NextResponse.json({ ok: true, data: r.data }, { headers: noStore });
}
