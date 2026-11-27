import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Allows live quiz participants (with HttpOnly session cookie or signed-in member session)
 * to report a question bug, dispute, or conduct incident directly to the session host.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request payload.", code: "VALIDATION" }, { status: 400, headers: noStore });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Session is required.", code: "VALIDATION" }, { status: 400, headers: noStore });
  }

  const participantToken = (await cookies()).get(quizParticipantCookie(sessionId))?.value ?? null;
  const r = await rpc<{ id: string }>("quizzes.reportIncident", { ...body, sessionId, participantToken });
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error, code: r.code, fields: r.fields },
      { status: r.status ?? 400, headers: noStore },
    );
  }
  return NextResponse.json({ ok: true, data: r.data }, { headers: noStore });
}
