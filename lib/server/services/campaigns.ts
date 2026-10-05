/**
 * Announcement emails ("campaigns"). A leader with `email.campaigns` (or a published announcement,
 * or a broadcast with "Also email it") queues one email per person; they go out a few at a time
 * within the free email allowance, never using the reserves kept for account and security mail,
 * and at most `email.campaign_hourly_max` an hour.
 *
 *   create     one batch: the campaign, its recipients (one statement for any number) and the
 *              audit row. The first emails go right after the response.
 *   tick       the hourly job (and right after creating): pick the oldest campaign due, take the
 *              allowance, claim recipients (UPDATE … RETURNING, so two runs never send to the same
 *              person), send, store each outcome in one statement. About eight statements.
 *
 * "Club announcements" is the one email choice that is on by default; every email has a one-click
 * unsubscribe (RFC 8058 List-Unsubscribe headers and a link). People without an account (event
 * guests) who unsubscribe are kept as a hash of their address in email_suppressions.
 */
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import { returnFetches, siteUrl, takeFetches, type Ctx } from "../context";
import { sha256Hex } from "../crypto";
import { newId, nowIso, type D1StatementLike } from "../db";
import { emailState, logEmails, reserveEmail, emailAllowanceLeft, type EmailLogRow, type EmailMessage, type EmailState, type SendResult } from "../email";
import { renderEmail } from "../email-template";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { limit } from "../limits";
import { signToken, verificationSecrets, verifyToken, requireSecret } from "../signing";
import { release, utcDay } from "../usage";
import { Validator } from "../validate";
import { safeLocalPath } from "../../safe-path";
import { estimateDelivery, type CampaignAllowance } from "../../email/estimate";
import { EMAIL_SENDER } from "../../email-hint";
import { sendAll } from "../email-outbox";

export const CAMPAIGN_KINDS = ["ANNOUNCEMENT", "CERTIFICATE"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
export type CampaignStatus = "QUEUED" | "SENDING" | "PAUSED" | "DONE" | "CANCELLED";

/** Who an announcement email goes to. */
export type Audience =
  | { kind: "members" }
  | { kind: "executives" }
  | { kind: "batch"; value: string }
  | { kind: "department"; value: string }
  /** People registered for an event; `guests` adds registrants without an account. */
  | { kind: "event"; eventId: string; statuses: Array<"REGISTERED" | "ATTENDED" | "WAITLISTED">; guests: boolean };

/** At most this many people per campaign: the whole month's free allowance. */
export const MAX_RECIPIENTS = 1000;
/** SMTP2GO takes about this many an hour from a sender without a verified domain. */
const PROVIDER_HOURLY = 25;
/** A claim this old was interrupted (the run stopped mid-send): try that person again. */
const STALE_CLAIM_MS = 30 * 60_000;
const MAX_ATTEMPTS = 3;
const TOKEN_DAYS = 365;

// ───────────────────────────── audiences ─────────────────────────────

export function parseAudience(raw: unknown): Audience {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const value = typeof a.value === "string" ? a.value.trim().slice(0, 80) : "";
  switch (a.kind) {
    case "executives":
      return { kind: "executives" };
    case "batch":
    case "department":
      if (!value) throw new ValidationError("Choose who it goes to.", { audience: `Choose a ${a.kind}.` });
      return { kind: a.kind, value };
    case "event": {
      const eventId = typeof a.eventId === "string" ? a.eventId.slice(0, 80) : "";
      if (!eventId) throw new ValidationError("Choose the event.", { audience: "Choose an event." });
      const allowed = ["REGISTERED", "ATTENDED", "WAITLISTED"] as const;
      const statuses = Array.isArray(a.statuses) ? allowed.filter((s) => (a.statuses as unknown[]).includes(s)) : ["REGISTERED", "ATTENDED"] as Array<(typeof allowed)[number]>;
      return { kind: "event", eventId, statuses: statuses.length ? statuses : ["REGISTERED", "ATTENDED"], guests: a.guests === true || a.guests === "1" || a.guests === "on" };
    }
    default:
      return { kind: "members" };
  }
}

export function describeAudience(a: Audience): string {
  switch (a.kind) {
    case "members": return "All members";
    case "executives": return "The current committee";
    case "batch": return `Batch ${a.value}`;
    case "department": return a.value;
    case "event": return `Event registrants${a.guests ? " (with guests)" : ""}`;
  }
}

interface Person {
  user_id: string | null;
  email: string;
  name: string | null;
  /** Per-person parts of the email (a certificate's own address). */
  data?: { path?: string } | null;
}

/** Account holders who want club announcements (active, confirmed address, not opted out). */
const ACCOUNTS = `SELECT u.id AS user_id, u.email, p.full_name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
  WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.email_verified_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM notification_preferences np WHERE np.user_id = u.id AND np.category = 'announcements' AND np.email = 0)`;

const emailHash = (email: string) => sha256Hex(`gucc-unsub:${email.trim().toLowerCase()}`);

/** Everyone an audience reaches now, one row per address (the order they'll be sent in). */
export async function audiencePeople(ctx: Ctx, audience: Audience): Promise<Person[]> {
  let rows: Person[];
  switch (audience.kind) {
    case "members":
      rows = await ctx.db.all<Person>(`${ACCOUNTS} ORDER BY u.created_at LIMIT ${MAX_RECIPIENTS + 1}`);
      break;
    case "executives":
      rows = await ctx.db.all<Person>(`${ACCOUNTS} AND EXISTS (SELECT 1 FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
        WHERE cm.profile_id = p.id AND cm.is_active = 1 AND cm.deleted_at IS NULL) ORDER BY u.created_at LIMIT ${MAX_RECIPIENTS + 1}`);
      break;
    case "batch":
      rows = await ctx.db.all<Person>(`${ACCOUNTS} AND p.batch = ?1 ORDER BY u.created_at LIMIT ${MAX_RECIPIENTS + 1}`, audience.value);
      break;
    case "department":
      rows = await ctx.db.all<Person>(`${ACCOUNTS} AND lower(p.department) = lower(?1) ORDER BY u.created_at LIMIT ${MAX_RECIPIENTS + 1}`, audience.value);
      break;
    case "event": {
      // Members by their account (and their choice); guests by the address they registered with.
      const found = await ctx.db.all<Person & { guest: number }>(
        `SELECT a.user_id, a.email, a.name, 0 AS guest FROM (${ACCOUNTS}) a JOIN event_registrations r ON r.user_id = a.user_id
           WHERE r.event_id = ?1 AND r.status IN (SELECT value FROM json_each(?2))
         UNION ALL
         SELECT NULL, r.email, r.name, 1 FROM event_registrations r
           WHERE ?3 = 1 AND r.event_id = ?1 AND r.status IN (SELECT value FROM json_each(?2))
             AND (r.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL))
         LIMIT ${MAX_RECIPIENTS + 1}`,
        audience.eventId, JSON.stringify(audience.statuses), audience.guests ? 1 : 0);
      // Guests who unsubscribed earlier.
      const guests = found.filter((r) => r.guest);
      let drop = new Set<Person>();
      if (guests.length) {
        const hashes = await Promise.all(guests.map((g) => emailHash(g.email)));
        const off = new Set((await ctx.db.all<{ email_hash: string }>(
          "SELECT email_hash FROM email_suppressions WHERE category = 'announcements' AND email_hash IN (SELECT value FROM json_each(?1))", JSON.stringify(hashes))).map((r) => r.email_hash));
        drop = new Set(guests.filter((_, i) => off.has(hashes[i]!)));
      }
      rows = found.filter((r) => !drop.has(r)).map(({ user_id, email, name }) => ({ user_id, email, name }));
      break;
    }
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = r.email.trim().toLowerCase();
    return k.includes("@") && !k.endsWith("@invalid") && !seen.has(k) && seen.add(k);
  });
}

