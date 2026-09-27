/**
 * People: the organisational identities (profiles) behind executive listings,
 * members and authors — separate from login accounts (users).
 *
 * Administrators with executives.assign or members.manage search and edit
 * profiles (photo, bio, links, faculty designation) and invite executives who
 * have no account yet. An invitation creates a password-less account already
 * linked to the profile; accepting it sets a password and activates the
 * account, so the position's permissions apply from the first sign-in.
 */
import { batchTransition, staleAnswer, unchangedSince } from "../transition";
import { limit } from "../limits";
import { assertNotSelf } from "../../governance/invariants";
import { holdsProtectedRole } from "../../governance/engine";
import { auditStmt } from "../audit";
import { authorize, requireActor } from "../authz";
import type { Ctx } from "../context";
import { randomToken, sha256Hex } from "../crypto";
import { newId, nowIso } from "../db";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { deliverEmail, requireRecentAuth } from "../security";
import { STUDENT_ID_RE, Validator } from "../validate";

const INVITE_DAYS = 14;

/** Editing people needs one of these, club-wide. */
function requirePeopleAccess(ctx: Ctx) {
  const assign = authorize(ctx, "executives.assign");
  if (assign.outcome === "ALLOW") return assign;
  const manage = authorize(ctx, "members.manage");
  if (manage.outcome === "ALLOW") return manage;
  throw new ForbiddenError("You cannot manage people's profiles.", assign);
}

export interface PersonRow {
  id: string;
  full_name: string;
  student_id: string | null;
  person_type: string;
  designation: string | null;
  department: string | null;
  user_id: string | null;
  email: string | null;
  account_status: string | null;
  avatar_media_id: string | null;
  avatar_key: string | null;
  avatar_legacy: string | null;
  roles_held: string | null;
  invite_pending: number;
}

const PERSON_SELECT = `
  SELECT pr.id, pr.full_name, pr.student_id, pr.person_type, pr.designation, pr.department, pr.user_id, u.email, u.status AS account_status,
         pr.avatar_media_id, m.object_key AS avatar_key, m.legacy_path AS avatar_legacy,
         (SELECT group_concat(DISTINCT cm.position_title) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
            WHERE cm.profile_id = pr.id AND cm.deleted_at IS NULL AND cm.is_active = 1) AS roles_held,
         EXISTS (SELECT 1 FROM auth_tokens t WHERE t.user_id = pr.user_id AND t.purpose = 'INVITE' AND t.used_at IS NULL AND t.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS invite_pending
  FROM profiles pr
  LEFT JOIN users u ON u.id = pr.user_id AND u.deleted_at IS NULL
  LEFT JOIN media m ON m.id = pr.avatar_media_id AND m.deleted_at IS NULL`;

/** Search by name, student ID or account email. Used by every person picker in the admin. */
export async function searchPeople(ctx: Ctx, input: { q?: string; withAccount?: boolean; limit?: number }) {
  const actor = requireActor(ctx);
  const ok = ["executives.read", "members.read", "executives.assign", "members.manage", "events.update", "tasks.assign", "meetings.schedule"].some((p) => authorize(ctx, p).outcome !== "DENY");
  if (!ok || actor.user.status !== "ACTIVE") throw new ForbiddenError("You cannot search people.");
  // Account emails are for people who manage members; everyone else finds people by name or student ID.
  const seeEmail = ["members.read", "members.manage", "executives.assign"].some((p) => authorize(ctx, p).outcome !== "DENY");
  const q = String(input.q ?? "").trim().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const rows = await ctx.db.all<PersonRow>(
    `${PERSON_SELECT}
     WHERE pr.deleted_at IS NULL AND (pr.full_name LIKE ?1 OR pr.student_id LIKE ?1 OR (?5 = 1 AND u.email LIKE ?1)) AND (?2 = 0 OR pr.user_id IS NOT NULL)
     ORDER BY (pr.user_id IS NULL), (pr.full_name LIKE ?3) DESC, pr.full_name LIMIT ?4`,
    like, input.withAccount ? 1 : 0, `${q}%`, Math.min(Math.max(Number(input.limit) || 12, 1), 30), seeEmail ? 1 : 0,
  );
  return seeEmail ? rows : rows.map((r) => ({ ...r, email: null }));
}

