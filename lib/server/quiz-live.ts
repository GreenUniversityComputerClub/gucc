/**
 * Signed short-lived WebSocket tickets for Quiz Arena (/v1/quiz/ws?t=<ticket>).
 * Uses a distinct HMAC domain ("quiz:") from live-hub passes ("live:") so tokens
 * cannot be replayed across subsystems, while sharing AUTH_SECRET and rotation via
 * verificationSecrets(env).
 */
import type { Ctx } from "./context";
import { b64url, fromB64url } from "./crypto";
import { hmac, requireSecret, verificationSecrets, verifyHmac } from "./signing";

export interface QuizWsTicket {
  p: "quiz";
  sid: string;
  qid: string;
  pid: string;
  uid: string | null;
  name: string;
  role: "host" | "player";
  exp: number;
}

const enc = new TextEncoder();
const MAX_TICKET = 2048;

export async function signQuizTicket(ctx: Pick<Ctx, "env">, payload: Omit<QuizWsTicket, "p" | "exp">, ttlSeconds = 180): Promise<string> {
  const full: QuizWsTicket = {
    p: "quiz",
    ...payload,
    name: payload.name.slice(0, 80),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(enc.encode(JSON.stringify(full)));
  const sig = await hmac(requireSecret(ctx.env.AUTH_SECRET), `quiz:${body}`);
  return `${body}.${sig}`;
}

export async function verifyQuizTicket(
  env: { AUTH_SECRET?: string; AUTH_SECRET_PREVIOUS?: string },
  token: unknown,
): Promise<QuizWsTicket | null> {
  if (typeof token !== "string" || token.length > MAX_TICKET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let secrets: string[];
  try {
    secrets = verificationSecrets(env);
  } catch {
    return null;
  }
  if (!(await verifyHmac(secrets, `quiz:${body}`, sig))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as QuizWsTicket;
    if (
      p.p !== "quiz" ||
      typeof p.sid !== "string" ||
      !p.sid ||
      typeof p.pid !== "string" ||
      !p.pid ||
      (p.role !== "host" && p.role !== "player") ||
      typeof p.exp !== "number" ||
      p.exp <= Date.now() / 1000
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
