/**
 * The club's leadership looking after members' accounts: deleting an account (one, or spam and
 * rejected applications in bulk) and changing someone's sign-in email. Moderators hold these
 * permissions (accounts.manage, accounts.email); the President and the General Secretary hold the
 * Moderator role while in office, so the three have the same power.
 *
 * Every change is audited, needs the password entered recently, and is never done to yourself
 * this way (the Security page is for that). An account with Moderator authority (a Moderator,
 * the President or the General Secretary) is changed only when another of them approves, and the
 * last Moderator can't be deleted at all.
 */
import { auditManyStmt, auditStmt } from "../audit";
import { HAS_MODERATOR_AUTHORITY_SQL, requireActor, requirePermission, userResource } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { nowIso } from "../db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { emit } from "../live";
import { notifyStmts } from "../notifications";
import { deliverEmail, requireRecentAuth } from "../security";
import { profileTags } from "../people-sync";
import { eligibleApprovers, loadPolicy, registerApprovalHandler, startApproval } from "./approvals";
import { erasureStatements } from "./account-erasure";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const APPROVAL_POLICY = "leadership-any";

interface Target {
  id: string;
  email: string;
  status: string;
  name: string | null;
  profile_id: string | null;
  protected: number;
  explicit_moderator: number;
}

async function loadTarget(ctx: Ctx, userId: string): Promise<Target> {
  const t = await ctx.db.first<Target>(
    `SELECT u.id, u.email, u.status, p.full_name AS name, p.id AS profile_id, ${HAS_MODERATOR_AUTHORITY_SQL("u.id")} AS protected,
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.is_protected = 1
                    WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS explicit_moderator
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE u.id = ?1 AND u.deleted_at IS NULL`, userId);
  if (!t) throw new NotFoundError("Account");
  return t;
}

const label = (t: Pick<Target, "name" | "email">) => t.name ?? t.email;

function reasonOf(raw: unknown): string {
  const reason = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (reason.length < 3) throw new ValidationError("Say why (kept in the activity log and told to the person).", { reason: "Required." });
  return reason;
}

/** The last Moderator (by role) can't lose their account: someone must hold the club's top authority. */
async function assertNotLastModerator(ctx: Ctx, t: Target) {
  if (!t.explicit_moderator) return;
  const others = (await ctx.db.value<number>(
    `SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.is_protected = 1 JOIN users u ON u.id = ur.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
     WHERE ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND ur.user_id <> ?1`, t.id)) ?? 0;
  if (others === 0) throw new AppError(409, "LAST_PROTECTED_HOLDER", `${label(t)} is the only Moderator. Appoint another Moderator first.`);
}

/** An account with Moderator authority: another leader (not the requester, not the person) approves. */
async function routeForApproval(ctx: Ctx, t: Target, action: "account.delete" | "account.set_email", title: string, payload: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const { policy } = await loadPolicy(ctx, APPROVAL_POLICY);
  const others = (await eligibleApprovers(ctx, policy, actor.user.id)).filter((id) => id !== t.id);
  if (others.length === 0) throw new AppError(409, "NO_APPROVER", `Another Moderator, the President or the General Secretary must approve changes to ${label(t)}'s account, and nobody else can right now.`);
  const { requestId } = await startApproval(ctx, { policyKey: APPROVAL_POLICY, resourceType: "user", resourceId: t.id, action, title, payload, excludeUserIds: [t.id] });
  return requestId;
}

/** The statements that close an account, with its audit row (the same for an approved request). */
function deletionStatements(ctx: Ctx, t: Target, reason: string, decision?: ReturnType<typeof requirePermission>, requestId?: string) {
  return [
    auditStmt(ctx, { action: "account.delete", resourceType: "user", resourceId: t.id, reason: requestId ? `${reason} (approved request ${requestId})` : reason, before: { name: t.name, email: t.email, status: t.status }, decision }),
    ...erasureStatements(ctx, [t.id], nowIso()),
  ];
}

async function tellClosed(ctx: Ctx, t: Target, reason: string) {
  await deliverEmail(ctx, {
    to: t.email,
    subject: "Your GUCC account was closed",
    text: `Your account on the Green University Computer Club website was closed by the club's leadership.\n\nReason: ${reason}\n\nIf you think this is a mistake, reply to this email or contact the club: ${siteUrl(ctx, "/contact")}`,
  }, { type: "account.deleted", userId: t.id }).catch(() => false);
}

/**
 * Delete a member's account. `confirmName` must repeat their name (or email), so the wrong row
 * can't be deleted by a slip.
 */