export async function listPeople(ctx: Ctx, input: { q?: string; filter?: string; page?: number }) {
  requirePeopleAccess(ctx);
  const page = Math.max(1, Number(input.page) || 1);
  const q = input.q ? `%${String(input.q).replace(/[%_]/g, "").slice(0, 60)}%` : null;
  const filter = ["executives", "faculty", "accounts", "no-account", "invited"].includes(String(input.filter)) ? String(input.filter) : "";
  const rows = await ctx.db.all<PersonRow>(
    `SELECT * FROM (${PERSON_SELECT} WHERE pr.deleted_at IS NULL AND (?1 IS NULL OR pr.full_name LIKE ?1 OR pr.student_id LIKE ?1 OR u.email LIKE ?1)) x
     WHERE (?2 = '' OR (?2 = 'executives' AND x.roles_held IS NOT NULL) OR (?2 = 'faculty' AND x.person_type = 'FACULTY')
            OR (?2 = 'accounts' AND x.user_id IS NOT NULL) OR (?2 = 'no-account' AND x.user_id IS NULL) OR (?2 = 'invited' AND x.invite_pending = 1))
     ORDER BY (x.roles_held IS NULL), x.full_name LIMIT 40 OFFSET ?3`,
    q, filter, (page - 1) * 40,
  );
  return { rows, page, hasMore: rows.length === 40 };
}

export async function getPerson(ctx: Ctx, id: string) {
  requirePeopleAccess(ctx);
  const p = await ctx.db.first<Record<string, unknown>>(
    `SELECT pr.id, pr.full_name, pr.slug, pr.person_type, pr.student_id, pr.department, pr.batch, pr.designation, pr.bio, pr.avatar_media_id,
            pr.public_email, pr.linkedin_url, pr.github_url, pr.twitter_url, pr.facebook_url, pr.website_url, pr.user_id, pr.updated_at,
            u.email, u.status AS account_status, u.last_login_at,
            m.storage AS avatar_storage, m.object_key AS avatar_object_key, m.legacy_path AS avatar_legacy_path, m.external_url AS avatar_external_url,
            EXISTS (SELECT 1 FROM auth_tokens t WHERE t.user_id = pr.user_id AND t.purpose = 'INVITE' AND t.used_at IS NULL AND t.expires_at > ?2) AS invite_pending
     FROM profiles pr LEFT JOIN users u ON u.id = pr.user_id LEFT JOIN media m ON m.id = pr.avatar_media_id AND m.deleted_at IS NULL
     WHERE pr.id = ?1 AND pr.deleted_at IS NULL`,
    id, nowIso(),
  );
  if (!p) throw new NotFoundError("Person");
  const history = await ctx.db.all<{ id: string; committee_id: string; committee_name: string; committee_slug: string; committee_status: string; position_title: string; section: string; end_date: string | null; is_active: number; unit_key: string | null }>(
    `SELECT cm.id, c.id AS committee_id, c.name AS committee_name, c.slug AS committee_slug, c.status AS committee_status, cm.position_title, cm.section, cm.end_date, cm.is_active, cm.unit_key
     FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.deleted_at IS NULL
     WHERE cm.profile_id = ?1 AND cm.deleted_at IS NULL ORDER BY c.slug DESC`,
    id,
  );
  return { person: p, history };
}

async function assertMayEditPerson(ctx: Ctx, profileId: string) {
  const actor = requireActor(ctx);
  const decision = requirePeopleAccess(ctx);
  const target = await ctx.db.first<{ user_id: string | null; is_protected: number }>(
    `SELECT pr.user_id, EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = pr.user_id AND ur.revoked_at IS NULL AND r.is_protected = 1) AS is_protected
     FROM profiles pr WHERE pr.id = ?1 AND pr.deleted_at IS NULL`, profileId);
  if (!target) throw new NotFoundError("Person");
  // A Moderator's profile is edited only by a Moderator (or themselves on /account).
  if (target.is_protected && target.user_id !== actor.user.id && !holdsProtectedRole(actor.subject)) {
    throw new ForbiddenError("Only a Moderator can edit a Moderator's profile.");
  }
  return { decision, target };
}

