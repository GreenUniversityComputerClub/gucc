-- Round 9 (2026-10-04). Additive only: new columns, tables, indexes, permissions and settings.
--
--   * Forms: what the dashboard learned about each external form (where it really is, whether it
--     needs a Google account), its schedule and listing, and every address it ever had.
--   * Messages: who a message mentions.
--   * Profiles: which email the executives pages and the profile show.
--   * Email campaigns: announcement (and certificate) emails, sent a few at a time within the
--     free email allowance, with one-click unsubscribe.
--   * Certificates: designs, issued batches (with the design frozen at issue) and certificates
--     with an unguessable verification code.
--   * Permissions: deleting accounts and changing someone's sign-in email (sensitive), and
--     emailing announcements. Moderators hold every permission; the President and the General
--     Secretary hold the Moderator role while in office.

-- ── Forms ─────────────────────────────────────────────────────────────────────────
ALTER TABLE external_forms ADD COLUMN provider TEXT;
ALTER TABLE external_forms ADD COLUMN embed_url TEXT CHECK (embed_url IS NULL OR (embed_url LIKE 'https://%' AND length(embed_url) <= 1000));
ALTER TABLE external_forms ADD COLUMN open_url TEXT CHECK (open_url IS NULL OR (open_url LIKE 'https://%' AND length(open_url) <= 1000));
ALTER TABLE external_forms ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) <= 1000);
ALTER TABLE external_forms ADD COLUMN question_count INTEGER CHECK (question_count IS NULL OR question_count BETWEEN 0 AND 10000);
ALTER TABLE external_forms ADD COLUMN requires_sign_in INTEGER NOT NULL DEFAULT 0 CHECK (requires_sign_in IN (0, 1));
-- AUTO: framed, except forms that need a Google account open at Google on phones and in apps.
ALTER TABLE external_forms ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'AUTO' CHECK (display_mode IN ('AUTO', 'EMBED', 'LINK'));
-- Shown on /forms and in search engines.
ALTER TABLE external_forms ADD COLUMN listed INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1));
ALTER TABLE external_forms ADD COLUMN accepting INTEGER NOT NULL DEFAULT 1 CHECK (accepting IN (0, 1));
ALTER TABLE external_forms ADD COLUMN opens_at TEXT;
ALTER TABLE external_forms ADD COLUMN closes_at TEXT;
ALTER TABLE external_forms ADD COLUMN closed_message TEXT CHECK (closed_message IS NULL OR length(closed_message) <= 500);
-- Where the answers are (a Google Sheet): leaders only, never in public reads.
ALTER TABLE external_forms ADD COLUMN responses_url TEXT CHECK (responses_url IS NULL OR (responses_url LIKE 'https://%' AND length(responses_url) <= 1000));
ALTER TABLE external_forms ADD COLUMN category TEXT CHECK (category IS NULL OR length(category) <= 40);
ALTER TABLE external_forms ADD COLUMN event_id TEXT REFERENCES events(id);
ALTER TABLE external_forms ADD COLUMN cover_media_id TEXT REFERENCES media(id);
ALTER TABLE external_forms ADD COLUMN inspected_at TEXT;
ALTER TABLE external_forms ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS external_forms_listed_idx ON external_forms(listed, sort_order) WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Every address a form has had, in any spelling (/forms/CR and /forms/cr): old links keep working.
CREATE TABLE IF NOT EXISTS external_form_slugs (
  slug       TEXT PRIMARY KEY COLLATE NOCASE,
  form_id    TEXT NOT NULL REFERENCES external_forms(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS external_form_slugs_form_idx ON external_form_slugs(form_id);
INSERT INTO external_form_slugs (slug, form_id) SELECT slug, id FROM external_forms WHERE true ON CONFLICT DO NOTHING;
UPDATE external_forms SET provider = 'google' WHERE provider IS NULL AND (url LIKE 'https://docs.google.com/forms/%' OR url LIKE 'https://forms.gle/%');
-- Archived forms become restorable (archiving no longer deletes).
UPDATE external_forms SET deleted_at = NULL WHERE status = 'ARCHIVED' AND deleted_at IS NOT NULL;

-- ── Mentions ──────────────────────────────────────────────────────────────────────
-- [{"u": user id, "n": name as written}] or [{"u": "*", "n": "everyone"}]; the body keeps "@Name".
ALTER TABLE messages ADD COLUMN mentions_json TEXT CHECK (mentions_json IS NULL OR (json_valid(mentions_json) AND length(mentions_json) <= 4000));

-- ── Email shown on profiles and executive listings ───────────────────────────────
-- AUTO: the profile's public email, else the one a past listing had; PROFILE: only the profile's;
-- HIDDEN: none anywhere.
ALTER TABLE profiles ADD COLUMN email_display TEXT NOT NULL DEFAULT 'AUTO' CHECK (email_display IN ('AUTO', 'PROFILE', 'HIDDEN'));

-- ── Email campaigns ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                       -- ANNOUNCEMENT | CERTIFICATE (checked in code)
  subject       TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 150),
  preheader     TEXT CHECK (preheader IS NULL OR length(preheader) <= 150),
  body          TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 6000),
  button_label  TEXT CHECK (button_label IS NULL OR length(button_label) <= 40),
  button_path   TEXT CHECK (button_path IS NULL OR (button_path LIKE '/%' AND button_path NOT LIKE '//%' AND length(button_path) <= 300)),
  audience_json TEXT NOT NULL CHECK (json_valid(audience_json)),
  post_id       TEXT REFERENCES posts(id),
  batch_id      TEXT,
  status        TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'PAUSED', 'DONE', 'CANCELLED')),
  paused_reason TEXT,
  not_before    TEXT,
  total         INTEGER NOT NULL DEFAULT 0,
  sent          INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0,
  last_run_at   TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by    TEXT REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS email_campaigns_due_idx ON email_campaigns(created_at) WHERE status IN ('QUEUED', 'SENDING');