// ───────────────────────────── allowance ─────────────────────────────

export interface Allowance extends CampaignAllowance {
  /** Emails sent in the last hour (all kinds). */
  hour: number;
  /** Announcement emails sent in the last hour. */
  campaignHour: number;
  /** Announcement emails that may go right now. */
  now: number;
}

const clampSetting = (raw: string | null | undefined, min: number, max: number, fallback: number) => {
  const n = Number(raw);
  return raw !== null && raw !== undefined && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

interface AllowanceRow { dr: string | null; mr: string | null; hm: string | null; today: number; month: number; hour: number; campaign_hour: number }

/** Columns for the allowance: ?A is the UTC day, ?B its month pattern, ?C an hour ago. */
const allowanceColumns = (day: string, monthLike: string, hourAgo: string) => `
  (SELECT value_json FROM system_settings WHERE key = 'email.campaign_daily_reserve') AS dr,
  (SELECT value_json FROM system_settings WHERE key = 'email.campaign_monthly_reserve') AS mr,
  (SELECT value_json FROM system_settings WHERE key = 'email.campaign_hourly_max') AS hm,
  COALESCE((SELECT SUM(count) FROM usage_counters WHERE key = 'email.sent' AND day = ${day}), 0) AS today,
  COALESCE((SELECT SUM(count) FROM usage_counters WHERE key = 'email.sent' AND day LIKE ${monthLike}), 0) AS month,
  (SELECT COUNT(*) FROM email_log WHERE created_at > ${hourAgo} AND status = 'sent') AS hour,
  (SELECT COUNT(*) FROM email_log WHERE created_at > ${hourAgo} AND status = 'sent' AND type LIKE 'campaign.%') AS campaign_hour`;

function allowanceOf(r: AllowanceRow | null, state: Pick<EmailState, "dailyLimit" | "monthlyLimit">): Allowance {
  const a = {
    dailyLimit: state.dailyLimit, monthlyLimit: state.monthlyLimit,
    dailyReserve: clampSetting(r?.dr, 0, 100, 10), monthlyReserve: clampSetting(r?.mr, 0, 300, 60), hourlyMax: clampSetting(r?.hm, 1, PROVIDER_HOURLY, 20),
    today: r?.today ?? 0, month: r?.month ?? 0, hour: r?.hour ?? 0, campaignHour: r?.campaign_hour ?? 0,
  };
  const now = Math.max(0, Math.min(a.hourlyMax - a.campaignHour, PROVIDER_HOURLY - a.hour, a.dailyLimit - a.dailyReserve - a.today, a.monthlyLimit - a.monthlyReserve - a.month));
  return { ...a, now };
}

/** Today's, this month's and this hour's use, and what announcements may take now. One statement. */
export async function campaignAllowance(ctx: Ctx, state: Pick<EmailState, "dailyLimit" | "monthlyLimit">, at = new Date()): Promise<Allowance> {
  const day = utcDay(at);
  const r = await ctx.db.first<AllowanceRow>(`SELECT ${allowanceColumns("?1", "?2", "?3")}`, day, `${day.slice(0, 7)}-%`, new Date(at.getTime() - 3600_000).toISOString());
  return allowanceOf(r, state);
}

// ───────────────────────────── creating ─────────────────────────────

export interface CampaignDraft {
  kind: CampaignKind;
  subject: string;
  preheader?: string | null;
  body: string;
  buttonLabel?: string | null;
  buttonPath?: string | null;
  audience: Audience | { kind: "list"; label: string };
  people: Person[];
  postId?: string | null;
  batchId?: string | null;
  notBefore?: string | null;
}

/** The campaign, its recipients (one statement however many) and the audit row. */
export function campaignStatements(ctx: Ctx, id: string, d: CampaignDraft): D1StatementLike[] {
  const actorId = ctx.actor?.user.id ?? null;
  const now = nowIso();
  const people = d.people.slice(0, MAX_RECIPIENTS);
  return [
    ctx.db.stmt(
      `INSERT INTO email_campaigns (id, kind, subject, preheader, body, button_label, button_path, audience_json, post_id, batch_id, status, not_before, total, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?14, ?15)`,
      id, d.kind, d.subject.slice(0, 150), d.preheader?.slice(0, 150) || null, d.body.slice(0, 6000), d.buttonLabel?.slice(0, 40) || null, d.buttonPath || null,
      JSON.stringify(d.audience), d.postId ?? null, d.batchId ?? null, people.length ? "QUEUED" : "DONE", d.notBefore ?? null, people.length, now, actorId),
    ...(people.length ? [ctx.db.stmt(
      `INSERT INTO email_campaign_recipients (campaign_id, seq, user_id, email, name, data_json)
       SELECT ?1, json_extract(j.value, '$.q'), json_extract(j.value, '$.u'), json_extract(j.value, '$.e'), json_extract(j.value, '$.n'), json_extract(j.value, '$.d')
       FROM json_each(?2) AS j WHERE true
       ON CONFLICT DO NOTHING`,
      id, JSON.stringify(people.map((p, i) => ({ q: i + 1, u: p.user_id, e: p.email.trim().toLowerCase().slice(0, 254), n: p.name?.slice(0, 120) ?? null, d: p.data ?? null }))))] : []),
    auditStmt(ctx, { action: "email.campaign.create", resourceType: "email_campaign", resourceId: id, after: { kind: d.kind, subject: d.subject, audience: d.audience, recipients: people.length } }),
  ];
}

function parseDraft(input: Record<string, unknown>) {
  const v = new Validator(input);
  const subject = v.string("subject", { required: true, max: 150, label: "Subject" });
  const preheader = v.string("preheader", { max: 150, label: "Preview line" });
  const body = v.string("body", { required: true, max: 6000, label: "Message" });
  const buttonLabel = v.string("buttonLabel", { max: 40, label: "Button" });
  const rawPath = v.string("buttonPath", { max: 300, label: "Button link" });
  const buttonPath = rawPath ? safeLocalPath(rawPath, "") : null;
  if (rawPath && !buttonPath) v.check(false, "buttonPath", "Use a page on this site, starting with / (for example /events/workshop).");
  if (buttonPath && !buttonLabel) v.check(false, "buttonLabel", "Say what the button does (for example “Register”).");
  const notBefore = v.datetime("notBefore", { label: "Send from" });
  v.done();
  return { subject: subject!, preheader, body: body!, buttonLabel: buttonPath ? buttonLabel : null, buttonPath: buttonPath || null, notBefore };
}

/** Queue an announcement email. */
export async function createCampaign(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string; total: number }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "email.campaigns");
  const d = parseDraft(input);
  const audience = parseAudience(input.audience);
  await limit(ctx, "email.campaign", actor.user.id);
  const people = await audiencePeople(ctx, audience);
  if (!people.length) throw new ValidationError("Nobody in this audience can get the email (no confirmed addresses, or everyone opted out).", { audience: "Nobody to send to." });
  if (people.length > MAX_RECIPIENTS) throw new ValidationError(`At most ${MAX_RECIPIENTS.toLocaleString("en-US")} people per email (the whole month's allowance). Choose a smaller audience.`, { audience: "Too many people." });
  const id = newId("cmp");
  await ctx.db.batch([
    ...campaignStatements(ctx, id, { kind: "ANNOUNCEMENT", ...d, audience, people }),
    auditStmt(ctx, { action: "email.campaign.queue", resourceType: "email_campaign", resourceId: id, decision }),
  ]);
  // The first emails go right after the response (the rest with the hourly job).
  if (!d.notBefore || d.notBefore <= nowIso()) ctx.campaignTick = true;
  return { id, total: people.length };
}

