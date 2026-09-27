/**
 * Outbound email behind one small interface, so authentication and business logic never
 * depend on a provider. Which provider runs is decided by configuration:
 *
 *   resend   RESEND_API_KEY + RESEND_FROM_EMAIL are set, and a Moderator switched email on
 *            (the protected `email.enabled` setting) after a successful test email
 *   console  development and tests: messages are printed where the Worker logs
 *   none     staging/production without a provider or with the switch off: "no-email mode"
 *
 * In no-email mode nothing pretends to send: sign-ups go straight to GUCC approval,
 * password resets and invitations are issued by administrators as links they share,
 * and in-app notifications carry the news. Another provider (for example Cloudflare
 * Email Service, which needs the Workers Paid plan) plugs in as one more EmailProvider.
 *
 * Every message counts against a daily cap (Resend's free plan stops at 100 a day) and is
 * written to email_log with the provider's answer. Nothing here throws into the caller.
 */
import type { Ctx } from "./context";
import { nowIso } from "./db";
import { release, reserve } from "./usage";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  /** The provider's message id, when it accepted the message. */
  id?: string | null;
  /** Short, user-safe reason when it didn't (never the API key or the full response). */
  error?: string | null;
}

export interface EmailProvider {
  readonly name: "resend" | "console" | "test";
  send(ctx: Ctx, msg: EmailMessage): Promise<SendResult>;
  /** Several messages in one call (Resend: up to 100). Results are in the same order. */
  sendBatch?(ctx: Ctx, msgs: EmailMessage[]): Promise<SendResult[]>;
}

const RESEND_API = "https://api.resend.com";
/** Resend accepts at most 100 messages per batch call. */
export const BATCH_SIZE = 100;

/** One line, never header-like: names typed into forms end up in subjects. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
const resendBody = (ctx: Ctx, m: EmailMessage) => ({ from: ctx.env.RESEND_FROM_EMAIL, to: m.to, subject: oneLine(m.subject), text: m.text, html: m.html, reply_to: m.replyTo });

async function resendError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown; name?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : typeof body?.name === "string" ? body.name : "";
  return `Resend answered ${res.status}${message ? `: ${message}` : ""}`.slice(0, 300);
}

const resend: EmailProvider = {
  name: "resend",
  async send(ctx, msg) {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(resendBody(ctx, msg)),
    });
    if (!res.ok) {
      const error = await resendError(res);
      console.error(`[${ctx.meta.requestId}] Email delivery failed with status ${res.status}`);
      return { ok: false, error };
    }
    const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true, id: typeof data?.id === "string" ? data.id : null };
  },
  async sendBatch(ctx, msgs) {
    const res = await fetch(`${RESEND_API}/emails/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(msgs.map((m) => resendBody(ctx, m))),
    });
    if (!res.ok) {
      const error = await resendError(res);
      console.error(`[${ctx.meta.requestId}] Batch email failed with status ${res.status}`);
      return msgs.map(() => ({ ok: false, error }));
    }
    const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
    return msgs.map((_, i) => ({ ok: true, id: typeof data?.data?.[i]?.id === "string" ? (data.data[i].id as string) : null }));
  },
};

const consoleProvider: EmailProvider = {
  name: "console",
  async send(_ctx, msg) {
    console.log(`\n[dev email] to=${msg.to}\nsubject: ${msg.subject}\n${msg.text}\n`);
    return { ok: true, id: null };
  },
};

/** The configured provider, whatever the switch says (the test email uses it before email is on). */
export function emailProvider(ctx: Ctx): EmailProvider | null {
  if (ctx.sendEmail) {
    const hook = ctx.sendEmail;
    return { name: "test", send: async (_c, msg) => (await hook(msg), { ok: true, id: null }) };
  }
  if (ctx.env.RESEND_API_KEY && ctx.env.RESEND_FROM_EMAIL) return resend;
  if (ctx.env.APP_ENV === "development" || ctx.env.APP_ENV === "test") return consoleProvider;
  return null;
}

export interface EmailState {
  provider: EmailProvider | null;
  /** The protected `email.enabled` setting. */
  switchedOn: boolean;
  /** Account emails (verification, resets, invitations) are delivered. */
  active: boolean;
  /** Notification copies are emailed (a real provider and the switch on; never the dev console). */
  notifications: boolean;
  dailyLimit: number;
}

/**
 * The switch and the cap change rarely and are read on many requests, so each Worker isolate
 * keeps them for a minute (per database binding). Changing the switch clears this isolate's copy;
 * others follow within the minute.
 */
const cached = new WeakMap<object, { at: number; switchedOn: boolean; dailyLimit: number }>();
const CACHE_MS = 60_000;

export function forgetEmailSettings(ctx: Ctx): void {
  cached.delete(ctx.db.raw);
}

