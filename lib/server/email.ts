/**
 * Outbound email behind one small interface, so authentication and business logic never
 * depend on a provider. Which provider runs is decided by configuration:
 *
 *   smtp2go  SMTP2GO_API_KEY + EMAIL_FROM are set, and a Moderator switched email on
 *            (the protected `email.enabled` setting) after a successful test email
 *   console  development and tests: messages are printed where the Worker logs
 *   none     staging/production without a provider or with the switch off: "no-email mode"
 *
 * In no-email mode nothing pretends to send: sign-ups go straight to GUCC approval,
 * password resets and invitations are issued by administrators as links they share,
 * and in-app notifications carry the news. Another provider plugs in as one more EmailProvider.
 *
 * SMTP2GO sends from the verified single sender in EMAIL_FROM (no domain/DNS setup). Its free
 * plan allows 1,000 emails a month (then it refuses), 200 a day and, without a verified domain,
 * 25 an hour (both queued by SMTP2GO). Every message counts against our own daily and monthly
 * caps first and is written to email_log with the provider's answer. Nothing here throws into
 * the caller.
 */
import { renderEmail } from "./email-template";
import type { Ctx } from "./context";
import { nowIso } from "./db";
import { release, utcDay } from "./usage";
import { EMAIL_SENDER } from "../email-hint";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Extra headers (List-Unsubscribe on announcement emails). Names and values are one line each. */
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  /** The provider's message id, when it accepted the message. */
  id?: string | null;
  /** Short, user-safe reason when it didn't (never the API key or the full response). */
  error?: string | null;
}

export interface EmailProvider {
  readonly name: "smtp2go" | "console" | "test";
  send(ctx: Ctx, msg: EmailMessage): Promise<SendResult>;
}

const SMTP2GO_SEND = "https://api.smtp2go.com/v3/email/send";
/**
 * Messages one request or cron run sends at most. SMTP2GO has no batch call, so each message is
 * its own subrequest (Workers Free allows 50 per invocation), and without a verified domain
 * SMTP2GO takes 25 an hour anyway.
 */
export const MAX_SENDS_PER_RUN = 25;
/** The SMTP2GO free plan: 1,000 a month (then refused), 200 a day. */
export const MONTHLY_LIMIT_MAX = 1000;
export const DAILY_LIMIT_MAX = 200;

/** One line, never header-like: names typed into forms end up in subjects. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
const smtp2goBody = (ctx: Ctx, m: EmailMessage) => ({
  sender: ctx.env.EMAIL_FROM,
  to: [m.to],
  subject: oneLine(m.subject),
  text_body: m.text,
  ...(m.html ? { html_body: m.html } : {}),
  ...(m.replyTo || m.headers ? {
    custom_headers: [
      ...(m.replyTo ? [{ header: "Reply-To", value: oneLine(m.replyTo) }] : []),
      ...Object.entries(m.headers ?? {}).filter(([k]) => /^[A-Za-z0-9-]{1,60}$/.test(k)).map(([header, value]) => ({ header, value: value.replace(/[\r\n]+/g, " ").slice(0, 900) })),
    ],
  } : {}),
});

interface Smtp2goAnswer {
  data?: { succeeded?: unknown; failed?: unknown; failures?: unknown; email_id?: unknown; error?: unknown; error_code?: unknown };
}

/** SMTP2GO answers 200 even when it refused the message, so success is read from the body. */
function smtp2goResult(status: number, ok: boolean, body: Smtp2goAnswer | null): SendResult {
  const d = body?.data;
  if (ok && Number(d?.succeeded) >= 1 && !Number(d?.failed)) return { ok: true, id: typeof d?.email_id === "string" ? d.email_id : null };
  const failure = Array.isArray(d?.failures) && d.failures.length ? String(d.failures[0]) : "";
  const reason = typeof d?.error === "string" ? d.error : typeof d?.error_code === "string" ? d.error_code : failure;
  return { ok: false, error: `SMTP2GO answered ${status}${reason ? `: ${reason}` : ""}`.slice(0, 300) };
}