// ───────────────────────────── reading ─────────────────────────────

export interface CampaignRow {
  id: string;
  kind: CampaignKind;
  subject: string;
  preheader: string | null;
  body: string;
  button_label: string | null;
  button_path: string | null;
  audience_json: string;
  post_id: string | null;
  status: CampaignStatus;
  paused_reason: string | null;
  not_before: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  last_run_at: string | null;
  finished_at: string | null;
  created_at: string;
  created_by_name: string | null;
}

const LIST_SQL = `SELECT c.id, c.kind, c.subject, c.preheader, c.body, c.button_label, c.button_path, c.audience_json, c.post_id, c.status, c.paused_reason, c.not_before,
         c.total, c.sent, c.failed, c.skipped, c.last_run_at, c.finished_at, c.created_at, COALESCE(p.full_name, u.email) AS created_by_name
  FROM email_campaigns c LEFT JOIN users u ON u.id = c.created_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL`;

const audienceLabel = (json: string) => {
  try {
    const a = JSON.parse(json) as Audience | { kind: "list"; label: string };
    return a.kind === "list" ? a.label : describeAudience(a);
  } catch {
    return "Members";
  }
};

export async function listCampaigns(ctx: Ctx, opts: { page?: number } = {}) {
  requirePermission(ctx, "email.campaigns");
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const [rows, total] = await Promise.all([
    ctx.db.all<CampaignRow>(`${LIST_SQL} ORDER BY c.created_at DESC LIMIT 25 OFFSET ?1`, (page - 1) * 25),
    ctx.db.value<number>("SELECT COUNT(*) FROM email_campaigns"),
  ]);
  return { rows: rows.map((r) => ({ ...r, audience: audienceLabel(r.audience_json) })), total: total ?? 0, page, pageSize: 25 };
}

