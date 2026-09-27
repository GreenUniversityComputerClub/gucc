/**
 * Smaller domains: external forms, lost & found, certificates, contests,
 * notifications, the audit log and dashboard figures.
 */
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { authorize, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso } from "../db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getOrgSetting } from "../security";
import { notifyStmts, usersWithPermission } from "../notifications";
import { sendToPerson } from "./messaging";
import { toSlug, Validator } from "../validate";
import { TAGS } from "./cache-tags";

// ───────────────────────────── external forms ─────────────────────────────

export async function listForms(ctx: Ctx) {
  requirePermission(ctx, "forms.manage");
  return ctx.db.all<{ id: string; slug: string; title: string; url: string; status: string; updated_at: string }>(
    "SELECT id, slug, title, url, status, updated_at FROM external_forms WHERE deleted_at IS NULL ORDER BY title");
}

export async function saveForm(ctx: Ctx, id: string | null, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "forms.manage");
  const v = new Validator(input);
  const title = v.string("title", { required: true, max: 120, label: "Title" });
  const url = v.url("url", { required: true, label: "Form URL" });
  const slug = v.string("slug", { max: 80, label: "Slug", pattern: /^[a-z0-9-]+$/, patternMessage: "Use lowercase letters, digits and hyphens." }) ?? (title ? toSlug(title) : null);
  if (url) v.check(/^https:\/\/(docs\.google\.com\/forms|forms\.gle|forms\.office\.com|tally\.so|airtable\.com)\//.test(url), "url", "Only Google, Microsoft, Tally or Airtable forms can be embedded.");
  v.done();
  const now = nowIso();
  if (id) {
    await ctx.db.batch([
      ctx.db.stmt("UPDATE external_forms SET title = ?2, url = ?3, slug = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?1", id, title, url, slug, now, actor.user.id),
      auditStmt(ctx, { action: "form.update", resourceType: "form", resourceId: id, after: { title, url, slug }, decision }),
    ]);
  } else {
    if (await ctx.db.first("SELECT id FROM external_forms WHERE slug = ?1", slug)) throw new ConflictError("A form with this slug already exists.");
    id = newId("form");
    await ctx.db.batch([
      ctx.db.stmt("INSERT INTO external_forms (id, slug, title, url, created_at, created_by, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?5, ?6)", id, slug, title, url, now, actor.user.id),
      auditStmt(ctx, { action: "form.create", resourceType: "form", resourceId: id, after: { title, url, slug }, decision }),
    ]);
  }
  ctx.revalidate?.([TAGS.forms]);
  return { id };
}

export async function archiveForm(ctx: Ctx, id: string) {
  const decision = requirePermission(ctx, "forms.manage");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE external_forms SET status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: "form.archive", resourceType: "form", resourceId: id, decision }),
  ]);
  ctx.revalidate?.([TAGS.forms]);
}

export async function getPublicForm(ctx: Ctx, slug: string) {
  return ctx.db.first<{ slug: string; title: string; url: string }>("SELECT slug, title, url FROM external_forms WHERE slug = ?1 AND status = 'ACTIVE' AND deleted_at IS NULL", slug);
}

// ───────────────────────────── lost & found ─────────────────────────────

interface LostFoundConfig {
  categories: string[];
  locations: string[];
  allowedStudentDomains: string[];
  archiveResolvedDays?: number;
  archiveOpenDays?: number;
}

async function lfConfig(ctx: Ctx): Promise<LostFoundConfig> {
  return getOrgSetting<LostFoundConfig>(ctx, "lostfound.config", { categories: [], locations: [], allowedStudentDomains: ["@green.edu.bd", "@green.ac.bd", "@student.green.ac.bd"] });
}

/**
 * Posting needs an approved membership (approval is the identity check while email isn't
 * verified) and a university email address.
 */
