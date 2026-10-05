/**
 * Live updates. Services describe what changed (`emit`); after the request succeeds the Worker
 * hands the list to the live hub (workers/api/src/live-hub.ts), which pushes each event to the
 * open tabs of the people it names. Nothing here touches D1 except issuing a ticket, so a
 * delivered message, reaction or notification costs the receiver no database reads at all.
 *
 * Browsers reach the hub with short-lived signed passes, checked by the hub without D1:
 *   ticket  who is connecting and whether they share their active status (2 minutes)
 *   room    the conversation a tab has open and who is in it: typing goes only to them
 *   watch   whose active status a tab may follow: people the viewer may message, never someone
 *           who blocked them
 */
import type { Mention } from "../chat/mentions";
import type { Ctx } from "./context";
import { AuthRequiredError } from "./errors";
import { b64url, fromB64url } from "./crypto";
import { hmac, requireSecret, verifyHmac, verificationSecrets } from "./signing";

/** A message as the other members' tabs show it. */
export interface LiveMessage {
  id: string;
  sender: string;
  senderName: string;
  body: string;
  at: string;
  kind: "TEXT" | "SYSTEM";
  replyTo: { id: string; name: string; body: string } | null;
  /** The sender's own id for it, so the tab that sent it replaces its "Sending…" copy. */
  clientId?: string | null;
  /** Who it mentions. */
  mentions?: Mention[];
}

export type LiveEvent =
  /** A new message; `from` gets a "delivered" tick when any recipient tab received it. */
  | { t: "msg"; c: string; m: LiveMessage; from: string; group?: string | null }
  | { t: "edit"; c: string; id: string; body: string; mentions?: Mention[] }
  | { t: "del"; c: string; id: string; removed?: boolean }
  /** Someone read a conversation up to `at` (only sent when both share read receipts). */
  | { t: "read"; c: string; u: string; at: string }
  | { t: "react"; c: string; id: string; u: string; name: string; e: string | null }
  /** A conversation's settings or members changed: refetch it. */
  | { t: "conv"; c: string }
  | { t: "ntf"; n: { id: string; type: string; title: string; body: string | null; link: string | null } }
  /** Your own counts changed on another tab or device (read, archived…). */
  | { t: "sync" }
  | { t: "task"; id: string }
  | { t: "meeting"; id: string }
  | { t: "seats"; event: string; taken: number }
  /** Signed out, suspended or deleted: close and stop reconnecting. */
  | { t: "bye" };

export interface LiveItem {
  to: string[];
  ev: LiveEvent;
}

/** Queue an event for these people; sent only if the whole request succeeds. */
export function emit(ctx: Ctx, to: Array<string | null | undefined>, ev: LiveEvent): void {
  const ids = [...new Set(to.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (ids.length && ctx.live) ctx.live.push({ to: ids, ev });
}

// ── Passes ──────────────────────────────────────────────────────────────────────────────

export interface Ticket { p: "live"; u: string; v: 0 | 1; exp: number }
export interface RoomPass { p: "room"; u: string; c: string; m: string[]; exp: number }
export interface WatchPass { p: "watch"; u: string; ids: string[]; exp: number }
type Pass = Ticket | RoomPass | WatchPass;

const enc = new TextEncoder();
/** Passes carry member lists, so they are allowed to be larger than other tokens (the hub keeps them in a 16 KB attachment). */
const MAX_PASS = 12_000;

async function sign(ctx: Pick<Ctx, "env">, payload: Pass): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(requireSecret(ctx.env.AUTH_SECRET), `live:${body}`)}`;
}

/** Checks a pass with the current (and, while rotating, the previous) AUTH_SECRET. */
export async function verifyPass<T extends Pass>(env: { AUTH_SECRET?: string; AUTH_SECRET_PREVIOUS?: string }, token: unknown, kind: T["p"]): Promise<T | null> {
  if (typeof token !== "string" || token.length > MAX_PASS) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let secrets: string[];
  try {
    secrets = verificationSecrets(env);
  } catch {
    return null;
  }
  if (!(await verifyHmac(secrets, `live:${body}`, sig))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    return p.p === kind && typeof p.exp === "number" && p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

export const roomPass = (ctx: Pick<Ctx, "env">, userId: string, conversationId: string, members: string[]) =>
  sign(ctx, { p: "room", u: userId, c: conversationId, m: [...new Set(members)].slice(0, 120), exp: inSeconds(12 * 3600) });

export const watchPass = (ctx: Pick<Ctx, "env">, userId: string, ids: string[]) =>
  sign(ctx, { p: "watch", u: userId, ids: [...new Set(ids)].filter((x) => x !== userId).slice(0, 150), exp: inSeconds(12 * 3600) });

/**
 * A two-minute ticket to open the live connection, or "poll" when live updates are switched off
 * (then pages check for news on a timer instead). Answered from the session: one statement.
 */
export async function issueTicket(ctx: Ctx): Promise<{ mode: "live"; ticket: string } | { mode: "poll" }> {
  const userId = ctx.session?.userId ?? ctx.actor?.user.id;
  if (!userId) throw new AuthRequiredError();
  const row = await ctx.db.first<{ status: string; visible: number; enabled: string | null }>(
    `SELECT u.status, u.show_active_status AS visible, (SELECT value_json FROM system_settings WHERE key = 'live.enabled') AS enabled
     FROM users u WHERE u.id = ?1 AND u.deleted_at IS NULL`, userId);
  if (!row || !["ACTIVE", "PENDING_APPROVAL"].includes(row.status)) throw new AuthRequiredError();
  if (row.enabled === "false") return { mode: "poll" };
  return { mode: "live", ticket: await sign(ctx, { p: "live", u: userId, v: row.visible ? 1 : 0, exp: inSeconds(120) }) };
}

/** What the hub reports for System health. */
export interface HubStats {
  connections: number;
  people: number;
  requestsToday: number;
  cap: number;
  paused: boolean;
}

/** Hub operations the Worker provides to services (absent in tests and cron without a hub). */
export interface HubClient {
  /** Who of these people has a tab open right now (whether or not they share it). */
  online(ids: string[]): Promise<Set<string>>;
  stats(): Promise<HubStats | null>;
}

/** Who has a tab open now; nobody when there is no hub or it can't be reached. */
export async function onlineNow(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  if (!ctx.hub || ids.length === 0) return new Set();
  try {
    return await ctx.hub.online(ids);
  } catch {
    return new Set();
  }
}