export async function getCampaign(ctx: Ctx, id: string) {
  requirePermission(ctx, "email.campaigns");
  const [row, recent] = await Promise.all([
    ctx.db.first<CampaignRow>(`${LIST_SQL} WHERE c.id = ?1`, id),
    ctx.db.all<{ seq: number; email: string; name: string | null; status: string; sent_at: string | null; error: string | null; attempts: number }>(
      `SELECT seq, email, name, status, sent_at, error, attempts FROM email_campaign_recipients WHERE campaign_id = ?1
       ORDER BY CASE status WHEN 'FAILED' THEN 0 WHEN 'SENDING' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'SKIPPED' THEN 3 ELSE 4 END, seq LIMIT 100`, id),
  ]);
  if (!row) throw new NotFoundError("Email");
  return { campaign: { ...row, audience: audienceLabel(row.audience_json) }, recipients: recent };
}

/** Who each audience reaches, and the allowance (for the compose page). */
export async function campaignOptions(ctx: Ctx) {
  requirePermission(ctx, "email.campaigns");
  const [counts, groups, events, state] = await Promise.all([
    ctx.db.first<{ members: number; executives: number }>(
      `SELECT (SELECT COUNT(*) FROM (${ACCOUNTS}) a) AS members,
              (SELECT COUNT(*) FROM (${ACCOUNTS} AND EXISTS (SELECT 1 FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
                 WHERE cm.profile_id = p.id AND cm.is_active = 1 AND cm.deleted_at IS NULL)) a) AS executives`),
    ctx.db.all<{ kind: string; value: string; n: number }>(
      `SELECT 'batch' AS kind, p.batch AS value, COUNT(*) AS n FROM (${ACCOUNTS}) a JOIN profiles p ON p.user_id = a.user_id AND p.deleted_at IS NULL
         WHERE p.batch IS NOT NULL AND trim(p.batch) <> '' GROUP BY p.batch
       UNION ALL
       SELECT 'department', MIN(p.department), COUNT(*) FROM (${ACCOUNTS}) a JOIN profiles p ON p.user_id = a.user_id AND p.deleted_at IS NULL
         WHERE p.department IS NOT NULL AND trim(p.department) <> '' GROUP BY lower(p.department)`),
    ctx.db.all<{ id: string; title: string; start_at: string | null; members: number; guests: number }>(
      `SELECT e.id, e.title, e.start_at,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED') AND r.user_id IS NOT NULL) AS members,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED') AND r.user_id IS NULL) AS guests
       FROM events e WHERE e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED') ORDER BY COALESCE(e.start_at, e.created_at) DESC LIMIT 30`),
    emailState(ctx),
  ]);
  const allowance = await campaignAllowance(ctx, state);
  return {
    emailOn: state.notifications,
    audiences: {
      members: counts?.members ?? 0,
      executives: counts?.executives ?? 0,
      batches: groups.filter((g) => g.kind === "batch").sort((a, b) => b.value.localeCompare(a.value)).map((g) => ({ value: g.value, count: g.n })),
      departments: groups.filter((g) => g.kind === "department").sort((a, b) => b.n - a.n).map((g) => ({ value: g.value, count: g.n })),
      events: events.map((e) => ({ id: e.id, title: e.title, startAt: e.start_at, members: e.members, guests: e.guests })),
    },
    allowance,
  };
}

/** How many people an audience reaches now (the compose page's live count). */
export async function audienceCount(ctx: Ctx, raw: unknown): Promise<{ count: number; capped: boolean }> {
  requirePermission(ctx, "email.campaigns");
  const people = await audiencePeople(ctx, parseAudience(raw));
  return { count: Math.min(people.length, MAX_RECIPIENTS), capped: people.length > MAX_RECIPIENTS };
}

