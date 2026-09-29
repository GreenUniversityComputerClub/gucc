/**
 * Email copies of in-app notifications.
 *
 * notifyStmts/notifyEachStmts put the ids of the notifications a request creates on ctx.outbox.
 * After the request succeeds, the Worker calls flushOutbox (in waitUntil, after the response):
 * it reads back the notifications that were really written, keeps the ones each person wants by
 * email, stays inside the daily and monthly caps (SMTP2GO's free plan: 1,000 a month), sends at
 * most MAX_SENDS_PER_RUN of them (SMTP2GO has no batch call, so each is one subrequest), and
 * writes every outcome to email_log. A failed request throws before
 * this runs, so nothing is emailed for work that didn't happen. Nothing here ever throws.
 *
 * Club-wide announcements are in-app only: they would use a whole day's allowance at once.
 */
import type { Ctx } from "./context";
import { emailAllowanceLeft, emailState, logEmails, MAX_SENDS_PER_RUN, reserveEmail, type EmailLogRow, type EmailMessage, type EmailProvider, type SendResult } from "./email";
import { release } from "./usage";
import { EMAIL_SENDER } from "../email-hint";

/** What people can choose to get by email (security notices always are). */
export const EMAIL_CATEGORIES = {
  approvals: { label: "Requests waiting for my decision", hint: "Membership applications, approvals, reports.", default: true },
  roles: { label: "My roles and permissions", hint: "Roles or permissions given to you or taken away.", default: true },
  work: { label: "Tasks and meetings", hint: "Tasks given to you, comments, meeting invitations and changes.", default: true },
  events: { label: "Events I registered for", hint: "Registration confirmed, waiting list, changes, cancellations.", default: true },
  messages: { label: "New messages", hint: "Off by default: conversations can be busy and the club can send only a few emails a day.", default: false },
} as const;
export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

/**
 * Which choice a notification type falls under. "security" is always emailed; null means in-app
 * only (for example membership decisions, which already get their own email).
 */
export function emailCategory(type: string): EmailCategory | "security" | null {
  if (type.startsWith("security.") || type === "system.usage") return "security";
  if (type.startsWith("approval.") || type === "member.pending" || type === "member.corrected" || type === "report.new" || type === "rule.notify") return "approvals";
  if (type.startsWith("role.") || type.startsWith("permission.") || type === "executive.assigned") return "roles";
  if (type.startsWith("task.") || type.startsWith("meeting.") || type === "recruitment.assigned" || type === "event.assigned") return "work";
  if (type.startsWith("event.")) return "events";
  if (type === "message.received") return "messages";
  return null;
}

/** Notice types emailed at most once a day per person. */
const ONCE_A_DAY = new Set(["security.locked"]);

const PRIORITY: Record<EmailCategory | "security", number> = { security: 0, approvals: 1, roles: 2, work: 3, events: 4, messages: 5 };

interface Row {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  email: string;
  prefs: string | null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The message for one notification. Only same-site paths become links. */
export function notificationEmail(ctx: Ctx, r: Pick<Row, "email" | "title" | "body" | "link">, category: EmailCategory | "security"): EmailMessage {
  const base = (ctx.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  const path = r.link && r.link.startsWith("/") && !r.link.startsWith("//") ? r.link : "/dashboard/notifications";
  const url = `${base}${path}`;
  const why = category === "security"
    ? "Security notices are always emailed."
    : `You get this because of your email choices: ${base}/dashboard/profile#email`;
  const contacts = `Add ${EMAIL_SENDER} to your contacts so these don't land in spam.`;
  const text = `${r.title}\n\n${r.body ? `${r.body}\n\n` : ""}Open: ${url}\n\n—\nGreen University Computer Club\n${why}\n${contacts}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(r.title)}</p>
${r.body ? `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(r.body)}</p>` : ""}
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in GUCC</a></p>
<p style="margin:0;color:#666;font-size:12px">Green University Computer Club<br>${escapeHtml(why)}<br>${escapeHtml(contacts)}</p></div>`;
  return { to: r.email, subject: r.title.slice(0, 200), text, html, replyTo: ctx.env.CONTACT_EMAIL };
}

export interface FlushReport {
  sent: number;
  failed: number;
  skipped: number;
}

/** Send each message (a few at a time, in order); a throw becomes that message's failure. */
async function sendAll(ctx: Ctx, provider: EmailProvider, msgs: EmailMessage[]): Promise<SendResult[]> {
  const results: SendResult[] = new Array(msgs.length);
  let next = 0;
  const worker = async () => {
    while (next < msgs.length) {
      const i = next++;
      try {
        results[i] = await provider.send(ctx, msgs[i]!);
      } catch (e) {
        console.error(`[${ctx.meta.requestId}] Notification email failed`, e);
        results[i] = { ok: false, error: "The email service could not be reached." };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, msgs.length) }, worker));
  return results;
}

