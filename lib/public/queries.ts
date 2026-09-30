/**
 * Read-model SQL for the public site. Shared with the migration verifier so
 * "what the site shows" and "what verification checked" are the same query.
 * Only public columns are selected; private ones (phone, legacy_json, emails
 * of participants) are never part of these statements.
 */

/** Current and past committees. One being prepared (UPCOMING) stays private until it's made current. */
export const COMMITTEES_SQL = `
SELECT id, slug, name, status, layout_json
FROM committees
WHERE deleted_at IS NULL AND status <> 'UPCOMING'
ORDER BY CAST(slug AS INTEGER), slug`;

/**
 * The photo a committee listing shows, in every year (past committees too): the person's profile
 * photo when they have a usable one, so a new photo shows at once on the roster, their executive
 * page and every past year they served. A listing's own photo is only the fallback for people
 * whose profile has none (older imports). The dashboard's committee page uses the same rule, so
 * admins and visitors always see one photo.
 */
export const listingAvatarIdSql = (cm: string, p: string) =>
  `COALESCE((SELECT pm.id FROM media pm WHERE pm.id = ${p}.avatar_media_id AND pm.deleted_at IS NULL AND pm.visibility = 'PUBLIC' AND pm.status = 'READY'), ${cm}.avatar_media_id)`;

const MEMBER_COLUMNS = `
  cm.committee_id, cm.section, cm.unit_type, cm.unit_key, cm.display_order, cm.position_title,
  cm.display_name, cm.designation, cm.campus_label, cm.legacy_json AS cm_legacy_json,
  cm.avatar_position_x AS cm_avatar_x, cm.avatar_position_y AS cm_avatar_y, cm.avatar_scale AS cm_avatar_scale,
  p.full_name, p.student_id, p.department, p.designation AS profile_designation, p.public_email,
  p.linkedin_url, p.github_url, p.twitter_url, p.facebook_url,
  p.avatar_position_x AS p_avatar_x, p.avatar_position_y AS p_avatar_y, p.avatar_scale AS p_avatar_scale,
  (m.id IS NOT NULL AND m.id IS p.avatar_media_id) AS avatar_is_profile,
  CASE WHEN p.visibility = 'PUBLIC' THEN p.slug END AS public_handle,
  m.storage AS avatar_storage, m.object_key AS avatar_object_key, m.legacy_path AS avatar_legacy_path, m.external_url AS avatar_external_url,
  cut.storage AS cutout_storage, cut.object_key AS cutout_object_key`;

const MEMBER_FROM = `
FROM committee_members cm
JOIN committees co ON co.id = cm.committee_id
JOIN profiles p ON p.id = cm.profile_id AND p.deleted_at IS NULL
LEFT JOIN media m ON m.id = ${listingAvatarIdSql("cm", "p")}
  AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC' AND m.status = 'READY'
-- The profile photo's cut-out (background removed), only while that photo is the one shown.
LEFT JOIN media cut ON cut.id = p.cutout_media_id AND m.id IS p.avatar_media_id
  AND cut.deleted_at IS NULL AND cut.visibility = 'PUBLIC' AND cut.status = 'READY'
WHERE cm.deleted_at IS NULL
  -- Someone whose assignment ended leaves the current roster (their year keeps them in history).
  AND NOT (co.status = 'CURRENT' AND cm.end_date IS NOT NULL AND cm.end_date < strftime('%Y-%m-%d', 'now'))`;

export const MEMBERS_SQL = `SELECT ${MEMBER_COLUMNS} ${MEMBER_FROM} ORDER BY cm.committee_id, cm.display_order`;

export const PUBLIC_EVENT_STATUSES = ["PUBLISHED", "ONGOING", "COMPLETED"] as const;

const EVENTS_SELECT = `
SELECT e.id, e.legacy_sl, e.slug, e.title, e.description, c.name AS category_name, e.organizer, e.venue,
       e.start_at, e.end_at, e.time_text, e.participants_reported, e.participants_text, e.external_link, e.guests_text, e.judges_text,
       e.status, e.registration_enabled, e.registration_opens_at, e.registration_closes_at, e.registration_form_url, e.registration_form_label,
       e.capacity, CASE WHEN e.registration_enabled = 1 AND e.capacity IS NOT NULL THEN
         (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED')) END AS seats_taken,
       m.storage AS banner_storage, m.object_key AS banner_object_key, m.legacy_path AS banner_legacy_path,
       m.external_url AS banner_external_url, m.variants_json AS banner_variants_json
FROM events e
LEFT JOIN categories c ON c.id = e.category_id
LEFT JOIN media m ON m.id = e.banner_media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC'
WHERE e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED')`;

// Pages sort by date only (a stable sort), so events on the same day keep this order: the order
// they were added in, as in the original events.json, whatever their start times.
export const EVENTS_SQL = `${EVENTS_SELECT}
ORDER BY substr(e.start_at, 1, 10), e.rowid`;

/** One event by its address; a cancelled one too, so its page can say so instead of a 404. */
export const EVENT_BY_SLUG_SQL = EVENTS_SELECT
  .replace("SELECT e.id,", "SELECT e.registration_fields_json, e.id,")
  .replace("e.status IN ('PUBLISHED','ONGOING','COMPLETED')", "e.status IN ('PUBLISHED','ONGOING','COMPLETED','CANCELLED')") + " AND e.slug = ?1";

export const CONTESTS_SQL = `
SELECT c.id, c.legacy_id, c.type, c.title, c.held_on_text, c.host, c.platform, c.contest_link, c.problemset_link, c.standings_link, c.editorial_link, c.practice_link,
       ev.slug AS event_slug, ev.title AS event_title
FROM contests c
LEFT JOIN events ev ON ev.id = c.event_id AND ev.deleted_at IS NULL AND ev.status IN ('PUBLISHED','ONGOING','COMPLETED')
WHERE c.deleted_at IS NULL AND c.status = 'PUBLISHED' ORDER BY c.legacy_id`;

export const CONTEST_TEAMS_SQL = `
SELECT t.contest_id, t.name, t.rank, t.solved, t.achievement, t.members_json, t.sort_order
FROM contest_teams t JOIN contests c ON c.id = t.contest_id
WHERE c.deleted_at IS NULL AND c.status = 'PUBLISHED'
ORDER BY t.contest_id, t.sort_order`;

export const CONTEST_IMAGES_SQL = `
SELECT cm.contest_id, cm.sort_order, m.storage, m.object_key, m.legacy_path, m.external_url, m.id, m.variants_json
FROM contest_media cm JOIN media m ON m.id = cm.media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC'
ORDER BY cm.contest_id, cm.sort_order`;