// ───────────────────────────── control ─────────────────────────────

/** Pause, resume or cancel. Cancelling skips everyone not reached yet. */
export async function setCampaignStatus(ctx: Ctx, id: string, action: "pause" | "resume" | "cancel"): Promise<{ status: CampaignStatus }> {
  const decision = requirePermission(ctx, "email.campaigns");
  const now = nowIso();
  const next: Record<typeof action, { status: CampaignStatus; from: CampaignStatus[] }> = {
    pause: { status: "PAUSED", from: ["QUEUED", "SENDING"] },
    resume: { status: "SENDING", from: ["PAUSED"] },
    cancel: { status: "CANCELLED", from: ["QUEUED", "SENDING", "PAUSED"] },
  };
  const n = next[action];
  if (!n) throw new ValidationError("Choose pause, resume or cancel.");
  const [row] = await ctx.db.batchAll([
    ctx.db.stmt(`UPDATE email_campaigns SET status = ?2, paused_reason = NULL, updated_at = ?3, updated_by = ?4,
                   finished_at = CASE WHEN ?2 = 'CANCELLED' THEN ?3 ELSE finished_at END
                 WHERE id = ?1 AND status IN (SELECT value FROM json_each(?5)) RETURNING id`, id, n.status, now, ctx.actor?.user.id ?? null, JSON.stringify(n.from)),
    ...(action === "cancel" ? [ctx.db.stmt(
      `UPDATE email_campaign_recipients SET status = 'SKIPPED', error = 'Cancelled' WHERE campaign_id = ?1 AND status = 'PENDING'
         AND EXISTS (SELECT 1 FROM email_campaigns WHERE id = ?1 AND status = 'CANCELLED')`, id),
      ctx.db.stmt("UPDATE email_campaigns SET skipped = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = ?1 AND status = 'SKIPPED') WHERE id = ?1", id)] : []),
    auditStmt(ctx, { action: `email.campaign.${action}`, resourceType: "email_campaign", resourceId: id, decision }),
  ]);
  if (!row?.results?.length) {
    const exists = await ctx.db.value<string>("SELECT status FROM email_campaigns WHERE id = ?1", id);
    if (!exists) throw new NotFoundError("Email");
    throw new AppError(409, "WRONG_STATE", exists === "DONE" ? "It has already gone to everyone." : exists === "CANCELLED" ? "It was cancelled." : `It's ${exists.toLowerCase()} already.`);
  }
  if (action === "resume") ctx.campaignTick = true;
  return { status: n.status };
}

// ───────────────────────────── the email ─────────────────────────────

interface UnsubPayload {
  p: "unsub";
  /** A hash of the address. */
  e: string;
  /** The account, when the person has one (their email choice is switched off). */
  u?: string | null;
  c: "announcements";
  exp: number;
}

export async function unsubscribeToken(ctx: Ctx, email: string, userId: string | null): Promise<string> {
  return signToken(requireSecret(ctx.env.AUTH_SECRET), {
    p: "unsub", e: await emailHash(email), ...(userId ? { u: userId } : {}), c: "announcements", exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86_400,
  } satisfies UnsubPayload);
}

const KICKER: Record<CampaignKind, string> = { ANNOUNCEMENT: "Club announcement", CERTIFICATE: "Your certificate" };

