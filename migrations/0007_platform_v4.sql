-- Platform v4 (2026-09-26). Additive only: new tables and nullable/defaulted columns; nothing
-- existing changes meaning, and no data is removed.
--
--   * user_permissions      direct, optionally time-limited permission grants to one account
--   * roles.color           a label colour for the dashboard
--   * positions.governance_level  the explicit authority order (Moderator > President > General Secretary > …)
--   * profiles              skills, and merged_into_id when duplicate people are merged
--   * users                 who may message the account, and read receipts
--   * user_mfa, sessions    two-factor sign-in (TOTP) and step-up re-authentication
--   * audit_seals           hourly tamper-evidence digests over the audit log
--   * conversations …       member-to-member messaging, blocks and reports
--   * lost_found_posts      moderation reason and housekeeping timestamps
--   * settings              home page content and the navbar Services menu
--   * tasks, meetings       work assigned to members (or to an email address) and meetings
--                           with a Google Meet link entered by hand
--   * system_heartbeats     when scheduled housekeeping last ran, for the System health page
--   * usage_counters        atomic daily budgets (R2 writes, AI answers, emails, …) so the free
--                           tier can never be exceeded, even by concurrent requests
--   * idempotency_keys      a repeated or double-submitted action returns the first result
--   * error_events, email_log, notification_preferences  diagnostics, delivery record, email choices
--   * last_transition, batch_assertions  per-request marker and in-batch assertions that make
--                           multi-step state changes race-free (one approval, one notice, one email)
--   * media.unreferenced_since  when a file was last seen unused (lifecycle cleanup)
--   * audit_logs            rows older than two years may be deleted (retention); newer stay immutable
--
-- Restore: this migration only adds; to undo, restore the D1 backup taken by the release
-- (release.ts / deploy.yml) or use D1 Time Travel to the point before it ran.

-- ── Direct permission grants ─────────────────────────────────────────────────
CREATE TABLE user_permissions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  permission_id       TEXT NOT NULL REFERENCES permissions(id),
  scope               TEXT NOT NULL DEFAULT 'ALL'
                        CHECK (scope IN ('OWN','ASSIGNED','COMMITTEE','POSITION','CATEGORY','EVENT','ALL')),
  scope_value         TEXT NOT NULL DEFAULT '',
  reason              TEXT,
  expires_at          TEXT,
  granted_by          TEXT REFERENCES users(id),
  granted_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at          TEXT,
  revoked_by          TEXT REFERENCES users(id),
  approval_request_id TEXT REFERENCES approval_requests(id)
);
-- One live grant per account, permission and scope; history rows (revoked) are kept.
CREATE UNIQUE INDEX user_permissions_live_uq ON user_permissions(user_id, permission_id, scope, scope_value) WHERE revoked_at IS NULL;
CREATE INDEX user_permissions_user_idx ON user_permissions(user_id, revoked_at);
CREATE INDEX user_permissions_expiry_idx ON user_permissions(expires_at) WHERE revoked_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX user_permissions_permission_idx ON user_permissions(permission_id);
CREATE INDEX user_permissions_request_idx ON user_permissions(approval_request_id) WHERE approval_request_id IS NOT NULL;

ALTER TABLE roles ADD COLUMN color TEXT;

-- ── Explicit governance hierarchy ────────────────────────────────────────────
-- Authority order, independent of the display rank (which only orders lists and the public
-- page): Moderator 100, faculty advisers 95, President 90, General Secretary 80, Vice Presidents
-- and other leadership 70, secretaries 60, coordinators 50, other 30, executive members 20.
ALTER TABLE positions ADD COLUMN governance_level INTEGER NOT NULL DEFAULT 20 CHECK (governance_level BETWEEN 0 AND 100);
UPDATE positions SET governance_level = CASE -- safety: reviewed (fills the column added just above)
  WHEN key = 'moderator' THEN 100
  WHEN category = 'FACULTY' THEN 95
  WHEN key = 'president' THEN 90
  WHEN key = 'general-secretary' THEN 80
  WHEN category = 'LEADERSHIP' THEN 70
  WHEN category = 'SECRETARIAT' THEN 60
  WHEN category = 'COORDINATOR' THEN 50
  WHEN category = 'OTHER' THEN 30
  ELSE 20 END;
