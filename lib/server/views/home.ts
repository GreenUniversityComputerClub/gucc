/**
 * The dashboard's front page for everyone: what needs my attention, what's coming up, and my
 * own work. Sections depend on permissions, never on role names, and the whole page is one
 * batch of statements.
 */
import { can, requireActor } from "../authz";
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { emailEnabled } from "../email";
import { activityFeed } from "../services/activity";
import { isContentReviewer, listApprovals } from "../services/approvals";

type Row = Record<string, unknown>;

export async function homeView(ctx: Ctx) {
  const actor = requireActor(ctx);
  const uid = actor.user.id;
  const now = nowIso();
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const c = {
    members: can(ctx, "members.approve"),
    messages: can(ctx, "messages.read"),
    recruitment: can(ctx, "recruitment.manage"),
    lostfound: can(ctx, "lostfound.moderate"),
    reports: can(ctx, "chat.moderate"),
    health: can(ctx, "audit.read") || can(ctx, "members.manage"),
  };

  const [account, mine, requests, expiring, upcoming, myRegs, counts, campaign, notes, tasks, meetings] = (await ctx.db.batchAll([
    ctx.db.stmt("SELECT status, correction_note, created_at FROM users WHERE id = ?1", uid),
    ctx.db.stmt(
      `SELECT 'post' AS kind, id, title, status, updated_at FROM posts WHERE created_by = ?1 AND deleted_at IS NULL AND status IN ('DRAFT','PENDING_APPROVAL','REJECTED')
       UNION ALL
       SELECT 'event', id, title, status, updated_at FROM events WHERE created_by = ?1 AND deleted_at IS NULL AND status IN ('DRAFT','PENDING_APPROVAL')
       ORDER BY updated_at DESC LIMIT 8`, uid),
    ctx.db.stmt("SELECT id, title, created_at FROM approval_requests WHERE requested_by = ?1 AND status = 'PENDING' ORDER BY created_at DESC LIMIT 5", uid),
    ctx.db.stmt(
      `SELECT 'permission' AS kind, p.description AS label, up.expires_at FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = ?1 AND up.revoked_at IS NULL AND up.expires_at > ?2 AND up.expires_at <= ?3
       UNION ALL
       SELECT 'role', r.name, ur.expires_at FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?1 AND ur.revoked_at IS NULL AND ur.expires_at > ?2 AND ur.expires_at <= ?3`, uid, now, soon),
    ctx.db.stmt(
      `SELECT e.id, e.slug, e.title, e.start_at, e.venue, e.registration_enabled,
              (SELECT r.status FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = ?1 AND r.status IN ('REGISTERED','WAITLISTED')) AS my_status
       FROM events e WHERE e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING') AND (e.end_at IS NULL OR e.end_at > ?2) AND e.start_at IS NOT NULL
       ORDER BY e.start_at LIMIT 5`, uid, now),
    ctx.db.stmt(
      `SELECT r.id, r.status, e.title, e.slug, e.start_at FROM event_registrations r
       JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING')
       WHERE r.user_id = ?1 AND r.status IN ('REGISTERED','WAITLISTED') AND (e.start_at IS NULL OR e.start_at > ?2) ORDER BY e.start_at LIMIT 5`, uid, now),
    ctx.db.stmt(
      // Only the figures this person's sections show are counted (a CASE branch not taken isn't
      // run), so the page stays cheap on the free plan's daily row reads for ordinary members.
      `SELECT CASE WHEN ?2 THEN (SELECT COUNT(*) FROM users WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) END AS pending_members,
              CASE WHEN ?3 THEN (SELECT COUNT(*) FROM contact_messages WHERE status = 'NEW') END AS new_messages,
              CASE WHEN ?4 THEN (SELECT COUNT(*) FROM recruitment_applications a JOIN recruitment_campaigns rc ON rc.id = a.campaign_id AND rc.status <> 'ARCHIVED' WHERE a.status = 'SUBMITTED') END AS new_applications,
              CASE WHEN ?5 THEN (SELECT COUNT(*) FROM lost_found_posts WHERE status = 'pending' AND deleted_at IS NULL) END AS pending_lostfound,
              CASE WHEN ?6 THEN (SELECT COUNT(*) FROM reports WHERE status = 'OPEN') END AS open_reports,
              CASE WHEN ?7 THEN (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL) END AS active_members,
              CASE WHEN ?7 THEN (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= ?1) END AS new_accounts,
              CASE WHEN ?7 THEN (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status IN ('PUBLISHED','ONGOING','COMPLETED') AND start_at >= ?1 AND start_at <= ?9) END AS events_30d,
              CASE WHEN ?7 THEN (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'PUBLISHED' AND published_at >= ?1 AND published_at <= ?9) END AS posts_30d,
              CASE WHEN ?7 THEN (SELECT count FROM usage_counters WHERE day = 'total' AND key = 'r2.stored_bytes') END AS storage_bytes,
              (SELECT COUNT(*) FROM notifications WHERE user_id = ?8 AND read_at IS NULL) AS unread,
              (SELECT COUNT(*) FROM tasks WHERE assignee_user_id = ?8 AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS') AND due_at IS NOT NULL AND due_at < ?9) AS overdue`,
      monthAgo, c.members ? 1 : 0, c.messages ? 1 : 0, c.recruitment ? 1 : 0, c.lostfound ? 1 : 0, c.reports ? 1 : 0, c.health ? 1 : 0, uid, now),
    ctx.db.stmt("SELECT id, title, closes_at FROM recruitment_campaigns WHERE status = 'OPEN' AND (opens_at IS NULL OR opens_at <= ?1) AND (closes_at IS NULL OR closes_at > ?1) LIMIT 1", now),
    ctx.db.stmt("SELECT id, title, body, link, created_at, read_at FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 5", uid),
    ctx.db.stmt(
      `SELECT id, title, due_at, status, priority FROM tasks WHERE assignee_user_id = ?1 AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS')
       ORDER BY due_at IS NULL, due_at, created_at DESC LIMIT 6`, uid),
    ctx.db.stmt(
      `SELECT m.id, m.title, m.starts_at, m.meet_url, m.location, mp.response FROM meetings m JOIN meeting_participants mp ON mp.meeting_id = m.id AND mp.user_id = ?1
       WHERE m.deleted_at IS NULL AND m.status = 'SCHEDULED' AND COALESCE(m.ends_at, m.starts_at) >= ?2 AND m.starts_at <= ?3 ORDER BY m.starts_at LIMIT 4`, uid, now, soon),
  ])) as Array<{ results?: Row[] }>;

  const n = (counts.results?.[0] ?? {}) as Record<string, number>;
  const decidable = can(ctx, "approvals.read") || isContentReviewer(ctx) ? (await listApprovals(ctx, {})).filter((r) => r.canDecide) : [];
  const waitedDays = (rows: Array<{ created_at: string }>) => Math.floor((Date.now() - Math.min(...rows.map((r) => Date.parse(r.created_at)))) / 86_400_000);
  const approvals = decidable.slice(0, 5).map((r) => ({ id: r.id, title: r.title ?? r.action, requester: r.requester_name }));
  const attention = [
    ...(decidable.length ? [{ key: "approvals", label: `${decidable.length >= 50 ? "50+" : decidable.length} waiting for your decision${waitedDays(decidable) >= 1 ? ` (oldest ${waitedDays(decidable)} day${waitedDays(decidable) === 1 ? "" : "s"})` : ""}`, href: "/dashboard/approvals" }] : []),
    ...(c.members && n.pending_members ? [{ key: "members", label: `${n.pending_members} membership application${n.pending_members === 1 ? "" : "s"}`, href: "/dashboard/members?status=PENDING_APPROVAL" }] : []),
    ...(c.messages && n.new_messages ? [{ key: "messages", label: `${n.new_messages} new contact message${n.new_messages === 1 ? "" : "s"}`, href: "/dashboard/messages" }] : []),
    ...(c.recruitment && n.new_applications ? [{ key: "recruitment", label: `${n.new_applications} new recruitment application${n.new_applications === 1 ? "" : "s"}`, href: "/dashboard/recruitment" }] : []),
    ...(c.lostfound && n.pending_lostfound ? [{ key: "lostfound", label: `${n.pending_lostfound} lost & found post${n.pending_lostfound === 1 ? "" : "s"} to review`, href: "/dashboard/lost-found" }] : []),
    ...(c.reports && n.open_reports ? [{ key: "reports", label: `${n.open_reports} reported item${n.open_reports === 1 ? "" : "s"}`, href: "/dashboard/reports" }] : []),
  ];
  const overdue = Number(n.overdue ?? 0);
  if (overdue) attention.unshift({ key: "tasks", label: `${overdue} overdue task${overdue === 1 ? "" : "s"}`, href: "/dashboard/tasks" });
  const unread = Number(n.unread ?? 0);
  const recentActivity = can(ctx, "audit.read") ? (await activityFeed(ctx, { limit: 6 })).entries : [];

  return {
    account: (account.results?.[0] ?? null) as { status: string; correction_note: string | null } | null,
    attention,
    approvals,
    myWork: mine.results ?? [],
    myRequests: requests.results ?? [],
    expiring: expiring.results ?? [],
    upcoming: upcoming.results ?? [],
    myRegistrations: myRegs.results ?? [],
    campaign: campaign.results?.[0] ?? null,
    notifications: notes.results ?? [],
    tasks: tasks.results ?? [],
    meetings: meetings.results ?? [],
    recentActivity,
    unread,
    health: c.health
      ? { activeMembers: n.active_members ?? 0, newAccounts: n.new_accounts ?? 0, events30d: n.events_30d ?? 0, posts30d: n.posts_30d ?? 0, storageBytes: n.storage_bytes ?? 0 }
      : null,
    emailEnabled: await emailEnabled(ctx),
  };
}