async function assertUniversityEmail(ctx: Ctx) {
  const actor = requireActor(ctx);
  if (actor.user.status !== "ACTIVE") throw new ForbiddenError("Lost & found posting opens once your membership is approved.");
  const cfg = await lfConfig(ctx);
  if (!cfg.allowedStudentDomains.some((d) => actor.user.email.toLowerCase().endsWith(d))) {
    throw new ForbiddenError("Only accounts with a university email address can post or message.");
  }
}

export async function listLostFound(ctx: Ctx, opts: { status?: string; type?: string; category?: string; q?: string; location?: string; mine?: boolean }) {
  const moderator = ctx.actor ? authorize(ctx, "lostfound.moderate").outcome === "ALLOW" : false;
  const mine = Boolean(opts.mine && ctx.actor);
  const status = mine ? "all" : opts.status && opts.status !== "active" ? opts.status : "active";
  // Only moderators see others' pending/rejected posts; owners see all of their own.
  if (!moderator && !mine && !["active", "resolved"].includes(status)) throw new ForbiddenError("Only moderators can view unreviewed posts.");
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "").slice(0, 60)}%` : null;
  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT lf.id, lf.user_id, lf.type, lf.title, lf.category, lf.description, lf.location, lf.occurred_at, lf.contact_method, lf.contact_value, lf.status, lf.created_at,
            lf.reject_reason, lf.resolved_at,
            COALESCE(lf.image_url, CASE WHEN m.storage = 'R2' THEN '/media/' || m.object_key END) AS image_url
     FROM lost_found_posts lf LEFT JOIN media m ON m.id = lf.image_media_id
     WHERE lf.deleted_at IS NULL AND (lf.archived_at IS NULL OR ?6 = 1) AND (?1 = 'all' OR lf.status = ?1) AND (?2 IS NULL OR lf.type = ?2) AND (?3 IS NULL OR lf.category = ?3)
       AND (?4 IS NULL OR lf.title LIKE ?4 OR lf.description LIKE ?4) AND (?5 IS NULL OR lf.location = ?5) AND (?7 IS NULL OR lf.user_id = ?7)
     ORDER BY lf.created_at DESC LIMIT 100`,
    moderator && opts.status === "all" ? "all" : status, opts.type ?? null, opts.category ?? null, q, opts.location ?? null, mine ? 1 : 0, mine ? ctx.actor!.user.id : null,
  );
  // Contact details only go to approved members; never to visitors or applicants.
  const member = ctx.actor?.user.status === "ACTIVE";
  return rows.map((r) => ({ ...r, contact_value: member ? r.contact_value : null, is_owner: ctx.actor?.user.id === r.user_id, reject_reason: ctx.actor?.user.id === r.user_id || moderator ? r.reject_reason : null, user_id: undefined }));
}

export async function createLostFound(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  await assertUniversityEmail(ctx);
  await limit(ctx, "lostfound.post", actor.user.id);
  const cfg = await lfConfig(ctx);
  const v = new Validator(input);
  const d = {
    type: v.oneOf("type", ["lost", "found"] as const, { required: true, label: "Type" }),
    title: v.string("title", { required: true, min: 3, max: 120, label: "Title" }),
    category: v.oneOf("category", (cfg.categories.length ? cfg.categories : ["Other"]) as readonly string[], { required: true, label: "Category" }),
    description: v.string("description", { required: true, min: 5, max: 2000, label: "Description" }),
    location: v.string("location", { required: true, max: 120, label: "Location" }),
    occurredAt: v.datetime("occurred_at", { required: true, label: "Date" }),
    contactMethod: v.oneOf("contact_method", ["email", "phone", "in_app"] as const, { required: true, label: "Contact method" }),
    contactValue: v.string("contact_value", { max: 120, label: "Contact" }),
    imageMediaId: v.string("imageMediaId", { max: 80 }),
  };
  if (d.contactMethod && d.contactMethod !== "in_app") v.check(Boolean(d.contactValue), "contact_value", "Add how people can reach you.");
  v.done();
  const id = newId("lf");
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO lost_found_posts (id, user_id, type, title, category, description, location, occurred_at, image_media_id, contact_method, contact_value, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', ?12, ?12)`,
      id, actor.user.id, d.type, d.title, d.category, d.description, d.location, d.occurredAt, d.imageMediaId, d.contactMethod, d.contactMethod === "in_app" ? null : d.contactValue, nowIso(),
    ),
    ...(d.imageMediaId ? [ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'lost_found', ?2, 'image') ON CONFLICT DO NOTHING", d.imageMediaId, id)] : []),
    auditStmt(ctx, { action: "lostfound.create", resourceType: "lost_found", resourceId: id, after: { type: d.type, title: d.title } }),
  ]);
  return { id };
}

