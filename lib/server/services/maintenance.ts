/**
 * Hourly housekeeping (the API Worker's cron trigger). Idempotent and cheap:
 * each statement touches only expired rows through an index.
 *
 *  - expired or long-revoked sessions, used/expired auth tokens, stale
 *    rate-limit windows are deleted;
 *  - published events move to ONGOING / COMPLETED by their times;
 *  - recruitment uploads never attached to an application (abandoned forms)
 *    are archived after a day and their private objects deleted;
 *  - expired direct grants are closed, old read notifications deleted;
 *  - lost & found posts are archived (resolved after 30 days, open ones after 90 by
 *    default, from lostfound.config) with a notice to the owner a week before.
 *
 * Every write is set-based, so the whole run stays well inside D1's statement budget.
 */
import { reconcileStoredBytes } from "../usage";
import type { Ctx } from "../context";
import { nowIso } from "../db";

export interface MaintenanceReport {
  sessions: number;
  tokens: number;
  rateLimits: number;
  eventsOngoing: number;
  eventsCompleted: number;
  orphanUploads: number;
  expiredGrants: number;
  oldNotifications: number;
  lostFoundNoticed: number;
  lostFoundArchived: number;
  storedBytes: number;
}

const DAY = 86_400_000;

export async function runMaintenance(ctx: Ctx, now = new Date()): Promise<MaintenanceReport> {
  const iso = now.toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const epoch = Math.floor(now.getTime() / 1000);
  const report: MaintenanceReport = {
    sessions: await ctx.db.run("DELETE FROM sessions WHERE expires_at < ?1 OR (revoked_at IS NOT NULL AND revoked_at < ?2)", iso, monthAgo),
    tokens: await ctx.db.run("DELETE FROM auth_tokens WHERE expires_at < ?1 OR (used_at IS NOT NULL AND used_at < ?2)", monthAgo, monthAgo),
    // Longest window in use is one day.
    rateLimits: await ctx.db.run("DELETE FROM rate_limits WHERE window_start < ?1", epoch - 2 * 86_400),
    eventsOngoing: await ctx.db.run(
      "UPDATE events SET status = 'ONGOING', updated_at = ?1 WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND start_at IS NOT NULL AND start_at <= ?1 AND (end_at IS NULL OR end_at > ?1)",
      iso),
    eventsCompleted: await ctx.db.run(
      `UPDATE events SET status = 'COMPLETED', updated_at = ?1 WHERE status IN ('PUBLISHED','ONGOING') AND deleted_at IS NULL
         AND ((end_at IS NOT NULL AND end_at <= ?1) OR (end_at IS NULL AND start_at IS NOT NULL AND start_at <= ?2))`,
      iso, dayAgo),
    orphanUploads: 0,
    expiredGrants: await ctx.db.run("UPDATE user_permissions SET revoked_at = expires_at WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?1", iso),
    oldNotifications: 0,
    lostFoundNoticed: 0,
    lostFoundArchived: 0,
    storedBytes: 0,
  };
  const retention = Number((await ctx.db.value<string>("SELECT value_json FROM system_settings WHERE key = 'notifications.retention_days'")) ?? 180) || 180;
  report.oldNotifications = await ctx.db.run("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?1", new Date(now.getTime() - retention * DAY).toISOString());

  // Lost & found housekeeping, from the club's own settings.
  const cfg = JSON.parse((await ctx.db.value<string>("SELECT value_json FROM organization_settings WHERE key = 'lostfound.config'")) ?? "{}") as { archiveResolvedDays?: number; archiveOpenDays?: number };
  const resolvedDays = cfg.archiveResolvedDays ?? 30;
  const openDays = cfg.archiveOpenDays ?? 90;
  const openCutoff = new Date(now.getTime() - openDays * DAY).toISOString();
  const noticeCutoff = new Date(now.getTime() - (openDays - 7) * DAY).toISOString();
  report.lostFoundNoticed = await ctx.db.run(
    `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at)
     SELECT 'ntf_' || lower(hex(randomblob(16))), user_id, 'lostfound.archiving', 'Your lost & found post will be archived in a week',
            title || ' — mark it resolved if it''s sorted, or post again later if you still need help.', '/lost-found', 'lost_found', id, 'IN_APP', ?1
     FROM lost_found_posts WHERE deleted_at IS NULL AND archived_at IS NULL AND archive_notified_at IS NULL AND status IN ('active', 'pending') AND created_at < ?2`,
    iso, noticeCutoff);
  if (report.lostFoundNoticed) {
    await ctx.db.run("UPDATE lost_found_posts SET archive_notified_at = ?1 WHERE deleted_at IS NULL AND archived_at IS NULL AND archive_notified_at IS NULL AND status IN ('active', 'pending') AND created_at < ?2", iso, noticeCutoff);
  }
  report.lostFoundArchived = await ctx.db.run(
    `UPDATE lost_found_posts SET archived_at = ?1 WHERE deleted_at IS NULL AND archived_at IS NULL AND (
       (status = 'resolved' AND COALESCE(resolved_at, updated_at) < ?2) OR (status IN ('active', 'pending', 'rejected') AND created_at < ?3))`,
    iso, new Date(now.getTime() - resolvedDays * DAY).toISOString(), openCutoff);
  const orphans = await ctx.db.all<{ id: string; variants_json: string | null }>(
    `SELECT m.id, m.variants_json FROM media m
     WHERE m.upload_session IS NOT NULL AND m.deleted_at IS NULL AND m.created_at < ?1
       AND NOT EXISTS (SELECT 1 FROM recruitment_applications a WHERE m.id IN (a.cv_media_id, a.photo_media_id, a.id_card_media_id))
     LIMIT 200`, dayAgo);
  if (orphans.length) {
    const keys = orphans.flatMap((o) => Object.values(JSON.parse(o.variants_json ?? "{}") as Record<string, { key: string }>).map((v) => v.key));
    if (ctx.media && keys.length) await ctx.media.private.delete(keys);
    // One statement for all of them (D1 counts statements per invocation).
    report.orphanUploads = await ctx.db.run("UPDATE media SET status = 'ARCHIVED', deleted_at = ?2, purged_at = ?2, updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?1))",
      JSON.stringify(orphans.map((o) => o.id)), nowIso());
  }
  // Correct the running total of stored bytes from the files themselves.
  report.storedBytes = await reconcileStoredBytes(ctx);
  if (report.eventsOngoing || report.eventsCompleted) ctx.revalidate?.(["events"]);
  return report;
}

/** Remember when housekeeping last ran (and whether it finished) for the System health page. */
export async function recordHeartbeat(ctx: Ctx, name: string, ok: boolean, detail: unknown): Promise<void> {
  await ctx.db.run(
    `INSERT INTO system_heartbeats (name, last_run_at, last_ok, detail_json) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_ok = excluded.last_ok, detail_json = excluded.detail_json`,
    name, nowIso(), ok ? 1 : 0, JSON.stringify(detail ?? null));
}
