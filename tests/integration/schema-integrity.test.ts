/**
 * The schema after every migration: no broken references, no corruption, every foreign key
 * backed by an index where lookups need one, and the uniqueness rules the code relies on.
 */
import { describe, expect, it } from "vitest";
import { createTestDb } from "../support/d1";

describe("database after all migrations", () => {
  it("passes SQLite's integrity and foreign-key checks", () => {
    const { sqlite } = createTestDb();
    expect(sqlite.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("indexes the foreign keys of the v4 tables", () => {
    const { sqlite } = createTestDb();
    const tables = ["user_permissions", "conversation_members", "messages", "user_blocks", "reports", "tasks", "task_comments", "meetings", "meeting_participants"];
    const missing: string[] = [];
    for (const t of tables) {
      const fks = sqlite.prepare(`PRAGMA foreign_key_list(${t})`).all() as Array<{ from: string }>;
      const indexed = new Set<string>();
      for (const ix of sqlite.prepare(`PRAGMA index_list(${t})`).all() as Array<{ name: string }>) {
        const first = (sqlite.prepare(`PRAGMA index_info("${ix.name}")`).all() as Array<{ seqno: number; name: string }>).find((c) => c.seqno === 0);
        if (first) indexed.add(first.name);
      }
      // Audit-style columns (who granted, who revoked) are never looked up by value.
      for (const fk of fks) if (!indexed.has(fk.from) && !/_by$|^created_by$|^granted_by$|^handled_by$/.test(fk.from)) missing.push(`${t}.${fk.from}`);
    }
    expect(missing).toEqual([]);
  });

  it("enforces one direct conversation per pair and one block per pair", () => {
    const { sqlite } = createTestDb();
    sqlite.exec("INSERT INTO users (id, email, status) VALUES ('u1', 'a@x.bd', 'ACTIVE'), ('u2', 'b@x.bd', 'ACTIVE')");
    sqlite.exec("INSERT INTO conversations (id, pair_key) VALUES ('c1', 'u1:u2')");
    expect(() => sqlite.exec("INSERT INTO conversations (id, pair_key) VALUES ('c2', 'u1:u2')")).toThrow(/UNIQUE/);
    sqlite.exec("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('u1', 'u2')");
    expect(() => sqlite.exec("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('u1', 'u2')")).toThrow(/UNIQUE|PRIMARY/);
    // A task needs someone to do it, and a meeting link has to be Google Meet.
    expect(() => sqlite.exec("INSERT INTO tasks (id, title, created_by) VALUES ('t1', 'x', 'u1')")).toThrow(/CHECK/);
    expect(() => sqlite.exec("INSERT INTO meetings (id, title, starts_at, meet_url, created_by) VALUES ('m1', 'x', '2030-01-01', 'https://zoom.us/j/1', 'u1')")).toThrow(/CHECK/);
  });
});
