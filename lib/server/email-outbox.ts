/**
 * Email copies of in-app notifications.
 *
 * notifyStmts/notifyEachStmts put the ids of the notifications a request creates on ctx.outbox.
 * After the request succeeds, the Worker calls flushOutbox (in waitUntil, after the response):
 * it reads back the notifications that were really written, keeps the ones each person wants by
 * email, stays inside the daily cap (Resend's free plan stops at 100 a day), sends them in Resend
 * batch calls of up to 100, and writes every outcome to email_log. A failed request throws before
 * this runs, so nothing is emailed for work that didn't happen. Nothing here ever throws.
 *
 * Club-wide announcements are in-app only: they would use a whole day's allowance at once.
 */
import type { Ctx } from "./context";
import { BATCH_SIZE, emailState, logEmails, type EmailLogRow, type EmailMessage, type SendResult } from "./email";
import { release, reserve, usageOf } from "./usage";

/** What people can choose to get by email (security notices always are). */
export const EMAIL_CATEGORIES = {
  approvals: { label: "Requests waiting for my decision", hint: "Membership applications, approvals, reports.", default: true },
  roles: { label: "My roles and permissions", hint: "Roles or permissions given to you or taken away.", default: true },
  work: { label: "Tasks and meetings", hint: "Tasks given to you, comments, meeting invitations and changes.", default: true },
  events: { label: "Events I registered for", hint: "Registration confirmed, waiting list, changes, cancellations.", default: true },
  messages: { label: "New messages", hint: "Off by default: conversations can be busy and the club sends at most 90 emails a day.", default: false },
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
  const text = `${r.title}\n\n${r.body ? `${r.body}\n\n` : ""}Open: ${url}\n\n—\nGreen University Computer Club\n${why}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(r.title)}</p>
${r.body ? `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(r.body)}</p>` : ""}
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in GUCC</a></p>
<p style="margin:0;color:#666;font-size:12px">Green University Computer Club<br>${escapeHtml(why)}</p></div>`;
  return { to: r.email, subject: r.title.slice(0, 200), text, html };
}

export interface FlushReport {
  sent: number;
  failed: number;
  skipped: number;
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
    for (const row of rows) {
      const category = emailCategory(row.type);
      if (!category) continue;
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

    // Take as much of today's allowance as there is, most important first.
    let allowed = wanted.length;
    if (allowed && !(await reserve(ctx, "email.sent", allowed, state.dailyLimit))) {
      const used = (await usageOf(ctx, ["email.sent"]))["email.sent"];
      allowed = Math.max(0, Math.min(wanted.length, state.dailyLimit - used));
      if (allowed && !(await reserve(ctx, "email.sent", allowed, state.dailyLimit))) allowed = 0;
    }
    for (const { row } of wanted.slice(allowed)) log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_limit" });

    const sending = wanted.slice(0, allowed);
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < sending.length; i += BATCH_SIZE) {
      const chunk = sending.slice(i, i + BATCH_SIZE);
      const msgs = chunk.map(({ row, category }) => notificationEmail(ctx, row, category));
      let results: SendResult[];
      try {
        results = state.provider.sendBatch ? await state.provider.sendBatch(ctx, msgs) : await Promise.all(msgs.map((m) => state.provider!.send(ctx, m)));
      } catch (e) {
        console.error(`[${ctx.meta.requestId}] Notification email failed`, e);
        results = msgs.map(() => ({ ok: false, error: "The email service could not be reached." }));
      }
      chunk.forEach(({ row }, j) => {
        const r: SendResult = results[j] ?? { ok: false, error: "No answer for this message." };
        if (r.ok) sent++;
        else failed++;
        log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: r.ok ? "sent" : "failed", providerId: r.id, error: r.error });
      });
    }
    // Refused messages don't use the provider's allowance.
    if (failed) await release(ctx, "email.sent", failed);
    await logEmails(ctx, log);
    return { sent, failed, skipped: log.length - sent - failed };
  } catch (e) {
    console.error(`[${ctx.meta.requestId}] Notification emails failed`, e);
    return null;
  }
}
