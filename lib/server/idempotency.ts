/**
 * Idempotent mutations. A double-click, a retried request or a reloaded form sends the same
 * action twice; the second one must not approve, publish, grant, register or email again.
 *
 * Each mutation gets a key: sha256(who, procedure, input), or a client-supplied key. The first
 * request runs and stores its result; a repeat within the window gets that stored result; a
 * repeat while the first is still running is told so; a failure removes the key so a retry
 * really retries. Procedures whose answers carry secrets (sign-in, tokens, recovery codes)
 * and intentionally repeatable ones (chat messages) are never stored.
 */
import type { Ctx } from "./context";
import { sha256Hex } from "./crypto";
import { nowIso } from "./db";
import { AppError } from "./errors";

export const REPLAY_WINDOW_MS = 10_000;

const READ = /^(session\.me|views\..+|.+\.(list|get|search|view|feed|related|matrix|person|publishers|explain|unread|thread|inbox|verify|details|signedUrl|campaigns|applications|application|registrations|status|health|authEvents|sessions|mfaStatus|preferences|overview|simulate|recipients|options|pulse|counts|home|blocks|profile|directory|queue|submissions|audiences|revision)|.+\.(export|exportCsv|exportRegistrations|bulkPreview|importPreview))$/;
/** Never stored: the answer contains a secret, or repeating is the point. */
const NEVER = new Set([
  "auth.login", "auth.mfaVerify", "auth.logout", "auth.register", "auth.resendVerification", "auth.verifyEmail", "auth.confirmEmailChange", "auth.requestPasswordReset", "auth.resetPassword",
  "auth.changePassword", "auth.acceptInvite", "account.reauth", "account.mfaStart", "account.mfaConfirm", "account.mfaDisable", "account.mfaRecoveryCodes", "account.mfaReplaceStart", "account.mfaReplaceConfirm",
  "members.resetLink", "people.invite", "media.uploadToken", "recruitment.uploadToken", "assistant.chat", "chat.send", "chat.start", "notifications.markRead", "notifications.markUnread", "notifications.seenPath", "notifications.open", "live.ticket",
  "audit.verify", "email.test",
  // Toggles: switching on, off and on again within seconds is deliberate, not a double click (the
  // forms disable while they run, and each change is guarded or idempotent in its service).
  "chat.state", "chat.block", "chat.react", "chat.read", "chat.unread", "sponsorships.setStatus", "sponsorships.setDefault", "sponsorships.move", "chat.groupRole", "chat.groupTransfer", "tasks.setStatus", "tasks.items", "meetings.respond", "meetings.attendance", "meetings.conflicts", "events.checkIn", "events.mine", "posts.react", "posts.reactions", "system.switch", "executives.move", "rules.setStatus", "roles.setGrant", "positions.setGrant",
]);

export function isIdempotent(procedure: string): boolean {
  return !READ.test(procedure) && !NEVER.has(procedure);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export interface IdempotentRun {
  replay?: unknown;
  finish(result: unknown): Promise<void>;
  abort(): Promise<void>;
}

export async function beginIdempotent(ctx: Ctx, procedure: string, input: unknown, clientKey?: string | null): Promise<IdempotentRun> {
  const who = ctx.actor?.user.id ?? ctx.meta.ipHash ?? "anonymous";
  const key = await sha256Hex(`${who}|${procedure}|${clientKey ? `key:${clientKey.slice(0, 100)}` : stable(input)}`);
  const now = nowIso();
  const run: IdempotentRun = {
    finish: async (result) => {
      const json = JSON.stringify(result ?? null);
      // Large answers aren't worth keeping; the key still blocks an immediate duplicate.
      await ctx.db.run("UPDATE idempotency_keys SET status = 'done', response_json = ?2, completed_at = ?3 WHERE key = ?1", key, json.length <= 20_000 ? json : null, nowIso());
    },
    abort: async () => {
      await ctx.db.run("DELETE FROM idempotency_keys WHERE key = ?1", key);
    },
  };
  const inserted = await ctx.db.first("INSERT INTO idempotency_keys (key, procedure, status, created_at) VALUES (?1, ?2, 'pending', ?3) ON CONFLICT(key) DO NOTHING RETURNING key", key, procedure, now);
  if (inserted) return run;
  const prior = await ctx.db.first<{ status: string; response_json: string | null; created_at: string }>("SELECT status, response_json, created_at FROM idempotency_keys WHERE key = ?1", key);
  if (!prior) return run;
  const fresh = Date.now() - new Date(prior.created_at).getTime() < REPLAY_WINDOW_MS;
  if (fresh && prior.status === "done") return { ...run, replay: prior.response_json ? JSON.parse(prior.response_json) : null };
  if (fresh) throw new AppError(409, "IN_PROGRESS", "This is already being processed. Please wait a moment.");
  // An old key: take it over atomically (only one request can).
  const taken = await ctx.db.first("UPDATE idempotency_keys SET status = 'pending', response_json = NULL, created_at = ?3, completed_at = NULL WHERE key = ?1 AND created_at = ?2 RETURNING key", key, prior.created_at, now);
  if (!taken) throw new AppError(409, "IN_PROGRESS", "This is already being processed. Please wait a moment.");
  return run;
}