function personInput(input: Record<string, unknown>) {
  const v = new Validator(input);
  const d = {
    full_name: v.string("fullName", { required: true, min: 2, max: 100, label: "Name" }),
    person_type: v.oneOf("personType", ["STUDENT", "FACULTY", "ALUMNI", "EXTERNAL"] as const, { label: "Type" }) ?? "STUDENT",
    student_id: v.string("studentId", { max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be 9 digits." }),
    department: v.string("department", { max: 60, label: "Department" }),
    batch: v.string("batch", { max: 20, label: "Batch" }),
    designation: v.string("designation", { max: 80, label: "Designation" }),
    bio: v.string("bio", { max: 1000, label: "Bio" }),
    public_email: v.string("publicEmail", { max: 254, label: "Public email", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: "Enter a valid email address." }),
    linkedin_url: v.url("linkedin", { label: "LinkedIn" }),
    github_url: v.url("github", { label: "GitHub" }),
    twitter_url: v.url("twitter", { label: "X / Twitter" }),
    facebook_url: v.url("facebook", { label: "Facebook" }),
    website_url: v.url("website", { label: "Website" }),
    avatar_media_id: v.string("avatarMediaId", { max: 80, label: "Photo" }),
  };
  v.done();
  return d;
}

async function checkAvatar(ctx: Ctx, mediaId: string | null) {
  if (!mediaId) return;
  const m = await ctx.db.first<{ media_type: string; visibility: string }>("SELECT media_type, visibility FROM media WHERE id = ?1 AND deleted_at IS NULL AND status = 'READY'", mediaId);
  if (!m || m.media_type !== "IMAGE" || m.visibility !== "PUBLIC") throw new AppError(400, "VALIDATION", "The photo must be a public image from the media library.");
}

async function checkStudentId(ctx: Ctx, studentId: string | null, exceptProfileId?: string) {
  if (!studentId) return;
  const clash = await ctx.db.first<{ full_name: string }>("SELECT full_name FROM profiles WHERE student_id = ?1 AND deleted_at IS NULL AND id <> ?2", studentId, exceptProfileId ?? "");
  if (clash) throw new ConflictError(`Student ID ${studentId} already belongs to ${clash.full_name}. Pick that person instead of creating a new one.`);
}

export async function createPerson(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePeopleAccess(ctx);
  const d = personInput(input);
  await checkStudentId(ctx, d.student_id);
  await checkAvatar(ctx, d.avatar_media_id);
  const id = newId("prf");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO profiles (id, full_name, person_type, student_id, department, batch, designation, bio, public_email, linkedin_url, github_url, twitter_url, facebook_url, website_url,
                             avatar_media_id, created_at, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?17)`,
      id, d.full_name, d.person_type, d.student_id, d.department, d.batch, d.designation, d.bio, d.public_email, d.linkedin_url, d.github_url, d.twitter_url,
      d.facebook_url, d.website_url, d.avatar_media_id, now, actor.user.id,
    ),
    auditStmt(ctx, { action: "profile.create", resourceType: "profile", resourceId: id, after: d, decision }),
  ]);
  return { id };
}

export async function updatePerson(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const { decision, target } = await assertMayEditPerson(ctx, id);
  const before = await ctx.db.first<Record<string, unknown>>("SELECT full_name, student_id, person_type, designation, avatar_media_id FROM profiles WHERE id = ?1", id);
  const d = personInput(input);
  // Changing your own student ID would let you claim someone else's committee history.
  if (target.user_id === actor.user.id && (before?.student_id ?? null) !== d.student_id) assertNotSelf(actor.subject, actor.user.id, "student ID");
  await checkStudentId(ctx, d.student_id, id);
  await checkAvatar(ctx, d.avatar_media_id);
  const fresh = await unchangedSince(ctx, "profiles", id, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt(
      `UPDATE profiles SET full_name = ?2, person_type = ?3, student_id = ?4, department = ?5, batch = ?6, designation = ?7, bio = ?8, public_email = ?9,
              linkedin_url = ?10, github_url = ?11, twitter_url = ?12, facebook_url = ?13, website_url = ?14, avatar_media_id = ?15, updated_at = ?16, updated_by = ?17
       WHERE id = ?1`,
      id, d.full_name, d.person_type, d.student_id, d.department, d.batch, d.designation, d.bio, d.public_email, d.linkedin_url, d.github_url, d.twitter_url,
      d.facebook_url, d.website_url, d.avatar_media_id, nowIso(), actor.user.id,
    ),
    auditStmt(ctx, { action: "profile.update", resourceType: "profile", resourceId: id, before, after: d, decision }),
  ], () => staleAnswer(ctx, "profiles", id));
  ctx.revalidate?.(["committees"]);
}

/** Members set their own photo from /account (any image they uploaded as an avatar). */
export async function setOwnAvatar(ctx: Ctx, mediaId: string | null): Promise<void> {
  const actor = requireActor(ctx);
  if (!actor.profile) throw new NotFoundError("Profile");
  if (mediaId) {
    const m = await ctx.db.first<{ uploaded_by: string | null }>("SELECT uploaded_by FROM media WHERE id = ?1 AND deleted_at IS NULL", mediaId);
    if (!m || m.uploaded_by !== actor.user.id) throw new ForbiddenError("Upload the photo from this page first.");
    await checkAvatar(ctx, mediaId);
  }
  await ctx.db.batch([
    ctx.db.stmt("UPDATE profiles SET avatar_media_id = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", actor.profile.id, mediaId, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "profile.avatar", resourceType: "profile", resourceId: actor.profile.id, after: { mediaId } }),
  ]);
  ctx.revalidate?.(["committees"]);
}

/**
 * Invite the person behind a profile to create their account. Needs
 * executives.assign (you are appointing them). The account is created without
 * a password and linked to the profile; the emailed link expires in 14 days
 * and sending a new one cancels the old.
 */
/**
 * Invite someone to activate their executive account. With email available the link is
 * emailed; without it (no-email mode, or if sending fails) it is returned to the
 * administrator to pass on privately, and nothing claims an email went out.
 */
export async function invitePerson(ctx: Ctx, profileId: string, emailRaw: string): Promise<{ message: string; link?: string }> {
  const actor = requireActor(ctx);
  const decision = authorize(ctx, "executives.assign");
  if (decision.outcome !== "ALLOW") throw new ForbiddenError("Only people who can assign executives can send invitations.", decision);
  await limit(ctx, "people.invite", actor.user.id);
  const v = new Validator({ email: emailRaw });
  const email = v.email("email");
  v.done();
  const profile = await ctx.db.first<{ id: string; full_name: string; user_id: string | null }>("SELECT id, full_name, user_id FROM profiles WHERE id = ?1 AND deleted_at IS NULL", profileId);
  if (!profile) throw new NotFoundError("Person");
  const existing = await ctx.db.first<{ id: string; status: string; password_hash: string | null }>("SELECT id, status, password_hash FROM users WHERE email = ?1 AND deleted_at IS NULL", email);
  let userId = profile.user_id;
  const now = nowIso();
  const stmts = [];
  if (userId) {
    const linked = await ctx.db.first<{ email: string; password_hash: string | null }>("SELECT email, password_hash FROM users WHERE id = ?1", userId);
    if (linked?.password_hash) throw new ConflictError(`${profile.full_name} already has an account (${linked.email}). They can sign in now.`);
    if (linked && linked.email.toLowerCase() !== email) {
      if (existing) throw new ConflictError("That email already belongs to another account.");
      stmts.push(ctx.db.stmt("UPDATE users SET email = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", userId, email, now, actor.user.id));
    }
  } else {
    if (existing) {
      throw new ConflictError("That email already has an account. Pick that member in the person search instead, or link their account from Members.");
    }
    userId = newId("usr");
    stmts.push(
      ctx.db.stmt("INSERT INTO users (id, email, status, created_at, updated_at, updated_by) VALUES (?1, ?2, 'REGISTERED', ?3, ?3, ?4)", userId, email, now, actor.user.id),
      ctx.db.stmt("UPDATE profiles SET user_id = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1 AND user_id IS NULL", profileId, userId, now, actor.user.id),
    );
  }
  assertNotSelf(actor.subject, userId, "invitation");
  const token = randomToken(32);
  stmts.push(
    ctx.db.stmt("UPDATE auth_tokens SET used_at = ?2 WHERE user_id = ?1 AND purpose = 'INVITE' AND used_at IS NULL", userId, now),
    ctx.db.stmt("INSERT INTO auth_tokens (id, user_id, profile_id, purpose, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, 'INVITE', ?4, ?5, ?6)",
      newId("tok"), userId, profileId, await sha256Hex(token), new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(), now),
    auditStmt(ctx, { action: "profile.invite", resourceType: "profile", resourceId: profileId, after: { email, userId }, decision }),
  );
  await ctx.db.batch(stmts);
  const base = (ctx.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const inviter = actor.profile?.full_name ?? "A club administrator";
  const link = `${base}/auth/accept-invite?token=${token}`;
  const sent = await deliverEmail(ctx, {
    to: email!,
    subject: "Your GUCC executive account",
    text: `Hello ${profile.full_name},\n\n${inviter} added you to the Green University Computer Club committee. Set a password to activate your account:\n${link}\n\nThe link expires in ${INVITE_DAYS} days. If you weren't expecting this, you can ignore this email.`,
  }, { type: "invite" });
  if (sent) return { message: `Invitation sent to ${email}.` };
  return { message: `Email isn't available, so no email was sent. Give ${profile.full_name} this link privately (it works once, for ${INVITE_DAYS} days): ${link}`, link };
}

