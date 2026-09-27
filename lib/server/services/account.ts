/**
 * Self-service for any signed-in person: signed-in devices, changing the sign-in email, and
 * deleting the account. Each action proves it's really them (password), is rate-limited and
 * audited.
 */
import { limit } from "../limits";
import { holdsProtectedRole } from "../../governance/engine";
import { auditStmt } from "../audit";
import { requireActor } from "../authz";
import type { Ctx } from "../context";
import { sha256Hex, verifyPassword } from "../crypto";
import { nowIso } from "../db";
import { emailEnabled } from "../email";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";

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
  const rows = await ctx.db.all<{ id: string; created_at: string; last_seen_at: string | null; user_agent: string | null; expires_at: string }>(
    "SELECT id, created_at, last_seen_at, user_agent, expires_at FROM sessions WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2 ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 20",
    actor.user.id, nowIso());
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

export async function changeEmail(ctx: Ctx, input: { password?: unknown; email?: unknown }): Promise<{ message: string }> {
  const actor = await checkPassword(ctx, input.password);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new ValidationError("Enter a valid email address.", { email: "Enter a valid email address." });
  if (email === actor.user.email.toLowerCase()) throw new ValidationError("That's already your email.", { email: "Enter a different address." });
  if (await ctx.db.first("SELECT id FROM users WHERE email = ?1 AND deleted_at IS NULL", email)) throw new ConflictError("Another account uses that email.");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET email = ?2, updated_at = ?3, updated_by = ?1 WHERE id = ?1", actor.user.id, email, now),
    auditStmt(ctx, { action: "account.email_change", resourceType: "user", resourceId: actor.user.id, before: { email: actor.user.email }, after: { email } }),
    ...notifyStmts(ctx, [actor.user.id], { type: "security.email_changed", title: "Your sign-in email was changed", body: `From ${actor.user.email} to ${email}. If this wasn't you, contact a club leader.`, link: "/dashboard/security" }),
  ]);
  return { message: (await emailEnabled(ctx)) ? `Saved. Sign in with ${email} from now on.` : `Saved. Sign in with ${email} from now on. (Email isn't set up yet, so nothing was sent.)` };
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
    // Profiles without committee history are personal only: remove them.
    ctx.db.stmt(
      `UPDATE profiles SET deleted_at = ?2, full_name = 'Deleted member', student_id = NULL, phone = NULL, bio = NULL, public_email = NULL, skills_json = NULL,
              linkedin_url = NULL, github_url = NULL, twitter_url = NULL, facebook_url = NULL, website_url = NULL, user_id = NULL
       WHERE user_id = ?1 AND NOT EXISTS (SELECT 1 FROM committee_members cm WHERE cm.profile_id = profiles.id AND cm.deleted_at IS NULL)`, id, now),
    // Executives stay in the club's history; only the private details and the link go.
    ctx.db.stmt("UPDATE profiles SET user_id = NULL, phone = NULL, updated_at = ?2 WHERE user_id = ?1", id, now),
    ctx.db.stmt(
      `UPDATE users SET email = 'deleted+' || id || '@invalid', password_hash = NULL, status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2,
              correction_note = NULL, review_note = NULL, rejected_reason = NULL, suspended_reason = NULL WHERE id = ?1`, id, now),
  ]);
}
