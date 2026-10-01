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
 *
 * Every kind of notification email is off until the member turns it on in My profile (email is
 * scarce: SMTP2GO's free plan is 1,000 a month). The only exception is the free-tier alert to the
 * leaders who look after the club's plans ("system"), which protects the club from a bill.
 *
 * Only what can't wait is emailed at once: security alerts, and requests waiting for someone's
 * decision (unless that person has the dashboard open right now). Everything else (roles, tasks
 * and meetings, events, messages) is marked DUE and goes out in one digest per person from the
 * hourly job, and only if it's still unread after 15 minutes: reading it in the dashboard first
 * means no email at all.
 */
import { renderEmail } from "./email-template";
import { siteUrl, type Ctx } from "./context";
import { emailAllowanceLeft, emailState, logEmails, MAX_SENDS_PER_RUN, reserveEmail, type EmailLogRow, type EmailMessage, type EmailProvider, type SendResult } from "./email";
import { release } from "./usage";
import { EMAIL_SENDER } from "../email-hint";
import { onlineNow } from "./live";

/** What people can choose to get by email. All off until they turn them on. */
export const EMAIL_CATEGORIES = {
  security: { label: "Security alerts", hint: "A sign-in from a new device, a locked account, password or email changes. Emailed at once. Recommended.", default: false },
  approvals: { label: "Requests waiting for my decision", hint: "Membership applications, approvals, reports. Emailed at once, unless you have the dashboard open.", default: false },
  roles: { label: "My roles and permissions", hint: "Roles or permissions given to you or taken away. In the hourly summary.", default: false },
  work: { label: "Tasks and meetings", hint: "Tasks given to you, comments, meeting invitations and changes. In the hourly summary.", default: false },
  events: { label: "Events I registered for", hint: "Registration confirmed, waiting list, reminders, changes. In the hourly summary.", default: false },
  messages: { label: "New messages", hint: "In the hourly summary, only for messages you haven't read in the dashboard by then.", default: false },
} as const;
export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

/**
 * Which choice a notification type falls under; null means in-app only (for example membership
 * decisions, which get their own email). "system" (free-tier alerts to the leaders who look after
 * the club's plans) isn't a choice: it's always emailed.
 */
export function emailCategory(type: string): EmailCategory | "system" | null {
  if (type === "system.usage") return "system";
  if (type.startsWith("security.")) return "security";
  if (type.startsWith("approval.") || type === "member.pending" || type === "member.corrected" || type === "report.new" || type === "rule.notify") return "approvals";
  if (type.startsWith("role.") || type.startsWith("permission.") || type === "executive.assigned") return "roles";
  if (type.startsWith("task.") || type.startsWith("meeting.") || type === "recruitment.assigned" || type === "event.assigned") return "work";
  if (type.startsWith("event.")) return "events";
  if (type === "message.received") return "messages";
  return null;
}

/** Emailed at once; every other category waits for the digest. */
const IMMEDIATE = new Set<EmailCategory | "system">(["system", "security", "approvals"]);

/** Notice types emailed at most once a day per person. */
const ONCE_A_DAY = new Set(["security.locked"]);

const PRIORITY: Record<EmailCategory | "system", number> = { system: 0, security: 0, approvals: 1, roles: 2, work: 3, events: 4, messages: 5 };

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


/** The message for one notification. Only same-site paths become links. */
export function notificationEmail(ctx: Ctx, r: Pick<Row, "email" | "title" | "body" | "link">, category: EmailCategory | "system"): EmailMessage {
  const base = siteUrl(ctx);
  const path = r.link && r.link.startsWith("/") && !r.link.startsWith("//") ? r.link : "/dashboard/notifications";
  const url = `${base}${path}`;
  const why = category === "system"
    ? "Free-tier alerts are always emailed to the leaders who look after the club's plans."
    : `You get this because you turned on these emails in your profile: ${base}/dashboard/profile#email`;
  const contacts = `Add ${EMAIL_SENDER} to your contacts so these don't land in spam.`;
  const text = `${r.title}\n\n${r.body ? `${r.body}\n\n` : ""}Open: ${url}\n\n—\nGreen University Computer Club\n${why}\n${contacts}`;
  const html = renderEmail({
    site: base,
    preheader: (r.body ?? r.title).slice(0, 140),
    heading: r.title,
    paragraphs: r.body ? [r.body] : [],
    action: { label: "Open in GUCC", url },
    footer: ["Green University Computer Club", why, contacts],
  });
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
              json_set(COALESCE((SELECT json_group_object(np.category, np.email) FROM notification_preferences np WHERE np.user_id = u.id), '{}'),
                '$.security', u.security_emails) AS prefs
       FROM notifications n JOIN users u ON u.id = n.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
       WHERE n.id IN (SELECT value FROM json_each(?1))`,
      JSON.stringify(ids));
    const log: EmailLogRow[] = [];
    const wanted: Array<{ row: Row; category: EmailCategory | "system" }> = [];
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
      if (category !== "system") {
        const prefs = row.prefs ? (JSON.parse(row.prefs) as Record<string, number>) : {};
        const on = prefs[category] === undefined ? EMAIL_CATEGORIES[category].default : prefs[category] === 1;
        if (!on) {
          log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_pref" });
          continue;
        }
      }
      wanted.push({ row, category });
    }
    // Decisions waiting for someone who has the dashboard open: they'll see it there (the digest
    // catches it if they don't). Everything that isn't urgent waits for the digest.
    const online = await onlineNow(ctx, [...new Set(wanted.filter((x) => x.category === "approvals").map((x) => x.row.user_id))]);
    const later = wanted.filter((x) => !IMMEDIATE.has(x.category) || (x.category === "approvals" && online.has(x.row.user_id)));
    if (later.length) {
      await ctx.db.run("UPDATE notifications SET email_state = 'DUE' WHERE email_state IS NULL AND id IN (SELECT value FROM json_each(?1))", JSON.stringify(later.map((x) => x.row.id)));
    }
    const laterIds = new Set(later.map((x) => x.row.id));
    wanted.splice(0, wanted.length, ...wanted.filter((x) => !laterIds.has(x.row.id)));
    wanted.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category]);

    // Take as much of the allowance as there is (and at most one run's worth), most important first.
    let allowed = Math.min(wanted.length, MAX_SENDS_PER_RUN);
    if (allowed && !(await reserveEmail(ctx, allowed, state))) {
      allowed = Math.min(allowed, (await emailAllowanceLeft(ctx, state)).left);
      if (allowed && !(await reserveEmail(ctx, allowed, state))) allowed = 0;
    }
    for (const { row } of wanted.slice(allowed)) log.push({ userId: row.user_id, recipient: row.email, type: row.type, status: "skipped_limit" });

    const sending = wanted.slice(0, allowed);
    if (sending.length) await ctx.db.run("UPDATE notifications SET email_state = 'SENT' WHERE id IN (SELECT value FROM json_each(?1))", JSON.stringify(sending.map((x) => x.row.id)));
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

/** Waiting this long in the dashboard before a notice goes into an email digest. */
export const DIGEST_DELAY_MS = 15 * 60_000;
/** Notices waiting longer than this (the allowance ran out for days) are dropped from email. */
const DIGEST_EXPIRE_MS = 2 * 86_400_000;
/** Items listed in one digest; the rest are summarised as "and N more". */
const DIGEST_ITEMS = 8;

interface DigestRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  email: string;
}

/** One email for several notices: what's waiting, newest first, each with its link. */
export function digestEmail(ctx: Ctx, email: string, rows: Array<Pick<DigestRow, "title" | "body" | "link">>): EmailMessage {
  const base = siteUrl(ctx);
  const href = (link: string | null) => `${base}${link && link.startsWith("/") && !link.startsWith("//") ? link : "/dashboard/notifications"}`;
  const shown = rows.slice(0, DIGEST_ITEMS);
  const more = rows.length - shown.length;
  const subject = rows.length === 1 ? rows[0]!.title.slice(0, 200) : `${rows.length} updates waiting for you at GUCC`;
  const why = `You get this because you turned on these emails in your profile: ${base}/dashboard/profile#email`;
  const text = [
    rows.length === 1 ? "" : "Here's what happened while you were away:\n",
    ...shown.map((r) => `• ${r.title}${r.body ? `\n  ${r.body.slice(0, 200)}` : ""}\n  ${href(r.link)}`),
    more > 0 ? `\n…and ${more} more: ${base}/dashboard/notifications` : "",
    `\n—\nGreen University Computer Club\n${why}\nAdd ${EMAIL_SENDER} to your contacts so these don't land in spam.`,
  ].filter(Boolean).join("\n");
  const html = renderEmail({
    site: base,
    preheader: rows.length === 1 ? (rows[0]!.body ?? rows[0]!.title).slice(0, 140) : shown.map((r) => r.title).join(" · ").slice(0, 140),
    heading: rows.length === 1 ? rows[0]!.title : `${rows.length} updates waiting for you`,
    // One notice reads like any other; several become a list.
    paragraphs: rows.length === 1 ? (rows[0]!.body ? [rows[0]!.body] : []) : ["Here's what happened while you were away:"],
    action: rows.length === 1 ? { label: "Open in GUCC", url: href(rows[0]!.link) } : undefined,
    items: rows.length === 1 ? [] : shown.map((r) => ({ title: r.title, body: r.body?.slice(0, 200) ?? null, url: href(r.link) })),
    after: more > 0 ? { text: `…and ${more} more in your notifications`, url: `${base}/dashboard/notifications` } : null,
    footer: ["Green University Computer Club", why, `Add ${EMAIL_SENDER} to your contacts so these don't land in spam.`],
  });
  return { to: email, subject, text, html, replyTo: ctx.env.CONTACT_EMAIL };
}

/**
 * The hourly digest: one email per person for notices still unread after 15 minutes, oldest
 * waiting people first, within the email allowance. About six statements however many people.
 */
export async function sendDigests(ctx: Ctx, now = new Date()): Promise<FlushReport | null> {
  try {
    // Read in time (or waiting too long): no email.
    await ctx.db.run("UPDATE notifications SET email_state = 'SKIPPED' WHERE email_state = 'DUE' AND (read_at IS NOT NULL OR created_at < ?1)",
      new Date(now.getTime() - DIGEST_EXPIRE_MS).toISOString());
    const state = await emailState(ctx);
    if (!state.notifications || !state.provider) return null;
    const rows = await ctx.db.all<DigestRow>(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.link, u.email FROM notifications n
       JOIN users u ON u.id = n.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
       WHERE n.email_state = 'DUE' AND n.read_at IS NULL AND n.created_at <= ?1 ORDER BY n.created_at LIMIT 400`,
      new Date(now.getTime() - DIGEST_DELAY_MS).toISOString());
    if (!rows.length) return { sent: 0, failed: 0, skipped: 0 };
    const people = new Map<string, DigestRow[]>();
    for (const r of rows) people.set(r.user_id, [...(people.get(r.user_id) ?? []), r]);
    let allowed = Math.min(people.size, MAX_SENDS_PER_RUN);
    if (allowed && !(await reserveEmail(ctx, allowed, state))) {
      allowed = Math.min(allowed, (await emailAllowanceLeft(ctx, state)).left);
      if (allowed && !(await reserveEmail(ctx, allowed, state))) allowed = 0;
    }
    // People waiting longest first (Map keeps the order of their oldest notice).
    const batch = [...people.values()].slice(0, allowed);
    const results = await sendAll(ctx, state.provider, batch.map((list) => digestEmail(ctx, list[0]!.email, [...list].reverse())));
    const log: EmailLogRow[] = [];
    const done: string[] = [];
    let sent = 0;
    let failed = 0;
    batch.forEach((list, j) => {
      const r: SendResult = results[j] ?? { ok: false, error: "No answer for this message." };
      const first = list[0]!;
      log.push({ userId: first.user_id, recipient: first.email, type: list.length === 1 ? first.type : "digest", status: r.ok ? "sent" : "failed", providerId: r.id, error: r.error });
      if (r.ok) {
        sent++;
        done.push(...list.map((x) => x.id));
      } else failed++;
    });
    if (done.length) await ctx.db.run("UPDATE notifications SET email_state = 'SENT' WHERE id IN (SELECT value FROM json_each(?1))", JSON.stringify(done));
    if (failed) await release(ctx, "email.sent", failed);
    await logEmails(ctx, log);
    return { sent, failed, skipped: people.size - batch.length };
  } catch (e) {
    console.error(`[${ctx.meta.requestId}] Email digest failed`, e);
    return null;
  }
}
