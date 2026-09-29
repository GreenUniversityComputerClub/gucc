/**
 * Self-service for any signed-in person: signed-in devices, changing the sign-in email, and
 * deleting the account. Each action proves it's really them (password), is rate-limited and
 * audited.
 */
import { limit } from "../limits";
import { holdsProtectedRole } from "../../governance/engine";
import { auditStmt } from "../audit";
import { requireActor } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { randomToken, sha256Hex, verifyPassword } from "../crypto";
import { newId, nowIso } from "../db";
import { emailEnabled } from "../email";
import { SPAM_HINT } from "../../email-hint";
import { assertStmt, batchTransition } from "../transition";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";
import { deliverEmail, getSetting } from "../security";
import { PROFILE_TAGS } from "../people-sync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function checkPassword(ctx: Ctx, password: unknown) {
  const actor = requireActor(ctx);
  await limit(ctx, "account.reauth", actor.user.id);
  const row = await ctx.db.first<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?1", actor.user.id);
  const { ok } = await verifyPassword(String(password ?? ""), row?.password_hash ?? null, ctx.env.PASSWORD_PEPPER, ctx.env.PASSWORD_PEPPER_PREVIOUS);
  if (!ok) throw new ValidationError("That password isn't right.", { password: "Check your password." });
  return actor;
}

/** Devices where this account is signed in; `current` marks the one making the request. */
export async function mySessions(ctx: Ctx, sessionToken: string | null) {
  const actor = requireActor(ctx);
  const current = sessionToken ? await sha256Hex(sessionToken) : null;
  // Only sessions that still work: not waiting for a two-factor code, and within the idle and
  // maximum age the club set (older ones end at their next use anyway).
  const idleDays = await getSetting(ctx, "security.session_idle_days", 14);
  const maxDays = await getSetting(ctx, "security.session_max_days", 30);
  const now = Date.now();
  const rows = await ctx.db.all<{ id: string; created_at: string; last_seen_at: string | null; user_agent: string | null; expires_at: string }>(
    `SELECT id, created_at, last_seen_at, user_agent, expires_at FROM sessions
     WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2 AND mfa_pending = 0
       AND COALESCE(last_seen_at, created_at) > ?3 AND created_at > ?4
     ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 20`,
    actor.user.id, new Date(now).toISOString(), new Date(now - idleDays * 86_400_000).toISOString(), new Date(now - maxDays * 86_400_000).toISOString());
  // The session id is a hash of the secret token; only an opaque reference leaves the API.
  return rows.map((r) => ({ ref: r.id.slice(0, 16), created_at: r.created_at, last_seen_at: r.last_seen_at, device: describeAgent(r.user_agent), current: r.id === current }));
}

/** "Chrome on Android" from a user-agent string, enough to recognise a device. */
export function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}

export async function revokeMySession(ctx: Ctx, ref: string): Promise<void> {
  const actor = requireActor(ctx);
  if (!/^[0-9a-f]{16}$/.test(ref)) throw new ValidationError("Unknown device.");
  const n = await ctx.db.run("UPDATE sessions SET revoked_at = ?3 WHERE user_id = ?1 AND substr(id, 1, 16) = ?2 AND revoked_at IS NULL", actor.user.id, ref, nowIso());
  if (!n) throw new NotFoundError("Device");
  await auditStmt(ctx, { action: "session.revoke", resourceType: "user", resourceId: actor.user.id }).run();
}

/** Sign out everywhere except this device. */
export async function revokeOtherSessions(ctx: Ctx, sessionToken: string | null): Promise<{ signedOut: number }> {
  const actor = requireActor(ctx);
  const keep = sessionToken ? await sha256Hex(sessionToken) : "";
  const signedOut = await ctx.db.run("UPDATE sessions SET revoked_at = ?3 WHERE user_id = ?1 AND id <> ?2 AND revoked_at IS NULL", actor.user.id, keep, nowIso());
  await auditStmt(ctx, { action: "session.revoke_others", resourceType: "user", resourceId: actor.user.id, after: { signedOut } }).run();
  return { signedOut };
}

/** Hours a confirmation link for a new sign-in email stays valid. */
const EMAIL_CHANGE_HOURS = 24;

/**
 * Change the sign-in email. With email working, the new address must be confirmed from a link
 * sent to it (a typo can't hand the account's recovery to a stranger) and the old address is told.
 * Without email, it changes at once (the password was just checked). Either way every other
 * device is signed out, and the security notice reaches the old address as well.
 */