export async function setLostFoundStatus(ctx: Ctx, id: string, status: "pending" | "active" | "resolved" | "rejected", reason?: string | null) {
  const actor = requireActor(ctx);
  const post = await ctx.db.first<{ user_id: string; status: string; title: string }>("SELECT user_id, status, title FROM lost_found_posts WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!post) throw new NotFoundError("Post");
  const moderator = authorize(ctx, "lostfound.moderate").outcome === "ALLOW";
  // Owners may only mark their own post resolved; review states belong to moderators.
  if (!moderator && !(post.user_id === actor.user.id && status === "resolved")) throw new ForbiddenError("Only moderators can change the review status.");
  const note = reason?.trim().slice(0, 300) || null;
  if (status === "rejected" && !note) throw new ValidationError("Say why, so the author can fix it.", { reason: "Give a reason." });
  const now = nowIso();
  const told = post.user_id !== actor.user.id && (status === "active" || status === "rejected");
  await ctx.db.batch([
    ctx.db.stmt(
      "UPDATE lost_found_posts SET status = ?2, updated_at = ?3, reject_reason = CASE WHEN ?2 = 'rejected' THEN ?4 ELSE NULL END, resolved_at = CASE WHEN ?2 = 'resolved' THEN ?3 ELSE resolved_at END WHERE id = ?1",
      id, status, now, note),
    auditStmt(ctx, { action: "lostfound.status", resourceType: "lost_found", resourceId: id, before: { status: post.status }, after: { status }, reason: note }),
    ...(told ? notifyStmts(ctx, [post.user_id], {
      type: `lostfound.${status}`,
      title: status === "active" ? `Your lost & found post is live: ${post.title}` : `Your lost & found post needs changes: ${post.title}`,
      body: note ?? undefined,
      link: "/lost-found",
    }) : []),
  ]);
}

/** Moderators remove a photo that shows something it shouldn't (an ID number, a face). */
export async function removeLostFoundImage(ctx: Ctx, id: string) {
  requirePermission(ctx, "lostfound.moderate");
  const post = await ctx.db.first<{ user_id: string; title: string }>("SELECT user_id, title FROM lost_found_posts WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!post) throw new NotFoundError("Post");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE lost_found_posts SET image_media_id = NULL, image_url = NULL, updated_at = ?2 WHERE id = ?1", id, nowIso()),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'lost_found' AND resource_id = ?1", id),
    auditStmt(ctx, { action: "lostfound.image_removed", resourceType: "lost_found", resourceId: id }),
    ...notifyStmts(ctx, [post.user_id], { type: "lostfound.image_removed", title: `A moderator removed the photo from your post: ${post.title}`, body: "Photos mustn't show ID numbers or other private details.", link: "/lost-found" }),
  ]);
}