CREATE INDEX positions_level_idx ON positions(governance_level DESC, rank) WHERE deleted_at IS NULL;

-- ── People ───────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN skills_json TEXT CHECK (skills_json IS NULL OR json_valid(skills_json));
ALTER TABLE profiles ADD COLUMN merged_into_id TEXT REFERENCES profiles(id);
ALTER TABLE users ADD COLUMN message_privacy TEXT NOT NULL DEFAULT 'EVERYONE' CHECK (message_privacy IN ('EVERYONE','EXECUTIVES','NOBODY'));
ALTER TABLE users ADD COLUMN read_receipts INTEGER NOT NULL DEFAULT 1 CHECK (read_receipts IN (0, 1));

-- ── Two-factor sign-in and step-up ───────────────────────────────────────────
CREATE TABLE user_mfa (
  user_id        TEXT PRIMARY KEY REFERENCES users(id),
  secret_enc     TEXT NOT NULL,                                  -- AES-GCM encrypted TOTP secret
  confirmed_at   TEXT,                                           -- NULL until the first code is verified
  recovery_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recovery_json)), -- SHA-256 hashes of unused codes
  last_step      INTEGER,                                        -- last accepted TOTP step (replay protection)
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE sessions ADD COLUMN mfa_pending INTEGER NOT NULL DEFAULT 0 CHECK (mfa_pending IN (0, 1));
ALTER TABLE sessions ADD COLUMN reauth_at TEXT;

-- ── Audit log tamper evidence ────────────────────────────────────────────────
CREATE TABLE audit_seals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  first_rowid  INTEGER NOT NULL,
  last_rowid   INTEGER NOT NULL,
  row_count    INTEGER NOT NULL,
  digest       TEXT NOT NULL,                                    -- sha256(prev_digest || rows)
  prev_digest  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── Member messaging ─────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL DEFAULT 'DIRECT' CHECK (kind IN ('DIRECT')),
  pair_key         TEXT NOT NULL UNIQUE,                         -- the two user ids, sorted: one thread per pair
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_message_at  TEXT
);
CREATE TABLE conversation_members (
  conversation_id  TEXT NOT NULL REFERENCES conversations(id),
  user_id          TEXT NOT NULL REFERENCES users(id),
  last_read_at     TEXT,
  muted            INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
  archived_at      TEXT,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id, archived_at);
CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id),
  sender_id        TEXT NOT NULL REFERENCES users(id),
  body             TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  context_type     TEXT,                                         -- e.g. 'lost_found_post'
  context_id       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  edited_at        TEXT,
  deleted_at       TEXT
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);
CREATE INDEX messages_sender_idx ON messages(sender_id, created_at);
CREATE TABLE user_blocks (
  blocker_id  TEXT NOT NULL REFERENCES users(id),
  blocked_id  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_id);