CREATE INDEX IF NOT EXISTS email_campaigns_recent_idx ON email_campaigns(created_at);

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  campaign_id TEXT NOT NULL REFERENCES email_campaigns(id),
  seq         INTEGER NOT NULL,
  user_id     TEXT REFERENCES users(id),
  email       TEXT NOT NULL COLLATE NOCASE,
  name        TEXT,
  -- Per-person parts of the email (e.g. their certificate's address).
  data_json   TEXT CHECK (data_json IS NULL OR json_valid(data_json)),
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  claimed_at  TEXT,
  sent_at     TEXT,
  error       TEXT CHECK (error IS NULL OR length(error) <= 300),
  PRIMARY KEY (campaign_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_email_uq ON email_campaign_recipients(campaign_id, email);
CREATE INDEX IF NOT EXISTS email_campaign_recipients_todo_idx ON email_campaign_recipients(campaign_id, seq) WHERE status IN ('PENDING', 'SENDING');

-- People without an account who unsubscribed (by a hash of their address; members use their email choices).
CREATE TABLE IF NOT EXISTS email_suppressions (
  email_hash TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (email_hash, category)
);

-- An announcement's "also email it" choice, kept until the post is really published.
ALTER TABLE posts ADD COLUMN email_intent_json TEXT CHECK (email_intent_json IS NULL OR json_valid(email_intent_json));
ALTER TABLE posts ADD COLUMN email_campaign_id TEXT;

-- ── Certificates ──────────────────────────────────────────────────────────────────
-- A saved design: one of the built-in templates (lib/certificates/templates) with the club's choices
-- (colours, logos, signatories, texts). The templates themselves live in the code.
CREATE TABLE IF NOT EXISTS certificate_designs (
  id          TEXT PRIMARY KEY,
  template    TEXT NOT NULL CHECK (length(template) BETWEEN 1 AND 40),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  config_json TEXT NOT NULL CHECK (json_valid(config_json) AND length(config_json) <= 20000),
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by  TEXT REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by  TEXT REFERENCES users(id),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_designs_default_uq ON certificate_designs(is_default) WHERE is_default = 1 AND deleted_at IS NULL;

-- One issue of certificates (e.g. "CSE Carnival 2026 participants"). The design is frozen here, so
-- a later change to the design (a new signatory next year) never alters what was issued.
CREATE TABLE IF NOT EXISTS certificate_batches (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  title                TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  kind                 TEXT NOT NULL,                -- checked in code
  source               TEXT NOT NULL,                -- MEMBERS | EVENT | EVENT_PEOPLE | COMMITTEE | CSV | MANUAL
  source_json          TEXT CHECK (source_json IS NULL OR json_valid(source_json)),
  event_id             TEXT REFERENCES events(id),
  committee_id         TEXT REFERENCES committees(id),
  design_id            TEXT REFERENCES certificate_designs(id),
  template             TEXT NOT NULL CHECK (length(template) BETWEEN 1 AND 40),
  design_snapshot_json TEXT NOT NULL CHECK (json_valid(design_snapshot_json) AND length(design_snapshot_json) <= 40000),
  issued_on            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'ARCHIVED')),
  recipient_count      INTEGER NOT NULL DEFAULT 0,
  email_campaign_id    TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by           TEXT REFERENCES users(id),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by           TEXT REFERENCES users(id),
  deleted_at           TEXT
);
CREATE INDEX IF NOT EXISTS certificate_batches_recent_idx ON certificate_batches(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS certificate_batches_event_idx ON certificate_batches(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS certificates (
  id              TEXT PRIMARY KEY,
  -- 16 Crockford base-32 characters (80 random bits), shown as GUCC-XXXX-XXXX-XXXX-XXXX.
  code            TEXT NOT NULL CHECK (length(code) = 16),
  batch_id        TEXT NOT NULL REFERENCES certificate_batches(id),
  profile_id      TEXT REFERENCES profiles(id),
  user_id         TEXT REFERENCES users(id),
  recipient_name  TEXT NOT NULL CHECK (length(recipient_name) BETWEEN 1 AND 120),
  -- Private: for delivery and matching only, never in public reads.
  recipient_email TEXT COLLATE NOCASE CHECK (recipient_email IS NULL OR length(recipient_email) <= 254),
  role_line       TEXT CHECK (role_line IS NULL OR length(role_line) <= 200),
  body            TEXT CHECK (body IS NULL OR length(body) <= 800),
  fields_json     TEXT CHECK (fields_json IS NULL OR json_valid(fields_json)),
  status          TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'REVOKED')),
  visibility      TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  revoked_at      TEXT,
  revoked_by      TEXT REFERENCES users(id),
  revoke_reason   TEXT CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 300),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by      TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_code_uq ON certificates(code);
CREATE INDEX IF NOT EXISTS certificates_batch_idx ON certificates(batch_id, recipient_name);
CREATE INDEX IF NOT EXISTS certificates_profile_idx ON certificates(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates(user_id) WHERE user_id IS NOT NULL;
-- One certificate per person per batch.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_batch_profile_uq ON certificates(batch_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS certificates_batch_email_uq ON certificates(batch_id, recipient_email) WHERE profile_id IS NULL AND recipient_email IS NOT NULL;

-- ── Permissions ───────────────────────────────────────────────────────────────────
INSERT INTO permissions (id, key, resource, action, description, is_sensitive) VALUES
  ('perm:accounts.manage', 'accounts.manage', 'accounts', 'manage', 'Delete members'' accounts (their personal data is erased; committee history stays)', 1),
  ('perm:accounts.email', 'accounts.email', 'accounts', 'email', 'Change a member''s sign-in email', 1),
  ('perm:email.campaigns', 'email.campaigns', 'email', 'campaigns', 'Email announcements to members (uses the club''s monthly email allowance)', 0)
  ON CONFLICT(id) DO NOTHING;

-- ── Settings ──────────────────────────────────────────────────────────────────────
INSERT INTO system_settings (key, value_json, is_protected, description) VALUES
  ('email.campaign_daily_reserve', '10', 1, 'Emails a day kept for account and security mail; announcement emails never use them.'),
  ('email.campaign_monthly_reserve', '60', 1, 'Emails a month kept for account and security mail; announcement emails never use them.'),
  ('email.campaign_hourly_max', '20', 1, 'Announcement emails sent per hour at most (SMTP2GO takes about 25 an hour from an unverified sender).')
  ON CONFLICT(key) DO NOTHING;
