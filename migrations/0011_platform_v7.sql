-- Platform v7 (round 8, 2026-09-30). Additive only: new tables, nullable or defaulted columns,
-- indexes, seed rows, and backfills that touch only rows they fill.
--
--   * live updates        users.last_active_at / show_active_status: "Active now" and "Active 5 min
--                         ago" in messages (the live hub keeps presence in memory; this column is
--                         written once when someone's last connection closes, at most every 5 min)
--   * group chats         chat_groups (name, description, photo), member roles and join/leave
--                         times; conversations.kind keeps its 'DIRECT' CHECK (it can't change
--                         without rebuilding the table), so a group is a conversation with a
--                         chat_groups row and a pair_key of 'group:<id>'
--   * messages            reactions (one per person per message), replies, system lines
--                         ("Rafi added Nusrat"), conversations.last_message_id for a cheaper inbox
--   * email digests       notifications.email_state: DUE notices are sent as one email per person
--                         by the hourly job, only if still unread after 15 minutes
--   * tasks               checklist items, labels, board order, comment counts, a link to the
--                         meeting that created them, templates
--   * meetings            any https join link, agenda items, attendance, decisions, repeat series
--   * blog                post reactions, a tag index for tag pages, pending edits of live posts
--   * events              agenda items, check-in time (QR check-in), reminder marker
--   * permissions         chat.groups.create (members), chat.groups.manage (the six senior
--                         positions; Moderators hold "*")
--
-- Release order: the previous Worker ignores every new table and column, so it keeps working on
-- the migrated database. Restore: this migration only adds; to undo, restore the D1 backup taken
-- by the release (release.ts / deploy.yml) or use D1 Time Travel to the point before it ran.

-- ── Presence ─────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN last_active_at TEXT;
-- Share "Active now" with others (and see theirs). Off hides both ways, like read receipts.
ALTER TABLE users ADD COLUMN show_active_status INTEGER NOT NULL DEFAULT 1 CHECK (show_active_status IN (0, 1));

-- ── Group chats ──────────────────────────────────────────────────────────────────
CREATE TABLE chat_groups (
  conversation_id  TEXT PRIMARY KEY REFERENCES conversations(id),
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description      TEXT CHECK (description IS NULL OR length(description) <= 500),
  photo_media_id   TEXT REFERENCES media(id),
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by       TEXT,
  deleted_at       TEXT
);
CREATE INDEX chat_groups_creator_idx ON chat_groups(created_by, created_at);

-- OWNER created the group (manages it with holders of chat.groups.manage); left_at keeps who
-- was in the group, so their old messages still show their name.
ALTER TABLE conversation_members ADD COLUMN role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER'));
ALTER TABLE conversation_members ADD COLUMN joined_at TEXT;
ALTER TABLE conversation_members ADD COLUMN left_at TEXT;
ALTER TABLE conversation_members ADD COLUMN added_by TEXT;

ALTER TABLE conversations ADD COLUMN last_message_id TEXT;
UPDATE conversations SET last_message_id = (SELECT m.id FROM messages m WHERE m.conversation_id = conversations.id ORDER BY m.created_at DESC LIMIT 1)
  WHERE last_message_at IS NOT NULL AND last_message_id IS NULL;

ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'TEXT' CHECK (kind IN ('TEXT', 'SYSTEM'));
ALTER TABLE messages ADD COLUMN reply_to_id TEXT;

