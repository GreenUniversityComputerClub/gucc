/**
 * One person, the same everywhere. The profile is the truth for the current committee and the
 * one being prepared: its photo, framing, name, faculty designation and links show on their
 * listings the moment they change. A past committee keeps a snapshot, frozen onto its listings
 * when it stops being current, so history doesn't change when people do.
 */
import type { Ctx } from "./context";
import type { D1StatementLike } from "./db";

/** Public pages that show profile data: the rosters (committees) and blog bylines (posts). */
export const PROFILE_TAGS = ["committees", "posts"];

/** Listings of the current committee and the one being prepared. */
const LIVE_LISTING = "committee_id IN (SELECT id FROM committees WHERE status IN ('CURRENT', 'UPCOMING') AND deleted_at IS NULL)";

/**
 * When a profile photo changes (or is removed): the live listings drop their own photo copy and
 * framing, so the new photo shows and no old zoom is applied to it. Removing a photo then shows
 * initials instead of an old copy. Put it in the batch BEFORE the profile update: it only acts
 * when `newPhotoId` differs from the photo the profile has now. Callers reset the profile's own
 * framing in their update the same way (`CASE WHEN avatar_media_id IS ?new THEN … END`).
 */
export function photoChangedStmt(ctx: Ctx, profileId: string, newPhotoId: string | null, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET avatar_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, updated_at = ?3
     WHERE profile_id = ?1 AND deleted_at IS NULL AND ${LIVE_LISTING}
       AND (SELECT avatar_media_id FROM profiles WHERE id = ?1) IS NOT ?2
       AND (avatar_media_id IS NOT NULL OR avatar_position_x IS NOT NULL OR avatar_position_y IS NOT NULL OR avatar_scale IS NOT NULL)`,
    profileId, newPhotoId, now,
  );
}

/** SET clause for a profile update: keep the framing only while the photo stays the same (`?n` holds the new photo id). */
export const keepFramingIfSame = (param: string) =>
  `avatar_position_x = CASE WHEN avatar_media_id IS ${param} THEN avatar_position_x END, avatar_position_y = CASE WHEN avatar_media_id IS ${param} THEN avatar_position_y END, avatar_scale = CASE WHEN avatar_media_id IS ${param} THEN avatar_scale END`;

/**
 * Freeze the current committee's listings before it is archived: what they show from the live
 * profiles (photo and framing, name, faculty designation, links and public email) is copied onto
 * the listings. Run in the same batch, before the status change. `keepId` is the committee
 * becoming current (never frozen).
 */
export function freezeCurrentListingsStmt(ctx: Ctx, keepId: string | null, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET
       avatar_media_id = COALESCE(p.avatar_media_id, committee_members.avatar_media_id),
       avatar_position_x = CASE WHEN p.avatar_media_id IS NOT NULL AND committee_members.avatar_position_x IS NULL THEN p.avatar_position_x ELSE committee_members.avatar_position_x END,
       avatar_position_y = CASE WHEN p.avatar_media_id IS NOT NULL AND committee_members.avatar_position_y IS NULL THEN p.avatar_position_y ELSE committee_members.avatar_position_y END,
       avatar_scale = CASE WHEN p.avatar_media_id IS NOT NULL AND committee_members.avatar_scale IS NULL THEN p.avatar_scale ELSE committee_members.avatar_scale END,
       display_name = COALESCE(committee_members.display_name, p.full_name),
       designation = COALESCE(committee_members.designation, CASE WHEN committee_members.section = 'FACULTY' THEN p.designation END),
       legacy_json = json_set(COALESCE(committee_members.legacy_json, '{}'),
         '$.linkedin', p.linkedin_url, '$.github', p.github_url, '$.twitter', p.twitter_url, '$.facebook', p.facebook_url, '$.mail', p.public_email),
       updated_at = ?2
     FROM profiles p
     WHERE p.id = committee_members.profile_id AND committee_members.deleted_at IS NULL
       AND committee_members.committee_id IN (SELECT id FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL AND id IS NOT ?1)`,
    keepId, now,
  );
}

/**
 * A renamed position: live listings that still show the old name take the new one. Titles
 * someone chose on purpose ("Joint Secretary (Activity)") and past committees stay as they are.
 */
export function positionRenamedStmt(ctx: Ctx, positionId: string, oldName: string, newName: string, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET position_title = ?3, updated_at = ?4
     WHERE position_id = ?1 AND position_title = ?2 AND deleted_at IS NULL AND ${LIVE_LISTING}`,
    positionId, oldName, newName, now,
  );
}

/**
 * Before a duplicate's listings move to the kept profile: live listings drop the duplicate's
 * spelling of the name, and (when the kept profile has a photo) the duplicate's photo copy and
 * framing, so they show the kept person. Past committees keep their snapshot.
 */
export function mergedListingsStmt(ctx: Ctx, dropId: string, dropName: string, keepHasPhoto: boolean, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET display_name = CASE WHEN display_name = ?2 THEN NULL ELSE display_name END,
       avatar_media_id = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_media_id END,
       avatar_position_x = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_position_x END,
       avatar_position_y = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_position_y END,
       avatar_scale = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_scale END, updated_at = ?4
     WHERE profile_id = ?1 AND deleted_at IS NULL AND ${LIVE_LISTING}`,
    dropId, dropName, keepHasPhoto ? 1 : 0, now,
  );
}

/** "mailto:x@y" (as some imported profiles stored it) → "x@y". */
export function cleanPublicEmail(v: unknown): unknown {
  return typeof v === "string" ? v.trim().replace(/^mailto:+/i, "") : v;
}