-- Reports of messages and lost & found posts. Moderators see reported items only.
CREATE TABLE reports (
  id             TEXT PRIMARY KEY,
  resource_type  TEXT NOT NULL CHECK (resource_type IN ('message','lost_found_post')),
  resource_id    TEXT NOT NULL,
  reporter_id    TEXT NOT NULL REFERENCES users(id),
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','ACTIONED')),
  handled_by     TEXT REFERENCES users(id),
  handled_at     TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX reports_once_uq ON reports(resource_type, resource_id, reporter_id);
CREATE INDEX reports_reporter_idx ON reports(reporter_id);
CREATE INDEX reports_status_idx ON reports(status, created_at);

-- Earlier lost & found messages become conversations between the sender and the post owner.
INSERT OR IGNORE INTO conversations (id, kind, pair_key, created_by, created_at, last_message_at)
SELECT 'cnv_' || lower(hex(randomblob(10))), 'DIRECT',
       min(m.sender_id, p.user_id) || ':' || max(m.sender_id, p.user_id), m.sender_id, min(m.created_at), max(m.created_at)
FROM lost_found_messages m JOIN lost_found_posts p ON p.id = m.post_id
WHERE m.sender_id IS NOT NULL AND p.user_id IS NOT NULL AND m.sender_id <> p.user_id
GROUP BY min(m.sender_id, p.user_id) || ':' || max(m.sender_id, p.user_id);
INSERT OR IGNORE INTO conversation_members (conversation_id, user_id)
SELECT c.id, substr(c.pair_key, 1, instr(c.pair_key, ':') - 1) FROM conversations c
UNION ALL
SELECT c.id, substr(c.pair_key, instr(c.pair_key, ':') + 1) FROM conversations c;
INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, body, context_type, context_id, created_at)
SELECT 'msg_' || lower(hex(randomblob(10))), c.id, m.sender_id, substr(m.body, 1, 2000), 'lost_found_post', m.post_id, m.created_at
FROM lost_found_messages m JOIN lost_found_posts p ON p.id = m.post_id
JOIN conversations c ON c.pair_key = min(m.sender_id, p.user_id) || ':' || max(m.sender_id, p.user_id)
WHERE length(trim(m.body)) > 0;

-- ── Lost & found moderation and housekeeping ─────────────────────────────────
ALTER TABLE lost_found_posts ADD COLUMN reject_reason TEXT;
ALTER TABLE lost_found_posts ADD COLUMN resolved_at TEXT;
ALTER TABLE lost_found_posts ADD COLUMN archived_at TEXT;
ALTER TABLE lost_found_posts ADD COLUMN archive_notified_at TEXT;
CREATE INDEX lost_found_posts_archive_idx ON lost_found_posts(archived_at, status, updated_at);
-- Databases without the legacy import get the same defaults the old code had.
INSERT OR IGNORE INTO organization_settings (key, value_json, is_public, description) VALUES
  ('lostfound.config', '{"categories": ["Phone", "ID Card", "Laptop", "Wallet", "Keys", "Bag", "Notebook", "Headphones", "Charger", "Other"], "locations": ["Main Gate", "A Building", "B Building", "Anex Building", "Library", "Cafeteria", "Auditorium", "Playground", "Parking", "Other"], "contactMethods": [{"value": "email", "label": "Email"}, {"value": "phone", "label": "Phone"}, {"value": "in_app", "label": "In-app message"}], "allowedStudentDomains": ["@green.edu.bd", "@green.ac.bd", "@student.green.ac.bd"], "archiveResolvedDays": 30, "archiveOpenDays": 90}', 1, 'Lost & found categories, locations, contact methods, allowed university email domains and archiving periods.');
UPDATE organization_settings
   SET value_json = json_set(value_json, '$.archiveResolvedDays', 30, '$.archiveOpenDays', 90)
 WHERE key = 'lostfound.config' AND json_extract(value_json, '$.archiveResolvedDays') IS NULL;