async function emailSettings(ctx: Ctx): Promise<{ switchedOn: boolean; dailyLimit: number }> {
  const hit = cached.get(ctx.db.raw);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const rows = await ctx.db.all<{ key: string; value_json: string }>(
    "SELECT key, value_json FROM system_settings WHERE key IN ('email.enabled', 'email.daily_limit')");
  const value = (k: string) => rows.find((r) => r.key === k)?.value_json;
  const limit = Number(value("email.daily_limit"));
  const fresh = { at: Date.now(), switchedOn: value("email.enabled") === "true", dailyLimit: Number.isFinite(limit) && limit >= 0 ? Math.min(limit, 100) : 90 };
  cached.set(ctx.db.raw, fresh);
  return fresh;
}

export async function emailState(ctx: Ctx): Promise<EmailState> {
  const provider = emailProvider(ctx);
  if (!provider) return { provider: null, switchedOn: false, active: false, notifications: false, dailyLimit: 0 };
  const { switchedOn, dailyLimit } = await emailSettings(ctx);
  return {
    provider,
    switchedOn,
    // Tests and development deliver account emails without the switch; Resend needs it.
    active: provider.name !== "resend" || switchedOn,
    notifications: provider.name !== "console" && switchedOn,
    dailyLimit,
  };
}

/** True when email can be sent: verification, reset and invitation emails are available. */
export async function emailEnabled(ctx: Ctx): Promise<boolean> {
  return (await emailState(ctx)).active;
}

/** Days a successful test email keeps "Switch email on" available. */
export const TEST_VALID_DAYS = 7;

/** When the newest test email Resend accepted was sent (within TEST_VALID_DAYS), or null. */
export async function lastSuccessfulTest(ctx: Ctx): Promise<string | null> {
  return ctx.db.value<string>(
    "SELECT MAX(created_at) FROM email_log WHERE type = 'test' AND status = 'sent' AND created_at > ?1",
    new Date(Date.now() - TEST_VALID_DAYS * 86_400_000).toISOString());
}

export type EmailLogStatus = "sent" | "failed" | "skipped_limit" | "skipped_pref" | "skipped_off";
export interface EmailLogRow {
  userId?: string | null;
  recipient: string;
  type: string;
  status: EmailLogStatus;
  providerId?: string | null;
  error?: string | null;
}

/** All outcomes in one statement. */
export async function logEmails(ctx: Ctx, rows: EmailLogRow[]): Promise<void> {
  if (!rows.length) return;
  await ctx.db.run(
    `INSERT INTO email_log (id, created_at, user_id, recipient, type, status, provider_id, error)
     SELECT 'eml_' || lower(hex(randomblob(12))), ?2, json_extract(j.value, '$.u'), json_extract(j.value, '$.r'), json_extract(j.value, '$.t'),
            json_extract(j.value, '$.s'), json_extract(j.value, '$.p'), json_extract(j.value, '$.e')
     FROM json_each(?1) AS j`,
    JSON.stringify(rows.map((r) => ({ u: r.userId ?? null, r: r.recipient.slice(0, 254), t: r.type.slice(0, 60), s: r.status, p: r.providerId ?? null, e: r.error?.slice(0, 300) ?? null }))),
    nowIso(),
  ).catch((e) => console.error(`[${ctx.meta.requestId}] email_log write failed`, e));
}

/**
 * Send one message now, within the daily cap. Returns false (and never throws) when it could not
 * be sent; the outcome is in email_log. `force` sends through the configured provider even with
 * the switch off (only the test email does this).
 */
export async function sendEmail(ctx: Ctx, msg: EmailMessage, info: { type?: string; userId?: string | null; force?: boolean } = {}): Promise<SendResult> {
  const type = info.type ?? "account";
  try {
    const state = await emailState(ctx);
    const provider = state.provider;
    if (!provider || (!state.active && !info.force)) {
      console.warn(`[${ctx.meta.requestId}] Email is off; not sent: ${msg.subject}`);
      return { ok: false, error: provider ? "Email is switched off." : "No email provider is configured." };
    }
    if (!(await reserve(ctx, "email.sent", 1, state.dailyLimit))) {
      await logEmails(ctx, [{ userId: info.userId, recipient: msg.to, type, status: "skipped_limit" }]);
      return { ok: false, error: `Today's email limit (${state.dailyLimit}) is reached. It resets at 00:00 UTC.` };
    }
    let result: SendResult;
    try {
      result = await provider.send(ctx, msg);
    } catch (e) {
      console.error(`[${ctx.meta.requestId}] Email via ${provider.name} failed`, e);
      result = { ok: false, error: "The email service could not be reached." };
    }
    // A refused message doesn't use the provider's allowance.
    if (!result.ok) await release(ctx, "email.sent", 1);
    await logEmails(ctx, [{ userId: info.userId, recipient: msg.to, type, status: result.ok ? "sent" : "failed", providerId: result.id, error: result.error }]);
    return result;
  } catch (e) {
    console.error(`[${ctx.meta.requestId}] Email failed`, e);
    return { ok: false, error: "The email could not be sent." };
  }
}