/** Report a lost & found post to the moderators. */
export async function reportLostFound(ctx: Ctx, id: string, reasonRaw: unknown) {
  const actor = requireActor(ctx);
  const reason = String(reasonRaw ?? "").trim().slice(0, 500);
  if (reason.length < 3) throw new ValidationError("Say briefly what's wrong.", { reason: "Give a reason." });
  if (!(await ctx.db.first("SELECT 1 FROM lost_found_posts WHERE id = ?1 AND deleted_at IS NULL", id))) throw new NotFoundError("Post");
  await limit(ctx, "report", actor.user.id);
  const moderators = await usersWithPermission(ctx, "lostfound.moderate");
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO reports (id, resource_type, resource_id, reporter_id, reason, created_at) VALUES (?1, 'lost_found_post', ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING",
      newId("rep"), id, actor.user.id, reason, nowIso()),
    auditStmt(ctx, { action: "lostfound.report", resourceType: "lost_found", resourceId: id, reason }),
    ...notifyStmts(ctx, moderators, { type: "report.new", title: "A lost & found post was reported", body: reason.slice(0, 140), link: "/dashboard/reports" }),
  ]);
}

export async function deleteLostFound(ctx: Ctx, id: string) {
  const actor = requireActor(ctx);
  const post = await ctx.db.first<{ user_id: string }>("SELECT user_id FROM lost_found_posts WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!post) throw new NotFoundError("Post");
  if (post.user_id !== actor.user.id && authorize(ctx, "lostfound.moderate").outcome !== "ALLOW") throw new ForbiddenError("You can only remove your own posts.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE lost_found_posts SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1", id, nowIso()),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'lost_found' AND resource_id = ?1", id),
    auditStmt(ctx, { action: "lostfound.delete", resourceType: "lost_found", resourceId: id }),
  ]);
}

/**
 * "Message the owner": starts (or continues) a conversation in Messages, with the post attached
 * so both people know what it's about.
 */
export async function messageLostFound(ctx: Ctx, postId: string, body: string) {
  await assertUniversityEmail(ctx);
  const post = await ctx.db.first<{ status: string; contact_method: string; user_id: string }>("SELECT status, contact_method, user_id FROM lost_found_posts WHERE id = ?1 AND deleted_at IS NULL", postId);
  if (!post) throw new NotFoundError("Post");
  if (post.status !== "active") throw new AppError(409, "INACTIVE", "This post is not active.");
  if (post.contact_method !== "in_app") throw new AppError(409, "NO_MESSAGES", "This post does not accept in-app messages.");
  if (post.user_id === ctx.actor?.user.id) throw new ValidationError("You cannot message your own post.");
  const { conversationId } = await sendToPerson(ctx, { userId: post.user_id, body, contextType: "lost_found_post", contextId: postId });
  return { id: conversationId, conversationId };
}

/** Conversations about my lost & found posts (they live in Messages). */
export async function lostFoundInbox(ctx: Ctx) {
  const actor = requireActor(ctx);
  return ctx.db.all<{ id: string; body: string; created_at: string; sender_email: string; post_id: string; post_title: string; conversation_id: string }>(
    `SELECT m.id, m.body, m.created_at, COALESCE(pr.full_name, u.email) AS sender_email, p.id AS post_id, p.title AS post_title, m.conversation_id
     FROM messages m JOIN lost_found_posts p ON p.id = m.context_id AND m.context_type = 'lost_found_post'
     JOIN users u ON u.id = m.sender_id LEFT JOIN profiles pr ON pr.user_id = u.id
     WHERE p.user_id = ?1 AND m.sender_id <> ?1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 100`, actor.user.id);
}

// ───────────────────────────── certificates ─────────────────────────────

/**
 * Verify a HackTheAI participant. Both the team name and a member's email
 * must match; only public certificate fields are returned — never emails or
 * phone numbers (those used to ship to every browser in a JSON bundle).
 */