/**
 * Merge a duplicate person into another: listings, event roles, authored posts and invitations
 * move to the kept profile; the account moves too when only the duplicate has one; the photo,
 * student ID and links fill gaps. The duplicate is kept (hidden) with merged_into_id, audited.
 */
export async function mergePeople(ctx: Ctx, keepId: string, dropId: string, reasonRaw: unknown): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  if (!keepId || keepId === dropId) throw new AppError(400, "SAME_PERSON", "Choose two different people.");
  const { decision } = await assertMayEditPerson(ctx, keepId);
  await assertMayEditPerson(ctx, dropId);
  await requireRecentAuth(ctx);
  const reason = String(reasonRaw ?? "").trim();
  if (reason.length < 3) throw new AppError(400, "REASON_REQUIRED", "Say why these are the same person (kept in the activity log).");
  type P = { id: string; full_name: string; user_id: string | null; student_id: string | null; avatar_media_id: string | null };
  const [keep, drop] = await Promise.all([keepId, dropId].map((id) => ctx.db.first<P>("SELECT id, full_name, user_id, student_id, avatar_media_id FROM profiles WHERE id = ?1 AND deleted_at IS NULL", id)));
  if (!keep || !drop) throw new NotFoundError("Person");
  if (keep.user_id && drop.user_id && keep.user_id !== drop.user_id) throw new ConflictError("Both have their own sign-in account. Keep the one that's used and delete the other account first.");
  if (keep.student_id && drop.student_id && keep.student_id !== drop.student_id) throw new ConflictError(`Different student IDs (${keep.student_id} and ${drop.student_id}). Fix the wrong one first if they really are the same person.`);
  if (drop.user_id === actor.user.id || keep.user_id === actor.user.id) assertNotSelf(actor.subject, actor.user.id, "profile");
  // Same person listed twice in one position of one committee: keep one listing.
  const dup = await ctx.db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM committee_members a JOIN committee_members b ON b.committee_id = a.committee_id AND b.position_id = a.position_id AND IFNULL(b.unit_key, '') = IFNULL(a.unit_key, '')
     WHERE a.profile_id = ?1 AND b.profile_id = ?2 AND a.deleted_at IS NULL AND b.deleted_at IS NULL`, keep.id, drop.id);
  const now = nowIso();
  const counts = await ctx.db.first<{ listings: number; people: number; posts: number }>(
    `SELECT (SELECT COUNT(*) FROM committee_members WHERE profile_id = ?1 AND deleted_at IS NULL) AS listings,
            (SELECT COUNT(*) FROM event_people WHERE profile_id = ?1) AS people,
            (SELECT COUNT(*) FROM posts WHERE author_profile_id = ?1) AS posts`, drop.id);
  await ctx.db.batch([
    // Duplicate listings (same committee, position and unit) are removed from the dropped side.
    ...(dup?.n ? [ctx.db.stmt(
      `UPDATE committee_members SET deleted_at = ?3, is_active = 0, updated_at = ?3 WHERE profile_id = ?2 AND deleted_at IS NULL AND EXISTS (
         SELECT 1 FROM committee_members k WHERE k.profile_id = ?1 AND k.committee_id = committee_members.committee_id AND k.position_id = committee_members.position_id
           AND IFNULL(k.unit_key, '') = IFNULL(committee_members.unit_key, '') AND k.deleted_at IS NULL)`, keep.id, drop.id, now)] : []),
    ctx.db.stmt("UPDATE committee_members SET profile_id = ?1, updated_at = ?3, updated_by = ?4 WHERE profile_id = ?2", keep.id, drop.id, now, actor.user.id),
    ctx.db.stmt("UPDATE event_people SET profile_id = ?1 WHERE profile_id = ?2", keep.id, drop.id),
    ctx.db.stmt("UPDATE posts SET author_profile_id = ?1 WHERE author_profile_id = ?2", keep.id, drop.id),
    ctx.db.stmt("UPDATE auth_tokens SET profile_id = ?1 WHERE profile_id = ?2", keep.id, drop.id),
    // The duplicate gives up its unique fields first (student ID, account), then fills the kept profile's gaps.
    ctx.db.stmt("UPDATE profiles SET student_id = NULL, user_id = NULL, merged_into_id = ?2, deleted_at = ?3, updated_at = ?3, updated_by = ?4 WHERE id = ?1", drop.id, keep.id, now, actor.user.id),
    ctx.db.stmt(
      `UPDATE profiles SET user_id = COALESCE(user_id, ?2), student_id = COALESCE(student_id, ?3), avatar_media_id = COALESCE(avatar_media_id, ?4),
              bio = COALESCE(bio, (SELECT bio FROM profiles WHERE id = ?5)), linkedin_url = COALESCE(linkedin_url, (SELECT linkedin_url FROM profiles WHERE id = ?5)),
              github_url = COALESCE(github_url, (SELECT github_url FROM profiles WHERE id = ?5)), facebook_url = COALESCE(facebook_url, (SELECT facebook_url FROM profiles WHERE id = ?5)),
              updated_at = ?6, updated_by = ?7
       WHERE id = ?1`, keep.id, drop.user_id, drop.student_id, drop.avatar_media_id, drop.id, now, actor.user.id),
    auditStmt(ctx, { action: "profile.merge", resourceType: "profile", resourceId: keep.id, reason,
      before: { kept: keep.full_name, merged: drop.full_name, mergedId: drop.id }, after: { listings: counts?.listings ?? 0, eventRoles: counts?.people ?? 0, posts: counts?.posts ?? 0, account: drop.user_id ? "moved" : "none" }, decision }),
  ]);
  ctx.revalidate?.(["committees", "events", "posts"]);
  return { message: `Merged ${drop.full_name} into ${keep.full_name}: ${counts?.listings ?? 0} listing(s), ${counts?.people ?? 0} event role(s) and ${counts?.posts ?? 0} post(s) moved.` };
}

/** Delete a person entered by mistake: only with no listings, no account and no authored posts. */
export async function deletePerson(ctx: Ctx, id: string, reasonRaw: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const { decision } = await assertMayEditPerson(ctx, id);
  const p = await ctx.db.first<{ full_name: string; user_id: string | null; listings: number; posts: number; people: number }>(
    `SELECT full_name, user_id, (SELECT COUNT(*) FROM committee_members WHERE profile_id = p.id) AS listings,
            (SELECT COUNT(*) FROM posts WHERE author_profile_id = p.id) AS posts, (SELECT COUNT(*) FROM event_people WHERE profile_id = p.id) AS people
     FROM profiles p WHERE id = ?1 AND deleted_at IS NULL`, id);
  if (!p) throw new NotFoundError("Person");
  if (p.user_id) throw new ConflictError("This person has a sign-in account. Accounts are closed from the member list, not deleted here.");
  if (p.listings || p.posts || p.people) throw new ConflictError(`${p.full_name} appears in ${p.listings} listing(s), ${p.people} event role(s) and ${p.posts} post(s). Merge them into the right person instead.`);
  const reason = String(reasonRaw ?? "").trim();
  if (reason.length < 3) throw new AppError(400, "REASON_REQUIRED", "Say why (kept in the activity log).");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE profiles SET student_id = NULL, deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: "profile.delete", resourceType: "profile", resourceId: id, reason, before: { name: p.full_name }, decision }),
  ]);
}
