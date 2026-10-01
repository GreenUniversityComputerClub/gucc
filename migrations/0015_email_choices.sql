-- Email is opt-in (2026-09-30), and authorization rules are cached safely (2026-10-01). Additive
-- only: one defaulted column, a small table and its triggers, one index.
--
--   * users.security_emails   the member chose to get security alerts (a sign-in from a new
--                             device, a locked account, password or email changes) by email.
--                             Every notification email is off until its owner turns it on; the
--                             other choices stay in notification_preferences, whose category
--                             CHECK predates this one (changing a CHECK means rebuilding the table).
ALTER TABLE users ADD COLUMN security_emails INTEGER NOT NULL DEFAULT 0 CHECK (security_emails IN (0, 1));

-- Authorization rules are read on every signed-in request but change rarely (2026-10-01).
--
--   * cache_stamps   a counter per cached thing. Every change to the rules, their actions and
--                    conditions, or the approval policies they name bumps 'rules' in the same
--                    transaction (the triggers below), so a Worker may keep the rules it read until
--                    the counter moves: one indexed row per request instead of every rule.
CREATE TABLE IF NOT EXISTS cache_stamps (
  key   TEXT PRIMARY KEY,
  stamp INTEGER NOT NULL DEFAULT 0
);
INSERT INTO cache_stamps (key, stamp) VALUES ('rules', 0) ON CONFLICT(key) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS rules_stamp_insert AFTER INSERT ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rules_stamp_update AFTER UPDATE ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rules_stamp_delete AFTER DELETE ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_insert AFTER INSERT ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_update AFTER UPDATE ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_delete AFTER DELETE ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_insert AFTER INSERT ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_update AFTER UPDATE ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_delete AFTER DELETE ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_insert AFTER INSERT ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_update AFTER UPDATE ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_delete AFTER DELETE ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;

-- A person's published posts, found by their profile (their member page lists them; a profile
-- save checks whether the blog shows them before refreshing it).
CREATE INDEX IF NOT EXISTS posts_author_profile_idx ON posts(author_profile_id) WHERE author_profile_id IS NOT NULL;
