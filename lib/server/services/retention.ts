/**
 * Daily data retention and media lifecycle (the Worker's daily cron; the hourly one does
 * sessions, tokens and events). What is kept, and for how long, is documented in
 * docs/platform/PRIVACY.md; this file is the enforcement. Every step is set-based and bounded,
 * so the run stays inside D1's 50 statements and the Worker's 10 ms of CPU.
 *
 *   error events            30 days
 *   email log               90 days
 *   idempotency keys        1 day
 *   sign-in events          1 year
 *   usage counters          13 months (monthly totals need the current and previous month)
 *   contact messages        12 months
 *   rejected or withdrawn applications (and their files)   12 months after the recruitment closed
 *   event registrations     anonymised 24 months after the event
 *   archived lost & found posts (and their photos)         12 months after archiving
 *   activity log            2 years (sealed ranges are removed whole)
 *
 * Files nothing uses any more are marked (media.unreferenced_since). They are never deleted
 * automatically: a Moderator can delete one permanently after 30 days unused.
 */
import type { Ctx } from "../context";
import { MEDIA_REFS_SQL } from "./media";

const DAY = 86_400_000;
/** Rows handled per run for steps that also delete files, so a large backlog spreads over days. */
const BATCH = 100;

export interface RetentionReport {
  errorEvents: number;
  emailLog: number;
  idempotencyKeys: number;
  authEvents: number;
  usageCounters: number;
  contactMessages: number;
  applications: number;
  registrationsAnonymised: number;
  lostFound: number;
  auditRows: number;
  mediaMarkedUnused: number;
  mediaInUseAgain: number;
}

const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();

type FileRow = { id: string; bucket: string | null; variants_json: string | null };

/** Delete the R2 objects of these files (free) and mark them purged. Returns the ids handled. */
async function purgeFiles(ctx: Ctx, files: FileRow[], at: string): Promise<string[]> {
  if (!files.length) return [];
  for (const bucket of ["public", "private"] as const) {
    const keys = files.filter((f) => (f.bucket ?? "public") === bucket).flatMap((f) => Object.values(JSON.parse(f.variants_json ?? "{}") as Record<string, { key: string }>).map((v) => v.key));
    if (keys.length && ctx.media) await ctx.media[bucket].delete(keys);
  }
  await ctx.db.run("UPDATE media SET status = 'ARCHIVED', deleted_at = COALESCE(deleted_at, ?2), purged_at = ?2, updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))",
    JSON.stringify(files.map((f) => f.id)), at);
  return files.map((f) => f.id);
}

