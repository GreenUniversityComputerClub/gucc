-- Production hardening: query indexes, housekeeping indexes, split media
-- buckets, recruitment and contact inbox, and removal of two unused tables.
-- Additive except for dropping event_sessions and post_media, which no code
-- ever wrote to.

-- ── indexes for real query patterns ─────────────────────────────────
CREATE INDEX IF NOT EXISTS approval_requests_requester_idx ON approval_requests(requested_by, status);
CREATE INDEX IF NOT EXISTS event_registrations_user_idx ON event_registrations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_uploader_idx ON media(uploaded_by, created_at);
CREATE INDEX IF NOT EXISTS committee_members_committee_position_idx ON committee_members(committee_id, position_id);
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category_id);
CREATE INDEX IF NOT EXISTS profiles_user_idx ON profiles(user_id) WHERE user_id IS NOT NULL;

-- ── housekeeping (the hourly cron purges by these) ──────────────────
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);

-- ── media: public and private objects live in different R2 buckets ──
ALTER TABLE media ADD COLUMN bucket TEXT NOT NULL DEFAULT 'public' CHECK (bucket IN ('public','private'));
-- Anonymous uploads (recruitment documents) are tied to the upload session that created them.
ALTER TABLE media ADD COLUMN upload_session TEXT;
CREATE INDEX IF NOT EXISTS media_upload_session_idx ON media(upload_session) WHERE upload_session IS NOT NULL;
UPDATE media SET bucket = 'private' WHERE visibility <> 'PUBLIC';

-- ── membership review: a reviewer can ask an applicant to fix their details ──
ALTER TABLE users ADD COLUMN correction_note TEXT;

-- ── invitations for executives added without an account ─────────────
ALTER TABLE auth_tokens ADD COLUMN profile_id TEXT REFERENCES profiles(id);

-- ── recruitment (replaces the Google Apps Script form) ───────────────
CREATE TABLE recruitment_campaigns (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  circular_url TEXT,                                            -- link to the official circular (PDF)
  committee_id TEXT REFERENCES committees(id),
  opens_at     TEXT,
  closes_at    TEXT,
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','CLOSED','ARCHIVED')),
  positions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(positions_json)),   -- position ids offered
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by   TEXT REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by   TEXT REFERENCES users(id)
);
CREATE INDEX recruitment_campaigns_status_idx ON recruitment_campaigns(status, closes_at);

-- PRIVATE: contact details, grades and identity documents.
CREATE TABLE recruitment_applications (
  id               TEXT PRIMARY KEY,
  campaign_id      TEXT NOT NULL REFERENCES recruitment_campaigns(id),
  user_id          TEXT REFERENCES users(id),
  full_name        TEXT NOT NULL,
  student_id       TEXT NOT NULL,
  email            TEXT NOT NULL COLLATE NOCASE,
  phone            TEXT NOT NULL,
  gender           TEXT,
  semester         TEXT,
  batch            TEXT,
  cgpa             REAL,
  completed_credit INTEGER,
  position_id      TEXT NOT NULL REFERENCES positions(id),
  club_work        TEXT,
  cv_media_id      TEXT REFERENCES media(id),
  photo_media_id   TEXT REFERENCES media(id),
  id_card_media_id TEXT REFERENCES media(id),
  status           TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','SHORTLISTED','INTERVIEW','ACCEPTED','REJECTED','WITHDRAWN')),
  reviewer_note    TEXT,
  reviewed_by      TEXT REFERENCES users(id),
  reviewed_at      TEXT,
  ip_hash          TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX recruitment_applications_student_uq ON recruitment_applications(campaign_id, student_id);
CREATE UNIQUE INDEX recruitment_applications_email_uq ON recruitment_applications(campaign_id, email);
CREATE INDEX recruitment_applications_status_idx ON recruitment_applications(campaign_id, status, created_at);

-- ── contact inbox (messages are kept even when email is not configured) ──
CREATE TABLE contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL COLLATE NOCASE,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','READ','ARCHIVED')),
  ip_hash    TEXT,
  handled_by TEXT REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX contact_messages_status_idx ON contact_messages(status, created_at DESC);

-- ── unused tables (never written by any code path) ──────────────────
DROP TABLE IF EXISTS event_sessions;
DROP TABLE IF EXISTS post_media;
