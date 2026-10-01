/**
 * System health for the dashboard. Every line is a real check made now (a query, a storage
 * read, a configuration test); anything that can't be checked says "Unknown" instead of
 * guessing. Values of secrets are never read out, only whether they're set.
 */
import { modelChain } from "./assistant";
import { can, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { emailState, lastSuccessfulTest } from "../email";
import { getSettings } from "../security";
import { LIMITS } from "../limits";
import { checkAuditSeals } from "./audit-seal";
import { appUsage, fetchCloudflareUsage, FREE_LIMITS } from "./cloudflare-usage";

/** The newest migration in this code. A test keeps it in step with migrations/. */
export const LATEST_MIGRATION = "0016_sponsorship_pages.sql";

export type HealthStatus = "HEALTHY" | "WARNING" | "ERROR" | "UNKNOWN";
export interface HealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 90) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
};

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "failed" };
  }
}

async function storageCheck(ctx: Ctx, which: "public" | "private"): Promise<HealthCheck> {
  const label = which === "public" ? "File storage (public)" : "File storage (private)";
  const key = `r2-${which}`;
  if (!ctx.media) return { key, label, status: "ERROR", detail: "Storage isn't connected to the API." };
  const row = await ctx.db.first<{ object_key: string }>(
    `SELECT object_key FROM media WHERE storage = 'R2' AND status = 'READY' AND deleted_at IS NULL AND object_key IS NOT NULL
       AND ((?1 = 'public' AND visibility = 'PUBLIC') OR (?1 = 'private' AND visibility <> 'PUBLIC'))
     ORDER BY created_at DESC LIMIT 1`, which);
  if (!row) return { key, label, status: "UNKNOWN", detail: "No files stored here yet, so there's nothing to read back." };
  const r = await attempt(() => ctx.media![which].head(row.object_key));
  if (!r.ok) return { key, label, status: "ERROR", detail: `Reading a file failed: ${r.error}` };
  return r.value ? { key, label, status: "HEALTHY", detail: "The newest file was read back successfully." } : { key, label, status: "ERROR", detail: "The newest file in the library is missing from storage." };
}

