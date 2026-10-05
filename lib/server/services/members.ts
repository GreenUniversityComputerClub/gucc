/**
 * Member lifecycle: REGISTERED → EMAIL_VERIFICATION_PENDING → PENDING_APPROVAL
 * → ACTIVE, plus REJECTED / SUSPENDED / INACTIVE / ARCHIVED. Authentication
 * identity (users) stays separate from organisational identity (profiles).
 */
import { csvCell } from "../csv";
import { alreadyDone, assertTransition, batchTransition, newTransition } from "../transition";
import { assertNotSelf } from "../../governance/invariants";
import { auditStmt } from "../audit";
import { authorize, requireActor, requirePermission, userResource } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { emit } from "../live";
import { newId, nowIso } from "../db";
import { AppError, NotFoundError } from "../errors";
import { notifyStmts, usersWithPermission } from "../notifications";
import { deliverEmail, requireRecentAuth } from "../security";
import { STUDENT_ID_RE, Validator } from "../validate";
import { claimEmailTasksStmts } from "./task-claim";
import { cleanPublicEmail, profileEditedStmt, profileTags } from "../people-sync";
import { avatarOfProfileSql, withAvatars } from "../avatar";
import { ensureProfileHandle } from "./profiles";

export interface MemberListRow {
  id: string;
  email: string;
  /** Two-factor sign-in is on. */
  mfa: number;
  status: string;
  created_at: string;
  last_login_at: string | null;
  full_name: string | null;
  student_id: string | null;
  department: string | null;
  batch: string | null;
  email_verified_at: string | null;
  correction_note: string | null;
  claim: string | null;
  claim_profile_id: string | null;
  claim_name: string | null;
  claim_holds: string | null;
  phone: string | null;
  review_note: string | null;
  roles: string | null;
  positions: string | null;
  /** Small version of the profile photo. */
  avatarUrl: string | null;
}

/** How the members list can be ordered (`?sort=`). Waiting applications always come first. */
const MEMBER_SORTS = {
  newest: "u.created_at DESC",
  oldest: "u.created_at ASC",
  name: "COALESCE(p.full_name, u.email) COLLATE NOCASE ASC",
  login: "u.last_login_at IS NULL, u.last_login_at DESC",
  batch: "p.batch IS NULL, p.batch DESC, COALESCE(p.full_name, u.email) COLLATE NOCASE ASC",
} as const;
export type MemberSort = keyof typeof MEMBER_SORTS;

