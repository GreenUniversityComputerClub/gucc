-- Platform v6 (2026-09-29). Additive only: nullable columns, indexes, seed rows, and data updates
-- that touch a row only while it still holds a copy or the seeded value.
--
--   * people data           a person's profile photo is their photo in every committee, past ones
--                           included: listing copies go wherever the profile has a photo (4 past
--                           listings on production showed an old photo; they now show the new
--                           one). Live listings also stop carrying copies of the profile's name
--                           and faculty designation (identical today, so nothing changes there)
--   * public_email          "mailto:" prefixes stored by the legacy import are removed
--   * notifications         who caused each one (actor_user_id), for the sender's name and photo
--   * reports / users       a report category, and a moderator's pause on someone's messaging
--   * messages.client_id    the browser's id for a message, so a double send stores it once
--   * profiles              every member has a page others can visit (/members/<handle>); each
--                           chooses who sees it (visibility), and handles are unique
--   * member submissions    every approved member can write blog posts and propose events (own
--                           only, published after approval); "content reviewers" and "event
--                           reviewers" policies add anyone who may publish club-wide as a reviewer;
--                           a switch (content.member_submissions) pauses it
--
-- Release order: the previous Worker still reads COALESCE(listing, profile). Once a listing's copy
-- is gone it shows the profile's photo too, which is the intended result, so it keeps working on
-- the migrated database.
--
-- Restore: this migration only adds; to undo, restore the D1 backup taken by the release
-- (release.ts / deploy.yml) or use D1 Time Travel to the point before it ran.

-- ── People data: one photo per person, in every year ─────────────────────────────
-- Every listing (past committees too) whose person has a usable profile photo drops its own copy,
-- so the profile photo shows. A copy that was a different (older) photo also drops the framing
-- that was set for it. People without a profile photo keep their listing's photo as it is.
UPDATE committee_members SET
    avatar_position_x = CASE WHEN committee_members.avatar_media_id = p.avatar_media_id THEN committee_members.avatar_position_x END,
    avatar_position_y = CASE WHEN committee_members.avatar_media_id = p.avatar_media_id THEN committee_members.avatar_position_y END,
    avatar_scale = CASE WHEN committee_members.avatar_media_id = p.avatar_media_id THEN committee_members.avatar_scale END,
    avatar_media_id = NULL
  FROM profiles p JOIN media pm ON pm.id = p.avatar_media_id AND pm.deleted_at IS NULL AND pm.visibility = 'PUBLIC' AND pm.status = 'READY'
  WHERE p.id = committee_members.profile_id AND committee_members.deleted_at IS NULL AND committee_members.avatar_media_id IS NOT NULL;

-- Name and faculty designation: only copies equal to the profile's value, and only on the current
-- or upcoming committee. Past committees keep their snapshot of who held which post.
UPDATE committee_members SET display_name = NULL
  WHERE deleted_at IS NULL AND display_name IS NOT NULL
    AND committee_id IN (SELECT id FROM committees WHERE status IN ('CURRENT', 'UPCOMING'))
    AND display_name = (SELECT p.full_name FROM profiles p WHERE p.id = committee_members.profile_id);
UPDATE committee_members SET designation = NULL
  WHERE deleted_at IS NULL AND designation IS NOT NULL AND section = 'FACULTY'
    AND committee_id IN (SELECT id FROM committees WHERE status IN ('CURRENT', 'UPCOMING'))
    AND designation = (SELECT p.designation FROM profiles p WHERE p.id = committee_members.profile_id);

-- ── Public email without "mailto:" ───────────────────────────────────────────────
UPDATE profiles SET public_email = NULLIF(ltrim(substr(trim(public_email), 8), ':'), '')
  WHERE lower(trim(public_email)) LIKE 'mailto:%';

-- ── Notifications: who caused them ───────────────────────────────────────────────
-- Filled from the signed-in person making the request; empty for scheduled jobs (shown as GUCC).
ALTER TABLE notifications ADD COLUMN actor_user_id TEXT;