CREATE TABLE message_reactions (
  message_id  TEXT NOT NULL REFERENCES messages(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  emoji       TEXT NOT NULL CHECK (emoji IN ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'thanks')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (message_id, user_id)
);

-- ── Email digests ────────────────────────────────────────────────────────────────
-- NULL: not for email. DUE: waiting for the hourly digest. SENT / SKIPPED (read in time, or the
-- allowance ran out and it expired after two days).
ALTER TABLE notifications ADD COLUMN email_state TEXT CHECK (email_state IS NULL OR email_state IN ('DUE', 'SENT', 'SKIPPED'));
CREATE INDEX notifications_email_due_idx ON notifications(created_at) WHERE email_state = 'DUE';

-- ── Tasks ────────────────────────────────────────────────────────────────────────
ALTER TABLE tasks ADD COLUMN labels_json TEXT CHECK (labels_json IS NULL OR json_valid(labels_json));
ALTER TABLE tasks ADD COLUMN meeting_id TEXT REFERENCES meetings(id);
ALTER TABLE tasks ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN board_position REAL;
-- Who saved last (edit forms check nobody changed the task or meeting since they opened it).
ALTER TABLE tasks ADD COLUMN updated_by TEXT;
ALTER TABLE meetings ADD COLUMN updated_by TEXT;
UPDATE tasks SET comment_count = (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = tasks.id AND c.deleted_at IS NULL)
  WHERE EXISTS (SELECT 1 FROM task_comments c WHERE c.task_id = tasks.id AND c.deleted_at IS NULL);
CREATE INDEX tasks_due_open_idx ON tasks(due_at) WHERE deleted_at IS NULL AND status IN ('OPEN', 'IN_PROGRESS') AND due_at IS NOT NULL;
CREATE INDEX tasks_meeting_idx ON tasks(meeting_id) WHERE meeting_id IS NOT NULL;
CREATE INDEX tasks_open_idx ON tasks(status, due_at) WHERE deleted_at IS NULL;

CREATE TABLE task_items (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  position    INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT,
  done_by     TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX task_items_task_idx ON task_items(task_id, position);

ALTER TABLE task_comments ADD COLUMN edited_at TEXT;

CREATE TABLE task_templates (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  details         TEXT CHECK (details IS NULL OR length(details) <= 5000),
  priority        TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
  checklist_json  TEXT CHECK (checklist_json IS NULL OR json_valid(checklist_json)),
  labels_json     TEXT CHECK (labels_json IS NULL OR json_valid(labels_json)),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);
CREATE INDEX task_templates_creator_idx ON task_templates(created_by) WHERE deleted_at IS NULL;

-- ── Meetings ─────────────────────────────────────────────────────────────────────
-- Any https link (Zoom, Teams, Jitsi…); meet_url keeps its Google Meet CHECK for older rows.
ALTER TABLE meetings ADD COLUMN join_url TEXT CHECK (join_url IS NULL OR (join_url LIKE 'https://%' AND length(join_url) <= 500));
ALTER TABLE meetings ADD COLUMN decisions_json TEXT CHECK (decisions_json IS NULL OR json_valid(decisions_json));
-- Meetings created together by "repeat weekly" share a series id.
ALTER TABLE meetings ADD COLUMN series_id TEXT;
ALTER TABLE meeting_participants ADD COLUMN attended INTEGER CHECK (attended IS NULL OR attended IN (0, 1));
ALTER TABLE meeting_participants ADD COLUMN responded_at TEXT;
CREATE INDEX meetings_series_idx ON meetings(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX meetings_end_idx ON meetings(status, ends_at) WHERE deleted_at IS NULL;

CREATE TABLE meeting_agenda_items (
  id             TEXT PRIMARY KEY,
  meeting_id     TEXT NOT NULL REFERENCES meetings(id),
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  owner_user_id  TEXT REFERENCES users(id),
  notes          TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX meeting_agenda_items_meeting_idx ON meeting_agenda_items(meeting_id, position);

-- ── Blog ─────────────────────────────────────────────────────────────────────────
CREATE INDEX post_tags_tag_idx ON post_tags(tag_id, post_id);
CREATE TABLE post_reactions (
  post_id     TEXT NOT NULL REFERENCES posts(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  emoji       TEXT NOT NULL CHECK (emoji IN ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'thanks')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (post_id, user_id)
);
-- An edit of a published post by someone who can't publish waits here until it is approved; the
-- live post stays as it was.
ALTER TABLE posts ADD COLUMN pending_revision_id TEXT;

-- ── Events ───────────────────────────────────────────────────────────────────────
CREATE TABLE event_agenda_items (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  starts_at    TEXT,
  ends_at      TEXT,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  speaker      TEXT CHECK (speaker IS NULL OR length(speaker) <= 200),
  description  TEXT CHECK (description IS NULL OR length(description) <= 2000),
  position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX event_agenda_items_event_idx ON event_agenda_items(event_id, position);
ALTER TABLE event_registrations ADD COLUMN checked_in_at TEXT;
ALTER TABLE event_registrations ADD COLUMN checked_in_by TEXT;
-- When registrants were reminded (once, a day before).
ALTER TABLE events ADD COLUMN reminded_at TEXT;

-- ── Permissions ──────────────────────────────────────────────────────────────────
INSERT INTO permissions (id, key, resource, action, description, is_sensitive) VALUES
  ('perm:chat.groups.create', 'chat.groups.create', 'chat', 'groups.create', 'Create group conversations with other members', 0),
  ('perm:chat.groups.manage', 'chat.groups.manage', 'chat', 'groups.manage', 'Rename any group conversation and change its photo and description', 0)
  ON CONFLICT(id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, scope, scope_value)
  SELECT r.value, 'perm:chat.groups.create', 'ALL', '' FROM json_each('["role:member","role:executive","role:unit-executive"]') AS r
  WHERE EXISTS (SELECT 1 FROM roles WHERE id = r.value)
  ON CONFLICT(role_id, permission_id, scope, scope_value) DO NOTHING;

-- The six senior positions of the club (Moderators hold every permission already). Leaders change
-- this under Positions without a code change.
INSERT INTO position_permissions (position_id, permission_id, scope, scope_value)
  SELECT p.value, 'perm:chat.groups.manage', 'ALL', '' FROM json_each('["pos:president","pos:vice-president-activities","pos:vice-president-technical","pos:general-secretary","pos:joint-general-secretary-activity","pos:joint-general-secretary-technical"]') AS p
  WHERE EXISTS (SELECT 1 FROM positions WHERE id = p.value)
  ON CONFLICT(position_id, permission_id, scope, scope_value) DO NOTHING;

-- ── Settings ─────────────────────────────────────────────────────────────────────
INSERT INTO system_settings (key, value_json, is_protected, description) VALUES
  ('live.enabled', 'true', 0, 'Live updates (messages, notifications, active status) over one connection per open tab. Off: pages check for news every minute or so instead.'),
  ('chat.max_group_members', '50', 0, 'Most people in one group conversation.')
  ON CONFLICT(key) DO NOTHING;