export async function systemHealth(ctx: Ctx) {
  requireActor(ctx);
  // Leaders and developers watch health (system.health); the activity-log permission includes it.
  if (!can(ctx, "system.health")) requirePermission(ctx, "audit.read");
  const checks: HealthCheck[] = [];
  const checkedAt = new Date().toISOString();

  checks.push({ key: "api", label: "API", status: "HEALTHY", detail: `Answered this request (${ctx.env.APP_ENV ?? "unknown"} environment).` });

  const started = Date.now();
  const db = await attempt(() => ctx.db.value<number>("SELECT COUNT(*) FROM users"));
  checks.push(db.ok
    ? { key: "d1", label: "Database", status: "HEALTHY", detail: `Query answered in ${Date.now() - started} ms.` }
    : { key: "d1", label: "Database", status: "ERROR", detail: `Query failed: ${db.error}` });

  const mig = await attempt(() => ctx.db.all<{ name: string }>("SELECT name FROM d1_migrations ORDER BY id"));
  if (!mig.ok) checks.push({ key: "migrations", label: "Database structure", status: "UNKNOWN", detail: "The migration list isn't available in this environment." });
  else {
    const names = mig.value.map((r) => r.name);
    const last = names.at(-1);
    checks.push(names.includes(LATEST_MIGRATION)
      ? { key: "migrations", label: "Database structure", status: "HEALTHY", detail: `Up to date: ${names.length} migrations, newest ${last}.` }
      : { key: "migrations", label: "Database structure", status: "WARNING", detail: `The database is behind this code: newest applied is ${last ?? "none"}, expected ${LATEST_MIGRATION}.` });
  }

  checks.push(await storageCheck(ctx, "public"), await storageCheck(ctx, "private"));

  const mail = await emailState(ctx);
  checks.push(!mail.provider
    ? { key: "email", label: "Email", status: "WARNING", detail: "Not configured (no-email mode). Nothing is emailed; people are told in the dashboard, and leaders share reset and invitation links themselves." }
    : mail.provider.name === "console"
      ? { key: "email", label: "Email", status: "HEALTHY", detail: "Development mode: messages are printed to the API log, not sent." }
      : !mail.switchedOn
        ? { key: "email", label: "Email", status: "WARNING", detail: "SMTP2GO is configured but email is switched off. Send a test email below; switch it on only after it arrives." }
        : { key: "email", label: "Email", status: "HEALTHY", detail: `On. Every message and SMTP2GO's answer are listed below (at most ${mail.dailyLimit} a day and ${mail.monthlyLimit} a month).` });

  const beat = await attempt(() => ctx.db.first<{ last_run_at: string; last_ok: number; detail_json: string | null }>("SELECT last_run_at, last_ok, detail_json FROM system_heartbeats WHERE name = 'maintenance'"));
  if (!beat.ok || !beat.value) checks.push({ key: "cron", label: "Scheduled housekeeping", status: "UNKNOWN", detail: "No run recorded yet. It runs every hour once the API is deployed." });
  else {
    const age = Date.now() - new Date(beat.value.last_run_at).getTime();
    const failed = !beat.value.last_ok;
    const status: HealthStatus = failed || age > 24 * 3600_000 ? "ERROR" : age > 2 * 3600_000 ? "WARNING" : "HEALTHY";
    const error = failed ? (JSON.parse(beat.value.detail_json ?? "{}") as { error?: string }).error : null;
    checks.push({ key: "cron", label: "Scheduled housekeeping", status, detail: failed ? `Last run ${ago(beat.value.last_run_at)} failed${error ? `: ${error}` : "."}` : `Last run ${ago(beat.value.last_run_at)} finished.` });
  }

  const daily = await attempt(() => ctx.db.first<{ last_run_at: string; last_ok: number }>("SELECT last_run_at, last_ok FROM system_heartbeats WHERE name = 'retention'"));
  if (!daily.ok || !daily.value) checks.push({ key: "retention", label: "Daily clean-up (data retention)", status: "UNKNOWN", detail: "No run recorded yet. It runs every day at 03:43 Dhaka time once the API is deployed." });
  else {
    const age = Date.now() - new Date(daily.value.last_run_at).getTime();
    checks.push({ key: "retention", label: "Daily clean-up (data retention)", status: !daily.value.last_ok || age > 3 * 86_400_000 ? "ERROR" : age > 30 * 3600_000 ? "WARNING" : "HEALTHY",
      detail: `Last run ${ago(daily.value.last_run_at)}${daily.value.last_ok ? " finished" : " failed"}. What is kept and for how long: docs/platform/PRIVACY.md.` });
  }

  const seals = await attempt(() => checkAuditSeals(ctx, 1));
  checks.push(!seals.ok
    ? { key: "audit", label: "Activity log seals", status: "UNKNOWN", detail: `Couldn't check: ${seals.error}` }
    : seals.value.seals === 0
      ? { key: "audit", label: "Activity log seals", status: "UNKNOWN", detail: "No seals yet; the hourly job writes them." }
      : seals.value.ok
        ? { key: "audit", label: "Activity log seals", status: "HEALTHY", detail: `The newest ${seals.value.seals} seals chain correctly, and the latest was recomputed from the log and matches.` }
        : { key: "audit", label: "Activity log seals", status: "ERROR", detail: seals.value.problem ?? "The seals don't match." });

  const prod = ctx.env.APP_ENV === "production";
  checks.push({ key: "turnstile", label: "Bot protection on public forms", status: ctx.env.TURNSTILE_SECRET_KEY ? "HEALTHY" : prod ? "ERROR" : "UNKNOWN",
    detail: ctx.env.TURNSTILE_SECRET_KEY ? "Turnstile is configured." : prod
      ? "TURNSTILE_SECRET_KEY isn't set on the API: sign-up, sign-in and the public forms rely on rate limits only. Add the Turnstile keys (see RUNBOOK.md)."
      : "Turnstile isn't configured; forms rely on rate limits and a hidden field." });
  checks.push({ key: "assistant", label: "Site assistant", status: ctx.env.GOOGLE_API_KEY ? "HEALTHY" : "WARNING",
    detail: ctx.env.GOOGLE_API_KEY
      ? `The AI model key is configured. Models tried in order: ${modelChain(ctx.env.GEMINI_MODEL).join(" → ")}; if none answers, the club's own FAQ and data do.`
      : "No AI model key: the assistant answers from the club's own FAQ and data only." });

  const [usage, extra] = await Promise.all([freeTierUsage(ctx), activity(ctx)]);
  if (!usage.controls.uploadsEnabled) {
    checks.push({ key: "uploads", label: "Uploads", status: "WARNING", detail: "Paused. Nobody can upload files until a Moderator switches uploads back on below." });
  }
  const email = { ...extra.email, provider: mail.provider?.name ?? null, switchedOn: mail.switchedOn, dailyLimit: mail.dailyLimit, lastTestAt: await lastSuccessfulTest(ctx) };
  return { checkedAt, checks, usage: usage.rows, analytics: usage.analytics, controls: usage.controls, email, errors: extra.errors, signIns: extra.signIns };
}