export async function verifyCertificate(ctx: Ctx, programKey: string, teamName: string, email: string) {
  await limit(ctx, "certificates.verify", ctx.meta.ipHash ?? "unknown");
  const team = String(teamName ?? "").trim().toLowerCase();
  const mail = String(email ?? "").trim().toLowerCase();
  if (!team || !mail) return null;
  const hit = await ctx.db.first<{ program_id: string; team_name: string }>(
    `SELECT r.program_id, r.team_name FROM certificate_recipients r JOIN certificate_programs p ON p.id = r.program_id
     WHERE p.key = ?1 AND lower(trim(r.team_name)) = ?2 AND r.email = ?3 LIMIT 1`, programKey, team, mail);
  if (!hit) return null;
  const members = await ctx.db.all<{ full_name: string; gender: string | null; institution: string | null; email: string | null }>(
    "SELECT full_name, gender, institution, email FROM certificate_recipients WHERE program_id = ?1 AND team_name = ?2 ORDER BY member_index", hit.program_id, hit.team_name);
  const mask = (e: string | null) => {
    if (!e) return "";
    const [user, domain] = e.split("@");
    return `${user.slice(0, 2)}•••@${domain ?? ""}`;
  };
  return {
    teamName: hit.team_name,
    university: members[0]?.institution ?? "",
    members: members.map((m) => ({ fullName: m.full_name, gender: m.gender ?? "", email: mask(m.email), verified: m.email === mail })),
  };
}

// ───────────────────────────── contests ─────────────────────────────

export async function listContestsAdmin(ctx: Ctx) {
  requirePermission(ctx, "contests.manage");
  return ctx.db.all<{ id: string; legacy_id: number; type: string; title: string; held_on_text: string | null; status: string; teams: number }>(
    `SELECT c.id, c.legacy_id, c.type, c.title, c.held_on_text, c.status, (SELECT COUNT(*) FROM contest_teams t WHERE t.contest_id = c.id) AS teams
     FROM contests c WHERE c.deleted_at IS NULL ORDER BY c.legacy_id DESC`);
}