export async function runRetention(ctx: Ctx, now = new Date()): Promise<RetentionReport> {
  const at = now.toISOString();
  const report: RetentionReport = {
    errorEvents: await ctx.db.run("DELETE FROM error_events WHERE created_at < ?1", ago(now, 30)),
    emailLog: await ctx.db.run("DELETE FROM email_log WHERE created_at < ?1", ago(now, 90)),
    idempotencyKeys: await ctx.db.run("DELETE FROM idempotency_keys WHERE created_at < ?1", ago(now, 1)),
    authEvents: await ctx.db.run("DELETE FROM authentication_events WHERE created_at < ?1", ago(now, 365)),
    usageCounters: await ctx.db.run("DELETE FROM usage_counters WHERE day <> 'total' AND day < ?1", ago(now, 400).slice(0, 10)),
    contactMessages: await ctx.db.run("DELETE FROM contact_messages WHERE created_at < ?1", ago(now, 365)),
    applications: 0,
    registrationsAnonymised: 0,
    lostFound: 0,
    auditRows: 0,
    mediaMarkedUnused: 0,
    mediaInUseAgain: 0,
  };

  // Applications that didn't succeed, a year after their recruitment closed, with their documents.
  const apps = await ctx.db.all<{ id: string; files: string }>(
    `SELECT a.id, json_array(a.cv_media_id, a.photo_media_id, a.id_card_media_id) AS files FROM recruitment_applications a
       JOIN recruitment_campaigns c ON c.id = a.campaign_id
     WHERE a.status IN ('REJECTED', 'WITHDRAWN') AND COALESCE(c.closes_at, c.updated_at) < ?1 LIMIT ${BATCH}`, ago(now, 365));
  if (apps.length) {
    const fileIds = apps.flatMap((a) => (JSON.parse(a.files) as Array<string | null>).filter((x): x is string => Boolean(x)));
    const files = fileIds.length
      ? await ctx.db.all<FileRow>("SELECT id, bucket, variants_json FROM media WHERE id IN (SELECT value FROM json_each(?1)) AND purged_at IS NULL", JSON.stringify(fileIds))
      : [];
    const ids = JSON.stringify(apps.map((a) => a.id));
    await ctx.db.batch([
      ctx.db.stmt("DELETE FROM recruitment_notes WHERE application_id IN (SELECT value FROM json_each(?1))", ids),
      ctx.db.stmt("DELETE FROM recruitment_applications WHERE id IN (SELECT value FROM json_each(?1))", ids),
    ]);
    await purgeFiles(ctx, files, at);
    report.applications = apps.length;
  }

  // Registrations for events that ended two years ago keep only their count and status.
  report.registrationsAnonymised = await ctx.db.run(
    `UPDATE event_registrations SET name = 'Former participant', email = 'anonymised-' || id || '@invalid', student_id = NULL, phone = NULL, answers_json = NULL, user_id = NULL, updated_at = ?2
     WHERE email NOT LIKE 'anonymised-%' AND event_id IN (SELECT id FROM events WHERE COALESCE(end_at, start_at) < ?1)`, ago(now, 730), at);

  // Lost & found posts archived a year ago, with their messages and photos.
  const posts = await ctx.db.all<{ id: string; image_media_id: string | null }>(
    `SELECT id, image_media_id FROM lost_found_posts WHERE archived_at IS NOT NULL AND archived_at < ?1 LIMIT ${BATCH}`, ago(now, 365));
  if (posts.length) {
    const ids = JSON.stringify(posts.map((p) => p.id));
    const imageIds = posts.map((p) => p.image_media_id).filter((x): x is string => Boolean(x));
    const files = imageIds.length
      ? await ctx.db.all<FileRow>("SELECT id, bucket, variants_json FROM media WHERE id IN (SELECT value FROM json_each(?1)) AND purged_at IS NULL", JSON.stringify(imageIds))
      : [];
    await ctx.db.batch([
      ctx.db.stmt("DELETE FROM lost_found_messages WHERE post_id IN (SELECT value FROM json_each(?1))", ids),
      ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'lost_found' AND resource_id IN (SELECT value FROM json_each(?1))", ids),
      ctx.db.stmt("DELETE FROM lost_found_posts WHERE id IN (SELECT value FROM json_each(?1))", ids),
    ]);
    await purgeFiles(ctx, files, at);
    report.lostFound = posts.length;
  }

  // Activity log entries older than two years, whole sealed ranges at a time (so the remaining
  // seals still verify). The table's trigger refuses anything younger.
  const upTo = await ctx.db.value<number>(
    `SELECT MAX(last_rowid) FROM audit_seals WHERE last_rowid <= (SELECT COALESCE(MAX(rowid), 0) FROM audit_logs WHERE created_at < ?1)`, ago(now, 730));
  if (upTo) {
    report.auditRows = (await ctx.db.value<number>("SELECT COUNT(*) FROM audit_logs WHERE rowid <= ?1 AND created_at < ?2", upTo, ago(now, 730))) ?? 0;
    await ctx.db.batch([
      ctx.db.stmt("DELETE FROM audit_logs WHERE rowid <= ?1 AND created_at < ?2", upTo, ago(now, 730)),
      ctx.db.stmt("DELETE FROM audit_seals WHERE last_rowid <= ?1", upTo),
    ]);
  }

  // Media lifecycle: mark what nothing uses (and unmark what is used again). Never deletes.
  report.mediaMarkedUnused = await ctx.db.run(
    `UPDATE media SET unreferenced_since = ?1 WHERE unreferenced_since IS NULL AND deleted_at IS NULL AND status = 'READY' AND storage = 'R2'
       AND upload_session IS NULL AND (${MEDIA_REFS_SQL.replace(/\bm\.id\b/g, "media.id").replace(/\bm\.legacy_path\b/g, "media.legacy_path")}) = 0`, at);
  report.mediaInUseAgain = await ctx.db.run(
    `UPDATE media SET unreferenced_since = NULL WHERE unreferenced_since IS NOT NULL AND deleted_at IS NULL
       AND (${MEDIA_REFS_SQL.replace(/\bm\.id\b/g, "media.id").replace(/\bm\.legacy_path\b/g, "media.legacy_path")}) > 0`);
  return report;
}