export async function changeEmail(ctx: Ctx, input: { password?: unknown; email?: unknown }): Promise<{ message: string }> {
  const actor = await checkPassword(ctx, input.password);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new ValidationError("Enter a valid email address.", { email: "Enter a valid email address." });
  if (email === actor.user.email.toLowerCase()) throw new ValidationError("That's already your email.", { email: "Enter a different address." });
  if (await ctx.db.first("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL", email)) throw new ConflictError("Another account uses that email.");
  const now = nowIso();
  const old = actor.user.email;
  if (await emailEnabled(ctx)) {
    const token = randomToken(32);
    await ctx.db.batch([
      // One live request: an earlier link stops working.
      ctx.db.stmt("UPDATE email_change_requests SET used_at = ?2 WHERE user_id = ?1 AND used_at IS NULL", actor.user.id, now),
      ctx.db.stmt("INSERT INTO email_change_requests (id, user_id, new_email, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        newId("ecr"), actor.user.id, email, await sha256Hex(token), new Date(Date.now() + EMAIL_CHANGE_HOURS * 3600_000).toISOString(), now),
      auditStmt(ctx, { action: "account.email_change_requested", resourceType: "user", resourceId: actor.user.id, before: { email: old }, after: { email } }),
    ]);
    const sent = await deliverEmail(ctx, {
      to: email,
      subject: "Confirm your new GUCC sign-in email",
      text: `Someone (hopefully you) asked to use this address to sign in to GUCC instead of ${old}.\n\nConfirm it with this link:\n${siteUrl(ctx)}/auth/confirm-email?token=${token}\n\nThe link expires in ${EMAIL_CHANGE_HOURS} hours. If you didn't ask for this, ignore this email; nothing changes.`,
    }, { type: "account.email_change", userId: actor.user.id });
    await deliverEmail(ctx, {
      to: old,
      subject: "Your GUCC sign-in email is being changed",
      text: `A request was made to change your GUCC sign-in email from ${old} to ${email}. It takes effect only when the new address is confirmed.\n\nIf this wasn't you, sign in and change your password now, and tell a club leader.`,
    }, { type: "security.email_change_requested", userId: actor.user.id });
    if (!sent) throw new AppError(503, "EMAIL_FAILED", "The confirmation email couldn't be sent. Nothing changed; try again later.");
    return { message: `Check ${email} for a confirmation link. Until you confirm it, keep signing in with ${old}. ${SPAM_HINT}` };
  }
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET email = ?2, updated_at = ?3, updated_by = ?1 WHERE id = ?1", actor.user.id, email, now),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?3 WHERE user_id = ?1 AND id <> ?2 AND revoked_at IS NULL", actor.user.id, ctx.session?.id ?? "", now),
    auditStmt(ctx, { action: "account.email_change", resourceType: "user", resourceId: actor.user.id, before: { email: old }, after: { email } }),
    ...notifyStmts(ctx, [actor.user.id], { type: "security.email_changed", title: "Your sign-in email was changed", body: `From ${old} to ${email}. You were signed out on other devices. If this wasn't you, contact a club leader.`, link: "/dashboard/security" }),
  ]);
  return { message: `Saved. Sign in with ${email} from now on; your other devices were signed out. (Email isn't set up yet, so nothing was sent.)` };
}

/** The link from the confirmation email: the new address becomes the sign-in email. */
export async function confirmEmailChange(ctx: Ctx, token: string): Promise<{ email: string }> {
  const hash = await sha256Hex(String(token ?? ""));
  const row = await ctx.db.first<{ id: string; user_id: string; new_email: string; expires_at: string; used_at: string | null; old_email: string }>(
    `SELECT r.id, r.user_id, r.new_email, r.expires_at, r.used_at, u.email AS old_email FROM email_change_requests r
     JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL WHERE r.token_hash = ?1`, hash);
  if (!row || row.used_at || row.expires_at < nowIso()) throw new AppError(400, "TOKEN_INVALID", "This link is invalid or has expired. Ask for a new one from your security page.");
  if (await ctx.db.first("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL AND id <> ?2", row.new_email, row.user_id)) throw new ConflictError("Another account uses that email now.");
  const now = nowIso();
  const token2 = newId("t");
  await batchTransition(ctx, [
    // Once only, even if the link is opened twice at the same moment.
    ctx.db.stmt("UPDATE email_change_requests SET used_at = ?2, last_transition = ?3 WHERE id = ?1 AND used_at IS NULL", row.id, now, token2),
    assertStmt(ctx, "EXISTS (SELECT 1 FROM email_change_requests WHERE id = ?1 AND last_transition = ?2)", row.id, token2),
    ctx.db.stmt("UPDATE users SET email = ?2, email_verified_at = ?3, updated_at = ?3 WHERE id = ?1", row.user_id, row.new_email, now),
    // Everyone signs in again with the new address.
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", row.user_id, now),
    auditStmt(ctx, { action: "account.email_change", resourceType: "user", resourceId: row.user_id, actorUserId: row.user_id, actorLabel: row.new_email, before: { email: row.old_email }, after: { email: row.new_email } }),
    ...notifyStmts(ctx, [row.user_id], { type: "security.email_changed", title: "Your sign-in email was changed", body: `From ${row.old_email} to ${row.new_email}. If this wasn't you, contact a club leader.`, link: "/dashboard/security" }),
  ], () => new AppError(400, "TOKEN_INVALID", "This link has already been used."));
  await deliverEmail(ctx, {
    to: row.old_email,
    subject: "Your GUCC sign-in email was changed",
    text: `Your GUCC sign-in email is now ${row.new_email}. If this wasn't you, contact a club leader right away.`,
  }, { type: "security.email_changed", userId: row.user_id });
  return { email: row.new_email };
}