export async function deleteMemberAccount(ctx: Ctx, userId: string, input: { reason?: unknown; confirmName?: unknown }): Promise<{ deleted: boolean; requestId?: string; message: string }> {
  const actor = requireActor(ctx);
  if (userId === actor.user.id) throw new ValidationError("To delete your own account, use Security → Delete my account.");
  const resource = await userResource(ctx.db, userId);
  if (!resource) throw new NotFoundError("Account");
  const decision = requirePermission(ctx, "accounts.manage", resource);
  const t = await loadTarget(ctx, userId);
  const reason = reasonOf(input.reason);
  const typed = String(input.confirmName ?? "").trim().toLowerCase();
  if (typed !== (t.name ?? "").trim().toLowerCase() && typed !== t.email.toLowerCase()) {
    throw new ValidationError(`Type ${label(t)} exactly to confirm.`, { confirmName: "Doesn't match." });
  }
  await requireRecentAuth(ctx);
  await assertNotLastModerator(ctx, t);
  if (t.protected) {
    const requestId = await routeForApproval(ctx, t, "account.delete", `Delete the account of ${label(t)}`, { userId: t.id, reason });
    return { deleted: false, requestId, message: `${label(t)} has Moderator authority, so another leader approves this first. You'll be notified.` };
  }
  const tags = await profileTags(ctx, t.profile_id ?? undefined);
  await ctx.db.batch(deletionStatements(ctx, t, reason, decision));
  await tellClosed(ctx, t, reason);
  if (tags.length) ctx.revalidate?.(tags);
  emit(ctx, [t.id], { t: "bye" });
  return { deleted: true, message: `${label(t)}'s account was deleted.` };
}

registerApprovalHandler("account.delete", {
  async onApproved(ctx, req) {
    const { userId, reason } = JSON.parse(req.payload_json ?? "{}") as { userId: string; reason: string };
    // Re-checked now: the account may have changed since the request.
    const t = await loadTarget(ctx, userId);
    await assertNotLastModerator(ctx, t);
    await tellClosed(ctx, t, reason);
    emit(ctx, [t.id], { t: "bye" });
    return deletionStatements(ctx, t, reason, undefined, req.id);
  },
});

/**
 * Remove applications that never became members (rejected, unverified or still waiting), e.g.
 * spam sign-ups: at most 100 at a time, all in one batch. Accounts that hold anything (a
 * committee listing, posts, Moderator authority) are left alone and reported.
 */
export async function bulkDeleteApplications(ctx: Ctx, rawIds: unknown, rawReason: unknown): Promise<{ deleted: number; skipped: Array<{ id: string; name: string; why: string }> }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "accounts.manage");
  const ids = [...new Set(Array.isArray(rawIds) ? rawIds.map(String) : [])].filter((id) => id !== actor.user.id);
  if (ids.length === 0) throw new ValidationError("Select at least one application.");
  if (ids.length > 100) throw new ValidationError("Select at most 100 at a time.");
  const reason = reasonOf(rawReason);
  await requireRecentAuth(ctx);
  const rows = await ctx.db.all<{ id: string; name: string; status: string; protected: number; listings: number; posts: number }>(
    `SELECT u.id, COALESCE(p.full_name, u.email) AS name, u.status, ${HAS_MODERATOR_AUTHORITY_SQL("u.id")} AS protected,
            (SELECT COUNT(*) FROM committee_members cm WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL) AS listings,
            (SELECT COUNT(*) FROM posts x WHERE x.author_profile_id = p.id AND x.deleted_at IS NULL) AS posts
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE u.id IN (SELECT value FROM json_each(?1)) AND u.deleted_at IS NULL`, JSON.stringify(ids));
  const skipped: Array<{ id: string; name: string; why: string }> = [];
  const ok: typeof rows = [];
  for (const r of rows) {
    const why = !["REJECTED", "EMAIL_VERIFICATION_PENDING", "PENDING_APPROVAL"].includes(r.status) ? "is a member, not an application"
      : r.protected ? "has Moderator authority"
        : r.listings ? "is on a committee listing"
          : r.posts ? "has written posts" : null;
    if (why) skipped.push({ id: r.id, name: r.name, why });
    else ok.push(r);
  }
  if (ok.length) {
    await ctx.db.batch([
      ...auditManyStmt(ctx, ok.map((r) => ({ action: "account.delete", resourceType: "user", resourceId: r.id, reason: `${reason} (bulk, ${r.status.toLowerCase().replace(/_/g, " ")})`, before: { name: r.name, status: r.status }, decision }))),
      ...erasureStatements(ctx, ok.map((r) => r.id), nowIso()),
    ]);
  }
  return { deleted: ok.length, skipped };
}

