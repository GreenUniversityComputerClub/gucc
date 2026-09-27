/**
 * Real usage against Cloudflare's free limits, from the GraphQL Analytics API (read-only token
 * CF_ANALYTICS_TOKEN, "Account Analytics: Read"). Without the token, or when the API doesn't
 * answer, each figure is null and shown as "Unknown" — never guessed.
 *
 * The hourly job uses the same numbers (plus the app's own counters) to warn Moderators and to
 * pause uploads before R2 — the only service billed past its free amount — gets close.
 */
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { notifyStmts, usersWithPermission } from "../notifications";
import { auditStmt } from "../audit";
import { getSettings } from "../security";
import { reserve, utcDay } from "../usage";

/** Free-plan limits (Workers Free, D1 Free, R2 free tier). */
export const FREE_LIMITS = {
  workerRequestsPerDay: 100_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  r2StorageBytes: 10 * 1024 ** 3,
  r2ClassAPerMonth: 1_000_000,
  r2ClassBPerMonth: 10_000_000,
} as const;

/** R2 operations that are free; reads (Class B) are listed; anything else counts as a write (Class A). */
const R2_FREE = new Set(["DeleteObject", "DeleteObjects", "DeleteBucket", "AbortMultipartUpload"]);
const R2_CLASS_B = new Set(["GetObject", "HeadObject", "HeadBucket", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration", "UsageSummary"]);

export interface CloudflareUsage {
  available: boolean;
  error: string | null;
  workerRequestsToday: number | null;
  workerErrorsToday: number | null;
  workerCpuP50Ms: number | null;
  workerCpuP99Ms: number | null;
  d1RowsReadToday: number | null;
  d1RowsWrittenToday: number | null;
  r2StorageBytes: number | null;
  r2ClassAThisMonth: number | null;
  r2ClassBThisMonth: number | null;
}

const EMPTY: CloudflareUsage = {
  available: false, error: null, workerRequestsToday: null, workerErrorsToday: null, workerCpuP50Ms: null, workerCpuP99Ms: null,
  d1RowsReadToday: null, d1RowsWrittenToday: null, r2StorageBytes: null, r2ClassAThisMonth: null, r2ClassBThisMonth: null,
};

type Gql = { data?: { viewer?: { accounts?: Array<Record<string, unknown[]>> } }; errors?: Array<{ message: string }> };

async function gql(ctx: Ctx, query: string, variables: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`analytics API answered ${res.status}`);
  const body = (await res.json()) as Gql;
  if (body.errors?.length) throw new Error(body.errors[0]!.message.slice(0, 160));
  const account = body.data?.viewer?.accounts?.[0] ?? {};
  return (Object.values(account)[0] ?? []) as Array<Record<string, unknown>>;
}

const sumOf = (rows: Array<Record<string, unknown>>, group: string, field: string) =>
  rows.reduce((n, r) => n + Number((r[group] as Record<string, unknown> | undefined)?.[field] ?? 0), 0);

/** Each dataset is its own small query, so one unavailable metric doesn't hide the others. */
export async function fetchCloudflareUsage(ctx: Ctx, now = new Date()): Promise<CloudflareUsage> {
  const e = ctx.env;
  if (!e.CF_ANALYTICS_TOKEN || !e.CF_ACCOUNT_ID) return { ...EMPTY, error: "CF_ANALYTICS_TOKEN is not set." };
  const out: CloudflareUsage = { ...EMPTY, available: true };
  const errors: string[] = [];
  const dayStart = `${utcDay(now)}T00:00:00Z`;
  const monthStart = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`;
  const account = e.CF_ACCOUNT_ID;
  let tried = 0;
  const attempt = async (label: string, fn: () => Promise<void>) => {
    tried++;
    try {
      await fn();
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : "failed"}`);
    }
  };
  await Promise.all([
    e.CF_WORKER_NAME && attempt("Workers", async () => {
      const rows = await gql(ctx, `query($a: string!, $s: string, $t: Time) { viewer { accounts(filter: { accountTag: $a }) {
        workersInvocationsAdaptive(limit: 100, filter: { scriptName: $s, datetime_geq: $t }) { sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 } } } } }`,
      { a: account, s: e.CF_WORKER_NAME, t: dayStart });
      out.workerRequestsToday = sumOf(rows, "sum", "requests");
      out.workerErrorsToday = sumOf(rows, "sum", "errors");
      const q = rows[0]?.quantiles as { cpuTimeP50?: number; cpuTimeP99?: number } | undefined;
      // Reported in microseconds.
      out.workerCpuP50Ms = q?.cpuTimeP50 != null ? Math.round(q.cpuTimeP50 / 10) / 100 : null;
      out.workerCpuP99Ms = q?.cpuTimeP99 != null ? Math.round(q.cpuTimeP99 / 10) / 100 : null;
    }),
    e.CF_D1_DATABASE_ID && attempt("D1", async () => {
      const rows = await gql(ctx, `query($a: string!, $d: string, $day: Date) { viewer { accounts(filter: { accountTag: $a }) {
        d1AnalyticsAdaptiveGroups(limit: 10, filter: { databaseId: $d, date_geq: $day }) { sum { rowsRead rowsWritten } } } } }`,
      { a: account, d: e.CF_D1_DATABASE_ID, day: utcDay(now) });
      out.d1RowsReadToday = sumOf(rows, "sum", "rowsRead");
      out.d1RowsWrittenToday = sumOf(rows, "sum", "rowsWritten");
    }),
    attempt("R2 storage", async () => {
      const rows = await gql(ctx, `query($a: string!, $t: Time) { viewer { accounts(filter: { accountTag: $a }) {
        r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $t }, orderBy: [datetime_DESC]) { max { payloadSize metadataSize } dimensions { bucketName } } } } }`,
      { a: account, t: new Date(now.getTime() - 2 * 86_400_000).toISOString() });
      // Latest size per bucket (rows are newest first).
      const seen = new Map<string, number>();
      for (const r of rows) {
        const bucket = String((r.dimensions as { bucketName?: string } | undefined)?.bucketName ?? "");
        if (!seen.has(bucket)) seen.set(bucket, Number((r.max as Record<string, number>)?.payloadSize ?? 0) + Number((r.max as Record<string, number>)?.metadataSize ?? 0));
      }
      out.r2StorageBytes = [...seen.values()].reduce((a, b) => a + b, 0);
    }),
    attempt("R2 operations", async () => {
      const rows = await gql(ctx, `query($a: string!, $t: Time) { viewer { accounts(filter: { accountTag: $a }) {
        r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $t }) { sum { requests } dimensions { actionType } } } } }`,
      { a: account, t: monthStart });
      let a = 0;
      let b = 0;
      for (const r of rows) {
        const action = String((r.dimensions as { actionType?: string } | undefined)?.actionType ?? "");
        const n = Number((r.sum as { requests?: number } | undefined)?.requests ?? 0);
        if (R2_FREE.has(action)) continue;
        if (R2_CLASS_B.has(action)) b += n;
        else a += n;
      }
      out.r2ClassAThisMonth = a;
      out.r2ClassBThisMonth = b;
    }),
  ]);
  out.error = errors.length ? errors.join("; ") : null;
  // "Available" only when at least one figure really came back.
  out.available = errors.length < tried;
  return out;
}

