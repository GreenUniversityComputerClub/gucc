-- Platform v5 (2026-09-28). Additive only: new tables and nullable columns, new settings, and
-- targeted content updates that touch a row only while it still holds the seeded value.
--
--   * email                 SMTP2GO replaces Resend: setting descriptions, a monthly cap
--                           (SMTP2GO free: 1,000 a month, 200 a day) and a lower daily default
--   * nav.services          the navbar Services menu no longer lists Class Scheduler or
--                           Certificate Verification (the pages stay reachable by link)
--   * page.home             Sagufta Sabah Nakshi replaces Feroza Naznin among the Deputy Moderators
--   * user_mfa              a second (pending) secret, to move two-factor to a new phone
--   * reports.snapshot      the reported text, kept even if its author edits or deletes it
--   * email_change_requests a new sign-in email is used only after its link is opened
--   * tasks/meetings        reminded_at, for "due soon" and "starting soon" reminders
--   * settings              page.collaborations and chatbot.knowledge exist on a fresh database
--
-- Restore: this migration only adds; to undo, restore the D1 backup taken by the release
-- (release.ts / deploy.yml) or use D1 Time Travel to the point before it ran.

-- ── Email through SMTP2GO ────────────────────────────────────────────────────
INSERT INTO system_settings (key, value_json, is_protected, description) VALUES
  ('email.monthly_limit', '1000', 0, 'Emails per calendar month, UTC (the SMTP2GO free plan stops at 1,000).')
  ON CONFLICT(key) DO NOTHING;
UPDATE system_settings SET description = 'Send email through SMTP2GO. Turn on only after a successful test email from System health.'
  WHERE key = 'email.enabled';
UPDATE system_settings SET description = 'Emails per day (the SMTP2GO free plan allows 200 a day and 1,000 a month).'
  WHERE key = 'email.daily_limit';
-- 40 a day keeps a whole month inside 1,000. Only while nobody has chosen a value.
UPDATE system_settings SET value_json = '40'
  WHERE key = 'email.daily_limit' AND updated_by IS NULL AND value_json = '90';

-- ── Navbar Services menu ─────────────────────────────────────────────────────
-- Keeps every other item (and its order) exactly as it is.
UPDATE organization_settings
  SET value_json = json_set(value_json, '$.items', (
        SELECT json_group_array(json(j.value)) FROM json_each(organization_settings.value_json, '$.items') AS j
        WHERE json_extract(j.value, '$.href') NOT IN ('/scheduler', '/certificates/hacktheai/verify'))),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE key = 'nav.services'
    AND EXISTS (SELECT 1 FROM json_each(organization_settings.value_json, '$.items') AS j
                WHERE json_extract(j.value, '$.href') IN ('/scheduler', '/certificates/hacktheai/verify'));

-- ── Home page: Deputy Moderators ─────────────────────────────────────────────
-- Same place, title and message; only while that card still shows Feroza Naznin.
UPDATE organization_settings
  SET value_json = json_set(value_json,
        '$.moderators.people[1].name', 'Sagufta Sabah Nakshi',
        '$.moderators.people[1].photo', '/executives/nakshi.png',
        '$.moderators.people[1].initials', 'SN'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE key = 'page.home' AND json_extract(value_json, '$.moderators.people[1].name') = 'Feroza Naznin';

-- ── Two-factor: move to a new phone without turning it off ───────────────────
-- The new secret waits here until the new app's first code proves it works.
ALTER TABLE user_mfa ADD COLUMN pending_secret_enc TEXT;
ALTER TABLE user_mfa ADD COLUMN pending_at TEXT;

-- ── Reports keep what was reported ───────────────────────────────────────────
-- A copy of the message or post text when it was reported, so a later edit or delete by its
-- author can't hide it from the moderators.
ALTER TABLE reports ADD COLUMN snapshot TEXT CHECK (snapshot IS NULL OR length(snapshot) <= 4000);
-- Deleting or removing a message clears its preview from notifications.
CREATE INDEX IF NOT EXISTS notifications_resource_idx ON notifications(resource_type, resource_id) WHERE resource_type IS NOT NULL;

-- ── Changing the sign-in email ───────────────────────────────────────────────
-- With email working, a new address is used only after the link sent to it is opened.
CREATE TABLE IF NOT EXISTS email_change_requests (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  new_email        TEXT NOT NULL COLLATE NOCASE CHECK (length(new_email) <= 254),
  token_hash       TEXT NOT NULL UNIQUE,
  expires_at       TEXT NOT NULL,
  used_at          TEXT,
  last_transition  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS email_change_requests_user_idx ON email_change_requests(user_id, used_at);

-- ── Reminders ─────────────────────────────────────────────────────────────────
-- When the "due soon" / "starting soon" reminder went out (once each).
ALTER TABLE tasks ADD COLUMN reminded_at TEXT;
ALTER TABLE meetings ADD COLUMN reminded_at TEXT;

-- ── Site content that only the legacy import created ─────────────────────────
-- So a fresh database can edit them in Settings too (existing rows are left alone).
INSERT OR IGNORE INTO organization_settings (key, value_json, is_public, description) VALUES
  ('page.collaborations', '{"partners": []}', 1, 'Partner clubs on the home page and /collaborations.'),
  ('chatbot.knowledge', '{}', 1, 'What the site assistant knows about the club: about, vision, values, events, location and contact.');