export interface UsageRow {
  key: string;
  label: string;
  used: number | null;
  limit: number;
  unit: "requests" | "rows" | "bytes" | "operations" | "files" | "answers" | "emails" | "ms";
  period: string;
  /** Where the figure comes from; null when it isn't known. */
  source: "Cloudflare" | "GUCC count" | null;
  note?: string;
}

/** Real usage next to the free limits: Cloudflare's figures when the analytics token is set, the app's own counts always. */
async function freeTierUsage(ctx: Ctx) {
  const [cf, app, cfg] = await Promise.all([
    fetchCloudflareUsage(ctx),
    appUsage(ctx),
    getSettings(ctx, { "media.uploads_enabled": true, "media.daily_object_writes": 2000, "media.storage_limit_bytes": 8 * 1024 ** 3, "assistant.daily_limit": 300, "email.daily_limit": 40, "email.monthly_limit": 1000, "email.enabled": false }),
  ]);
  const both = (cfValue: number | null, appValue: number) => (cfValue === null ? { used: appValue, source: "GUCC count" as const } : { used: Math.max(cfValue, appValue), source: "Cloudflare" as const });
  const cfOnly = (v: number | null) => ({ used: v, source: v === null ? null : ("Cloudflare" as const) });
  const rows: UsageRow[] = [
    { key: "worker", label: "API requests", ...cfOnly(cf.workerRequestsToday), limit: FREE_LIMITS.workerRequestsPerDay, unit: "requests", period: "today (UTC)", note: "Past the limit the API refuses requests until 00:00 UTC; nothing is charged." },
    { key: "worker-errors", label: "API errors", ...cfOnly(cf.workerErrorsToday), limit: FREE_LIMITS.workerRequestsPerDay, unit: "requests", period: "today (UTC)" },
    { key: "cpu", label: "API CPU time per request (99th percentile)", ...cfOnly(cf.workerCpuP99Ms), limit: 10, unit: "ms", period: "today (UTC)", note: "The free plan allows 10 ms of CPU per request." },
    { key: "d1-read", label: "Database rows read", ...cfOnly(cf.d1RowsReadToday), limit: FREE_LIMITS.d1RowsReadPerDay, unit: "rows", period: "today (UTC)", note: "Past the limit queries fail until 00:00 UTC; nothing is charged." },
    { key: "d1-write", label: "Database rows written", ...cfOnly(cf.d1RowsWrittenToday), limit: FREE_LIMITS.d1RowsWrittenPerDay, unit: "rows", period: "today (UTC)" },
    { key: "r2-storage", label: "File storage", ...both(cf.r2StorageBytes, app.storedBytes), limit: FREE_LIMITS.r2StorageBytes, unit: "bytes", period: "now",
      note: `R2 bills past 10 GB, so uploads stop at ${formatBytes(Number(cfg["media.storage_limit_bytes"]))} and pause automatically at 90%.` },
    { key: "r2-writes", label: "File storage writes", ...both(cf.r2ClassAThisMonth, app.objectWritesThisMonth), limit: FREE_LIMITS.r2ClassAPerMonth, unit: "operations", period: "this month" },
    { key: "r2-reads", label: "File storage reads", ...cfOnly(cf.r2ClassBThisMonth), limit: FREE_LIMITS.r2ClassBPerMonth, unit: "operations", period: "this month",
      note: "Reads only happen through the API, so its daily request limit caps them far below this." },
    { key: "uploads", label: "Files uploaded", used: app.objectWritesToday, source: "GUCC count", limit: Number(cfg["media.daily_object_writes"]), unit: "files", period: "today (UTC)" },
    { key: "ai", label: "AI answers", used: app.aiAnswersToday, source: "GUCC count", limit: Number(cfg["assistant.daily_limit"]), unit: "answers", period: "today (UTC)", note: "After the limit the assistant answers from the club's own data." },
    { key: "email", label: "Emails", used: app.emailsToday, source: "GUCC count", limit: Number(cfg["email.daily_limit"]), unit: "emails", period: "today (UTC)",
      note: "SMTP2GO's free plan allows 200 a day, and 25 an hour until a sending domain is verified (extra ones wait in its queue)." },
    { key: "email-month", label: "Emails this month", used: app.emailsThisMonth, source: "GUCC count", limit: Number(cfg["email.monthly_limit"]), unit: "emails", period: "this month (UTC)",
      note: "SMTP2GO's free plan stops sending at 1,000 a month; nothing is charged." },
  ];
  return {
    rows,
    analytics: { configured: Boolean(ctx.env.CF_ANALYTICS_TOKEN), available: cf.available, error: cf.error },
    controls: {
      uploadsEnabled: cfg["media.uploads_enabled"] !== false,
      emailEnabled: cfg["email.enabled"] === true,
      /** Switching off is a brake anyone watching health may pull; switching on is a Moderator's protected change. */
      canSwitchOff: can(ctx, "system.health") || can(ctx, "settings.system"),
      canSwitchOn: can(ctx, "settings.system"),
      canTestEmail: can(ctx, "settings.system"),
    },
  };
}

