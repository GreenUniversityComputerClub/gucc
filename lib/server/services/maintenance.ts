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
 *    default, from lostfound.config) with a notice to the owner a week before;
 *  - reminders: tasks due within a day, meetings starting within the hour (once each);
 *  - pages refresh when a scheduled post went out or an event's registration opened or
 *    closed in the last hour (the public site caches for an hour).
 *
 * Every write is set-based, so the whole run stays well inside D1's statement budget.
 */
import { reconcileStoredBytes } from "../usage";
import type { Ctx } from "../context";
import { nowIso } from "../db";

export interface MaintenanceReport {
  endedListings?: number;
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
  taskReminders: number;
  meetingReminders: number;
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
      // updated_by cleared: the change is the club's schedule, not the last person who edited it.
      "UPDATE events SET status = 'ONGOING', updated_at = ?1, updated_by = NULL WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND start_at IS NOT NULL AND start_at <= ?1 AND (end_at IS NULL OR end_at > ?1)",
      iso),
    eventsCompleted: await ctx.db.run(
      `UPDATE events SET status = 'COMPLETED', updated_at = ?1, updated_by = NULL WHERE status IN ('PUBLISHED','ONGOING') AND deleted_at IS NULL
         AND ((end_at IS NOT NULL AND end_at <= ?1) OR (end_at IS NULL AND start_at IS NOT NULL AND start_at <= ?2))`,
      iso, dayAgo),
    orphanUploads: 0,
    expiredGrants: await ctx.db.run("UPDATE user_permissions SET revoked_at = expires_at WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?1", iso),
    // Assignments whose end date has passed stop counting (approvers, positions' permissions).
    endedListings: await ctx.db.run("UPDATE committee_members SET is_active = 0, updated_at = ?1 WHERE is_active = 1 AND deleted_at IS NULL AND end_date IS NOT NULL AND end_date < substr(?1, 1, 10)", iso),
    oldNotifications: 0,
    lostFoundNoticed: 0,
    lostFoundArchived: 0,
    storedBytes: 0,
    taskReminders: 0,
    meetingReminders: 0,
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
  await reminders(ctx, now, report);
  // Correct the running total of stored bytes from the files themselves.
  report.storedBytes = await reconcileStoredBytes(ctx);
  // Scheduled posts and registration windows change what the (cached) public pages show.
  const crossed = await ctx.db.first<{ posts: number; events: number }>(
    `SELECT EXISTS (SELECT 1 FROM posts WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND published_at > ?1 AND published_at <= ?2) AS posts,
            EXISTS (SELECT 1 FROM events WHERE deleted_at IS NULL AND status IN ('PUBLISHED','ONGOING')
                      AND ((registration_opens_at > ?1 AND registration_opens_at <= ?2) OR (registration_closes_at > ?1 AND registration_closes_at <= ?2))) AS events`,
    new Date(now.getTime() - 3600_000).toISOString(), iso);
  if (crossed?.posts) ctx.revalidate?.(["posts"]);
  if (report.eventsOngoing || report.eventsCompleted || crossed?.events) ctx.revalidate?.(["events"]);
  return report;
}

/**
 * Reminders in the dashboard (and by email where people chose it): a task due in the next day,
 * a meeting starting in the next hour. Each is sent once (reminded_at); nothing runs when
 * nothing is due, so quiet hours cost one statement each.
 */
async function reminders(ctx: Ctx, now: Date, report: MaintenanceReport): Promise<void> {
  const iso = now.toISOString();
  const dayAhead = new Date(now.getTime() + DAY).toISOString();
  const hourAhead = new Date(now.getTime() + 3600_000).toISOString();
  // RETURNING id: the new notices go through the email outbox like any other (flushed after this run).
  const tasks = await ctx.db.all<{ id: string }>(
    `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at)
     SELECT 'ntf_' || lower(hex(randomblob(16))), t.assignee_user_id, 'task.due', 'Due soon: ' || substr(t.title, 1, 150), 'Due within a day.', '/dashboard/tasks/' || t.id, 'task', t.id, 'IN_APP', ?1
     FROM tasks t WHERE t.deleted_at IS NULL AND t.status IN ('OPEN','IN_PROGRESS') AND t.assignee_user_id IS NOT NULL AND t.reminded_at IS NULL
       AND t.due_at IS NOT NULL AND t.due_at > ?1 AND t.due_at <= ?2 RETURNING id`, iso, dayAhead);
  report.taskReminders = tasks.length;
  ctx.outbox?.push(...tasks.map((t) => t.id));
  if (report.taskReminders) {
    await ctx.db.run(`UPDATE tasks SET reminded_at = ?1 WHERE deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS') AND assignee_user_id IS NOT NULL AND reminded_at IS NULL
      AND due_at IS NOT NULL AND due_at > ?1 AND due_at <= ?2`, iso, dayAhead);
  }
  const meetings = await ctx.db.all<{ id: string }>(
    `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at)
     SELECT 'ntf_' || lower(hex(randomblob(16))), p.user_id, 'meeting.soon', 'Starting soon: ' || substr(m.title, 1, 150),
            COALESCE(m.location, CASE WHEN m.meet_url IS NOT NULL THEN 'Online (Google Meet)' END), '/dashboard/meetings/' || m.id, 'meeting', m.id, 'IN_APP', ?1
     FROM meetings m JOIN meeting_participants p ON p.meeting_id = m.id AND p.response <> 'NO'
     JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE'
     WHERE m.deleted_at IS NULL AND m.status = 'SCHEDULED' AND m.reminded_at IS NULL AND m.starts_at > ?1 AND m.starts_at <= ?2 RETURNING id`, iso, hourAhead);
  report.meetingReminders = meetings.length;
  ctx.outbox?.push(...meetings.map((m) => m.id));
  if (report.meetingReminders) {
    await ctx.db.run("UPDATE meetings SET reminded_at = ?1 WHERE deleted_at IS NULL AND status = 'SCHEDULED' AND reminded_at IS NULL AND starts_at > ?1 AND starts_at <= ?2", iso, hourAhead);
  }
}

/** Remember when housekeeping last ran (and whether it finished) for the System health page. */
export async function recordHeartbeat(ctx: Ctx, name: string, ok: boolean, detail: unknown): Promise<void> {
  await ctx.db.run(
    `INSERT INTO system_heartbeats (name, last_run_at, last_ok, detail_json) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_ok = excluded.last_ok, detail_json = excluded.detail_json`,
    name, nowIso(), ok ? 1 : 0, JSON.stringify(detail ?? null));
}