/** One person's email: the message, a button, and a footer that says how to stop these. */
export async function campaignEmail(ctx: Ctx, c: Pick<CampaignRow, "kind" | "subject" | "preheader" | "body" | "button_label" | "button_path">, to: { email: string; name: string | null; user_id: string | null; data_json?: string | null }): Promise<EmailMessage> {
  const base = siteUrl(ctx);
  const token = await unsubscribeToken(ctx, to.email, to.user_id);
  const unsubscribe = `${base}/email/unsubscribe?t=${encodeURIComponent(token)}`;
  const oneClick = `${base}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
  const first = to.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hello,";
  const paragraphs = [greeting, ...c.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)];
  // A person's own page (their certificate) wins over the campaign's button.
  let own: string | null = null;
  try {
    const path = to.data_json ? (JSON.parse(to.data_json) as { path?: unknown }).path : null;
    own = typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    own = null;
  }
  const action = own ? { label: c.button_label || "Open", url: `${base}${own}` }
    : c.button_path && c.button_label ? { label: c.button_label, url: `${base}${c.button_path}` } : undefined;
  const why = c.kind === "CERTIFICATE"
    ? "You get this because the Green University Computer Club issued you a certificate."
    : to.user_id
      ? `You get club announcements because you're a GUCC member. Change it in your profile: ${base}/dashboard/profile#email`
      : "You get this because you registered for a GUCC event.";
  const footer = ["Green University Computer Club", why, `Unsubscribe from announcements: ${unsubscribe}`, `Add ${EMAIL_SENDER} to your contacts so these don't land in spam.`];
  const text = [`${KICKER[c.kind]}: ${c.subject}`, "", ...paragraphs.flatMap((p) => [p, ""]), ...(action ? [`${action.label}: ${action.url}`, ""] : []), "—", ...footer].join("\n");
  const html = renderEmail({ site: base, kicker: KICKER[c.kind], preheader: c.preheader ?? c.body.slice(0, 140), heading: c.subject, paragraphs, action, footer });
  return {
    to: to.email, subject: c.subject, text, html, replyTo: ctx.env.CONTACT_EMAIL,
    headers: {
      "List-Unsubscribe": `<${oneClick}>${ctx.env.EMAIL_FROM ? `, <mailto:${ctx.env.EMAIL_FROM}?subject=unsubscribe>` : ""}`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Send the email to yourself first (counts against the allowance like any other). */
export async function sendTestCampaign(ctx: Ctx, input: Record<string, unknown>): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  requirePermission(ctx, "email.campaigns");
  const d = parseDraft(input);
  await limit(ctx, "email.campaignTest", actor.user.id);
  const state = await emailState(ctx);
  if (!state.provider || !state.active) throw new AppError(409, "EMAIL_OFF", "Email is switched off. A Moderator switches it on in Settings → Email.");
  if (!(await reserveEmail(ctx, 1, state))) throw new AppError(409, "EMAIL_LIMIT", "Today's email allowance is used up. Try again tomorrow.");
  const msg = await campaignEmail(ctx, { kind: "ANNOUNCEMENT", subject: `[Test] ${d.subject}`, preheader: d.preheader, body: d.body, button_label: d.buttonLabel, button_path: d.buttonPath },
    { email: actor.user.email, name: actor.profile?.full_name ?? null, user_id: actor.user.id });
  let r: SendResult;
  try {
    r = await state.provider.send(ctx, msg);
  } catch {
    r = { ok: false, error: "The email service could not be reached." };
  }
  if (!r.ok) await release(ctx, "email.sent", 1);
  await logEmails(ctx, [{ userId: actor.user.id, recipient: actor.user.email, type: "campaign.test", status: r.ok ? "sent" : "failed", providerId: r.id, error: r.error }]);
  if (!r.ok) throw new AppError(502, "EMAIL_FAILED", `Not sent. ${r.error ?? ""}`.trim());
  return { message: state.provider.name === "console" ? "Development mode: the email was printed to the API log." : `Sent to ${actor.user.email}. Check your inbox (and spam).` };
}

// ───────────────────────────── sending ─────────────────────────────

export interface TickReport {
  campaign: string;
  sent: number;
  failed: number;
  skipped: number;
  waiting?: string;
}

/**
 * Send the next few emails of the oldest campaign that's due. Never throws (the hourly job goes on).
 */
export async function runCampaignTick(ctx: Ctx, at = new Date()): Promise<TickReport | null> {
  try {
    const state = await emailState(ctx);
    if (!state.notifications || !state.provider) return null;
    const now = at.toISOString();
    const day = utcDay(at);
    // The oldest campaign due, and the allowance, in one statement.
    const c = await ctx.db.first<CampaignRow & AllowanceRow>(
      `SELECT c.id, c.kind, c.subject, c.preheader, c.body, c.button_label, c.button_path, ${allowanceColumns("?2", "?3", "?4")}
       FROM email_campaigns c WHERE c.status IN ('QUEUED', 'SENDING') AND (c.not_before IS NULL OR c.not_before <= ?1) ORDER BY c.created_at LIMIT 1`,
      now, day, `${day.slice(0, 7)}-%`, new Date(at.getTime() - 3600_000).toISOString());
    if (!c) return null;
    const allowance = allowanceOf(c, state);
    const budget = takeFetches(ctx, allowance.now);
    let n = budget;
    if (n && !(await reserveEmail(ctx, n, state))) {
      n = Math.min(n, (await emailAllowanceLeft(ctx, state)).left);
      if (n && !(await reserveEmail(ctx, n, state))) n = 0;
    }
    if (n === 0) {
      returnFetches(ctx, budget);
      const e = estimateDelivery(1, allowance);
      const waiting = e.monthLeft === 0 ? "Waiting for next month's email allowance (the 1st, UTC)."
        : allowance.hour >= PROVIDER_HOURLY || allowance.campaignHour >= allowance.hourlyMax ? "Waiting: this hour's emails are used."
        : "Waiting for tomorrow's email allowance (00:00 UTC).";
      await ctx.db.run("UPDATE email_campaigns SET paused_reason = ?2, last_run_at = ?3 WHERE id = ?1", c.id, waiting, now);
      return { campaign: c.id, sent: 0, failed: 0, skipped: 0, waiting };
    }
    // Claim the next people (so two runs never send to the same person). Anyone who turned
    // announcements off, or whose account closed, since it was queued is skipped in the same step.
    const gone = `user_id IS NOT NULL AND (user_id IN (SELECT user_id FROM notification_preferences WHERE category = 'announcements' AND email = 0)
                    OR user_id IN (SELECT id FROM users WHERE status <> 'ACTIVE' OR deleted_at IS NOT NULL))`;
    const claimed = (await ctx.db.all<{ seq: number; user_id: string | null; email: string; name: string | null; attempts: number; status: string; data_json: string | null }>(
      `UPDATE email_campaign_recipients SET status = CASE WHEN ${gone} THEN 'SKIPPED' ELSE 'SENDING' END,
              error = CASE WHEN ${gone} THEN 'Unsubscribed or account closed' ELSE error END, claimed_at = ?2, attempts = attempts + 1
       WHERE campaign_id = ?1 AND seq IN (
         SELECT seq FROM email_campaign_recipients WHERE campaign_id = ?1 AND attempts < ?5
           AND (status = 'PENDING' OR (status = 'SENDING' AND claimed_at < ?3)) ORDER BY seq LIMIT ?4)
       RETURNING seq, user_id, email, name, attempts, status, data_json`,
      c.id, now, new Date(at.getTime() - STALE_CLAIM_MS).toISOString(), n, MAX_ATTEMPTS)).sort((a, b) => a.seq - b.seq);
    const skippedNow = claimed.filter((r) => r.status === "SKIPPED").length;
    // Guests who unsubscribed meanwhile.
    const guests = claimed.filter((r) => !r.user_id && r.status === "SENDING");
    const off = new Set<number>();
    if (guests.length) {
      const hashes = await Promise.all(guests.map((g) => emailHash(g.email)));
      const suppressed = new Set((await ctx.db.all<{ email_hash: string }>(
        "SELECT email_hash FROM email_suppressions WHERE category = 'announcements' AND email_hash IN (SELECT value FROM json_each(?1))", JSON.stringify(hashes))).map((r) => r.email_hash));
      guests.forEach((g, i) => suppressed.has(hashes[i]!) && off.add(g.seq));
    }
    const sending = claimed.filter((r) => r.status === "SENDING" && !off.has(r.seq));
    const unused = n - sending.length;
    if (unused > 0) {
      await release(ctx, "email.sent", unused, utcDay(at));
      returnFetches(ctx, unused);
    }
    const msgs = await Promise.all(sending.map((r) => campaignEmail(ctx, c, r)));
    const results = await sendAll(ctx, state.provider, msgs);
    const outcome: Array<{ q: number; s: string; e: string | null }> = [...off].map((q) => ({ q, s: "SKIPPED", e: "Unsubscribed" }));
    const log: EmailLogRow[] = [];
    let sent = 0;
    let failed = 0;
    sending.forEach((r, i) => {
      const res = results[i] ?? { ok: false, error: "No answer for this message." };
      if (res.ok) sent++;
      else failed++;
      // A refused message is tried again next time, up to three times.
      outcome.push({ q: r.seq, s: res.ok ? "SENT" : r.attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", e: res.ok ? null : (res.error ?? "Not sent").slice(0, 300) });
      log.push({ userId: r.user_id, recipient: r.email, type: `campaign.${c.kind.toLowerCase()}`, status: res.ok ? "sent" : "failed", providerId: res.id, error: res.error });
    });
    if (failed) await release(ctx, "email.sent", failed, utcDay(at));
    await ctx.db.batch([
      ctx.db.stmt(
        `UPDATE email_campaign_recipients AS t SET status = j.s, error = j.e, sent_at = CASE WHEN j.s = 'SENT' THEN ?3 ELSE t.sent_at END
         FROM (SELECT json_extract(value, '$.q') AS q, json_extract(value, '$.s') AS s, json_extract(value, '$.e') AS e FROM json_each(?2)) AS j
         WHERE t.campaign_id = ?1 AND t.seq = j.q`,
        c.id, JSON.stringify(outcome), now),
      ctx.db.stmt(
        `UPDATE email_campaigns SET
           sent = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = ?1 AND status = 'SENT'),
           failed = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = ?1 AND status = 'FAILED'),
           skipped = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = ?1 AND status = 'SKIPPED'),
           status = CASE WHEN status NOT IN ('QUEUED', 'SENDING') THEN status
                         WHEN EXISTS (SELECT 1 FROM email_campaign_recipients WHERE campaign_id = ?1 AND status IN ('PENDING', 'SENDING')) THEN 'SENDING' ELSE 'DONE' END,
           finished_at = CASE WHEN status IN ('QUEUED', 'SENDING') AND NOT EXISTS (SELECT 1 FROM email_campaign_recipients WHERE campaign_id = ?1 AND status IN ('PENDING', 'SENDING')) THEN ?2 ELSE finished_at END,
           paused_reason = NULL, last_run_at = ?2, updated_at = ?2
         WHERE id = ?1`, c.id, now),
    ]);
    await logEmails(ctx, log);
    return { campaign: c.id, sent, failed, skipped: off.size + skippedNow };
  } catch (e) {
    console.error(`[${ctx.meta.requestId}] Announcement emails failed`, e);
    return null;
  }
}

// ───────────────────────────── unsubscribing ─────────────────────────────

/**
 * One click from an email (no sign-in: the signed link is the proof). Members get their
 * "Club announcements" choice switched off; guests are remembered by a hash of their address.
 */
export async function unsubscribe(ctx: Ctx, token: unknown, resubscribe = false): Promise<{ done: true; member: boolean; resubscribed: boolean }> {
  const p = await verifyToken<UnsubPayload>(verificationSecrets(ctx.env), typeof token === "string" ? token : null);
  if (!p || p.p !== "unsub" || p.c !== "announcements" || !/^[0-9a-f]{64}$/.test(p.e)) throw new AppError(400, "BAD_LINK", "This link isn't valid any more. Change your email choices in your profile instead.");
  const now = nowIso();
  if (p.u) {
    await ctx.db.batch([
      ctx.db.stmt(
        `INSERT INTO notification_preferences (user_id, category, email, updated_at) SELECT ?1, 'announcements', ?2, ?3 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1)
         ON CONFLICT(user_id, category) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`, p.u, resubscribe ? 1 : 0, now),
      ...(resubscribe ? [] : [ctx.db.stmt("UPDATE email_campaign_recipients SET status = 'SKIPPED', error = 'Unsubscribed' WHERE user_id = ?1 AND status = 'PENDING'", p.u)]),
    ]);
  } else if (resubscribe) {
    await ctx.db.run("DELETE FROM email_suppressions WHERE email_hash = ?1 AND category = 'announcements'", p.e);
  } else {
    await ctx.db.run("INSERT INTO email_suppressions (email_hash, category, created_at) VALUES (?1, 'announcements', ?2) ON CONFLICT DO NOTHING", p.e, now);
  }
  return { done: true, member: Boolean(p.u), resubscribed: resubscribe };
}

// ───────────────────────────── announcements (posts) ─────────────────────────────

interface PostForEmail {
  id: string;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string | null;
  email_intent_json: string | null;
  email_campaign_id: string | null;
}

/** Plain text from Markdown, for the email: no images, links as their words, no marks. */
export function plainText(md: string, max = 900): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]{1,3}([^*_~`]+)[*_~`]{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

const POST_PATH: Record<string, string> = { ANNOUNCEMENT: "/announcements", NEWS: "/news", BLOG: "/blog" };

/**
 * The email for a post that has just been published (or is published now), when someone asked for
 * one: the campaign and the post's link to it, in the same batch as the publishing.
 */
export async function postCampaignStatements(ctx: Ctx, postId: string, notBefore: string | null = null): Promise<D1StatementLike[]> {
  const post = await ctx.db.first<PostForEmail>(
    "SELECT id, type, slug, title, excerpt, body_markdown, email_intent_json, email_campaign_id FROM posts WHERE id = ?1", postId);
  if (!post?.email_intent_json || post.email_campaign_id) return [];
  let audience: Audience;
  try {
    audience = parseAudience((JSON.parse(post.email_intent_json) as { audience?: unknown }).audience);
  } catch {
    audience = { kind: "members" };
  }
  const people = await audiencePeople(ctx, audience);
  const id = newId("cmp");
  const body = post.excerpt?.trim() || plainText(post.body_markdown ?? "", 900) || post.title;
  if (!notBefore || notBefore <= nowIso()) ctx.campaignTick = true;
  return [
    ...campaignStatements(ctx, id, {
      kind: "ANNOUNCEMENT", subject: post.title.slice(0, 150), preheader: post.excerpt?.slice(0, 150) ?? null, body,
      buttonLabel: post.type === "ANNOUNCEMENT" ? "Read the announcement" : "Read more", buttonPath: `${POST_PATH[post.type] ?? "/announcements"}/${post.slug}`,
      audience, people, postId: post.id, notBefore,
    }),
    ctx.db.stmt("UPDATE posts SET email_campaign_id = ?2, email_intent_json = NULL WHERE id = ?1 AND email_campaign_id IS NULL", post.id, id),
  ];
}

/**
 * "Email this announcement": before publishing, remember to email it once it's live (or forget);
 * on a published post, queue the email now.
 */
export async function setPostEmail(ctx: Ctx, postId: string, input: { on?: unknown; audience?: unknown }): Promise<{ queued: boolean; campaignId: string | null; message: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "email.campaigns");
  const post = await ctx.db.first<{ type: string; status: string; email_campaign_id: string | null; deleted_at: string | null; published_at: string | null }>(
    "SELECT type, status, email_campaign_id, deleted_at, published_at FROM posts WHERE id = ?1", postId);
  if (!post || post.deleted_at) throw new NotFoundError("Post");
  if (post.type !== "ANNOUNCEMENT" && post.type !== "NEWS") throw new ValidationError("Only announcements and news are emailed.");
  if (post.email_campaign_id) throw new AppError(409, "ALREADY_EMAILED", "This post has already been emailed.");
  const on = input.on === true || input.on === "on" || input.on === "1" || input.on === "true";
  const audience = parseAudience(input.audience);
  const live = post.status === "PUBLISHED" && post.published_at !== null && post.published_at <= nowIso();
  if (on && live) {
    await limit(ctx, "email.campaign", actor.user.id);
    await ctx.db.run("UPDATE posts SET email_intent_json = ?2 WHERE id = ?1", postId, JSON.stringify({ audience, by: actor.user.id }));
    const stmts = await postCampaignStatements(ctx, postId);
    await ctx.db.batch([...stmts, auditStmt(ctx, { action: "post.email", resourceType: "post", resourceId: postId, after: { audience }, decision })]);
    const campaignId = await ctx.db.value<string>("SELECT email_campaign_id FROM posts WHERE id = ?1", postId);
    return { queued: true, campaignId, message: "Emailing it now, a few at a time within the email allowance." };
  }
  await ctx.db.batch([
    ctx.db.stmt("UPDATE posts SET email_intent_json = ?2 WHERE id = ?1", postId, on ? JSON.stringify({ audience, by: actor.user.id }) : null),
    auditStmt(ctx, { action: on ? "post.email_planned" : "post.email_cancelled", resourceType: "post", resourceId: postId, after: on ? { audience } : undefined, decision }),
  ]);
  return { queued: false, campaignId: null, message: on ? "It will be emailed when it's published." : "It won't be emailed." };
}
