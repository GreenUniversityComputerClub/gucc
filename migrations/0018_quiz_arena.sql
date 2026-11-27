-- GUCC Quiz Arena foundation (strictly additive; compatible with migration-lint.ts).
--
--   * Core entities: quizzes, quiz_questions, quiz_moderators, quiz_sessions,
--     quiz_participants, quiz_answers, quiz_incidents.
--   * Answer keys live only in quiz_questions.answer_key_json so public/player projections
--     can omit the column completely until reveal/finalization.
--   * Governance: PERMISSIONS_V6 (quizzes.*) and baseline quiz system settings.

CREATE TABLE IF NOT EXISTS quizzes (
  id                     TEXT PRIMARY KEY,
  slug                   TEXT NOT NULL UNIQUE,
  title                  TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 150),
  description            TEXT CHECK (description IS NULL OR length(description) <= 4000),
  topic                  TEXT CHECK (topic IS NULL OR length(topic) <= 60),
  visibility             TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','MEMBERS','EVENT')),
  access_mode            TEXT NOT NULL DEFAULT 'GUEST' CHECK (access_mode IN ('GUEST','REGISTERED','MEMBERS_ONLY')),
  event_id               TEXT REFERENCES events(id),
  committee_id           TEXT REFERENCES committees(id),
  banner_media_id        TEXT REFERENCES media(id),
  logo_media_id          TEXT REFERENCES media(id),
  theme_preset           TEXT NOT NULL DEFAULT 'CYBER_ARENA' CHECK (theme_preset IN ('CYBER_ARENA','ACADEMIC','GAME_SHOW','EVENT_SPECIAL')),
  theme_config_json      TEXT CHECK (theme_config_json IS NULL OR (json_valid(theme_config_json) AND length(theme_config_json) <= 4000)),
  scoring_mode           TEXT NOT NULL DEFAULT 'SPEED_BONUS' CHECK (scoring_mode IN ('FIXED','SPEED_BONUS')),
  scoring_config_json    TEXT CHECK (scoring_config_json IS NULL OR (json_valid(scoring_config_json) AND length(scoring_config_json) <= 4000)),
  default_time_limit_sec INTEGER NOT NULL DEFAULT 20 CHECK (default_time_limit_sec BETWEEN 5 AND 300),
  shuffle_questions      INTEGER NOT NULL DEFAULT 0 CHECK (shuffle_questions IN (0, 1)),
  shuffle_options        INTEGER NOT NULL DEFAULT 0 CHECK (shuffle_options IN (0, 1)),
  status                 TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','PUBLISHED','ARCHIVED')),
  published_at           TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by             TEXT NOT NULL REFERENCES users(id),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by             TEXT REFERENCES users(id),
  deleted_at             TEXT
);
CREATE INDEX IF NOT EXISTS quizzes_public_idx ON quizzes(status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quizzes_event_idx ON quizzes(event_id);
CREATE INDEX IF NOT EXISTS quizzes_committee_idx ON quizzes(committee_id);
CREATE INDEX IF NOT EXISTS quizzes_banner_idx ON quizzes(banner_media_id);
CREATE INDEX IF NOT EXISTS quizzes_logo_idx ON quizzes(logo_media_id);
CREATE INDEX IF NOT EXISTS quizzes_creator_idx ON quizzes(created_by, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id                   TEXT PRIMARY KEY,
  quiz_id              TEXT NOT NULL REFERENCES quizzes(id),
  sort_order           INTEGER NOT NULL,
  kind                 TEXT NOT NULL DEFAULT 'MCQ' CHECK (kind IN ('MCQ','MULTI_SELECT','TRUE_FALSE')),
  prompt_markdown      TEXT NOT NULL CHECK (length(prompt_markdown) BETWEEN 1 AND 2000),
  media_id             TEXT REFERENCES media(id),
  options_json         TEXT NOT NULL CHECK (json_valid(options_json) AND length(options_json) <= 4000),
  answer_key_json      TEXT NOT NULL CHECK (json_valid(answer_key_json) AND length(answer_key_json) <= 500),
  explanation_markdown TEXT CHECK (explanation_markdown IS NULL OR length(explanation_markdown) <= 2000),
  time_limit_sec       INTEGER CHECK (time_limit_sec IS NULL OR time_limit_sec BETWEEN 5 AND 300),
  points               INTEGER NOT NULL DEFAULT 1000 CHECK (points BETWEEN 0 AND 10000),
  negative_points      INTEGER NOT NULL DEFAULT 0 CHECK (negative_points BETWEEN 0 AND 10000),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at           TEXT
);
CREATE INDEX IF NOT EXISTS quiz_questions_order_idx ON quiz_questions(quiz_id, deleted_at, sort_order);
CREATE INDEX IF NOT EXISTS quiz_questions_media_idx ON quiz_questions(media_id);

CREATE TABLE IF NOT EXISTS quiz_moderators (
  quiz_id     TEXT NOT NULL REFERENCES quizzes(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  can_edit    INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1)),
  can_host    INTEGER NOT NULL DEFAULT 1 CHECK (can_host IN (0, 1)),
  assigned_by TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (quiz_id, user_id)
);
CREATE INDEX IF NOT EXISTS quiz_moderators_user_idx ON quiz_moderators(user_id);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id                     TEXT PRIMARY KEY,
  quiz_id                TEXT NOT NULL REFERENCES quizzes(id),
  event_id               TEXT REFERENCES events(id),
  host_user_id           TEXT NOT NULL REFERENCES users(id),
  join_code              TEXT NOT NULL UNIQUE CHECK (length(join_code) BETWEEN 6 AND 12),
  mode                   TEXT NOT NULL DEFAULT 'LIVE_HOSTED' CHECK (mode IN ('LIVE_HOSTED','ASYNC_PRACTICE')),
  status                 TEXT NOT NULL DEFAULT 'LOBBY' CHECK (status IN ('LOBBY','QUESTION','REVEAL','PAUSED','FINALIZING','FINALIZED','CANCELLED')),
  current_question_idx   INTEGER NOT NULL DEFAULT -1,
  question_started_at    TEXT,
  question_ends_at       TEXT,
  registration_opens_at  TEXT,
  registration_closes_at TEXT,
  scheduled_start_at     TEXT,
  results_published      INTEGER NOT NULL DEFAULT 1 CHECK (results_published IN (0, 1)),
  max_participants       INTEGER NOT NULL DEFAULT 600 CHECK (max_participants BETWEEN 2 AND 2000),
  participant_count      INTEGER NOT NULL DEFAULT 0,
  certificate_batch_id   TEXT REFERENCES certificate_batches(id),
  summary_json           TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
  started_at             TEXT,
  ended_at               TEXT,
  finalized_at           TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quiz_sessions_quiz_idx ON quiz_sessions(quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_event_idx ON quiz_sessions(event_id);
CREATE INDEX IF NOT EXISTS quiz_sessions_host_idx ON quiz_sessions(host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_cert_batch_idx ON quiz_sessions(certificate_batch_id);
CREATE INDEX IF NOT EXISTS quiz_sessions_status_idx ON quiz_sessions(status, scheduled_start_at);

CREATE TABLE IF NOT EXISTS quiz_participants (
  id                     TEXT PRIMARY KEY,
  session_id             TEXT NOT NULL REFERENCES quiz_sessions(id),
  user_id                TEXT REFERENCES users(id),
  registration_id        TEXT REFERENCES event_registrations(id),
  participant_type       TEXT NOT NULL DEFAULT 'GUEST' CHECK (participant_type IN ('STUDENT','GUEST')),
  display_name           TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
  student_id             TEXT CHECK (student_id IS NULL OR length(student_id) <= 12),
  department             TEXT CHECK (department IS NULL OR length(department) <= 100),
  institution            TEXT CHECK (institution IS NULL OR length(institution) <= 120),
  email                  TEXT COLLATE NOCASE CHECK (email IS NULL OR length(email) <= 254),
  phone                  TEXT CHECK (phone IS NULL OR length(phone) <= 30),
  accepted_rules_at      TEXT,
  participant_token_hash TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'JOINED' CHECK (status IN ('JOINED','KICKED','BANNED','DISQUALIFIED')),
  score_total            INTEGER NOT NULL DEFAULT 0,
  correct_count          INTEGER NOT NULL DEFAULT 0,
  avg_response_ms        INTEGER NOT NULL DEFAULT 0,
  rank                   INTEGER,
  joined_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_participants_token_uq ON quiz_participants(session_id, participant_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_participants_user_uq ON quiz_participants(session_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_participants_reg_uq ON quiz_participants(session_id, registration_id) WHERE registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_participants_email_uq ON quiz_participants(session_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_participants_student_uq ON quiz_participants(session_id, student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quiz_participants_leaderboard_idx ON quiz_participants(session_id, status, score_total DESC, correct_count DESC, avg_response_ms ASC);
CREATE INDEX IF NOT EXISTS quiz_participants_user_idx ON quiz_participants(user_id);
CREATE INDEX IF NOT EXISTS quiz_participants_reg_idx ON quiz_participants(registration_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES quiz_sessions(id),
  participant_id TEXT NOT NULL REFERENCES quiz_participants(id),
  question_id    TEXT NOT NULL REFERENCES quiz_questions(id),
  selected_json  TEXT NOT NULL CHECK (json_valid(selected_json) AND length(selected_json) <= 500),
  is_correct     INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  response_ms    INTEGER NOT NULL CHECK (response_ms >= 0),
  answered_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_answers_once_uq ON quiz_answers(session_id, participant_id, question_id);
CREATE INDEX IF NOT EXISTS quiz_answers_question_idx ON quiz_answers(session_id, question_id, is_correct);
CREATE INDEX IF NOT EXISTS quiz_answers_question_fk_idx ON quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS quiz_answers_participant_idx ON quiz_answers(participant_id);

CREATE TABLE IF NOT EXISTS quiz_incidents (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES quiz_sessions(id),
  question_id      TEXT REFERENCES quiz_questions(id),
  participant_id   TEXT REFERENCES quiz_participants(id),
  reporter_user_id TEXT REFERENCES users(id),
  kind             TEXT NOT NULL CHECK (kind IN ('DISPUTE','MISCONDUCT','BUG','APPEAL')),
  reason           TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','ACTIONED')),
  handled_by       TEXT REFERENCES users(id),
  handled_at       TEXT,
  note             TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS quiz_incidents_session_idx ON quiz_incidents(session_id, status, created_at);
CREATE INDEX IF NOT EXISTS quiz_incidents_question_idx ON quiz_incidents(question_id);
CREATE INDEX IF NOT EXISTS quiz_incidents_participant_idx ON quiz_incidents(participant_id);
CREATE INDEX IF NOT EXISTS quiz_incidents_reporter_idx ON quiz_incidents(reporter_user_id);

-- ── Permissions (paired with PERMISSIONS_V6 in lib/governance/catalog.ts) ────────────
INSERT INTO permissions (id, key, resource, action, description, is_sensitive) VALUES
  ('perm:quizzes.read',     'quizzes.read',     'quizzes', 'read',     'View quizzes and live session summaries in the dashboard', 0),
  ('perm:quizzes.create',   'quizzes.create',   'quizzes', 'create',   'Create quiz drafts and edit question banks', 0),
  ('perm:quizzes.update',   'quizzes.update',   'quizzes', 'update',   'Edit existing quizzes and questions', 0),
  ('perm:quizzes.publish',  'quizzes.publish',  'quizzes', 'publish',  'Publish or archive quizzes', 0),
  ('perm:quizzes.host',     'quizzes.host',     'quizzes', 'host',     'Host live quiz sessions, advance questions, and manage participants', 0),
  ('perm:quizzes.delete',   'quizzes.delete',   'quizzes', 'delete',   'Archive or delete quizzes and clear sessions', 1),
  ('perm:quizzes.moderate', 'quizzes.moderate', 'quizzes', 'moderate', 'Review quiz incidents and override session outcomes', 1)
  ON CONFLICT(id) DO NOTHING;

-- ── Quiz Arena baseline settings ─────────────────────────────────────────────────────
INSERT INTO system_settings (key, value_json, is_protected, description) VALUES
  ('quiz.enabled',                  'true', 1, 'Enable live Quiz Arena sessions; when false, new live rooms cannot start.'),
  ('quiz.max_participants_default', '600',  1, 'Default participant capacity per live Quiz Arena session.'),
  ('quiz.guest_turnstile_required', 'true', 1, 'Require Cloudflare Turnstile verification for unauthenticated guest joins.')
  ON CONFLICT(key) DO NOTHING;
