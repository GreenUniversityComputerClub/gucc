/**
 * One person, the same everywhere.
 *   - Photo: the profile's photo shows on every listing, past committees included, so a new
 *     photo reaches the roster, the executive page and every year the person served at once.
 *   - Name, faculty designation, links: the profile is the truth for the current committee and
 *     the one being prepared. A past committee keeps a snapshot of them, frozen onto its listings
 *     when it stops being current, so the record of who held which post doesn't change.
 */
import type { Ctx } from "./context";
import type { D1StatementLike } from "./db";

/** Public pages that show profile data: the rosters (committees) and blog bylines (posts). */
export const PROFILE_TAGS = ["committees", "posts"];

/** Listings of the current committee and the one being prepared. */
const LIVE_LISTING = "committee_id IN (SELECT id FROM committees WHERE status IN ('CURRENT', 'UPCOMING') AND deleted_at IS NULL)";

/**
 * When a profile photo changes (or is removed): every listing of the person, in every year,
 * drops its own photo copy and framing, so the new photo shows everywhere and no old zoom is
 * applied to it. Removing a photo then shows initials instead of an old copy. Put it in the batch
 * BEFORE the profile update: it only acts when `newPhotoId` differs from the photo the profile has
 * now. Callers reset the profile's own framing in their update the same way
 * (`CASE WHEN avatar_media_id IS ?new THEN … END`).
 */
export function photoChangedStmt(ctx: Ctx, profileId: string, newPhotoId: string | null, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET avatar_media_id = NULL, avatar_position_x = NULL, avatar_position_y = NULL, avatar_scale = NULL, updated_at = ?3
     WHERE profile_id = ?1 AND deleted_at IS NULL
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
 * profiles (name, faculty designation, links and public email) is copied onto the listings. The
 * photo is not copied: it keeps following the profile in past years too. Run in the same batch,
 * before the status change. `keepId` is the committee becoming current (never frozen).
 */
export function freezeCurrentListingsStmt(ctx: Ctx, keepId: string | null, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET
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
 * spelling of the name (past committees keep theirs), and every listing, past ones included,
 * drops the duplicate's photo copy and framing when the kept profile has a photo, so they all
 * show the kept person's photo.
 */
export function mergedListingsStmt(ctx: Ctx, dropId: string, dropName: string, keepHasPhoto: boolean, now: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE committee_members SET display_name = CASE WHEN display_name = ?2 AND ${LIVE_LISTING} THEN NULL ELSE display_name END,
       avatar_media_id = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_media_id END,
       avatar_position_x = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_position_x END,
       avatar_position_y = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_position_y END,
       avatar_scale = CASE WHEN ?3 = 1 THEN NULL ELSE avatar_scale END, updated_at = ?4
     WHERE profile_id = ?1 AND deleted_at IS NULL`,
    dropId, dropName, keepHasPhoto ? 1 : 0, now,
  );
}

/** "mailto:x@y" (as some imported profiles stored it) → "x@y". */
export function cleanPublicEmail(v: unknown): unknown {
  return typeof v === "string" ? v.trim().replace(/^mailto:+/i, "") : v;
}
