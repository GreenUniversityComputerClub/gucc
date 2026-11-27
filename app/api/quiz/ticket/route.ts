import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_PUBLIC_BASE_URL } from "@/lib/api/config";
import { SECURE_SITE, quizParticipantCookie } from "@/lib/api/cookies";
import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const wsUrl = (ticket: string) => `${API_PUBLIC_BASE_URL.replace(/^http/, "ws")}/v1/quiz/ws?t=${encodeURIComponent(ticket)}`;

/**
 * Quiz Arena join + WebSocket ticket handler.
 *
 * Raw participant tokens are stored exclusively in an HttpOnly SameSite=Lax cookie
 * scoped per sessionId and never exposed to browser JavaScript.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request payload.", code: "VALIDATION" }, { status: 400, headers: noStore });
  }

  const jar = await cookies();
  const action = body.action === "join" ? "join" : "ticket";
  const reqSessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const existingToken = reqSessionId ? jar.get(quizParticipantCookie(reqSessionId))?.value ?? null : null;

  if (action === "join") {
    const r = await rpc<{
      sessionId: string;
      slug: string;
      participantId: string;
      displayName: string;
      participantToken: string;
      ticket: string;
      role: "player";
    }>("quizzes.join", { ...body, participantToken: existingToken });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error, code: r.code, fields: r.fields },
        { status: r.status ?? 400, headers: noStore },
      );
    }

    const res = NextResponse.json(
      {
        ok: true,
        mode: "live",
        sessionId: r.data.sessionId,
        slug: r.data.slug,
        participantId: r.data.participantId,
        displayName: r.data.displayName,
        role: r.data.role,
        ticket: r.data.ticket,
        wsUrl: wsUrl(r.data.ticket),
      },
      { headers: noStore },
    );

    res.cookies.set(quizParticipantCookie(r.data.sessionId), r.data.participantToken, {
      httpOnly: true,
      secure: SECURE_SITE || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 3600,
    });
    return res;
  }

  if (!reqSessionId) {
    return NextResponse.json({ ok: false, error: "Session is required.", code: "VALIDATION" }, { status: 400, headers: noStore });
  }

  const r = await rpc<{ mode: "live"; ticket: string; participantId: string; role: "host" | "player" } | { mode: "poll" }>(
    "quizzes.ticket",
    {
      sessionId: reqSessionId,
      participantToken: existingToken,
      asHost: body.asHost === true,
    },
  );
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.status ?? 401, headers: noStore });
  }
  if (r.data.mode !== "live") {
    return NextResponse.json({ ok: true, mode: "poll" }, { headers: noStore });
  }
  return NextResponse.json(
    {
      ok: true,
      mode: "live",
      ticket: r.data.ticket,
      wsUrl: wsUrl(r.data.ticket),
      participantId: r.data.participantId,
      role: r.data.role,
    },
    { headers: noStore },
  );
}
