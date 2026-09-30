/**
 * The queries run most often (every page, every message, the daily clean-up) find their rows
 * through an index instead of reading whole tables, which is what keeps D1's free daily row reads
 * far away. Checked with SQLite's own planner on the real schema (D1 is SQLite).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { MEDIA_REFS_SQL } from "@/lib/server/services/media";
import { avatarOfUserSql } from "@/lib/server/avatar";
import { MEMBERS_SQL } from "@/lib/public/queries";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});

const plan = (sql: string) => (w.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map((r) => r.detail);
/** Full reads of a table ("SCAN x", not "SCAN x USING … INDEX"), except the ones allowed. */
const scans = (sql: string, allowed: string[] = []) =>
  plan(sql).filter((d) => /^SCAN \w+$/.test(d.trim()) || /^SCAN \w+ USING (?!COVERING )INDEX \w+$/.test(d.trim()) && !/CONSTANT ROW/.test(d))
    .filter((d) => !allowed.some((a) => new RegExp(`^SCAN ${a}\\b`).test(d.trim())));

const HOT: Record<string, string> = {
  "someone's photo": `SELECT ${avatarOfUserSql("'usr_1'")}`,
  "unread notifications": "SELECT COUNT(*) FROM notifications WHERE user_id = 'u' AND read_at IS NULL",
  "notification list": "SELECT id FROM notifications WHERE user_id = 'u' ORDER BY created_at DESC LIMIT 30",
  "email digest": "SELECT id FROM notifications WHERE email_state = 'DUE' AND created_at <= '2030' LIMIT 100",
  "my conversations": "SELECT c.id FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id WHERE me.user_id = 'u' AND me.left_at IS NULL",
  "a conversation's messages": "SELECT id FROM messages WHERE conversation_id = 'c' ORDER BY created_at DESC LIMIT 60",
  "reactions on messages": "SELECT * FROM message_reactions WHERE message_id IN ('a', 'b')",
  "my open tasks": "SELECT id FROM tasks WHERE assignee_user_id = 'u' AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS')",
  "my meetings": "SELECT m.id FROM meeting_participants mp JOIN meetings m ON m.id = mp.meeting_id WHERE mp.user_id = 'u' AND m.deleted_at IS NULL",
  "published articles": "SELECT id FROM posts WHERE type = 'BLOG' AND status = 'PUBLISHED' AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 50",
  "an article's reactions": "SELECT emoji, COUNT(*) FROM post_reactions WHERE post_id = 'p' GROUP BY emoji",
  "seats taken": "SELECT COUNT(*) FROM event_registrations WHERE event_id = 'e' AND status IN ('REGISTERED','ATTENDED')",
  "rate limit": "SELECT * FROM rate_limits WHERE key = 'k'",
  "usage counter": "SELECT count FROM usage_counters WHERE day = 'd' AND key = 'k'",
};

describe("query plans", () => {
  for (const [name, sql] of Object.entries(HOT)) {
    it(`${name}: found through an index`, () => {
      expect(scans(sql)).toEqual([]);
    });
  }

  it("whether a file is used anywhere: one index search per place (only text bodies are read)", () => {
    // Articles, event descriptions and settings are searched for files placed inside their text:
    // those tables are small. Everything else must be a search.
    const refs = `SELECT ${MEDIA_REFS_SQL} FROM media m WHERE m.id = 'x'`;
    expect(scans(refs, ["po", "e", "s"])).toEqual([]);
  });

  it("the public committee roster: one pass over listings, joined to people and photos by key", () => {
    expect(plan(MEMBERS_SQL).filter((d) => /SCAN (p|m|cut|co)\b/.test(d))).toEqual([]);
  });
});
