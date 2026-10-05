/**
 * Erasing accounts: what deleting an account means, the same whether the person does it or the
 * club's leadership does. The sign-in, roles, grants and private details go; messages stay in the
 * conversations as "Former member"; a committee listing stays in the club's history by name and
 * position only, unlinked from the account; a profile with no listings is removed. Certificates
 * stay valid records, without the account or the address.
 *
 * One fixed set of statements for any number of accounts (the ids go in as one JSON list), so a
 * bulk deletion costs the same as a single one.
 */
import type { Ctx } from "../context";
import type { D1StatementLike } from "../db";

const IDS = "(SELECT value FROM json_each(?1))";

export function erasureStatements(ctx: Ctx, userIds: string[], now: string): D1StatementLike[] {
  const ids = JSON.stringify([...new Set(userIds)]);
  return [
    ctx.db.stmt(`UPDATE sessions SET revoked_at = ?2 WHERE user_id IN ${IDS} AND revoked_at IS NULL`, ids, now),
    ctx.db.stmt(`DELETE FROM auth_tokens WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`UPDATE user_roles SET revoked_at = ?2, reason = 'Account deleted' WHERE user_id IN ${IDS} AND revoked_at IS NULL`, ids, now),
    ctx.db.stmt(`UPDATE user_permissions SET revoked_at = ?2 WHERE user_id IN ${IDS} AND revoked_at IS NULL`, ids, now),
    ctx.db.stmt(`UPDATE event_registrations SET user_id = NULL WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`UPDATE lost_found_posts SET deleted_at = ?2 WHERE user_id IN ${IDS} AND deleted_at IS NULL`, ids, now),
    // Direct conversations are archived; groups are left (their messages stay, as "Former member").
    ctx.db.stmt(`UPDATE conversation_members SET archived_at = COALESCE(archived_at, ?2),
                   left_at = CASE WHEN conversation_id IN (SELECT conversation_id FROM chat_groups) THEN COALESCE(left_at, ?2) ELSE left_at END
                 WHERE user_id IN ${IDS}`, ids, now),
    // Personal records with no history value go; logs keep the event but not the address.
    ctx.db.stmt(`DELETE FROM user_mfa WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`DELETE FROM notification_preferences WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`DELETE FROM notifications WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`UPDATE email_log SET recipient = 'deleted' WHERE user_id IN ${IDS}`, ids),
    ctx.db.stmt(`UPDATE authentication_events SET email = NULL, user_agent = NULL WHERE user_id IN ${IDS}`, ids),
    // Emails still waiting to go to them are dropped, and their address leaves the lists.
    ctx.db.stmt(`UPDATE email_campaign_recipients SET email = 'deleted+' || campaign_id || '-' || seq, name = NULL, data_json = NULL,
                   status = CASE WHEN status IN ('PENDING', 'SENDING') THEN 'SKIPPED' ELSE status END
                 WHERE user_id IN ${IDS}`, ids),
    // Certificates stay as the club's record, without the account or the address.
    ctx.db.stmt(`UPDATE certificates SET user_id = NULL, recipient_email = NULL, updated_at = ?2 WHERE user_id IN ${IDS}`, ids, now),
    // Open tasks for them are cancelled (nobody can do them now, and reminders would go nowhere).
    ctx.db.stmt(`UPDATE tasks SET status = 'CANCELLED', updated_at = ?2 WHERE assignee_user_id IN ${IDS} AND status IN ('OPEN', 'IN_PROGRESS') AND deleted_at IS NULL`, ids, now),
    // Executives stay in the club's history by name and position only: their photo, bio, links
    // and public email go from every listing too.
    ctx.db.stmt(
      `UPDATE committee_members SET avatar_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, bio = NULL,
              legacy_json = CASE WHEN legacy_json IS NULL THEN NULL ELSE json_remove(legacy_json, '$.linkedin', '$.github', '$.twitter', '$.facebook', '$.mail') END, updated_at = ?2
       WHERE profile_id IN (SELECT id FROM profiles WHERE user_id IN ${IDS})`, ids, now),
    // Profiles without committee history are personal only: remove them.
    ctx.db.stmt(
      `UPDATE profiles SET deleted_at = ?2, full_name = 'Former member', student_id = NULL, phone = NULL, bio = NULL, public_email = NULL, skills_json = NULL,
              linkedin_url = NULL, github_url = NULL, twitter_url = NULL, facebook_url = NULL, website_url = NULL, avatar_media_id = NULL, cutout_media_id = NULL, user_id = NULL
       WHERE user_id IN ${IDS} AND NOT EXISTS (SELECT 1 FROM committee_members cm WHERE cm.profile_id = profiles.id AND cm.deleted_at IS NULL)`, ids, now),
    ctx.db.stmt(
      `UPDATE profiles SET user_id = NULL, phone = NULL, bio = NULL, public_email = NULL, skills_json = NULL, linkedin_url = NULL, github_url = NULL, twitter_url = NULL,
              facebook_url = NULL, website_url = NULL, avatar_media_id = NULL, cutout_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, updated_at = ?2
       WHERE user_id IN ${IDS}`, ids, now),
    ctx.db.stmt(
      `UPDATE users SET email = 'deleted+' || id || '@invalid', password_hash = NULL, status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2,
              correction_note = NULL, review_note = NULL, rejected_reason = NULL, suspended_reason = NULL WHERE id IN ${IDS}`, ids, now),
  ];
}