/** The app's own counters, available without any token. */
export async function appUsage(ctx: Ctx, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const row = await ctx.db.first<{ stored: number | null; writes_today: number | null; writes_month: number | null; ai_today: number | null; email_today: number | null }>(
    `SELECT (SELECT count FROM usage_counters WHERE day = 'total' AND key = 'r2.stored_bytes') AS stored,
            (SELECT count FROM usage_counters WHERE day = ?1 AND key = 'r2.objects') AS writes_today,
            (SELECT SUM(count) FROM usage_counters WHERE day LIKE ?2 AND key = 'r2.objects') AS writes_month,
            (SELECT count FROM usage_counters WHERE day = ?1 AND key = 'ai.answers') AS ai_today,
            (SELECT count FROM usage_counters WHERE day = ?1 AND key = 'email.sent') AS email_today`,
    utcDay(now), `${month}-%`);
  return {
    storedBytes: row?.stored ?? 0,
    objectWritesToday: row?.writes_today ?? 0,
    objectWritesThisMonth: row?.writes_month ?? 0,
    aiAnswersToday: row?.ai_today ?? 0,
    emailsToday: row?.email_today ?? 0,
  };
}

/**
 * Hourly: warn Moderators when anything passes the alert share of a free limit (once a day per
 * metric), and pause uploads when R2 storage or writes pass the pause share.
 */