export async function flushOutbox(ctx: Ctx): Promise<FlushReport | null> {
  const ids = [...new Set(ctx.outbox?.splice(0) ?? [])];
  if (!ids.length) return null;
  try {
    const state = await emailState(ctx);
    if (!state.notifications || !state.provider) return null;
    // Only notifications that were really written, for active accounts with a confirmed address.
    const rows = await ctx.db.all<Row>(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.link, u.email,
              (SELECT json_group_object(np.category, np.email) FROM notification_preferences np WHERE np.user_id = u.id) AS prefs
       FROM notifications n JOIN users u ON u.id = n.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
       WHERE n.id IN (SELECT value FROM json_each(?1))`,
      JSON.stringify(ids));
    const log: EmailLogRow[] = [];
    const wanted: Array<{ row: Row; category: EmailCategory | "security" }> = [];
    // Repeated notices of one kind (e.g. an account locked again and again by someone guessing)
    // are emailed once a day per person, so they can't use up the club's email allowance.
    const throttled = rows.filter((r) => ONCE_A_DAY.has(r.type));
    const recent = throttled.length
      ? new Set((await ctx.db.all<{ k: string }>(
          `SELECT user_id || ':' || type AS k FROM email_log WHERE status = 'sent' AND created_at > ?2
             AND type IN (SELECT value FROM json_each(?1)) AND user_id IN (SELECT json_extract(value, '$') FROM json_each(?3))`,
          JSON.stringify([...ONCE_A_DAY]), new Date(Date.now() - 86_400_000).toISOString(), JSON.stringify(throttled.map((r) => r.user_id)))).map((r) => r.k))
      : new Set<string>();
    for (const row of rows) {
      const category = emailCategory(row.type);
      if (!category) continue;
      if (recent.has(`${row.user_id}:${row.type}`)) {
        log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_limit", error: "Already emailed about this today." });
        continue;
      }
      if (category !== "security") {
        const prefs = row.prefs ? (JSON.parse(row.prefs) as Record<string, number>) : {};
        const on = prefs[category] === undefined ? EMAIL_CATEGORIES[category].default : prefs[category] === 1;
        if (!on) {
          log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_pref" });
          continue;
        }
      }
      wanted.push({ row, category });
    }
    wanted.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category]);

    // Take as much of the allowance as there is (and at most one run's worth), most important first.
    let allowed = Math.min(wanted.length, MAX_SENDS_PER_RUN);
    if (allowed && !(await reserveEmail(ctx, allowed, state))) {
      allowed = Math.min(allowed, (await emailAllowanceLeft(ctx, state)).left);
      if (allowed && !(await reserveEmail(ctx, allowed, state))) allowed = 0;
    }
    for (const { row } of wanted.slice(allowed)) log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_limit" });

    const sending = wanted.slice(0, allowed);
    const results = await sendAll(ctx, state.provider, sending.map(({ row, category }) => notificationEmail(ctx, row, category)));
    let sent = 0;
    let failed = 0;
    sending.forEach(({ row }, j) => {
      const r: SendResult = results[j] ?? { ok: false, error: "No answer for this message." };
      if (r.ok) sent++;
      else failed++;
      log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: r.ok ? "sent" : "failed", providerId: r.id, error: r.error });
    });
    // Refused messages don't use the provider's allowance.
    if (failed) await release(ctx, "email.sent", failed);
    await logEmails(ctx, log);
    return { sent, failed, skipped: log.length - sent - failed };
  } catch (e) {
    console.error(`[${ctx.meta.requestId}] Notification emails failed`, e);
    return null;
  }
}
