/**
 * Admin "views": one call per admin page returning everything it renders,
 * including what the viewer may do there. Pages stay thin (no SQL, no
 * permission logic in the frontend) and each page costs one API round trip.
 * Every view authorizes through the same services and engine as the actions.
 */
import { ensureProfileHandle } from "../services/profiles";
import { API_VERSION } from "../../version";
import { holdsProtectedRole } from "../../governance/engine";
import { PERMISSIONS, PERMISSIONS_V2, PERMISSIONS_V3, PERMISSIONS_V4 } from "../../governance/catalog";
import { mediaUrl, type MediaRow } from "../../public/shapes";
import { listingAvatarIdSql } from "../../public/queries";
import { authorize, can, eventResource, requireActor, requirePermission, scopesFor } from "../authz";
import type { Ctx } from "../context";
import { NotFoundError } from "../errors";
import { listAssignments, type CommitteeRow } from "../services/committees";
import { listContestsAdmin, myNotifications } from "../services/community";
import { getEventForEdit, listRegistrations, eventAgenda } from "../services/events";
import { listPermissions, listPolicies, listPositions, listRules } from "../services/governance";
import { getPostForEdit } from "../services/posts";
import { TRIGGER_EVENTS } from "../triggers";

const ALL_PERMISSION_KEYS = [...PERMISSIONS, ...PERMISSIONS_V2, ...PERMISSIONS_V3, ...PERMISSIONS_V4].map((p) => p.key).filter((k) => k !== "*");

/** Permissions that open some part of the admin. */
const ADMIN_ENTRY = ["events.read", "posts.read", "members.read", "media.upload", "approvals.read", "recruitment.manage", "messages.read", "executives.assign", "contests.manage", "forms.manage"];

const MEDIA_COLS = "id, storage, object_key, legacy_path, external_url, variants_json";
async function mediaRow(ctx: Ctx, id: string | null | undefined): Promise<MediaRow | null> {
  if (!id) return null;
  return ctx.db.first<MediaRow>(`SELECT ${MEDIA_COLS} FROM media WHERE id = ?1 AND deleted_at IS NULL`, id);
}

/**
 * Who is signed in and what they may use. `can` follows the engine: true
 * unless the decision is DENY (approval-routed actions show up so users can
 * submit them). The frontend uses this only to show or hide UI.
 */
