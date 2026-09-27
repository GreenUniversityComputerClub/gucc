/**
 * The migration safety lint: releases roll the Worker back automatically, which is only safe
 * while every new migration is additive.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LINT_FROM, lintFiles, lintMigration } from "@/scripts/platform/lib/migration-lint";

const rules = (sql: string) => lintMigration("x.sql", sql).map((p) => p.rule);

describe("migration safety lint", () => {
  it("refuses changes the previous Worker couldn't run on", () => {
    expect(rules("DROP TABLE users;")).toEqual(["drops a table"]);
    expect(rules("ALTER TABLE users DROP COLUMN email;")).toEqual(["drops a column"]);
    expect(rules("ALTER TABLE users RENAME TO people;")).toEqual(["renames a table or column"]);
    expect(rules("ALTER TABLE users RENAME COLUMN email TO mail;")).toEqual(["renames a table or column"]);
    expect(rules("DELETE FROM sessions;")).toEqual(["DELETE without WHERE"]);
    expect(rules("UPDATE users SET status = 'ACTIVE';")).toEqual(["UPDATE without WHERE"]);
    expect(rules("CREATE TABLE users_new (id TEXT);\nINSERT INTO users_new SELECT * FROM users;")).toEqual(["rebuilds a table"]);
  });

  it("applies a review note only to its own statement", () => {
    expect(rules("UPDATE a SET b = 1; -- safety: reviewed (backfill)\nUPDATE c SET d = 2;")).toEqual(["UPDATE without WHERE"]);
  });

  it("allows additive changes, triggers and indexes, helper tables, and reviewed lines", () => {
    expect(rules(`CREATE TABLE a (id TEXT PRIMARY KEY);
      ALTER TABLE users ADD COLUMN x TEXT;
      CREATE INDEX a_idx ON a(id);
      DROP INDEX IF EXISTS old_idx;
      DROP TRIGGER audit_logs_no_delete;
      CREATE TRIGGER t BEFORE DELETE ON a BEGIN DELETE FROM b; UPDATE c SET d = 1; END;
      DELETE FROM sessions WHERE revoked_at IS NOT NULL;
      UPDATE users SET status = 'ACTIVE' WHERE id = 'x';
      INSERT INTO a (id) VALUES ('DROP TABLE users; DELETE FROM users;');
      CREATE TABLE tmp (id TEXT); DROP TABLE tmp;
      UPDATE positions SET level = 1; -- safety: reviewed (backfill of the new column)
      -- DROP TABLE users; (a comment)`)).toEqual([]);
  });

  it("passes every migration that hasn't reached production", () => {
    const dir = path.join(process.cwd(), "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && f >= LINT_FROM);
    expect(files.length).toBeGreaterThan(0);
    expect(lintFiles(dir, files)).toEqual([]);
  });
});