-- ── Page content and navigation ──────────────────────────────────────────────
INSERT OR IGNORE INTO organization_settings (key, value_json, is_public, description) VALUES
  ('page.home', '{"chairperson": {"heading": "Messages from Our Chairperson", "subheading": "A message from the Chairperson of the Department of CSE", "person": {"name": "Mr. Syed Ahsanul Kabir", "title": "Chairperson & Associate Professor", "photo": "/executives/kabir.cse.png", "initials": "SK", "message": "It gives me great pride to see the Green University Computer Club (GUCC) flourishing as a platform for student innovation, leadership, and collaboration. GUCC is more than just a club — it''s a space where ideas come to life, where students learn by doing, and where futures are shaped through teamwork and creativity. I wholeheartedly support the club''s mission and encourage every student to take part in this journey of growth and excellence."}}, "moderators": {"heading": "Messages from Our Moderators", "subheading": "Inspiring messages from our faculty moderators who guide and shape our journey", "people": [{"name": "Md. Monirul Islam", "title": "Assistant Professor & Moderator, GUCC", "photo": "/executives/monirul.cse.png", "initials": "MI", "message": "At GUCC, we witness remarkable growth in our CSE students — not just in technical expertise, but also in leadership and teamwork. This platform has become a cornerstone for empowering the next generation of tech leaders."}, {"name": "Feroza Naznin", "title": "Deputy Moderator, GUCC", "photo": "/executives/feroza.png", "initials": "FN", "message": "The energy and dedication our members bring to GUCC is truly inspiring. By bridging academic knowledge with real-world innovation, this club continues to nurture creativity, confidence, and community."}, {"name": "Montaser Abdul Quader", "title": "Deputy Moderator, GUCC", "photo": "/executives/montaser.cse.png", "initials": "MQ", "message": "GUCC embodies the spirit of collaboration and continuous improvement. It''s a pleasure to watch our students take on challenges and transform them into meaningful impact, building a stronger tech future."}]}, "stats": [{"value": 7000, "suffix": "+", "label": "Members"}, {"value": 50, "suffix": "+", "label": "Events Per Year"}, {"value": 20, "suffix": "+", "label": "Workshops"}, {"value": 10, "suffix": "+", "label": "Years of Excellence"}]}', 1, 'Home page: the Chairperson''s and Moderators'' messages and the "GUCC in Numbers" figures.'),
  ('nav.services', '{"items": [{"label": "Lost & Found", "href": "/lost-found", "description": "Report or find lost items on campus", "visible": true}, {"label": "Class Scheduler", "href": "/scheduler", "description": "Plan your semester routine", "visible": true}, {"label": "Certificate Verification", "href": "/certificates/hacktheai/verify", "description": "Check a GUCC certificate", "visible": true}]}', 1, 'The navbar Services menu: label, link, short description and visibility of each item, in order.');