/** Hide most of an address: enough to recognise it, not to collect it. */
export const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!domain) return "•••";
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
};

/** Email outcomes, recent errors and sign-in activity (last 24 hours). */
async function activity(ctx: Ctx) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [counts, recentEmail, recentErrors] = await Promise.all([
    ctx.db.first<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM email_log WHERE created_at > ?1 AND status = 'sent') AS email_sent,
              (SELECT COUNT(*) FROM email_log WHERE created_at > ?1 AND status = 'failed') AS email_failed,
              (SELECT COUNT(*) FROM email_log WHERE created_at > ?1 AND status LIKE 'skipped%') AS email_skipped,
              (SELECT COUNT(*) FROM error_events WHERE created_at > ?1) AS errors,
              (SELECT COUNT(*) FROM authentication_events WHERE created_at > ?1 AND event = 'LOGIN_SUCCESS') AS sign_ins,
              (SELECT COUNT(*) FROM authentication_events WHERE created_at > ?1 AND event IN ('LOGIN_FAILED', 'MFA_FAILED')) AS failed,
              (SELECT COUNT(*) FROM authentication_events WHERE created_at > ?1 AND event = 'LOCKED') AS locked,
              (SELECT COUNT(*) FROM authentication_events WHERE created_at > ?1 AND event = 'REGISTER') AS sign_ups,
              (SELECT COUNT(*) FROM rate_limits rl JOIN json_each(?3) l ON l.key = substr(rl.key, 1, instr(rl.key, ':') - 1)
                 WHERE rl.key LIKE 'auth.%' AND rl.window_start > ?2 AND rl.count >= l.value) AS limited`,
      since, Math.floor(Date.now() / 1000) - 3600, JSON.stringify(Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, v.limit])))),
    ctx.db.all<{ created_at: string; type: string; status: string; recipient: string; error: string | null }>(
      "SELECT created_at, type, status, recipient, error FROM email_log ORDER BY created_at DESC LIMIT 10"),
    ctx.db.all<{ created_at: string; procedure: string | null; code: string | null; status: number | null; message: string | null }>(
      "SELECT created_at, procedure, code, status, message FROM error_events ORDER BY created_at DESC LIMIT 10"),
  ]);
  const c = counts ?? {};
  return {
    email: { last24h: { sent: c.email_sent ?? 0, failed: c.email_failed ?? 0, skipped: c.email_skipped ?? 0 }, recent: recentEmail.map((r) => ({ ...r, recipient: maskEmail(r.recipient) })) },
    errors: { last24h: c.errors ?? 0, recent: recentErrors },
    signIns: { successful: c.sign_ins ?? 0, failed: c.failed ?? 0, locked: c.locked ?? 0, signUps: c.sign_ups ?? 0, limitedAddresses: c.limited ?? 0 },
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}