export async function listMembers(ctx: Ctx, opts: { status?: string; q?: string; page?: number; size?: number; sort?: string; batch?: string; department?: string }) {
  requirePermission(ctx, "members.read");
  const page = Math.max(1, opts.page ?? 1);
  const size = [10, 25, 50, 100].includes(Number(opts.size)) ? Number(opts.size) : 50;
  const sort = MEMBER_SORTS[(opts.sort ?? "newest") as MemberSort] ?? MEMBER_SORTS.newest;
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "")}%` : null;
  // Phone numbers are private: only people who manage members see them.
  const showPhone = authorize(ctx, "members.manage").outcome === "ALLOW" ? 1 : 0;
  const batch = opts.batch?.trim().slice(0, 20) || null;
  const department = opts.department?.trim().slice(0, 60) || null;
  const rows = withAvatars(await ctx.db.all<Omit<MemberListRow, "avatarUrl"> & { avatar_json: string | null }>(
    `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, u.email_verified_at, u.correction_note, u.review_note, p.full_name, p.student_id, p.department, p.batch,
            ${avatarOfProfileSql("p")} AS avatar_json,
            CASE WHEN ?4 = 1 THEN p.phone END AS phone,
            EXISTS (SELECT 1 FROM user_mfa WHERE user_id = u.id AND confirmed_at IS NOT NULL) AS mfa,
            json_extract(p.legacy_json, '$.claimStudentId') AS claim,
            cp.id AS claim_profile_id, cp.full_name AS claim_name,
            (SELECT group_concat(c2.slug || ' ' || cm2.position_title, '; ') FROM committee_members cm2 JOIN committees c2 ON c2.id = cm2.committee_id
               WHERE cm2.profile_id = cp.id AND cm2.deleted_at IS NULL) AS claim_holds,
            (SELECT group_concat(r.name, ', ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS roles,
            (SELECT group_concat(cm.position_title, ', ') FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
               WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL AND cm.is_active = 1) AS positions
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     LEFT JOIN profiles cp ON cp.id = json_extract(p.legacy_json, '$.claimProfileId') AND cp.deleted_at IS NULL AND cp.user_id IS NULL
     WHERE u.deleted_at IS NULL AND (?1 IS NULL OR u.status = ?1)
       AND (?2 IS NULL OR u.email LIKE ?2 OR p.full_name LIKE ?2 OR p.student_id LIKE ?2 OR json_extract(p.legacy_json, '$.claimStudentId') LIKE ?2)
       AND (?5 IS NULL OR p.batch = ?5) AND (?6 IS NULL OR p.department LIKE ?6)
     ORDER BY CASE u.status WHEN 'PENDING_APPROVAL' THEN 0 ELSE 1 END, ${sort}
     LIMIT ?7 OFFSET ?3`,
    opts.status ?? null, q, (page - 1) * size, showPhone, batch, department ? `%${department.replace(/[%_]/g, "")}%` : null, size,
  )) as MemberListRow[];
  const total = await ctx.db.value<number>(
    `SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.deleted_at IS NULL AND (?1 IS NULL OR u.status = ?1)
       AND (?2 IS NULL OR u.email LIKE ?2 OR p.full_name LIKE ?2 OR p.student_id LIKE ?2 OR json_extract(p.legacy_json, '$.claimStudentId') LIKE ?2)
       AND (?3 IS NULL OR p.batch = ?3) AND (?4 IS NULL OR p.department LIKE ?4)`,
    opts.status ?? null, q, batch, department ? `%${department.replace(/[%_]/g, "")}%` : null,
  );
  return { rows, total: total ?? 0, page, size };
}

/** The batches and departments members have, for the list's filters (most common first). */
export async function memberFilterOptions(ctx: Ctx): Promise<{ batches: string[]; departments: string[] }> {
  requirePermission(ctx, "members.read");
  const rows = await ctx.db.all<{ kind: string; value: string }>(
    `SELECT 'batch' AS kind, p.batch AS value FROM profiles p JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     WHERE p.deleted_at IS NULL AND p.batch IS NOT NULL AND trim(p.batch) <> '' GROUP BY p.batch ORDER BY p.batch DESC LIMIT 200`);
  const deps = await ctx.db.all<{ value: string }>(
    `SELECT p.department AS value FROM profiles p JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     WHERE p.deleted_at IS NULL AND p.department IS NOT NULL AND trim(p.department) <> '' GROUP BY lower(p.department) ORDER BY COUNT(*) DESC LIMIT 60`);
  return { batches: rows.map((r) => r.value), departments: deps.map((r) => r.value) };
}

async function loadTarget(ctx: Ctx, userId: string) {
  const res = await userResource(ctx.db, userId);
  if (!res) throw new NotFoundError("Member");
  return res;
}

/**
 * Approve an application. With `linkProfileId` the account is attached to that existing
 * profile (e.g. the executive record they claimed) in the same transaction.
 */
export async function approveMember(ctx: Ctx, userId: string, opts: { linkProfileId?: string | null } = {}): Promise<void> {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "members.approve", target);
  assertNotSelf(actor.subject, userId, "membership status");
  const link = opts.linkProfileId ? await linkStatements(ctx, userId, opts.linkProfileId) : [];
  // Email not verified yet (e.g. email delivery not configured): a leader who knows the
  // applicant may approve anyway; that counts as verifying the address and is audited.
  if (target.status !== "PENDING_APPROVAL" && target.status !== "EMAIL_VERIFICATION_PENDING") throw new AppError(409, "BAD_STATE", `Only pending applications can be approved (this one is ${target.status}).`);
  const now = nowIso();
  const token = newTransition();
  await batchTransition(ctx, [
    // Guarded and stamped: if another leader decided first, the assertion below aborts this whole batch.
    ctx.db.stmt("UPDATE users SET status = 'ACTIVE', approved_at = ?2, approved_by = ?3, correction_note = NULL, email_verified_at = COALESCE(email_verified_at, ?2), updated_at = ?2, updated_by = ?3, last_transition = ?4 WHERE id = ?1 AND status IN ('PENDING_APPROVAL','EMAIL_VERIFICATION_PENDING')", userId, now, actor.user.id, token),
    assertTransition(ctx, "users", userId, token),
    ...link,
    ctx.db.stmt("INSERT INTO user_roles (id, user_id, role_id, granted_by, granted_at, reason) VALUES (?1, ?2, 'role:member', ?3, ?4, 'Membership approved') ON CONFLICT DO NOTHING", newId("ur"), userId, actor.user.id, now),
    auditStmt(ctx, { action: "member.approve", resourceType: "user", resourceId: userId, before: { status: target.status }, after: { status: "ACTIVE" }, reason: target.status === "EMAIL_VERIFICATION_PENDING" ? "Approved before email verification (verified by the approver)" : null, decision }),
    ...notifyStmts(ctx, [userId], { type: "member.approved", title: "Your GUCC account has been approved", body: "Welcome to the Green University Computer Club.", link: "/dashboard/profile" }),
    ...claimEmailTasksStmts(ctx, userId, now),
  ], () => alreadyDone(ctx, "users", userId, "This application"));
  const email = await ctx.db.value<string>("SELECT email FROM users WHERE id = ?1", userId);
  if (email) await deliverEmail(ctx, { to: email, subject: "Your GUCC account has been approved", text: `Welcome to the Green University Computer Club!\n\nYour membership is approved. Sign in to register for events and keep your profile up to date:\n${siteUrl(ctx, "/dashboard/profile")}` }, { type: "member.approved", userId });
}

/**
 * Ask an applicant to fix their details (e.g. a wrong student ID). The
 * application stays pending; the applicant sees the note on /account and
 * reviewers are notified when they save their profile.
 */
export async function requestCorrection(ctx: Ctx, userId: string, note: string): Promise<void> {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "members.approve", target);
  assertNotSelf(actor.subject, userId, "membership status");
  const text = String(note ?? "").trim();
  if (text.length < 5 || text.length > 500) throw new AppError(400, "REASON_REQUIRED", "Explain what needs to be corrected (5–500 characters).");
  if (target.status !== "PENDING_APPROVAL") throw new AppError(409, "BAD_STATE", "Corrections can only be requested for pending applications.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET correction_note = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", userId, text, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "member.request_correction", resourceType: "user", resourceId: userId, reason: text, decision }),
    ...notifyStmts(ctx, [userId], { type: "member.correction", title: "Your registration requires attention", body: text, link: "/dashboard/profile" }),
  ]);
  const email = await ctx.db.value<string>("SELECT email FROM users WHERE id = ?1", userId);
  if (email) await deliverEmail(ctx, { to: email, subject: "Your GUCC registration requires attention", text: `Please update your registration details:\n\n${text}\n\nOpen your account: ${siteUrl(ctx, "/dashboard/profile")}` }, { type: "member.correction", userId });
}

export async function rejectMember(ctx: Ctx, userId: string, reason: string): Promise<void> {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "members.reject", target);
  assertNotSelf(actor.subject, userId, "membership status");
  if (!reason?.trim()) throw new AppError(400, "REASON_REQUIRED", "Give a reason for the rejection.");
  if (target.status !== "PENDING_APPROVAL") throw new AppError(409, "BAD_STATE", "Only pending applications can be rejected.");
  const now = nowIso();
  const token = newTransition();
  await batchTransition(ctx, [
    ctx.db.stmt("UPDATE users SET status = 'REJECTED', rejected_reason = ?2, updated_at = ?3, updated_by = ?4, last_transition = ?5 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", userId, reason.trim(), now, actor.user.id, token),
    assertTransition(ctx, "users", userId, token),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", userId, now),
    auditStmt(ctx, { action: "member.reject", resourceType: "user", resourceId: userId, reason, before: { status: target.status }, after: { status: "REJECTED" }, decision }),
    ...notifyStmts(ctx, [userId], { type: "member.rejected", title: "Your membership application wasn't approved", body: reason.trim() }),
  ], () => alreadyDone(ctx, "users", userId, "This application"));
  const email = await ctx.db.value<string>("SELECT email FROM users WHERE id = ?1", userId);
  if (email) await deliverEmail(ctx, { to: email, subject: "Your GUCC registration", text: `Your membership application was not approved.\n\nReason: ${reason.trim()}\n\nIf you think this is a mistake, contact the club.` }, { type: "member.rejected", userId });
}

export async function suspendUser(ctx: Ctx, userId: string, reason: string): Promise<void> {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "users.suspend", target);
  assertNotSelf(actor.subject, userId, "account status");
  if (target.isProtected) requirePermission(ctx, "governance.protected");
  if (!reason?.trim()) throw new AppError(400, "REASON_REQUIRED", "Give a reason for the suspension.");
  if (target.status === "SUSPENDED") throw new AppError(409, "BAD_STATE", "This account is already suspended.");
  const now = nowIso();
  const token = newTransition();
  await batchTransition(ctx, [
    ctx.db.stmt("UPDATE users SET status = 'SUSPENDED', suspended_at = ?2, suspended_by = ?3, suspended_reason = ?4, updated_at = ?2, updated_by = ?3, last_transition = ?5 WHERE id = ?1 AND status <> 'SUSPENDED'", userId, now, actor.user.id, reason.trim(), token),
    assertTransition(ctx, "users", userId, token),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", userId, now),
    auditStmt(ctx, { action: "user.suspend", resourceType: "user", resourceId: userId, reason, before: { status: target.status }, after: { status: "SUSPENDED" }, decision }),
  ], () => alreadyDone(ctx, "users", userId, "This account"));
  // Their open tabs close now instead of at the next half-hourly renewal.
  emit(ctx, [userId], { t: "bye" });
}

export async function reactivateUser(ctx: Ctx, userId: string): Promise<void> {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "users.suspend", target);
  assertNotSelf(actor.subject, userId, "account status");
  // A suspended Moderator comes back only with Moderator authority, as suspending needed.
  if (target.isProtected) requirePermission(ctx, "governance.protected");
  if (!["SUSPENDED", "INACTIVE"].includes(String(target.status))) throw new AppError(409, "BAD_STATE", "Only suspended or inactive accounts can be reactivated.");
  const now = nowIso();
  const token = newTransition();
  await batchTransition(ctx, [
    ctx.db.stmt("UPDATE users SET status = 'ACTIVE', suspended_at = NULL, suspended_by = NULL, suspended_reason = NULL, updated_at = ?2, updated_by = ?3, last_transition = ?4 WHERE id = ?1 AND status IN ('SUSPENDED', 'INACTIVE')", userId, now, actor.user.id, token),
    assertTransition(ctx, "users", userId, token),
    auditStmt(ctx, { action: "user.reactivate", resourceType: "user", resourceId: userId, before: { status: target.status }, after: { status: "ACTIVE" }, decision }),
  ], () => alreadyDone(ctx, "users", userId, "This account"));
}

/**
 * Link an account to an existing (legacy) profile — e.g. a former executive
 * who registered and claimed their student ID. The account's own empty
 * profile is archived; the legacy profile, with its committee history, is
 * attached.
 */
export async function linkProfile(ctx: Ctx, userId: string, profileId: string): Promise<void> {
  await ctx.db.batch(await linkStatements(ctx, userId, profileId));
}

/**
 * The statements that attach an account to an existing profile. The account's own profile
 * (created at sign-up) is archived after its details fill any gaps in the existing one, so
 * nothing the member entered is lost. Needs members.manage; never your own account.
 */
async function linkStatements(ctx: Ctx, userId: string, profileId: string) {
  const actor = requireActor(ctx);
  const target = await loadTarget(ctx, userId);
  const decision = requirePermission(ctx, "members.manage", target);
  assertNotSelf(actor.subject, userId, "profile link");
  const legacy = await ctx.db.first<{ id: string; user_id: string | null; full_name: string }>("SELECT id, user_id, full_name FROM profiles WHERE id = ?1 AND deleted_at IS NULL", profileId);
  if (!legacy) throw new NotFoundError("Profile");
  if (legacy.user_id && legacy.user_id !== userId) throw new AppError(409, "PROFILE_TAKEN", "That profile already belongs to another account.");
  const own = await ctx.db.first<{ id: string }>("SELECT id FROM profiles WHERE user_id = ?1 AND deleted_at IS NULL AND id <> ?2", userId, profileId);
  const now = nowIso();
  return [
    ...(own
      ? [
          ctx.db.stmt(
            `UPDATE profiles SET department = COALESCE(profiles.department, o.department), batch = COALESCE(profiles.batch, o.batch), phone = COALESCE(profiles.phone, o.phone)
             FROM (SELECT department, batch, phone FROM profiles WHERE id = ?2) AS o WHERE profiles.id = ?1`,
            profileId, own.id),
          ctx.db.stmt("UPDATE profiles SET user_id = NULL, deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", own.id, now, actor.user.id),
        ]
      : []),
    ctx.db.stmt("UPDATE profiles SET user_id = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", profileId, userId, now, actor.user.id),
    auditStmt(ctx, { action: "member.link_profile", resourceType: "user", resourceId: userId, after: { profileId, name: legacy.full_name }, decision }),
  ];
}

/** An internal note on an application or account, for reviewers only. */
export async function setReviewNote(ctx: Ctx, userId: string, note: string | null): Promise<void> {
  const target = await loadTarget(ctx, userId);
  const decision = authorize(ctx, "members.approve", target).outcome === "ALLOW" ? requirePermission(ctx, "members.approve", target) : requirePermission(ctx, "members.manage", target);
  const text = note?.trim().slice(0, 1000) || null;
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET review_note = ?2 WHERE id = ?1", userId, text),
    auditStmt(ctx, { action: "member.review_note", resourceType: "user", resourceId: userId, decision }),
  ]);
}

export async function updateOwnProfile(ctx: Ctx, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  if (!actor.profile) throw new NotFoundError("Profile");
  // Applicants fix their own details while waiting; members need profile.update on their own
  // profile (the member role has it), so a governance rule can restrict it.
  const applying = ["PENDING_APPROVAL", "EMAIL_VERIFICATION_PENDING"].includes(actor.user.status);
  if (!applying) requirePermission(ctx, "profile.update", { type: "profile", id: actor.profile.id, ownerId: actor.user.id, createdBy: actor.user.id });
  const v = new Validator({ ...input, publicEmail: cleanPublicEmail(input.publicEmail) });
  const data = {
    full_name: v.string("fullName", { required: true, min: 2, max: 100, label: "Full name" }),
    department: v.string("department", { max: 60, label: "Department" }),
    batch: v.string("batch", { max: 20, label: "Batch" }),
    bio: v.string("bio", { max: 1000, label: "Bio" }),
    linkedin_url: v.url("linkedin", { label: "LinkedIn" }),
    github_url: v.url("github", { label: "GitHub" }),
    facebook_url: v.url("facebook", { label: "Facebook" }),
    website_url: v.url("website", { label: "Website" }),
    twitter_url: v.url("twitter", { label: "X" }),
    public_email: v.string("publicEmail", { max: 254, label: "Public email", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: "Enter a valid email address." }),
    phone: v.string("phone", { max: 20, label: "Phone", pattern: /^\+?[0-9\s-]{6,20}$/, patternMessage: "Enter a valid phone number." }),
  };
  // Applicants can still correct their student ID (it's fixed once they're approved). An ID that
  // belongs to an existing profile is recorded as a claim for the reviewers to confirm, as at sign-up.
  const studentId = applying && typeof input.studentId === "string" && input.studentId.trim()
    ? v.string("studentId", { max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be 9 digits." })
    : null;
  // Who sees my profile page; left as it is when the form doesn't send it.
  const visibility = input.visibility === undefined ? null : v.oneOf("visibility", ["PUBLIC", "MEMBERS", "PRIVATE"] as const, { label: "Who can see my profile" });
  // Which email my profile and the executives pages show (for every year I served).
  const emailDisplay = input.emailDisplay === undefined ? null : v.oneOf("emailDisplay", ["AUTO", "PROFILE", "HIDDEN"] as const, { label: "Email shown on the site" });
  const skills = typeof input.skills === "string" || Array.isArray(input.skills)
    ? [...new Set((Array.isArray(input.skills) ? input.skills.map(String) : String(input.skills).split(",")).map((x) => x.trim()).filter(Boolean))]
    : null;
  if (skills && skills.some((x) => x.length > 40)) v.check(false, "skills", "Keep each skill under 40 characters.");
  if (skills && skills.length > 15) v.check(false, "skills", "Up to 15 skills.");
  v.done();
  const now = nowIso();
  await ctx.db.batch([
    // Every year the person is listed in follows (before the update: it compares with the old values).
    profileEditedStmt(ctx, actor.profile.id, data, now),
    ctx.db.stmt(
      `UPDATE profiles SET full_name = ?2, department = ?3, batch = ?4, bio = ?5, linkedin_url = ?6, github_url = ?7, facebook_url = ?8, website_url = ?9, phone = ?10,
              twitter_url = ?13, public_email = ?14, skills_json = CASE WHEN ?15 IS NULL THEN skills_json ELSE ?15 END,
              visibility = COALESCE(?16, visibility), email_display = COALESCE(?17, email_display), updated_at = ?11, updated_by = ?12 WHERE id = ?1`,
      actor.profile.id, data.full_name, data.department, data.batch, data.bio, data.linkedin_url, data.github_url, data.facebook_url, data.website_url, data.phone, now, actor.user.id,
      data.twitter_url, data.public_email, skills ? JSON.stringify(skills) : null, visibility ?? null, emailDisplay ?? null,
    ),
    auditStmt(ctx, { action: "profile.update", resourceType: "profile", resourceId: actor.profile.id, after: { ...data, phone: undefined } }),
  ]);
  if (studentId) {
    const holder = await ctx.db.first<{ id: string }>("SELECT id FROM profiles WHERE student_id = ?1 AND deleted_at IS NULL AND id <> ?2", studentId, actor.profile.id);
    // Each statement gets exactly the values it uses (D1 refuses extra ones).
    if (holder) {
      await ctx.db.run("UPDATE profiles SET student_id = NULL, legacy_json = json_set(COALESCE(legacy_json, '{}'), '$.claimStudentId', ?2, '$.claimProfileId', ?3) WHERE id = ?1",
        actor.profile.id, studentId, holder.id);
    } else {
      await ctx.db.run("UPDATE profiles SET student_id = ?2, legacy_json = CASE WHEN legacy_json IS NULL THEN NULL ELSE json_remove(legacy_json, '$.claimStudentId', '$.claimProfileId') END WHERE id = ?1",
        actor.profile.id, studentId);
    }
  }

  const pending = await ctx.db.first<{ correction_note: string | null; status: string }>("SELECT correction_note, status FROM users WHERE id = ?1", actor.user.id);
  if (pending?.correction_note && pending.status === "PENDING_APPROVAL") {
    const reviewers = await usersWithPermission(ctx, "members.approve");
    await ctx.db.batch([
      ctx.db.stmt("UPDATE users SET correction_note = NULL WHERE id = ?1", actor.user.id),
      ...notifyStmts(ctx, reviewers, { type: "member.corrected", title: "An applicant updated their details", body: `${data.full_name} (${actor.user.email}) made the requested correction.`, link: "/dashboard/members?status=PENDING_APPROVAL", resourceType: "user", resourceId: actor.user.id }),
    ]);
  }
  // Your page's address, made from your name the first time.
  await ensureProfileHandle(ctx, actor.profile.id, data.full_name ?? actor.profile.full_name);
  const tags = await profileTags(ctx, actor.profile.id);
  if (tags.length) ctx.revalidate?.(tags);
}


/** Every member as CSV for people who manage members. Needs a recent password; audited. */
export async function exportMembersCsv(ctx: Ctx, opts: { status?: string; q?: string; batch?: string; department?: string } = {}): Promise<{ filename: string; csv: string }> {
  const decision = requirePermission(ctx, "members.manage");
  await requireRecentAuth(ctx);
  // The same view as the Members page: its tab and filters.
  const status = ["ACTIVE", "PENDING_APPROVAL", "SUSPENDED", "REJECTED", "EMAIL_VERIFICATION_PENDING"].includes(String(opts.status)) ? String(opts.status) : null;
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "").slice(0, 60)}%` : null;
  const batch = opts.batch?.trim().slice(0, 20) || null;
  const department = opts.department?.trim().slice(0, 60) || null;
  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT u.email, u.status, u.created_at, u.approved_at, u.last_login_at, p.full_name, p.student_id, p.department, p.batch, p.phone,
            (SELECT group_concat(cm.position_title, '; ') FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
               WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL AND cm.is_active = 1) AS positions,
            (SELECT group_concat(r.name, '; ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS roles
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE u.deleted_at IS NULL AND (?1 IS NULL OR u.status = ?1)
       AND (?2 IS NULL OR u.email LIKE ?2 OR p.full_name LIKE ?2 OR p.student_id LIKE ?2) AND (?3 IS NULL OR p.batch = ?3) AND (?4 IS NULL OR p.department LIKE ?4)
     ORDER BY p.full_name, u.email LIMIT 20000`, status, q, batch, department ? `%${department.replace(/[%_]/g, "")}%` : null);
  const head = ["Name", "Email", "Student ID", "Department", "Batch", "Phone", "Status", "Current positions", "Roles", "Joined", "Approved", "Last sign-in"];
  const lines = [head.map(csvCell).join(","), ...rows.map((r) => [r.full_name, r.email, r.student_id, r.department, r.batch, r.phone, r.status, r.positions, r.roles, r.created_at, r.approved_at, r.last_login_at].map(csvCell).join(","))];
  await auditStmt(ctx, { action: "members.export", resourceType: "user", after: { rows: rows.length, status: status ?? "all" }, decision }).run();
  return { filename: `gucc-members${status ? `-${status.toLowerCase()}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`, csv: `\ufeff${lines.join("\r\n")}\r\n` };
}