const smtp2go: EmailProvider = {
  name: "smtp2go",
  async send(ctx, msg) {
    const res = await fetch(SMTP2GO_SEND, {
      method: "POST",
      headers: { "X-Smtp2go-Api-Key": ctx.env.SMTP2GO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(smtp2goBody(ctx, msg)),
      signal: AbortSignal.timeout(10_000),
    });
    const result = smtp2goResult(res.status, res.ok, (await res.json().catch(() => null)) as Smtp2goAnswer | null);
    if (!result.ok) console.error(`[${ctx.meta.requestId}] Email delivery failed with status ${res.status}`);
    return result;
  },
};

const consoleProvider: EmailProvider = {
  name: "console",
  async send(_ctx, msg) {
    console.log(`\n[dev email] to=${msg.to}\nsubject: ${msg.subject}\n${msg.text}\n`);
    return { ok: true, id: null };
  },
};


/**
 * Account and member emails (verification, reset, invitation, decisions): the same text plus a
 * short footer, an HTML part with clickable links, and replies going to the club's inbox. Both
 * parts and a real Reply-To make spam filters less suspicious of a sender without DNS records.
 * Messages to the club itself (the contact form) are left as they are.
 */
export function accountMessage(ctx: Ctx, msg: EmailMessage, type: string): EmailMessage {
  if (type.startsWith("contact")) return msg;
  const site = (ctx.env.PUBLIC_BASE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "") || "the GUCC website";
  const footer = `Green University Computer Club (${site})\nAdd ${EMAIL_SENDER} to your contacts so our emails don't land in spam.`;
  const text = `${msg.text}\n\n—\n${footer}`;
  // The first link is the thing to do (verify, set a password, accept an invitation…): a button.
  const url = msg.text.match(/https?:\/\/[^\s<>"]+/)?.[0];
  const html = msg.html ?? renderEmail({
    site: ctx.env.PUBLIC_BASE_URL ?? "",
    preheader: msg.text.split("\n").find((l) => l.trim() && !/https?:\/\//.test(l))?.slice(0, 140),
    heading: msg.subject,
    paragraphs: msg.text.split(/\n{2,}/).map((p) => (url ? p.replace(url, "").trim().replace(/:$/, ".") : p.trim())).filter((p) => p && !/^[:.\s]*$/.test(p)),
    action: url ? { label: actionLabel(type, msg.subject), url } : undefined,
    footer: [`Green University Computer Club (${site})`, `Add ${EMAIL_SENDER} to your contacts so our emails don't land in spam.`],
  });
  return { ...msg, text, html, replyTo: msg.replyTo ?? ctx.env.CONTACT_EMAIL };
}

/** What the button in an account email says. */
function actionLabel(type: string, subject: string): string {
  if (type === "account.verify" || /verify/i.test(subject)) return "Verify my email";
  if (type === "account.reset" || /password/i.test(subject)) return "Set a new password";
  if (type === "invite" || /invit/i.test(subject)) return "Accept the invitation";
  if (/email/i.test(type)) return "Confirm the change";
  return "Open GUCC";
}

/** The configured provider, whatever the switch says (the test email uses it before email is on). */
export function emailProvider(ctx: Ctx): EmailProvider | null {
  if (ctx.sendEmail) {
    const hook = ctx.sendEmail;
    return { name: "test", send: async (_c, msg) => (await hook(msg), { ok: true, id: null }) };
  }
  if (ctx.env.SMTP2GO_API_KEY && ctx.env.EMAIL_FROM) return smtp2go;
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
  monthlyLimit: number;
}

/**
 * The switch and the cap change rarely and are read on many requests, so each Worker isolate
 * keeps them for a minute (per database binding). Changing the switch clears this isolate's copy;
 * others follow within the minute.
 */
const cached = new WeakMap<object, { at: number; switchedOn: boolean; dailyLimit: number; monthlyLimit: number }>();
const CACHE_MS = 60_000;

export function forgetEmailSettings(ctx: Ctx): void {
  cached.delete(ctx.db.raw);
}

const capped = (raw: string | undefined, max: number, fallback: number) => {
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
};

async function emailSettings(ctx: Ctx): Promise<{ switchedOn: boolean; dailyLimit: number; monthlyLimit: number }> {
  const hit = cached.get(ctx.db.raw);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const rows = await ctx.db.all<{ key: string; value_json: string }>(
    "SELECT key, value_json FROM system_settings WHERE key IN ('email.enabled', 'email.daily_limit', 'email.monthly_limit')");
  const value = (k: string) => rows.find((r) => r.key === k)?.value_json;
  const fresh = {
    at: Date.now(),
    switchedOn: value("email.enabled") === "true",
    dailyLimit: capped(value("email.daily_limit"), DAILY_LIMIT_MAX, 40),
    monthlyLimit: capped(value("email.monthly_limit"), MONTHLY_LIMIT_MAX, MONTHLY_LIMIT_MAX),
  };
  cached.set(ctx.db.raw, fresh);
  return fresh;
}

export async function emailState(ctx: Ctx): Promise<EmailState> {
  const provider = emailProvider(ctx);
  if (!provider) return { provider: null, switchedOn: false, active: false, notifications: false, dailyLimit: 0, monthlyLimit: 0 };
  const { switchedOn, dailyLimit, monthlyLimit } = await emailSettings(ctx);
  return {
    provider,
    switchedOn,
    // Tests and development deliver account emails without the switch; SMTP2GO needs it.
    active: provider.name !== "smtp2go" || switchedOn,
    notifications: provider.name !== "console" && switchedOn,
    dailyLimit,
    monthlyLimit,
  };
}

const month = (day: string) => day.slice(0, 7);

/**
 * Take `n` emails from today's and this month's allowance in one atomic statement (the same
 * conditional upsert as reserve() in usage.ts, plus the month's total). False changes nothing.
 */
export async function reserveEmail(ctx: Ctx, n: number, state: Pick<EmailState, "dailyLimit" | "monthlyLimit">, day = utcDay()): Promise<boolean> {
  if (n <= 0) return true;
  const row = await ctx.db.first<{ count: number }>(
    `INSERT INTO usage_counters (day, key, count, updated_at)
     SELECT ?1, 'email.sent', ?2, ?4
     WHERE ?2 <= ?3 AND (SELECT COALESCE(SUM(count), 0) FROM usage_counters WHERE key = 'email.sent' AND day LIKE ?5) + ?2 <= ?6
     ON CONFLICT(day, key) DO UPDATE SET count = usage_counters.count + excluded.count, updated_at = excluded.updated_at
       WHERE usage_counters.count + excluded.count <= ?3
         AND (SELECT COALESCE(SUM(count), 0) FROM usage_counters WHERE key = 'email.sent' AND day LIKE ?5) + excluded.count <= ?6
     RETURNING count`,
    day, n, state.dailyLimit, nowIso(), `${month(day)}-%`, state.monthlyLimit);
  return row !== null;
}

/** Emails still allowed today, within both caps. */
export async function emailAllowanceLeft(ctx: Ctx, state: Pick<EmailState, "dailyLimit" | "monthlyLimit">, day = utcDay()): Promise<{ left: number; monthly: boolean }> {
  const row = await ctx.db.first<{ today: number; month: number }>(
    `SELECT COALESCE(SUM(CASE WHEN day = ?1 THEN count END), 0) AS today, COALESCE(SUM(count), 0) AS month
     FROM usage_counters WHERE key = 'email.sent' AND day LIKE ?2`, day, `${month(day)}-%`);
  const daily = state.dailyLimit - (row?.today ?? 0);
  const monthly = state.monthlyLimit - (row?.month ?? 0);
  return { left: Math.max(0, Math.min(daily, monthly)), monthly: monthly <= daily };
}

/** True when email can be sent: verification, reset and invitation emails are available. */
export async function emailEnabled(ctx: Ctx): Promise<boolean> {
  return (await emailState(ctx)).active;
}

/** Days a successful test email keeps "Switch email on" available. */
export const TEST_VALID_DAYS = 7;

/** When the newest test email SMTP2GO accepted was sent (within TEST_VALID_DAYS), or null. */
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
    // A test email (a leader checking the set-up, rate-limited) may go past the club's own daily
    // cap, never past SMTP2GO's free day (200) or the month.
    const caps = info.force ? { ...state, dailyLimit: Math.max(state.dailyLimit, DAILY_LIMIT_MAX) } : state;
    if (!(await reserveEmail(ctx, 1, caps))) {
      const { monthly } = await emailAllowanceLeft(ctx, state);
      const error = monthly
        ? `This month's email limit (${state.monthlyLimit}) is reached. It resets on the 1st (UTC).`
        : `Today's email limit (${state.dailyLimit}) is reached. It resets at 00:00 UTC.`;
      await logEmails(ctx, [{ userId: info.userId, recipient: msg.to, type, status: "skipped_limit", error }]);
      return { ok: false, error };
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
