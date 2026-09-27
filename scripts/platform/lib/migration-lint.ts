/**
 * Migration safety lint. Releases apply migrations before deploying the new Worker, and roll the
 * Worker back automatically if its smoke test fails. That only works while every migration is
 * additive: the previous Worker must still run on the migrated database. So a migration that
 * hasn't reached production yet may not:
 *
 *   - drop or rename a table or column (the old Worker still reads them);
 *   - DELETE or UPDATE without a WHERE clause (wipes data);
 *   - rebuild a table (CREATE TABLE …_new + copy + DROP) — same as a drop for the old Worker.
 *
 * Dropping and recreating a trigger, index or view is allowed (nothing reads them by name). A
 * line ending in `-- safety: reviewed <reason>` is accepted after a human review.
 *
 *   bun scripts/platform/lib/migration-lint.ts            lint migrations/ (from 0007 on)
 *   bun scripts/platform/lib/migration-lint.ts --all      every migration
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Migrations before this one were released before the lint existed (they ran on an empty or imported database). */
export const LINT_FROM = "0007";

export interface LintProblem {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** SQL without comments and string literals, statement by statement, with the line each starts on. */
function statements(sql: string): Array<{ text: string; line: number; reviewed: boolean }> {
  const out: Array<{ text: string; line: number; reviewed: boolean }> = [];
  let buf = "";
  let startLine = 1;
  let line = 1;
  let reviewed = false;
  let inBlockTrigger = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const comment = sql.slice(i, end < 0 ? sql.length : end);
      if (/--\s*safety:\s*reviewed\b/i.test(comment)) reviewed = true;
      i = (end < 0 ? sql.length : end) - 1;
      continue;
    }
    if (c === "'") {
      // Keep the literal's place but not its text: keywords inside strings don't count.
      buf += "''";
      i++;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) {
        if (sql[i] === "'" && sql[i + 1] === "'") i++;
        if (sql[i] === "\n") line++;
        i++;
      }
      continue;
    }
    if (c === "\n") line++;
    if (!buf.trim() && /\S/.test(c)) startLine = line;
    buf += c;
    // Trigger bodies contain their own semicolons, closed by END;.
    if (/\bBEGIN\s*$/i.test(buf) && /CREATE\s+TRIGGER/i.test(buf)) inBlockTrigger++;
    if (c === ";") {
      if (inBlockTrigger && !/\bEND\s*;$/i.test(buf)) continue;
      inBlockTrigger = 0;
      // A review note may also follow the statement on the same line.
      const eol = sql.indexOf("\n", i);
      const sameLine = /^[^\n]*--\s*safety:\s*reviewed\b/i.test(sql.slice(i + 1, eol < 0 ? sql.length : eol));
      if (buf.trim()) out.push({ text: buf.trim(), line: startLine, reviewed: reviewed || sameLine });
      buf = "";
      reviewed = false;
      // That note belongs to this statement, not the next one.
      if (sameLine) i = (eol < 0 ? sql.length : eol) - 1;
    }
  }
  if (buf.trim()) out.push({ text: buf.trim(), line: startLine, reviewed });
  return out;
}

export function lintMigration(file: string, sql: string): LintProblem[] {
  const problems: LintProblem[] = [];
  const created = new Set<string>();
  for (const s of statements(sql)) {
    const t = s.text.replace(/\s+/g, " ");
    const add = (rule: string) => !s.reviewed && problems.push({ file, line: s.line, rule, text: t.slice(0, 120) });
    const createdTable = t.match(/^CREATE TABLE (?:IF NOT EXISTS )?["`]?(\w+)/i)?.[1];
    if (createdTable) created.add(createdTable.toLowerCase());
    const dropped = t.match(/^DROP TABLE (?:IF EXISTS )?["`]?(\w+)/i)?.[1];
    // A table created earlier in the same migration may be dropped (a temporary helper table).
    if (dropped && !created.has(dropped.toLowerCase())) add("drops a table");
    if (/^ALTER TABLE \S+ DROP (COLUMN )?/i.test(t)) add("drops a column");
    if (/^ALTER TABLE \S+ RENAME/i.test(t)) add("renames a table or column");
    if (/^DELETE FROM \S+\s*;?$/i.test(t)) add("DELETE without WHERE");
    if (/^UPDATE \S+ SET /i.test(t) && !/\bWHERE\b/i.test(t)) add("UPDATE without WHERE");
    if (/^INSERT INTO \w+_new\b/i.test(t)) add("rebuilds a table");
  }
  return problems;
}

/** Lint the given migration files (names like 0007_platform_v4.sql). */
export function lintFiles(dir: string, files: string[]): LintProblem[] {
  return files.flatMap((f) => lintMigration(f, readFileSync(path.join(dir, f), "utf8")));
}

if (import.meta.main) {
  const dir = path.join(process.cwd(), "migrations");
  const all = process.argv.includes("--all");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && (all || f >= LINT_FROM)).sort();
  const problems = lintFiles(dir, files);
  for (const p of problems) console.error(`${p.file}:${p.line}  ${p.rule}: ${p.text}`);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} unsafe statement(s). Make the change additive, or mark a reviewed line with "-- safety: reviewed <reason>".`);
    process.exit(1);
  }
  console.log(`✓ ${files.length} migration(s) are additive (${files.join(", ")}).`);
}