export async function saveContest(ctx: Ctx, id: string | null, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "contests.manage");
  const v = new Validator(input);
  const d = {
    type: v.string("type", { required: true, max: 20, label: "Type" }),
    title: v.string("title", { required: true, max: 200, label: "Title" }),
    heldOnText: v.string("heldOnText", { max: 40, label: "Date" }),
    host: v.string("host", { max: 200, label: "Host" }),
    platform: v.string("platform", { max: 60, label: "Platform" }),
    contestLink: v.url("contestLink", { label: "Contest link" }),
    standingsLink: v.url("standingsLink", { label: "Standings link" }),
    problemsetLink: v.url("problemsetLink", { label: "Problem set link" }),
    editorialLink: v.url("editorialLink", { label: "Editorial link" }),
    practiceLink: v.url("practiceLink", { label: "Practice link" }),
    status: v.oneOf("status", ["DRAFT", "PUBLISHED", "ARCHIVED"] as const, { label: "Status" }) ?? "PUBLISHED",
    eventId: v.string("eventId", { max: 80, label: "Event" }),
  };
  let teams: Array<{ name: string; members: string[]; rank: number | null; achievement?: string }> = [];
  try {
    teams = JSON.parse(String(input.teams ?? "[]"));
    v.check(Array.isArray(teams) && teams.every((t) => typeof t.name === "string" && Array.isArray(t.members)), "teams", "Teams must be a list of {name, members[], rank}.");
  } catch {
    v.errors.teams = "Teams must be valid JSON.";
  }
  v.done();
  if (d.eventId && !(await ctx.db.first("SELECT id FROM events WHERE id = ?1 AND deleted_at IS NULL", d.eventId))) throw new ValidationError("That event doesn't exist.", { eventId: "Choose an existing event." });
  const now = nowIso();
  const contestId = id ?? newId("contest");
  const legacyId = id ? null : ((await ctx.db.value<number>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM contests")) ?? 1);
  await ctx.db.batch([
    id
      ? ctx.db.stmt(
          `UPDATE contests SET type = ?2, title = ?3, held_on_text = ?4, host = ?5, platform = ?6, contest_link = ?7, standings_link = ?8, problemset_link = ?9, editorial_link = ?10,
                  practice_link = ?13, status = ?14, event_id = ?15, updated_at = ?11, updated_by = ?12 WHERE id = ?1`,
          id, d.type, d.title, d.heldOnText, d.host, d.platform, d.contestLink, d.standingsLink, d.problemsetLink, d.editorialLink, now, actor.user.id, d.practiceLink, d.status, d.eventId)
      : ctx.db.stmt(
          `INSERT INTO contests (id, legacy_id, type, title, held_on_text, host, platform, contest_link, standings_link, problemset_link, editorial_link, practice_link, status, event_id, created_at, updated_at, updated_by)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?14, ?15, ?16, ?12, ?12, ?13)`,
          contestId, legacyId, d.type, d.title, d.heldOnText, d.host, d.platform, d.contestLink, d.standingsLink, d.problemsetLink, d.editorialLink, now, actor.user.id, d.practiceLink, d.status, d.eventId),
    ctx.db.stmt("DELETE FROM contest_teams WHERE contest_id = ?1", contestId),
    ...(teams.length
      ? [ctx.db.stmt(
          `INSERT INTO contest_teams (id, contest_id, name, rank, achievement, members_json, sort_order)
           SELECT 'ct_' || lower(hex(randomblob(16))), ?1, json_extract(j.value, '$.name'), json_extract(j.value, '$.rank'), json_extract(j.value, '$.achievement'),
                  json(json_extract(j.value, '$.members')), CAST(j.key AS INTEGER) FROM json_each(?2) AS j`,
          contestId, JSON.stringify(teams.map((t) => ({ name: t.name.slice(0, 120), rank: t.rank ?? null, achievement: t.achievement ?? null, members: t.members.map((m) => String(m).slice(0, 100)) })))),
        ]
      : []),
    auditStmt(ctx, { action: id ? "contest.update" : "contest.create", resourceType: "contest", resourceId: contestId, after: { ...d, teams: teams.length }, decision }),
  ]);
  ctx.revalidate?.([TAGS.contests]);
  return { id: contestId };
}

// ───────────────────────────── notifications ─────────────────────────────

/** Newest first. `before` is the created_at of the last row already shown (keyset paging). */
export async function myNotifications(ctx: Ctx, limit = 30, opts: { unreadOnly?: boolean; before?: string | null } = {}) {
  const actor = requireActor(ctx);
  const before = opts.before && /^\d{4}-\d{2}-\d{2}T/.test(opts.before) ? opts.before : null;
  const rows = await ctx.db.all<{ id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }>(
    `SELECT id, type, title, body, link, read_at, created_at FROM notifications
     WHERE user_id = ?1 AND (?3 = 0 OR read_at IS NULL) AND (?4 IS NULL OR created_at < ?4)
     ORDER BY created_at DESC LIMIT ?2`, actor.user.id, limit + 1, opts.unreadOnly ? 1 : 0, before);
  const unread = (await ctx.db.value<number>("SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read_at IS NULL", actor.user.id)) ?? 0;
  const more = rows.length > limit;
  return { rows: rows.slice(0, limit), unread, next: more ? rows[limit - 1]!.created_at : null };
}

export async function markNotificationsRead(ctx: Ctx, ids: string[] | "all") {
  const actor = requireActor(ctx);
  const now = nowIso();
  if (ids === "all") await ctx.db.run("UPDATE notifications SET read_at = ?2 WHERE user_id = ?1 AND read_at IS NULL", actor.user.id, now);
  else await ctx.db.run("UPDATE notifications SET read_at = ?3 WHERE user_id = ?2 AND read_at IS NULL AND id IN (SELECT value FROM json_each(?1))", JSON.stringify(ids.slice(0, 100)), actor.user.id, now);
}

/** Only paths on this site: a notification never sends anyone elsewhere. */
export function safeNotificationLink(link: string | null | undefined): string {
  return link && link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") && link.length <= 500 ? link : "/dashboard/notifications";
}

/** Opening a notification marks it read and returns where it points (your own notifications only). */
export async function openNotification(ctx: Ctx, id: string, markRead = true): Promise<{ link: string }> {
  const actor = requireActor(ctx);
  const row = markRead
    ? await ctx.db.first<{ link: string | null }>("UPDATE notifications SET read_at = COALESCE(read_at, ?3) WHERE id = ?1 AND user_id = ?2 RETURNING link", id, actor.user.id, nowIso())
    : await ctx.db.first<{ link: string | null }>("SELECT link FROM notifications WHERE id = ?1 AND user_id = ?2", id, actor.user.id);
  return { link: safeNotificationLink(row?.link) };
}

export async function broadcast(ctx: Ctx, input: { title: string; body: string; link?: string; audience: "members" | "executives" }) {
  const decision = requirePermission(ctx, "notifications.send");
  const v = new Validator(input as unknown as Record<string, unknown>);
  const title = v.string("title", { required: true, max: 120, label: "Title" });
  const body = v.string("body", { required: true, max: 1000, label: "Message" });
  v.done();
  const sql = input.audience === "executives"
    ? `SELECT DISTINCT pr.user_id AS id FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' JOIN users u ON u.id = pr.user_id AND u.status = 'ACTIVE' WHERE cm.is_active = 1 AND cm.deleted_at IS NULL`
    : "SELECT id FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL";
  // One statement for every recipient: D1 counts statements per Worker invocation.
  const recipients = await ctx.db.run(
    `INSERT INTO notifications (id, user_id, type, title, body, link, channel, created_at)
     SELECT 'ntf_' || lower(hex(randomblob(16))), a.id, 'broadcast', ?1, ?2, ?3, 'IN_APP', ?4 FROM (${sql}) AS a`,
    title, body, input.link ?? null, nowIso());
  await auditStmt(ctx, { action: "notification.broadcast", after: { title, audience: input.audience, recipients }, decision }).run();
  return { sent: recipients };
}

// ───────────────────────────── audit & dashboard ─────────────────────────────

export async function listAudit(ctx: Ctx, opts: { actor?: string; action?: string; resource?: string; from?: string; to?: string; page?: number }) {
  requirePermission(ctx, "audit.read");
  const page = Math.max(1, opts.page ?? 1);
  return ctx.db.all<{ id: string; actor_label: string | null; action: string; resource_type: string | null; resource_id: string | null; reason: string | null; request_id: string | null; created_at: string; before_json: string | null; after_json: string | null; decision_json: string | null }>(
    `SELECT id, actor_label, action, resource_type, resource_id, reason, request_id, created_at, before_json, after_json, decision_json FROM audit_logs
     WHERE (?1 IS NULL OR actor_label LIKE ?1) AND (?2 IS NULL OR action LIKE ?2) AND (?3 IS NULL OR resource_type = ?3 OR resource_id = ?3)
       AND (?4 IS NULL OR created_at >= ?4) AND (?5 IS NULL OR created_at <= ?5)
     ORDER BY created_at DESC LIMIT 50 OFFSET ?6`,
    opts.actor ? `%${opts.actor}%` : null, opts.action ? `${opts.action}%` : null, opts.resource ?? null, opts.from ?? null, opts.to ? `${opts.to}T23:59:59Z` : null, (page - 1) * 50,
  );
}

export async function dashboardStats(ctx: Ctx) {
  const actor = requireActor(ctx);
  const can = (p: string) => authorize(ctx, p).outcome !== "DENY";
  const row = await ctx.db.first<Record<string, number | string | null>>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) AS pending_members,
       (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL) AS active_members,
       (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND status NOT IN ('REGISTERED','ARCHIVED')) AS total_members,
       (SELECT COUNT(*) FROM users WHERE status = 'SUSPENDED' AND deleted_at IS NULL) AS suspended_members,
       (SELECT COUNT(*) FROM users WHERE status = 'EMAIL_VERIFICATION_PENDING' AND deleted_at IS NULL) AS unverified_members,
       (SELECT COUNT(DISTINCT cm.position_id) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' WHERE cm.deleted_at IS NULL AND cm.is_active = 1) AS active_positions,
       (SELECT COUNT(*) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' WHERE cm.deleted_at IS NULL) AS committee_size,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'ONGOING') AS ongoing_events,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'COMPLETED') AS completed_events,
       (SELECT COUNT(*) FROM event_registrations WHERE status IN ('REGISTERED','ATTENDED')) AS total_registrations,
       (SELECT COUNT(*) FROM posts WHERE status = 'PUBLISHED' AND deleted_at IS NULL) AS published_posts,
       (SELECT COUNT(*) FROM recruitment_campaigns WHERE status = 'OPEN') AS open_campaigns,
       (SELECT COUNT(*) FROM recruitment_applications a JOIN recruitment_campaigns c ON c.id = a.campaign_id AND c.status = 'OPEN') AS campaign_applications,
       (SELECT COUNT(*) FROM recruitment_applications a JOIN recruitment_campaigns c ON c.id = a.campaign_id AND c.status = 'OPEN' WHERE a.status = 'SUBMITTED') AS pending_reviews,
       (SELECT COUNT(*) FROM approval_requests WHERE status = 'PENDING') AS pending_approvals,
       (SELECT name FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL) AS current_committee,
       (SELECT COUNT(*) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' WHERE cm.deleted_at IS NULL AND cm.is_active = 1) AS active_executives,
       (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status IN ('PUBLISHED','ONGOING') AND start_at >= date('now')) AS upcoming_events,
       (SELECT COUNT(*) FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.start_at >= date('now') AND r.status = 'REGISTERED') AS upcoming_registrations,
       (SELECT COUNT(*) FROM posts WHERE status = 'DRAFT' AND deleted_at IS NULL) AS drafts,
       (SELECT COUNT(*) FROM posts WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) AS pending_posts,
       (SELECT COUNT(*) FROM events WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) AS pending_events,
       (SELECT COUNT(*) FROM media WHERE deleted_at IS NULL) AS media_files,
       (SELECT COALESCE(SUM(size_bytes), 0) FROM media WHERE deleted_at IS NULL AND storage = 'R2') AS r2_bytes,
       (SELECT COUNT(*) FROM media WHERE deleted_at IS NULL AND storage = 'STATIC') AS static_media,
       (SELECT COUNT(*) FROM rules WHERE status = 'ACTIVE' AND deleted_at IS NULL) AS active_rules`,
  );
  const recent = can("audit.read")
    ? await ctx.db.all<{ action: string; actor_label: string | null; created_at: string; resource_type: string | null }>("SELECT action, actor_label, created_at, resource_type FROM audit_logs ORDER BY created_at DESC LIMIT 10")
    : [];
  const myApprovals = await ctx.db.all<{ id: string; title: string | null; created_at: string }>(
    "SELECT id, title, created_at FROM approval_requests WHERE status = 'PENDING' AND requested_by = ?1 ORDER BY created_at DESC LIMIT 5", actor.user.id);
  return { stats: row ?? {}, recent, myApprovals };
}

/** Sign-in activity (successful and failed logins, lockouts, resets) for security review. */
export async function listAuthEvents(ctx: Ctx, opts: { q?: string; event?: string; page?: number }) {
  requirePermission(ctx, "audit.read");
  const page = Math.max(1, Number(opts.page) || 1);
  return ctx.db.all<{ id: string; email: string | null; event: string; detail: string | null; ip_hash: string | null; user_agent: string | null; created_at: string }>(
    `SELECT id, email, event, detail, substr(ip_hash, 1, 10) AS ip_hash, user_agent, created_at FROM authentication_events
     WHERE (?1 IS NULL OR email LIKE ?1) AND (?2 IS NULL OR event = ?2) ORDER BY created_at DESC LIMIT 50 OFFSET ?3`,
    opts.q ? `%${String(opts.q).replace(/[%_]/g, "").slice(0, 80)}%` : null, opts.event || null, (page - 1) * 50);
}
