import { NextResponse, type NextRequest } from "next/server";
import { rpc } from "@/lib/api/session";
import { sameOrigin } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/**
 * Site assistant. The API Worker holds the Gemini key and builds the prompt
 * from public data only; it is stateless, so the browser sends the last few
 * turns with each message. (Older pages sent `{ message: null }` to open a session id; that still
 * answers without calling the API.)
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; sessionId?: unknown; history?: unknown };
  if (!body.message) return NextResponse.json({ sessionId: typeof body.sessionId === "string" ? body.sessionId : crypto.randomUUID() });
  const r = await rpc<{ response: string }>("assistant.chat", { message: body.message, history: body.history });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status && r.status < 500 ? r.status : 503 });
  return NextResponse.json({ sessionId: body.sessionId, response: r.data.response });
}
