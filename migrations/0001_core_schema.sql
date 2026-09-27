-- GUCC platform — core relational schema for Cloudflare D1 (SQLite).
--
-- Conventions
--   * ids are TEXT: random UUIDs for new rows, deterministic hashes for rows
--     created by the legacy data migration (so re-running it never duplicates).
--   * timestamps are ISO-8601 UTC strings; booleans are INTEGER 0/1.
--   * JSON columns are TEXT guarded by json_valid().
--   * `deleted_at` marks a soft delete. Historical entities are archived, not
--     removed, so committees, posts and audit trails survive.
--   * `updated_by IS NULL` on a migrated row means no human has edited it yet;
--     the importer's refresh mode only touches such rows.
--   * binary data never lives here — media rows point at R2 object keys.


-- ───────────────────────────── identity ─────────────────────────────

CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL COLLATE NOCASE,
  password_hash      TEXT,                                   -- NULL until the account sets one (invited / migrated users)
  status             TEXT NOT NULL DEFAULT 'EMAIL_VERIFICATION_PENDING'
                       CHECK (status IN ('REGISTERED','EMAIL_VERIFICATION_PENDING','PENDING_APPROVAL',
                                         'APPROVED','ACTIVE','SUSPENDED','INACTIVE','ARCHIVED','REJECTED')),
  email_verified_at  TEXT,
  approved_at        TEXT,
  approved_by        TEXT REFERENCES users(id),
  rejected_reason    TEXT,
  suspended_at       TEXT,
  suspended_by       TEXT REFERENCES users(id),
  suspended_reason   TEXT,
  last_login_at      TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  password_changed_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by         TEXT,
  deleted_at         TEXT
);
CREATE UNIQUE INDEX users_email_uq ON users(email);
CREATE INDEX users_status_idx ON users(status, created_at);

-- Organisational identity. A profile may exist without a login (legacy
-- executives, faculty moderators) and is linked to a user when they claim it.
CREATE TABLE profiles (
  id               TEXT PRIMARY KEY,
  user_id          TEXT UNIQUE REFERENCES users(id),
  full_name        TEXT NOT NULL,
  slug             TEXT,
  person_type      TEXT NOT NULL DEFAULT 'STUDENT'
                     CHECK (person_type IN ('STUDENT','FACULTY','ALUMNI','EXTERNAL')),
  student_id       TEXT,                                     -- nine digits when valid; legacy placeholders kept in legacy_json
  department       TEXT,
  batch            TEXT,
  designation      TEXT,                                     -- faculty title, e.g. "Lecturer"
  bio              TEXT,
  avatar_media_id  TEXT REFERENCES media(id),
  avatar_position_x REAL,
  avatar_position_y REAL,
  avatar_scale     REAL,
  phone            TEXT,                                     -- PRIVATE. never rendered publicly
  public_email     TEXT,
  linkedin_url     TEXT,
  github_url       TEXT,
  twitter_url      TEXT,
  facebook_url     TEXT,
  website_url      TEXT,
  legacy_json      TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by       TEXT,
  deleted_at       TEXT
);
CREATE UNIQUE INDEX profiles_student_id_uq ON profiles(student_id) WHERE student_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX profiles_name_idx ON profiles(full_name);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,                             -- SHA-256 of the cookie token; the token itself is never stored
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT NOT NULL,
  last_seen_at  TEXT,
  ip_hash       TEXT,
  user_agent    TEXT,
  revoked_at    TEXT
);
CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at);

CREATE TABLE auth_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  purpose     TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFY','PASSWORD_RESET','INVITE')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens(user_id, purpose);

CREATE TABLE authentication_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  email       TEXT COLLATE NOCASE,
  event       TEXT NOT NULL,
  ip_hash     TEXT,
  user_agent  TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX authentication_events_user_idx ON authentication_events(user_id, created_at);
CREATE INDEX authentication_events_email_idx ON authentication_events(email, created_at);

-- Fixed-window counters for brute-force and abuse protection.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ───────────────────────────── authorization ─────────────────────────────

CREATE TABLE roles (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  rank         INTEGER NOT NULL DEFAULT 0,
  is_protected INTEGER NOT NULL DEFAULT 0,                   -- only protected-governance authority may change it
  max_holders  INTEGER,                                      -- e.g. 3 for moderator
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by   TEXT,
  deleted_at   TEXT
);

