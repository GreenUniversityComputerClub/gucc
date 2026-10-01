/**
 * Membership applications never get stuck behind email.
 *
 * Normally a new account verifies its email address, then waits for GUCC's approval. When email
 * can't do that job (switched off, no provider, the daily or monthly allowance used up, or the
 * verification email simply failed) the application goes straight to "Waiting for approval"
 * instead, and the reviewers (members.approve) are told; they confirm who the applicant is, as in
 * no-email mode. It happens:
 *   - at sign-up, when the verification email can't be sent;
 *   - at sign-in, for an account still waiting for verification while email can't send (the
 *     password proves it's the applicant);
 *   - for everyone waiting, the moment email is switched off;
 *   - in the hourly job, for anyone left waiting whose verification email never went out.
 * Only accounts in EMAIL_VERIFICATION_PENDING move. Invited accounts (REGISTERED, activated by
 * their invitation link) never do. The Members page marks their email "not verified".
 */
import { auditStmt } from "./audit";
import type { Ctx } from "./context";
import type { D1StatementLike } from "./db";
import { nowIso } from "./db";
import { emailAllowanceLeft, emailState } from "./email";
import { notifyStmts, usersWithPermission } from "./notifications";
import { triggerStmts } from "./triggers";

/** Whether a verification email could go out right now (email on, and allowance left today and this month). */
export async function canSendVerification(ctx: Ctx): Promise<boolean> {
  const state = await emailState(ctx);
  if (!state.provider || !state.active) return false;
  return (await emailAllowanceLeft(ctx, state)).left > 0;
}

export type SkipReason = "email_off" | "email_failed" | "email_limit";

/**
 * Why this applicant can't verify by email now, or null when they can (a link went out, or one
 * can be sent). Their latest verification email counts: if it didn't go out, nothing is coming.
 */
export async function whyNoVerification(ctx: Ctx, userId: string): Promise<SkipReason | null> {
  const state = await emailState(ctx);
  if (!state.provider || !state.active) return "email_off";
  if ((await emailAllowanceLeft(ctx, state)).left <= 0) return "email_limit";
  const last = await ctx.db.value<string>(
    "SELECT status FROM email_log WHERE user_id = ?1 AND type = 'account.verify' ORDER BY created_at DESC LIMIT 1", userId);
  return last && last !== "sent" ? "email_failed" : null;
}

const WHY: Record<SkipReason, string> = {
  email_off: "email is switched off",
  email_failed: "the verification email couldn't be sent",
  email_limit: "the club's email allowance is used up",
};

/**
 * Move these accounts (only those still waiting for email verification) to Waiting for approval,
 * with one audit entry and one notice per reviewer however many there are (a single application
 * also runs the leaders' "application waiting" rules, as a normal one does). A few statements
 * however many move.
 */
export async function skipVerificationStmts(ctx: Ctx, applicants: Array<{ id: string; label: string }>, reason: SkipReason): Promise<D1StatementLike[]> {
  if (!applicants.length) return [];
  const now = nowIso();
  const approvers = await usersWithPermission(ctx, "members.approve");
  const one = applicants.length === 1 ? applicants[0]! : null;
  return [
    ctx.db.stmt(
      `UPDATE users SET status = 'PENDING_APPROVAL', updated_at = ?2
       WHERE status = 'EMAIL_VERIFICATION_PENDING' AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?1))`,
      JSON.stringify(applicants.map((a) => a.id)), now),
    auditStmt(ctx, {
      action: "member.verification_skipped", resourceType: "user", resourceId: one?.id ?? null,
      reason: `Waiting for approval without email verification: ${WHY[reason]}.`,
      after: { status: "PENDING_APPROVAL", accounts: applicants.map((a) => a.id).slice(0, 50), count: applicants.length },
      ...(ctx.actor ? {} : { actorUserId: null, actorLabel: "GUCC (automatic)" }),
    }),
    ...notifyStmts(ctx, approvers, {
      type: "member.pending",
      title: one ? "New membership application" : `${applicants.length} membership applications are waiting`,
      body: one
        ? `${one.label} is waiting for approval. Their email isn't verified (${WHY[reason]}): check who they are before approving.`
        : `They were waiting for email verification; ${WHY[reason]}, so they went straight to approval. Check who each one is before approving.`,
      link: "/dashboard/members?status=PENDING_APPROVAL",
      resourceType: "user",
      resourceId: one?.id,
    }),
    ...(one ? await triggerStmts(ctx, "member.pending", { type: "user", id: one.id, status: "PENDING_APPROVAL" }, { title: one.label, link: "/dashboard/members?status=PENDING_APPROVAL" }) : []),
  ];
}

/**
 * The hourly safety net: applications still waiting for verification that never can be verified
 * (email off or out of allowance), or whose verification email never went out, move to Waiting
 * for approval. One statement when there's nothing to do. Accounts younger than ten minutes are
 * left alone (their email may be on its way).
 */
export async function releaseStuckApplications(ctx: Ctx, now = new Date()): Promise<number> {
  const stuck = await ctx.db.all<{ id: string; label: string }>(
    `SELECT u.id, COALESCE(p.full_name, u.email) AS label FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
     WHERE u.status = 'EMAIL_VERIFICATION_PENDING' AND u.deleted_at IS NULL AND u.created_at <= ?1
     ORDER BY u.created_at LIMIT 200`,
    new Date(now.getTime() - 10 * 60_000).toISOString());
  if (!stuck.length) return 0;
  const possible = await canSendVerification(ctx);
  let release = stuck;
  if (possible) {
    // Email works: only those whose latest verification email didn't go out (or never was sent).
    const sent = new Set((await ctx.db.all<{ user_id: string }>(
      `SELECT l.user_id FROM email_log l WHERE l.type = 'account.verify' AND l.status = 'sent' AND l.user_id IN (SELECT value FROM json_each(?1))
         AND l.created_at = (SELECT MAX(x.created_at) FROM email_log x WHERE x.user_id = l.user_id AND x.type = 'account.verify')`,
      JSON.stringify(stuck.map((s) => s.id)))).map((r) => r.user_id));
    release = stuck.filter((s) => !sent.has(s.id));
  }
  if (!release.length) return 0;
  const state = possible ? "email_failed" : (await emailState(ctx)).active ? "email_limit" : "email_off";
  await ctx.db.batch(await skipVerificationStmts(ctx, release, state));
  return release.length;
}