-- ── Tasks ────────────────────────────────────────────────────────────────────
-- Assigned to an account, or to an email address for someone without one yet. An email-only
-- task is linked to the account once that address signs up and is approved; no account is
-- ever created automatically.
CREATE TABLE tasks (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  details           TEXT CHECK (details IS NULL OR length(details) <= 5000),
  status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  priority          TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  due_at            TEXT,
  assignee_user_id  TEXT REFERENCES users(id),
  assignee_email    TEXT CHECK (assignee_email IS NULL OR (assignee_email = lower(assignee_email) AND assignee_email LIKE '%_@_%')),
  assignee_name     TEXT,
  event_id          TEXT REFERENCES events(id),
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at      TEXT,
  deleted_at        TEXT,
  CHECK (assignee_user_id IS NOT NULL OR assignee_email IS NOT NULL)
);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_user_id, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_email_idx ON tasks(assignee_email) WHERE assignee_user_id IS NULL AND deleted_at IS NULL;
CREATE INDEX tasks_creator_idx ON tasks(created_by, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_event_idx ON tasks(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE task_comments (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  author_user_id  TEXT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);
CREATE INDEX task_comments_task_idx ON task_comments(task_id, created_at);
CREATE INDEX task_comments_author_idx ON task_comments(author_user_id);

-- ── Meetings ─────────────────────────────────────────────────────────────────
-- The Google Meet link is pasted by the organiser; nothing here creates Meet rooms.
CREATE TABLE meetings (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  agenda        TEXT CHECK (agenda IS NULL OR length(agenda) <= 5000),
  notes         TEXT CHECK (notes IS NULL OR length(notes) <= 20000),
  starts_at     TEXT NOT NULL,
  ends_at       TEXT,
  location      TEXT CHECK (location IS NULL OR length(location) <= 200),
  meet_url      TEXT CHECK (meet_url IS NULL OR meet_url LIKE 'https://meet.google.com/%'),
  status        TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED','DONE')),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelled_at  TEXT,
  deleted_at    TEXT
);
CREATE INDEX meetings_start_idx ON meetings(starts_at) WHERE deleted_at IS NULL;
CREATE INDEX meetings_creator_idx ON meetings(created_by, starts_at);

CREATE TABLE meeting_participants (
  meeting_id  TEXT NOT NULL REFERENCES meetings(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  response    TEXT NOT NULL DEFAULT 'INVITED' CHECK (response IN ('INVITED','YES','NO','MAYBE')),
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (meeting_id, user_id)
);
CREATE INDEX meeting_participants_user_idx ON meeting_participants(user_id, meeting_id);

-- ── Scheduled housekeeping heartbeat ─────────────────────────────────────────
CREATE TABLE system_heartbeats (
  name         TEXT PRIMARY KEY,
  last_run_at  TEXT NOT NULL,
  last_ok      INTEGER NOT NULL CHECK (last_ok IN (0, 1)),
  detail_json  TEXT CHECK (detail_json IS NULL OR json_valid(detail_json))
);

-- ── Atomic budgets ───────────────────────────────────────────────────────────
-- One row per (day, key). A reservation is a single conditional upsert, so two requests can
-- never both take the last unit. day is a UTC date, or 'total' for running totals.
CREATE TABLE usage_counters (
  day         TEXT NOT NULL,
  key         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (day, key)
);

-- ── Idempotency ──────────────────────────────────────────────────────────────
CREATE TABLE idempotency_keys (
  key           TEXT PRIMARY KEY,                               -- sha256 of who + procedure + input, or a client key
  procedure     TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','done')),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at  TEXT
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys(created_at);

-- ── Diagnostics and email ────────────────────────────────────────────────────
CREATE TABLE error_events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  request_id     TEXT,
  procedure      TEXT,
  code           TEXT,
  status         INTEGER,
  message        TEXT CHECK (message IS NULL OR length(message) <= 300),
  actor_user_id  TEXT REFERENCES users(id)
);
CREATE INDEX error_events_created_idx ON error_events(created_at);
CREATE INDEX error_events_actor_idx ON error_events(actor_user_id);

CREATE TABLE email_log (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id      TEXT REFERENCES users(id),
  recipient    TEXT NOT NULL,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('sent','failed','skipped_limit','skipped_pref','skipped_off')),
  provider_id  TEXT,
  error        TEXT CHECK (error IS NULL OR length(error) <= 300)
);
CREATE INDEX email_log_created_idx ON email_log(created_at, status);
-- Sign-in figures for System health and the retention job read by time.
CREATE INDEX IF NOT EXISTS authentication_events_created_idx ON authentication_events(created_at, event);
CREATE INDEX email_log_user_idx ON email_log(user_id);

CREATE TABLE notification_preferences (
  user_id     TEXT NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL CHECK (category IN ('approvals','roles','work','events','messages','announcements')),
  email       INTEGER NOT NULL CHECK (email IN (0, 1)),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, category)
);

-- ── Race-free state changes and media lifecycle ──────────────────────────────
-- Never holds a row. Inserting into it aborts the batch it belongs to (a D1 batch is one
-- transaction): "only if the guarded change before me really happened" (lib/server/transition.ts).
CREATE TABLE batch_assertions (
  failed TEXT,
  CONSTRAINT transition_lost CHECK (0)
);
ALTER TABLE users ADD COLUMN last_transition TEXT;
ALTER TABLE approval_requests ADD COLUMN last_transition TEXT;
ALTER TABLE posts ADD COLUMN last_transition TEXT;
ALTER TABLE events ADD COLUMN last_transition TEXT;
ALTER TABLE media ADD COLUMN unreferenced_since TEXT;
-- Set when the file's objects are actually deleted from R2 (archived files keep theirs).
ALTER TABLE media ADD COLUMN purged_at TEXT;
CREATE INDEX media_unreferenced_idx ON media(unreferenced_since) WHERE unreferenced_since IS NOT NULL AND deleted_at IS NULL;

-- ── Audit retention ──────────────────────────────────────────────────────────
-- Entries stay immutable for two years; after that the hourly job may delete them.
DROP TRIGGER audit_logs_no_delete;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
WHEN OLD.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-730 days')
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