export async function sessionMe(ctx: Ctx) {
  if (!ctx.actor) return null;
  const a = ctx.actor;
  const caps: Record<string, boolean> = {};
  for (const k of ALL_PERMISSION_KEYS) caps[k] = can(ctx, k);
  const active = a.user.status === "ACTIVE";
  const avatar = await ctx.db.first<MediaRow>(
    `SELECT m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json FROM profiles p JOIN media m ON m.id = p.avatar_media_id AND m.deleted_at IS NULL WHERE p.user_id = ?1 AND p.deleted_at IS NULL`,
    a.user.id);
  const counts = await ctx.db.first<{ unread: number; messages: number; tasks: number }>(
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read_at IS NULL) AS unread,
            (SELECT COUNT(*) FROM tasks WHERE assignee_user_id = ?1 AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS')) AS tasks,
            (SELECT COUNT(*) FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
              WHERE me.user_id = ?1 AND me.archived_at IS NULL AND me.muted = 0 AND c.last_message_at > COALESCE(me.last_read_at, '')) AS messages`, a.user.id);
  const unread = counts?.unread ?? 0;
  const positionNames = a.subject.positions.length
    ? await ctx.db.all<{ key: string; name: string }>(`SELECT key, name FROM positions WHERE key IN (SELECT value FROM json_each(?1))`, JSON.stringify(a.subject.positions.map((p) => p.key)))
    : [];
  return {
    user: { id: a.user.id, email: a.user.email, status: a.user.status },
    profile: a.profile ? { id: a.profile.id, name: a.profile.full_name, avatarUrl: mediaUrl(avatar, "thumb") ?? null } : null,
    roles: a.subject.roles,
    positions: a.subject.positions.map((p) => ({ key: p.key, name: positionNames.find((n) => n.key === p.key)?.name ?? p.key })),
    isModerator: holdsProtectedRole(a.subject),
    // Club management: a right beyond your own items. Members writing their own posts and events
    // use those pages without it.
    adminAccess: active && ADMIN_ENTRY.some((p) => caps[p] && scopesFor(ctx, p).some((g) => g.scope !== "OWN")),
    caps,
    /** Permissions held club-wide (not only for your own items or a category), for navigation. */
    wideCaps: Object.fromEntries(Object.keys(caps).filter((k) => caps[k] && scopesFor(ctx, k).some((g) => g.scope === "ALL")).map((k) => [k, true])) as Record<string, true>,
    unread,
    unreadMessages: counts?.messages ?? 0,
    openTasks: counts?.tasks ?? 0,
    security: { mfaEnabled: Boolean(a.security?.mfaEnabled), mfaRequired: Boolean(a.security?.mfaRequired), mfaDeadline: a.security?.mfaDeadline ?? null, mfaBlocked: Boolean(a.security?.mfaBlocked) },
    apiVersion: API_VERSION as string | null,
  };
}
export type SessionView = NonNullable<Awaited<ReturnType<typeof sessionMe>>>;

export async function committeeView(ctx: Ctx, id: string) {
  requirePermission(ctx, "committees.read");
  const c = await ctx.db.first<CommitteeRow & { layout_json: string | null }>("SELECT * FROM committees WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!c) throw new NotFoundError("Committee");
  const [assignments, positions, otherCommittees] = await Promise.all([
    listAssignments(ctx, id),
    listPositions(ctx),
    ctx.db.all<{ id: string; name: string; status: string }>("SELECT id, name, status FROM committees WHERE deleted_at IS NULL AND id <> ?1 ORDER BY CASE status WHEN 'UPCOMING' THEN 0 WHEN 'CURRENT' THEN 1 ELSE 2 END, slug DESC", id),
  ]);
  const accounts = await ctx.db.all<{ profile_id: string; email: string | null; has_password: number; invite_pending: number; avatar_id: string | null }>(
    `SELECT pr.id AS profile_id, u.email, (u.password_hash IS NOT NULL) AS has_password, pr.avatar_media_id AS avatar_id,
            EXISTS (SELECT 1 FROM auth_tokens t WHERE t.user_id = u.id AND t.purpose = 'INVITE' AND t.used_at IS NULL AND t.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS invite_pending
     FROM profiles pr LEFT JOIN users u ON u.id = pr.user_id WHERE pr.id IN (SELECT profile_id FROM committee_members WHERE committee_id = ?1 AND deleted_at IS NULL)`, id);
  const avatars = await ctx.db.all<MediaRow & { profile_id: string }>(
    `SELECT pr.id AS profile_id, m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json
     FROM committee_members cm JOIN committees co ON co.id = cm.committee_id JOIN profiles pr ON pr.id = cm.profile_id
     JOIN media m ON m.id = ${listingAvatarIdSql("cm", "pr")} AND m.deleted_at IS NULL
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL`, id);
  const removed = await ctx.db.all<{ id: string; name: string; position_title: string; deleted_at: string }>(
    `SELECT cm.id, COALESCE(cm.display_name, pr.full_name) AS name, cm.position_title, cm.deleted_at FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NOT NULL AND cm.deleted_at >= ?2 ORDER BY cm.deleted_at DESC LIMIT 100`, id, new Date(Date.now() - 30 * 86_400_000).toISOString());
  const layout = c.layout_json ? (JSON.parse(c.layout_json) as { sections?: string[]; units: Array<{ type: string; key: string; meta?: { name?: string } }> }) : { sections: [], units: [] };
  const flatAllowed = layout.units.length === 0 || (layout.sections ?? []).some((x) => x === "facultyMembers" || x === "studentExecutives");
  const units = [...layout.units.map((u) => ({ key: u.key, type: u.type, name: u.meta?.name ?? null }))];
  for (const a of assignments) if (a.unit_key && !units.some((u) => u.key === a.unit_key)) units.push({ key: a.unit_key, type: "CAMPUS", name: null });
  const resource = { type: "committee_member", committeeId: id };
  return {
    committee: c,
    assignments: assignments.map((a) => {
      const acc = accounts.find((x) => x.profile_id === a.profile_id);
      return {
        ...a,
        email: acc?.email ?? null,
        account: !a.user_id ? "none" : acc?.has_password ? "active" : acc?.invite_pending ? "invited" : "invite-expired",
        avatarUrl: mediaUrl(avatars.find((m) => m.profile_id === a.profile_id), "thumb") ?? null,
      };
    }),
    positions: positions.filter((p) => p.is_active).map((p) => ({ id: p.id, key: p.key, name: p.name, category: p.category, rank: p.rank, isProtected: Boolean(p.is_protected), maxHolders: p.max_holders, holders: p.holders, grants: p.grants.map((g) => ({ permission: g.permission, scope: g.scope, scopeValue: g.scope_value })) })),
    units,
    flatAllowed,
    otherCommittees,
    removed,
    caps: {
      assign: can(ctx, "executives.assign", resource),
      remove: can(ctx, "executives.remove", resource),
      edit: can(ctx, "committees.update", { type: "committee", committeeId: id }),
      editPeople: authorize(ctx, "executives.assign").outcome === "ALLOW" || authorize(ctx, "members.manage").outcome === "ALLOW",
      import: can(ctx, "executives.import"),
      isModerator: holdsProtectedRole(requireActor(ctx).subject),
    },
  };
}

/** The latest decision to send an item back, so its author sees why (and who). */
async function lastSentBack(ctx: Ctx, type: "post" | "event", id: string) {
  return ctx.db.first<{ comment: string | null; by: string | null; at: string }>(
    `SELECT COALESCE(r.resolution_note, (SELECT s.comment FROM approval_steps s WHERE s.request_id = r.id AND s.decision = 'REJECT' ORDER BY s.created_at DESC LIMIT 1)) AS comment,
            (SELECT p.full_name FROM approval_steps s JOIN profiles p ON p.user_id = s.actor_id WHERE s.request_id = r.id AND s.decision = 'REJECT' ORDER BY s.created_at DESC LIMIT 1) AS by,
            r.resolved_at AS at
     FROM approval_requests r WHERE r.resource_type = ?1 AND r.resource_id = ?2 AND r.status = 'REJECTED' ORDER BY r.resolved_at DESC LIMIT 1`, type, id);
}

export async function eventView(ctx: Ctx, id: string) {
  const data = await getEventForEdit(ctx, id);
  const banner = await mediaRow(ctx, data.event.banner_media_id as string | null);
  const registrations = data.capabilities.registrations ? await listRegistrations(ctx, id) : [];
  const gallery = await ctx.db.all<MediaRow & { alt_text: string | null; kind: string; media_type: string; original_filename: string | null; uploaded_by: string | null }>(
    `SELECT m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json, m.alt_text, em.kind, m.media_type, m.original_filename, m.uploaded_by
     FROM event_media em JOIN media m ON m.id = em.media_id AND m.deleted_at IS NULL WHERE em.event_id = ?1 AND em.kind <> 'BANNER' ORDER BY em.sort_order`, id);
  const resource = { ...(await eventResource(ctx.db, id))!, type: "event_media" };
  const people = await ctx.db.all<{ id: string; role: string; name: string; title: string | null; user_id: string | null; email: string | null }>(
    "SELECT ep.id, ep.role, ep.name, ep.title, ep.user_id, u.email FROM event_people ep LEFT JOIN users u ON u.id = ep.user_id WHERE ep.event_id = ?1 AND ep.role IN ('SPEAKER','COORDINATOR','PHOTOGRAPHER') ORDER BY ep.sort_order", id);
  return {
    ...data,
    people,
    bannerUrl: mediaUrl(banner) ?? null,
    registrations,
    // Event editors curate the whole gallery; others may remove only what they uploaded (as removeEventMedia checks).
    gallery: gallery.map((g) => ({ id: g.id, url: mediaUrl(g, "md") ?? null, thumb: mediaUrl(g, "thumb") ?? null, alt: g.alt_text, kind: g.kind, type: g.media_type, name: g.original_filename,
      canRemove: Boolean(data.capabilities.edit) || (g.uploaded_by !== null && g.uploaded_by === ctx.actor?.user.id) })),
    canUploadGallery: authorize(ctx, "media.upload", resource).outcome === "ALLOW",
    sentBack: String(data.event.status) === "REJECTED" ? await lastSentBack(ctx, "event", id) : null,
    agenda: await eventAgenda(ctx, id),
  };
}

export async function postView(ctx: Ctx, id: string) {
  const data = await getPostForEdit(ctx, id);
  const cover = await mediaRow(ctx, data.post.featured_media_id);
  return { ...data, coverUrl: mediaUrl(cover) ?? null, sentBack: data.post.status === "REJECTED" ? await lastSentBack(ctx, "post", id) : null };
}

/** All contests with their teams in two queries (was one query per contest). */
export async function contestsView(ctx: Ctx) {
  const contests = await listContestsAdmin(ctx);
  const [details, teams, events] = await Promise.all([
    ctx.db.all<Record<string, string | number | null>>("SELECT * FROM contests WHERE deleted_at IS NULL"),
    ctx.db.all<{ contest_id: string; name: string; members_json: string; rank: number | null; achievement: string | null }>(
      "SELECT t.contest_id, t.name, t.members_json, t.rank, t.achievement FROM contest_teams t JOIN contests c ON c.id = t.contest_id AND c.deleted_at IS NULL ORDER BY t.contest_id, t.sort_order"),
    ctx.db.all<{ id: string; title: string; start_at: string | null }>("SELECT id, title, start_at FROM events WHERE deleted_at IS NULL ORDER BY start_at DESC LIMIT 200"),
  ]);
  return {
    rows: contests.map((row) => ({
      contest: details.find((d) => d.id === row.id)!,
      teams: teams.filter((t) => t.contest_id === row.id).map((t) => ({ name: t.name, members: JSON.parse(t.members_json) as string[], rank: t.rank, achievement: t.achievement ?? "" })),
    })),
    events: events.map((e) => ({ id: e.id, label: `${e.title}${e.start_at ? ` (${e.start_at.slice(0, 10)})` : ""}` })),
  };
}

export async function rulesView(ctx: Ctx) {
  const [rules, permissions, policies, positions, roles] = await Promise.all([
    listRules(ctx), listPermissions(ctx), listPolicies(ctx),
    ctx.db.all<{ key: string; name: string }>("SELECT key, name FROM positions WHERE deleted_at IS NULL AND is_active = 1 ORDER BY rank, name"),
    ctx.db.all<{ key: string; name: string }>("SELECT key, name FROM roles WHERE deleted_at IS NULL ORDER BY rank, name"),
  ]);
  return {
    rules, permissions: permissions.map((p) => p.key), policies: policies.map((p) => ({ key: p.key, name: p.name })), isModerator: holdsProtectedRole(requireActor(ctx).subject),
    positions, roles, triggerEvents: Object.entries(TRIGGER_EVENTS) as Array<[string, string]>,
  };
}

export async function ruleView(ctx: Ctx, id: string) {
  const base = await rulesView(ctx);
  const rule = base.rules.find((x) => x.id === id);
  if (!rule) throw new NotFoundError("Rule");
  const history = await ctx.db.all<{ action: string; actor_label: string | null; created_at: string; reason: string | null }>(
    "SELECT action, actor_label, created_at, reason FROM audit_logs WHERE resource_type = 'rule' AND resource_id = ?1 ORDER BY created_at DESC LIMIT 20", id);
  return { ...base, rule, history, editable: can(ctx, "rules.update") && (!rule.is_protected || base.isModerator) };
}

export async function accountView(ctx: Ctx) {
  const actor = requireActor(ctx);
  const profile = await ctx.db.first<Record<string, string | null>>(
    `SELECT p.id, p.full_name, p.student_id, p.department, p.batch, p.bio, p.linkedin_url, p.github_url, p.facebook_url, p.website_url, p.twitter_url, p.public_email, p.skills_json, p.phone, p.avatar_media_id,
            p.visibility, p.slug AS handle,
            m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json
     FROM profiles p LEFT JOIN media m ON m.id = p.avatar_media_id AND m.deleted_at IS NULL WHERE p.user_id = ?1 AND p.deleted_at IS NULL`, actor.user.id);
  const { rows: notifications, unread } = await myNotifications(ctx, 20);
  const registrations = await ctx.db.all<{ id: string; status: string; created_at: string; title: string; slug: string; start_at: string | null; venue: string | null }>(
    `SELECT r.id, r.status, r.created_at, e.title, e.slug, e.start_at, e.venue FROM event_registrations r JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL
     WHERE r.user_id = ?1 ORDER BY e.start_at DESC LIMIT 20`, actor.user.id);
  const history = profile
    ? await ctx.db.all<{ committee_name: string; committee_slug: string; position_title: string; is_active: number }>(
        `SELECT c.name AS committee_name, c.slug AS committee_slug, cm.position_title, cm.is_active FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.deleted_at IS NULL
         WHERE cm.profile_id = ?1 AND cm.deleted_at IS NULL ORDER BY c.slug DESC`, profile.id)
    : [];
  const account = await ctx.db.first<{ status: string; correction_note: string | null; rejected_reason: string | null; suspended_reason: string | null; email_verified_at: string | null; created_at: string }>(
    "SELECT status, correction_note, rejected_reason, suspended_reason, email_verified_at, created_at FROM users WHERE id = ?1", actor.user.id);
  // An approved member's page address, made from their name the first time it's needed.
  if (profile && !profile.handle && account?.status === "ACTIVE") profile.handle = await ensureProfileHandle(ctx, String(profile.id), profile.full_name ?? "member");
  const avatarUrl = profile?.storage ? mediaUrl({ id: String(profile.avatar_media_id), storage: profile.storage as MediaRow["storage"], object_key: profile.object_key, legacy_path: profile.legacy_path, external_url: profile.external_url, variants_json: profile.variants_json }, "sm") ?? null : null;
  let publicProfile: Record<string, string | null> | null = null;
  if (profile) {
    const { storage: _s, object_key: _k, legacy_path: _l, external_url: _e, variants_json: _v, ...rest } = profile;
    publicProfile = rest;
  }
  return {
    profile: publicProfile,
    avatarUrl,
    account,
    notifications,
    unread,
    registrations,
    history,
  };
}

/** Existing categories, offered as suggestions in the event/post forms (new ones are created on save). */
export async function listCategories(ctx: Ctx, kind: string) {
  requireActor(ctx);
  const k = kind === "POST" ? "POST" : "EVENT";
  return ctx.db.all<{ slug: string; name: string; uses: number }>(
    `SELECT c.slug, c.name, (SELECT COUNT(*) FROM ${k === "POST" ? "posts" : "events"} x WHERE x.category_id = c.id AND x.deleted_at IS NULL) AS uses
     FROM categories c WHERE c.kind = ?1 ORDER BY uses DESC, c.name LIMIT 100`, k);
}