/**
 * Change someone's sign-in email (they lost access to the old one, or asked to use another).
 * The leader vouches for the new address, so it counts as verified; every device is signed out,
 * and both addresses are told.
 */
export async function changeMemberEmail(ctx: Ctx, userId: string, input: { email?: unknown; reason?: unknown }): Promise<{ changed: boolean; requestId?: string; message: string }> {
  const actor = requireActor(ctx);
  if (userId === actor.user.id) throw new ValidationError("To change your own sign-in email, use Security → Sign-in email (or the Change button on your profile).");
  const resource = await userResource(ctx.db, userId);
  if (!resource) throw new NotFoundError("Account");
  const decision = requirePermission(ctx, "accounts.email", resource);
  const t = await loadTarget(ctx, userId);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new ValidationError("Enter a valid email address.", { email: "Enter a valid email address." });
  if (email === t.email.toLowerCase()) throw new ValidationError("That's already their sign-in email.", { email: "Enter a different address." });
  const reason = reasonOf(input.reason);
  if (await ctx.db.first("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL AND id <> ?2", email, userId)) throw new ConflictError("Another account uses that email.");
  await requireRecentAuth(ctx);
  if (t.protected) {
    const requestId = await routeForApproval(ctx, t, "account.set_email", `Change ${label(t)}'s sign-in email`, { userId: t.id, email, reason });
    return { changed: false, requestId, message: `${label(t)} has Moderator authority, so another leader approves this first. You'll be notified.` };
  }
  await ctx.db.batch(emailChangeStatements(ctx, t, email, reason, decision));
  await tellEmailChanged(ctx, t, email, reason);
  emit(ctx, [t.id], { t: "bye" });
  return { changed: true, message: `${label(t)} now signs in with ${email}. Their devices were signed out, and both addresses were told.` };
}

function emailChangeStatements(ctx: Ctx, t: Target, email: string, reason: string, decision?: ReturnType<typeof requirePermission>, requestId?: string) {
  const now = nowIso();
  return [
    ctx.db.stmt("UPDATE users SET email = ?2, email_verified_at = ?3, updated_at = ?3, updated_by = ?4 WHERE id = ?1", t.id, email, now, ctx.actor?.user.id ?? null),
    // A pending self-service change would now point at the wrong account state.
    ctx.db.stmt("UPDATE email_change_requests SET used_at = ?2 WHERE user_id = ?1 AND used_at IS NULL", t.id, now),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", t.id, now),
    auditStmt(ctx, { action: "account.email_change_by_leader", resourceType: "user", resourceId: t.id, reason: requestId ? `${reason} (approved request ${requestId})` : reason, before: { email: t.email }, after: { email }, decision }),
    // In-app only (both addresses get an account email anyway).
    ...notifyStmts(ctx, [t.id], { type: "account.email_changed", title: "Your sign-in email was changed", body: `The club's leadership changed it from ${t.email} to ${email}. Reason: ${reason}`, link: "/dashboard/security" }),
  ];
}

async function tellEmailChanged(ctx: Ctx, t: Target, email: string, reason: string) {
  const text = (to: "old" | "new") => `${to === "new" ? "This address" : email} is now the sign-in email of ${label(t)}'s account on the Green University Computer Club website${to === "old" ? `, instead of ${t.email}` : ""}. The change was made by the club's leadership.\n\nReason: ${reason}\n\n${to === "new" ? `Sign in at ${siteUrl(ctx, "/auth/login")} with your existing password (or use "Forgot password").` : "If this wasn't expected, contact the club right away."}`;
  await Promise.all([
    deliverEmail(ctx, { to: email, subject: "Your GUCC sign-in email was changed", text: text("new") }, { type: "account.email_changed", userId: t.id }).catch(() => false),
    deliverEmail(ctx, { to: t.email, subject: "Your GUCC sign-in email was changed", text: text("old") }, { type: "account.email_changed", userId: t.id }).catch(() => false),
  ]);
}

registerApprovalHandler("account.set_email", {
  async onApproved(ctx, req) {
    const { userId, email, reason } = JSON.parse(req.payload_json ?? "{}") as { userId: string; email: string; reason: string };
    const t = await loadTarget(ctx, userId);
    if (await ctx.db.first("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL AND id <> ?2", email, userId)) throw new ConflictError("Another account uses that email now.");
    await tellEmailChanged(ctx, t, email, reason);
    emit(ctx, [t.id], { t: "bye" });
    return emailChangeStatements(ctx, t, email, reason, undefined, req.id);
  },
});