export async function guardFreeTier(ctx: Ctx, now = new Date()): Promise<{ paused: boolean; alerts: string[] }> {
  const cfg = await getSettings(ctx, { "usage.alert_percent": 70, "usage.pause_percent": 90, "media.uploads_enabled": true });
  const alert = Number(cfg["usage.alert_percent"]) / 100;
  const pause = Number(cfg["usage.pause_percent"]) / 100;
  const [cf, app] = await Promise.all([fetchCloudflareUsage(ctx, now), appUsage(ctx, now)]);
  // Take the larger of the real figure and the app's own count (the app's count is conservative).
  const storage = Math.max(cf.r2StorageBytes ?? 0, app.storedBytes);
  const classA = Math.max(cf.r2ClassAThisMonth ?? 0, app.objectWritesThisMonth);
  const shares: Array<[string, number | null, number]> = [
    ["R2 storage", storage, FREE_LIMITS.r2StorageBytes],
    ["R2 writes this month", classA, FREE_LIMITS.r2ClassAPerMonth],
    ["R2 reads this month", cf.r2ClassBThisMonth, FREE_LIMITS.r2ClassBPerMonth],
    ["Worker requests today", cf.workerRequestsToday, FREE_LIMITS.workerRequestsPerDay],
    ["D1 rows read today", cf.d1RowsReadToday, FREE_LIMITS.d1RowsReadPerDay],
    ["D1 rows written today", cf.d1RowsWrittenToday, FREE_LIMITS.d1RowsWrittenPerDay],
  ];
  const alerts = shares.filter(([, v, limit]) => v !== null && v >= alert * limit).map(([label, v, limit]) => `${label}: ${Math.round((Number(v) / limit) * 100)}% of the free limit`);
  const mustPause = storage >= pause * FREE_LIMITS.r2StorageBytes || classA >= pause * FREE_LIMITS.r2ClassAPerMonth;
  const moderators = alerts.length || (mustPause && cfg["media.uploads_enabled"]) ? await usersWithPermission(ctx, "settings.manage") : [];
  let paused = false;
  if (mustPause && cfg["media.uploads_enabled"]) {
    paused = true;
    await ctx.db.batch([
      ctx.db.stmt("UPDATE system_settings SET value_json = 'false', updated_at = ?1 WHERE key = 'media.uploads_enabled'", nowIso()),
      auditStmt(ctx, { action: "usage.uploads_paused", resourceType: "system_setting", resourceId: "media.uploads_enabled", actorUserId: null, actorLabel: "free-tier guard", reason: `R2 storage ${storage} bytes, writes ${classA} this month` }),
      ...notifyStmts(ctx, moderators, { type: "system.usage", title: "Uploads paused to stay within the free tier", body: "R2 storage or writes are near the free limit. Delete unused files, then switch uploads back on in System health.", link: "/dashboard/health" }),
    ]);
  }
  // One warning per metric per day.
  for (const text of alerts) {
    if (await reserve(ctx, `alert:${text.split(":")[0]}`, 1, 1)) {
      await ctx.db.batch(notifyStmts(ctx, moderators, { type: "system.usage", title: "Usage is approaching a free limit", body: text, link: "/dashboard/health" }));
    }
  }
  return { paused, alerts };
}
