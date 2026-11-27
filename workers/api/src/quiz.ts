/**
 * Worker edge handler for `/v1/quiz/ws?t=<ticket>` and QuizRoom Durable Object RPC bridge.
 *
 * NAT-safe edge protection: verifies the signed HMAC ticket BEFORE charging the shared IP
 * against `EDGE_LIMITS.quizWs`, routing invalid/spoofed upgrades to strict `quizWsInvalid`.
 */
import type {
  QuizParticipantStatus,
  QuizParticipantType,
  QuizRoomClient,
  QuizRoomFinalizeExport,
  QuizRoomInitPayload,
  QuizStateSnapshot,
} from "../../../lib/quiz/types";
import { verifyQuizTicket } from "../../../lib/server/quiz-live";
import type { Env } from "./env";
import { allow, clientIp, EDGE_LIMITS, tooMany } from "./guard";
import { allowedOrigins } from "./http";

const jsonErr = (status: number, code: string, error: string) =>
  new Response(JSON.stringify({ ok: false, code, error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** GET /v1/quiz/ws?t=<ticket> — browser WebSocket connection to per-session QuizRoom DO. */
export async function handleQuizWs(env: Env, req: Request): Promise<Response> {
  const edge = env.APP_ENV === "development" ? 10 : 1;
  const ip = clientIp(req);

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    if (!allow(`qi:${ip}`, EDGE_LIMITS.quizWsInvalid * edge)) return tooMany();
    return jsonErr(426, "UPGRADE_REQUIRED", "Expected a WebSocket connection.");
  }

  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(env.FRONTEND_ORIGIN).includes(origin.replace(/\/+$/, ""))) {
    if (!allow(`qi:${ip}`, EDGE_LIMITS.quizWsInvalid * edge)) return tooMany();
    return jsonErr(403, "FORBIDDEN_ORIGIN", "Quiz Arena WebSockets are only accepted from the GUCC website.");
  }

  const url = new URL(req.url);
  const ticket = await verifyQuizTicket(env, url.searchParams.get("t"));
  if (!ticket) {
    if (!allow(`qi:${ip}`, EDGE_LIMITS.quizWsInvalid * edge)) return tooMany();
    return jsonErr(401, "INVALID_TICKET", "Your quiz ticket expired or is invalid.");
  }

  // Verified ticket: enforce NAT-tolerant campus ceiling + per-participant reconnect flood guard.
  if (!allow(`qw:${ip}`, EDGE_LIMITS.quizWs * edge)) return tooMany();
  if (!allow(`qp:${ticket.pid}`, 24 * edge)) return tooMany();

  if (!env.QUIZ_ROOM) return jsonErr(503, "NO_DO", "Quiz live room is unavailable in this environment.");

  const stub = env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(ticket.sid));
  const headers = new Headers(req.headers);
  headers.set("x-quiz-sid", ticket.sid);
  headers.set("x-quiz-pid", ticket.pid);
  headers.set("x-quiz-uid", ticket.uid ?? "");
  headers.set("x-quiz-name", ticket.name);
  headers.set("x-quiz-role", ticket.role);
  headers.set("x-quiz-exp", String(ticket.exp));
  return stub.fetch("https://quiz/connect", { headers });
}

export function quizRoomClient(env: Env): QuizRoomClient | undefined {
  if (!env.QUIZ_ROOM) return undefined;
  const stub = (sessionId: string) => env.QUIZ_ROOM!.get(env.QUIZ_ROOM!.idFromName(sessionId));

  return {
    async ensureInitialized(payload: QuizRoomInitPayload) {
      await stub(payload.sessionId).fetch("https://quiz/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    async syncParticipant(sessionId: string, participant: { id: string; displayName: string; participantType: QuizParticipantType; status: QuizParticipantStatus }) {
      await stub(sessionId).fetch("https://quiz/sync-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(participant),
      });
    },
    async hostAction(sessionId: string, action: string, opts = {}) {
      const res = await stub(sessionId).fetch("https://quiz/host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...opts }),
      });
      const body = (await res.json()) as { ok: boolean; data?: QuizStateSnapshot; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Host action failed.");
      return body.data;
    },
    async getState(sessionId: string, opts = {}) {
      const qs = new URLSearchParams();
      if (opts.role) qs.set("role", opts.role);
      if (opts.participantId) qs.set("pid", opts.participantId);
      const res = await stub(sessionId).fetch(`https://quiz/state?${qs.toString()}`);
      if (res.status === 404) return null;
      const body = (await res.json()) as { ok: boolean; data?: QuizStateSnapshot };
      return body.ok && body.data ? body.data : null;
    },
    async finalizeExport(sessionId: string) {
      const res = await stub(sessionId).fetch("https://quiz/finalize-export", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; data: QuizRoomFinalizeExport };
      return body.data;
    },
    async markFinalized(sessionId: string) {
      await stub(sessionId).fetch("https://quiz/mark-finalized", { method: "POST" });
    },
  };
}