-- ── Reporting and moderating messages ────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN category TEXT CHECK (category IS NULL OR category IN ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'SCAM', 'OTHER'));
-- Until when a moderator paused this person's messaging after a report (reading still works).
ALTER TABLE users ADD COLUMN chat_restricted_until TEXT;

-- ── A message sent twice (double Enter, retry after a dropped connection) is stored once ──
ALTER TABLE messages ADD COLUMN client_id TEXT CHECK (client_id IS NULL OR length(client_id) BETWEEN 8 AND 64);
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_uq ON messages(sender_id, client_id) WHERE client_id IS NOT NULL;

-- ── Member submissions ────────────────────────────────────────────────────────────
-- Their own blog posts and events, never published without approval (the member role has no
-- publish rights). Existing grants and administrators' changes are left alone.
INSERT INTO role_permissions (role_id, permission_id, scope, scope_value)
  SELECT 'role:member', 'perm:' || k.value, 'OWN', '' FROM json_each('["posts.read","posts.create","posts.update","posts.submit","events.read","events.create","events.update","media.upload","media.update"]') AS k
  WHERE EXISTS (SELECT 1 FROM roles WHERE id = 'role:member') AND EXISTS (SELECT 1 FROM permissions WHERE id = 'perm:' || k.value)
  ON CONFLICT(role_id, permission_id, scope, scope_value) DO NOTHING;

-- Reviewers: the President, the General Secretary, a Moderator, or anyone the leaders let publish
-- club-wide (the Publication Secretary today). Leaders can change them under Rules → Policies.
INSERT INTO approval_policies (id, key, name, description, mode, threshold, approvers_json, allow_self_approval, is_protected) VALUES
  ('policy:content-reviewers', 'content-reviewers', 'Content reviewers',
   'The President, the General Secretary, a Moderator, or anyone who can publish posts club-wide approves.', 'ANY', NULL,
   '[{"type":"position","value":"president"},{"type":"position","value":"general-secretary"},{"type":"role","value":"moderator"},{"type":"permission","value":"posts.publish"}]', 0, 0),
  ('policy:event-reviewers', 'event-reviewers', 'Event reviewers',
   'The President, the General Secretary, a Moderator, or anyone who can publish events club-wide approves.', 'ANY', NULL,
   '[{"type":"position","value":"president"},{"type":"position","value":"general-secretary"},{"type":"role","value":"moderator"},{"type":"permission","value":"events.publish"}]', 0, 0)
  ON CONFLICT(id) DO NOTHING;

-- Submissions go to them, only while nobody has chosen another policy in Settings.
UPDATE system_settings SET value_json = '"content-reviewers"'
  WHERE key = 'content.default_approval_policy' AND updated_by IS NULL AND value_json = '"leadership-any"';
UPDATE system_settings SET value_json = '"event-reviewers"'
  WHERE key = 'events.default_approval_policy' AND updated_by IS NULL AND value_json = '"leadership-any"';

INSERT INTO system_settings (key, value_json, is_protected, description) VALUES
  ('content.member_submissions', 'true', 0, 'Approved members can write blog posts and propose events (published after approval). Switch off to pause new ones.')
  ON CONFLICT(key) DO NOTHING;

-- When the reviewers of a request waiting two days were reminded (once).
ALTER TABLE approval_requests ADD COLUMN reminded_at TEXT;

-- ── Profiles people can visit ─────────────────────────────────────────────────────
-- Who sees a member's profile: signed-in members (default), everyone, or only them.
ALTER TABLE profiles ADD COLUMN visibility TEXT NOT NULL DEFAULT 'MEMBERS' CHECK (visibility IN ('PUBLIC', 'MEMBERS', 'PRIVATE'));
-- The profile address (/members/<slug>) is unique among live profiles. Every live profile already
-- has a distinct slug or none (checked read-only on production before this release); the few
-- without one get it from their name the first time their page is opened.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_uq ON profiles(slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;