/**
 * Delete my account: the sign-in, roles, grants and private details go. A committee listing
 * stays as part of the club's record, unlinked from the account; a profile with no listings is
 * removed.
 */
export async function deleteOwnAccount(ctx: Ctx, input: { password?: unknown; confirm?: unknown }): Promise<void> {
  const actor = await checkPassword(ctx, input.password);
  if (String(input.confirm ?? "").trim().toUpperCase() !== "DELETE") throw new ValidationError('Type DELETE to confirm.', { confirm: 'Type DELETE.' });
  if (holdsProtectedRole(actor.subject)) {
    const others = (await ctx.db.value<number>(
      `SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.is_protected = 1 JOIN users u ON u.id = ur.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
       WHERE ur.revoked_at IS NULL AND ur.user_id <> ?1`, actor.user.id)) ?? 0;
    if (others === 0) throw new AppError(409, "LAST_PROTECTED_HOLDER", "You're the only Moderator. Appoint another Moderator before deleting your account.");
  }
  const id = actor.user.id;
  const now = nowIso();
  await ctx.db.batch([
    auditStmt(ctx, { action: "account.delete", resourceType: "user", resourceId: id, reason: "Deleted by the account holder" }),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", id, now),
    ctx.db.stmt("DELETE FROM auth_tokens WHERE user_id = ?1", id),
    ctx.db.stmt("UPDATE user_roles SET revoked_at = ?2, reason = 'Account deleted' WHERE user_id = ?1 AND revoked_at IS NULL", id, now),
    ctx.db.stmt("UPDATE user_permissions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", id, now),
    ctx.db.stmt("UPDATE event_registrations SET user_id = NULL WHERE user_id = ?1", id),
    ctx.db.stmt("UPDATE lost_found_posts SET deleted_at = ?2 WHERE user_id = ?1 AND deleted_at IS NULL", id, now),
    ctx.db.stmt("UPDATE conversation_members SET archived_at = COALESCE(archived_at, ?2) WHERE user_id = ?1", id, now),
    // Personal records with no history value go; logs keep the event but not the address.
    ctx.db.stmt("DELETE FROM user_mfa WHERE user_id = ?1", id),
    ctx.db.stmt("DELETE FROM notification_preferences WHERE user_id = ?1", id),
    ctx.db.stmt("DELETE FROM notifications WHERE user_id = ?1", id),
    ctx.db.stmt("UPDATE email_log SET recipient = 'deleted' WHERE user_id = ?1", id),
    ctx.db.stmt("UPDATE authentication_events SET email = NULL, user_agent = NULL WHERE user_id = ?1", id),
    // Open tasks for this person are cancelled (nobody can do them now, and reminders would go nowhere).
    ctx.db.stmt("UPDATE tasks SET status = 'CANCELLED', updated_at = ?2 WHERE assignee_user_id = ?1 AND status IN ('OPEN', 'IN_PROGRESS') AND deleted_at IS NULL", id, now),
    // Executives stay in the club's history by name and position only: their photo, bio, links
    // and public email go from every listing too.
    ctx.db.stmt(
      `UPDATE committee_members SET avatar_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, bio = NULL,
              legacy_json = CASE WHEN legacy_json IS NULL THEN NULL ELSE json_remove(legacy_json, '$.linkedin', '$.github', '$.twitter', '$.facebook', '$.mail') END, updated_at = ?2
       WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = ?1)`, id, now),
    // Profiles without committee history are personal only: remove them.
    ctx.db.stmt(
      `UPDATE profiles SET deleted_at = ?2, full_name = 'Former member', student_id = NULL, phone = NULL, bio = NULL, public_email = NULL, skills_json = NULL,
              linkedin_url = NULL, github_url = NULL, twitter_url = NULL, facebook_url = NULL, website_url = NULL, avatar_media_id = NULL, user_id = NULL
       WHERE user_id = ?1 AND NOT EXISTS (SELECT 1 FROM committee_members cm WHERE cm.profile_id = profiles.id AND cm.deleted_at IS NULL)`, id, now),
    ctx.db.stmt(
      `UPDATE profiles SET user_id = NULL, phone = NULL, bio = NULL, public_email = NULL, skills_json = NULL, linkedin_url = NULL, github_url = NULL, twitter_url = NULL,
              facebook_url = NULL, website_url = NULL, avatar_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, updated_at = ?2
       WHERE user_id = ?1`, id, now),
    ctx.db.stmt(
      `UPDATE users SET email = 'deleted+' || id || '@invalid', password_hash = NULL, status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2,
              correction_note = NULL, review_note = NULL, rejected_reason = NULL, suspended_reason = NULL WHERE id = ?1`, id, now),
  ]);
  ctx.revalidate?.(PROFILE_TAGS);
}