CREATE TABLE permissions (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,                          -- resource.action, e.g. posts.publish
  resource     TEXT NOT NULL,
  action       TEXT NOT NULL,
  description  TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  scope         TEXT NOT NULL DEFAULT 'ALL'
                  CHECK (scope IN ('OWN','ASSIGNED','COMMITTEE','POSITION','CATEGORY','EVENT','ALL')),
  scope_value   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by    TEXT,
  PRIMARY KEY (role_id, permission_id, scope, scope_value)
);

CREATE TABLE user_roles (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role_id     TEXT NOT NULL REFERENCES roles(id),
  granted_by  TEXT REFERENCES users(id),
  granted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT,
  revoked_at  TEXT,
  revoked_by  TEXT REFERENCES users(id),
  reason      TEXT
);
CREATE UNIQUE INDEX user_roles_active_uq ON user_roles(user_id, role_id) WHERE revoked_at IS NULL;
CREATE INDEX user_roles_role_idx ON user_roles(role_id) WHERE revoked_at IS NULL;

CREATE TABLE positions (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,                         -- slug, e.g. general-secretary
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'EXECUTIVE'
                  CHECK (category IN ('FACULTY','LEADERSHIP','SECRETARIAT','COORDINATOR','EXECUTIVE','OTHER')),
  rank          INTEGER NOT NULL DEFAULT 100,                 -- lower = more senior; drives default ordering
  parent_id     TEXT REFERENCES positions(id),
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_protected  INTEGER NOT NULL DEFAULT 0,
  max_holders   INTEGER,                                      -- per committee; NULL = unlimited
  term_months   INTEGER,
  aliases_json  TEXT CHECK (aliases_json IS NULL OR json_valid(aliases_json)),  -- legacy titles that map here
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE position_permissions (
  position_id   TEXT NOT NULL REFERENCES positions(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  scope         TEXT NOT NULL DEFAULT 'ALL'
                  CHECK (scope IN ('OWN','ASSIGNED','COMMITTEE','POSITION','CATEGORY','EVENT','ALL')),
  scope_value   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by    TEXT,
  PRIMARY KEY (position_id, permission_id, scope, scope_value)
);

-- ───────────────────────────── committees ─────────────────────────────

CREATE TABLE committees (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,                        -- the public URL segment, e.g. "2026"
  name           TEXT NOT NULL,
  term_label     TEXT NOT NULL,
  academic_year  TEXT,
  start_date     TEXT,
  end_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'ARCHIVED' CHECK (status IN ('UPCOMING','CURRENT','ARCHIVED')),
  description    TEXT,
  -- Order and metadata of the committee's units (campuses / wings) so the
  -- public page renders them exactly as before, e.g.
  -- {"sections":["wings","facultyMembers","studentExecutives"],"units":[{"type":"WING","key":"vgs","meta":{"year":"2024"}}]}
  layout_json    TEXT CHECK (layout_json IS NULL OR json_valid(layout_json)),
  legacy_json    TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by     TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by     TEXT,
  deleted_at     TEXT
);
-- At most one committee is current at a time.
CREATE UNIQUE INDEX committees_one_current_uq ON committees(status) WHERE status = 'CURRENT' AND deleted_at IS NULL;

-- One row per person per position per committee. Historical rows are never
-- rewritten when a new committee starts; a new committee gets new rows.
CREATE TABLE committee_members (
  id             TEXT PRIMARY KEY,
  committee_id   TEXT NOT NULL REFERENCES committees(id),
  profile_id     TEXT NOT NULL REFERENCES profiles(id),
  position_id    TEXT NOT NULL REFERENCES positions(id),
  position_title TEXT NOT NULL,                               -- title exactly as displayed, e.g. "Vice President (Technical)"
  display_name   TEXT,                                        -- name as listed that term; NULL = profile name
  designation    TEXT,                                        -- faculty title that term, e.g. "Lecturer"
  section        TEXT NOT NULL DEFAULT 'STUDENT' CHECK (section IN ('FACULTY','STUDENT')),
  unit_type      TEXT CHECK (unit_type IS NULL OR unit_type IN ('CAMPUS','WING')),
  unit_key       TEXT,                                        -- e.g. "permanent", "vgs"
  campus_label   TEXT,                                        -- shown on the card, e.g. "Permanent Campus"
  avatar_media_id   TEXT REFERENCES media(id),                -- per-term portrait/crop; NULL falls back to the profile
  avatar_position_x REAL,
  avatar_position_y REAL,
  avatar_scale      REAL,
  display_order  INTEGER NOT NULL DEFAULT 100,
  start_date     TEXT,
  end_date       TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  bio            TEXT,
  legacy_json    TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by     TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by     TEXT,
  deleted_at     TEXT
);
CREATE INDEX committee_members_committee_idx ON committee_members(committee_id, section, display_order);
CREATE INDEX committee_members_profile_idx ON committee_members(profile_id);
CREATE INDEX committee_members_position_idx ON committee_members(position_id);
-- The same person cannot hold the same position twice in one committee unit.
CREATE UNIQUE INDEX committee_members_uq
  ON committee_members(committee_id, profile_id, position_id, IFNULL(unit_key, ''))
  WHERE deleted_at IS NULL;

-- ───────────────────────────── media ─────────────────────────────

CREATE TABLE media (
  id                TEXT PRIMARY KEY,
  storage           TEXT NOT NULL CHECK (storage IN ('R2','STATIC','EXTERNAL')),
  object_key        TEXT UNIQUE,                              -- R2 key of the optimised master
  legacy_path       TEXT,                                     -- /public path while STATIC, kept after migration for traceability
  external_url      TEXT,
  original_filename TEXT,
  mime_type         TEXT,
  media_type        TEXT NOT NULL DEFAULT 'IMAGE' CHECK (media_type IN ('IMAGE','DOCUMENT','OTHER')),
  size_bytes        INTEGER,
  width             INTEGER,
  height            INTEGER,
  checksum_sha256   TEXT,                                     -- of the optimised master; drives dedupe
  source_checksum   TEXT,                                     -- of the original upload / legacy file
  variants_json     TEXT CHECK (variants_json IS NULL OR json_valid(variants_json)),
  alt_text          TEXT,
  visibility        TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','PRIVATE','RESTRICTED')),
  status            TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('PENDING','READY','FAILED','ARCHIVED')),
  uploaded_by       TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by        TEXT,
  deleted_at        TEXT
);
CREATE INDEX media_checksum_idx ON media(checksum_sha256);
CREATE INDEX media_source_checksum_idx ON media(source_checksum);
CREATE UNIQUE INDEX media_legacy_path_uq ON media(legacy_path) WHERE legacy_path IS NOT NULL;

-- Every place a media object is used; orphan detection and safe deletion read this.
CREATE TABLE media_references (
  media_id      TEXT NOT NULL REFERENCES media(id),
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  field         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (media_id, resource_type, resource_id, field)
);
CREATE INDEX media_references_resource_idx ON media_references(resource_type, resource_id);

-- ───────────────────────────── approvals & governance ─────────────────────────────

CREATE TABLE approval_policies (
  id                  TEXT PRIMARY KEY,
  key                 TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT,
  mode                TEXT NOT NULL CHECK (mode IN ('ANY','ALL','THRESHOLD')),
  threshold           INTEGER,                                -- for THRESHOLD: distinct approvals required
  approvers_json      TEXT NOT NULL CHECK (json_valid(approvers_json)),  -- [{ "type": "position"|"role"|"user"|"assigned"|"committee_leader", "value": "..." }]
  allow_self_approval INTEGER NOT NULL DEFAULT 0,
  is_protected        INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by          TEXT,
  deleted_at          TEXT
);

-- WHEN conditions THEN actions WITH scope REQUIRES approval.
CREATE TABLE rules (
  id                 TEXT PRIMARY KEY,
  key                TEXT UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  trigger            TEXT NOT NULL DEFAULT 'AUTHORIZE',        -- AUTHORIZE, or EVENT:<name> e.g. EVENT:post.submitted
  permission_key     TEXT NOT NULL,                            -- exact key, "resource.*" or "*"
  resource_type      TEXT,
  scope              TEXT NOT NULL DEFAULT 'ALL'
                       CHECK (scope IN ('OWN','ASSIGNED','COMMITTEE','POSITION','CATEGORY','EVENT','ALL')),
  scope_value        TEXT NOT NULL DEFAULT '',
  priority           INTEGER NOT NULL DEFAULT 100,             -- higher runs first
  approval_policy_id TEXT REFERENCES approval_policies(id),
  is_protected       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  version            INTEGER NOT NULL DEFAULT 1,
  activated_at       TEXT,
  activated_by       TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by         TEXT REFERENCES users(id),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by         TEXT REFERENCES users(id),
  deleted_at         TEXT
);
CREATE INDEX rules_active_idx ON rules(status, trigger, priority DESC) WHERE deleted_at IS NULL;

-- Conditions with the same group_no are AND-ed; groups are OR-ed.
CREATE TABLE rule_conditions (
  id         TEXT PRIMARY KEY,
  rule_id    TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  group_no   INTEGER NOT NULL DEFAULT 0,
  field      TEXT NOT NULL,                                    -- actor.position, resource.category, ...
  operator   TEXT NOT NULL CHECK (operator IN ('eq','neq','in','not_in','exists','not_exists','is_true','is_false')),
  value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX rule_conditions_rule_idx ON rule_conditions(rule_id);

CREATE TABLE rule_actions (
  id          TEXT PRIMARY KEY,
  rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ALLOW','DENY','REQUIRE_APPROVAL','ASSIGN_PERMISSION','REMOVE_PERMISSION',
                                                   'NOTIFY','ASSIGN_TASK','CHANGE_STATE','PUBLISH','UNPUBLISH','ARCHIVE')),
  params_json TEXT CHECK (params_json IS NULL OR json_valid(params_json)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX rule_actions_rule_idx ON rule_actions(rule_id);

CREATE TABLE approval_requests (
  id              TEXT PRIMARY KEY,
  policy_id       TEXT NOT NULL REFERENCES approval_policies(id),
  policy_snapshot TEXT NOT NULL CHECK (json_valid(policy_snapshot)),  -- frozen at creation so later policy edits cannot change an open request
  rule_id         TEXT REFERENCES rules(id),
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  action          TEXT NOT NULL,
  title           TEXT,
  payload_json    TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by    TEXT NOT NULL REFERENCES users(id),
  resolved_at     TEXT,
  resolution_note TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- One open request per resource+action; duplicate submits collapse onto it.
CREATE UNIQUE INDEX approval_requests_open_uq ON approval_requests(resource_type, resource_id, action) WHERE status = 'PENDING';
CREATE INDEX approval_requests_status_idx ON approval_requests(status, created_at);

CREATE TABLE approval_steps (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES approval_requests(id),
  actor_id      TEXT NOT NULL REFERENCES users(id),
  decision      TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  matched_group TEXT,
  comment       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (request_id, actor_id)
);

-- ───────────────────────────── content ─────────────────────────────

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('POST','EVENT')),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (kind, slug)
);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE posts (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('BLOG','NEWS','ANNOUNCEMENT')),
  slug              TEXT NOT NULL,
  title             TEXT NOT NULL,
  subtitle          TEXT,
  excerpt           TEXT,
  body_markdown     TEXT,
  author_profile_id TEXT REFERENCES profiles(id),
  author_name       TEXT,                                     -- for external / legacy authors without a profile
  author_url        TEXT,
  category_id       TEXT REFERENCES categories(id),
  featured_media_id TEXT REFERENCES media(id),
  canonical_url     TEXT,                                     -- set when the article's home is elsewhere (Substack, Hashnode)
  seo_title         TEXT,
  seo_description   TEXT,
  status            TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PUBLISHED','REJECTED','ARCHIVED')),
  scheduled_at      TEXT,
  published_at      TEXT,
  read_time_minutes INTEGER,
  views             INTEGER NOT NULL DEFAULT 0,
  pinned            INTEGER NOT NULL DEFAULT 0,
  current_version   INTEGER NOT NULL DEFAULT 1,
  source            TEXT NOT NULL DEFAULT 'LOCAL' CHECK (source IN ('LOCAL','LEGACY','HASHNODE','SUBSTACK')),
  source_id         TEXT,
  legacy_json       TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by        TEXT REFERENCES users(id),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by        TEXT REFERENCES users(id),
  deleted_at        TEXT,
  UNIQUE (type, slug)
);
CREATE INDEX posts_public_idx ON posts(type, status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_author_idx ON posts(created_by);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE post_media (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id   TEXT NOT NULL REFERENCES media(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE post_revisions (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id),
  version       INTEGER NOT NULL,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  body_markdown TEXT,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  changed_by    TEXT REFERENCES users(id),
  change_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (post_id, version)
);

-- ───────────────────────────── events ─────────────────────────────

CREATE TABLE events (
  id                     TEXT PRIMARY KEY,
  legacy_sl              INTEGER,                              -- the old numeric id; not unique in the source data
  slug                   TEXT NOT NULL UNIQUE,
  title                  TEXT NOT NULL,
  description            TEXT,
  category_id            TEXT REFERENCES categories(id),
  organizer              TEXT,
  committee_id           TEXT REFERENCES committees(id),
  venue                  TEXT,
  mode                   TEXT CHECK (mode IS NULL OR mode IN ('ONLINE','OFFLINE','HYBRID')),
  start_at               TEXT,
  end_at                 TEXT,
  time_text              TEXT,                                 -- free-text schedule kept verbatim from legacy data
  registration_enabled   INTEGER NOT NULL DEFAULT 0,
  registration_opens_at  TEXT,
  registration_closes_at TEXT,
  capacity               INTEGER,
  registration_fields_json TEXT CHECK (registration_fields_json IS NULL OR json_valid(registration_fields_json)),
  participants_reported  INTEGER,                              -- attendance figure reported for past events
  participants_text      TEXT,                                 -- non-numeric attendance kept verbatim, e.g. "All Executive Members"
  external_link          TEXT,
  guests_text            TEXT,
  judges_text            TEXT,
  banner_media_id        TEXT REFERENCES media(id),
  status                 TEXT NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PUBLISHED','ONGOING','COMPLETED','CANCELLED','ARCHIVED')),
  published_at           TEXT,
  legacy_json            TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by             TEXT REFERENCES users(id),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by             TEXT REFERENCES users(id),
  deleted_at             TEXT
);
CREATE INDEX events_public_idx ON events(status, start_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE event_sessions (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  start_at   TEXT,
  end_at     TEXT,
  venue      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX event_sessions_event_idx ON event_sessions(event_id);

-- Speakers, guests, judges and coordinators. A coordinator with a user_id is
-- what the ASSIGNED / EVENT:ASSIGNED permission scopes match against.
CREATE TABLE event_people (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('SPEAKER','COORDINATOR','CHIEF_GUEST','SPECIAL_GUEST','GUEST','JUDGE','PHOTOGRAPHER')),
  name        TEXT NOT NULL,
  title       TEXT,
  profile_id  TEXT REFERENCES profiles(id),
  user_id     TEXT REFERENCES users(id),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX event_people_event_idx ON event_people(event_id);
CREATE INDEX event_people_user_idx ON event_people(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE event_registrations (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  user_id      TEXT REFERENCES users(id),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL COLLATE NOCASE,
  student_id   TEXT,
  phone        TEXT,
  answers_json TEXT CHECK (answers_json IS NULL OR json_valid(answers_json)),
  status       TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED','WAITLISTED','CANCELLED','ATTENDED','REJECTED')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX event_registrations_email_uq ON event_registrations(event_id, email);
CREATE UNIQUE INDEX event_registrations_user_uq ON event_registrations(event_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX event_registrations_status_idx ON event_registrations(event_id, status);

CREATE TABLE event_media (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id   TEXT NOT NULL REFERENCES media(id),
  kind       TEXT NOT NULL DEFAULT 'GALLERY' CHECK (kind IN ('BANNER','GALLERY','ATTACHMENT')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, media_id, kind)
);

-- ───────────────────────────── contests ─────────────────────────────

CREATE TABLE contests (
  id              TEXT PRIMARY KEY,
  legacy_id       INTEGER UNIQUE,                             -- the public URL: /contests/<legacy_id>
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  held_on_text    TEXT,
  held_on         TEXT,
  host            TEXT,
  platform        TEXT,                                       -- judge platform, e.g. "toph.io", "vjudge"
  contest_link    TEXT,
  problemset_link TEXT,
  standings_link  TEXT,
  editorial_link  TEXT,
  practice_link   TEXT,
  status          TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  legacy_json     TEXT CHECK (legacy_json IS NULL OR json_valid(legacy_json)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by      TEXT,
  deleted_at      TEXT
);

CREATE TABLE contest_teams (
  id          TEXT PRIMARY KEY,
  contest_id  TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rank        INTEGER,
  solved      INTEGER,
  achievement TEXT,
  members_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(members_json)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX contest_teams_contest_idx ON contest_teams(contest_id);

CREATE TABLE contest_media (
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  media_id   TEXT NOT NULL REFERENCES media(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contest_id, media_id)
);

-- ───────────────────────────── forms, certificates, lost & found ─────────────────────────────

CREATE TABLE external_forms (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT REFERENCES users(id),
  deleted_at TEXT
);

CREATE TABLE certificate_programs (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,                            -- e.g. hacktheai-2025
  name        TEXT NOT NULL,
  event_id    TEXT REFERENCES events(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- PRIVATE: emails and phone numbers are only ever compared server-side.
CREATE TABLE certificate_recipients (
  id             TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL REFERENCES certificate_programs(id),
  team_name      TEXT,
  institution    TEXT,
  full_name      TEXT NOT NULL,
  gender         TEXT,
  email          TEXT COLLATE NOCASE,
  phone          TEXT,
  member_index   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX certificate_recipients_lookup_idx ON certificate_recipients(program_id, email);
CREATE INDEX certificate_recipients_team_idx ON certificate_recipients(program_id, team_name);

CREATE TABLE lost_found_posts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  type           TEXT NOT NULL CHECK (type IN ('lost','found')),
  title          TEXT NOT NULL,
  category       TEXT NOT NULL,
  description    TEXT NOT NULL,
  location       TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  image_media_id TEXT REFERENCES media(id),
  image_url      TEXT,                                         -- legacy Supabase storage URL until migrated
  contact_method TEXT NOT NULL CHECK (contact_method IN ('email','phone','in_app')),
  contact_value  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','resolved','rejected')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);
CREATE INDEX lost_found_posts_status_idx ON lost_found_posts(status, created_at DESC);
CREATE INDEX lost_found_posts_user_idx ON lost_found_posts(user_id);

CREATE TABLE lost_found_messages (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES lost_found_posts(id),
  sender_id    TEXT NOT NULL REFERENCES users(id),
  sender_email TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX lost_found_messages_post_idx ON lost_found_messages(post_id, created_at DESC);

-- ───────────────────────────── notifications, audit, settings ─────────────────────────────

CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  link          TEXT,
  resource_type TEXT,
  resource_id   TEXT,
  channel       TEXT NOT NULL DEFAULT 'IN_APP',
  read_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_label   TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  reason        TEXT,
  request_id    TEXT,
  ip_hash       TEXT,
  user_agent    TEXT,
  before_json   TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json    TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  decision_json TEXT CHECK (decision_json IS NULL OR json_valid(decision_json)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs(action, created_at DESC);

-- Audit history is append-only, enforced by the database itself rather than
-- by application code that a future change could bypass.
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

CREATE TABLE organization_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL CHECK (json_valid(value_json)),
  is_public   INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by  TEXT
);

CREATE TABLE system_settings (
  key          TEXT PRIMARY KEY,
  value_json   TEXT NOT NULL CHECK (json_valid(value_json)),
  is_protected INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by   TEXT
);

-- ───────────────────────────── migration bookkeeping ─────────────────────────────

CREATE TABLE migration_runs (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  mode        TEXT NOT NULL,
  status      TEXT NOT NULL,
  summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json))
);

CREATE TABLE migration_source_map (
  source       TEXT NOT NULL,                                  -- e.g. data/executives.json
  source_key   TEXT NOT NULL,                                  -- stable key within the source
  target_table TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (source, source_key, target_table)
);
CREATE INDEX migration_source_map_target_idx ON migration_source_map(target_table, target_id);

CREATE TABLE migration_conflicts (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_key  TEXT NOT NULL,
  kind        TEXT NOT NULL,                                   -- CONFLICT, DUPLICATE, SKIPPED, FAILED
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  resolution  TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
);
