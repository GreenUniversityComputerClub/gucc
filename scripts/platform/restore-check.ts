#!/usr/bin/env bun
/**
 * Prove a database backup can be restored: load the SQL dump into a throwaway SQLite database
 * (in memory, on this machine; no Cloudflare database or quota is used), run SQLite's integrity
 * and foreign-key checks, and compare row counts with the live database (read-only).
 *
 *   bun scripts/platform/restore-check.ts backup.sql
 *   bun scripts/platform/restore-check.ts backup.sql --compare production   (weekly workflow)
 *   bun scripts/platform/restore-check.ts backup.sql --compare local        (end-to-end suite)
 *
 * Exits non-zero when the dump doesn't load, a check fails, or a table lost rows it shouldn't
 * have. Prints table names and counts only, never data.
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { d1Query, parseTarget, type Target } from "./lib/wrangler";

/** Business tables that only grow between the export and the comparison (a few rows of slack). */
export const STABLE_TABLES = ["users", "profiles", "committees", "committee_members", "positions", "roles", "permissions", "events", "posts", "media", "audit_logs", "approval_requests", "recruitment_applications", "event_registrations"];

export interface RestoreReport {
  tables: number;
  integrity: string;
  brokenReferences: number;
  counts: Record<string, number>;
  problems: string[];
}

export function restoreDump(sql: string): RestoreReport {
  const db = new Database(":memory:");
  const problems: string[] = [];
  try {
    db.exec(sql);
  } catch (e) {
    return { tables: 0, integrity: "not loaded", brokenReferences: 0, counts: {}, problems: [`The dump didn't load: ${(e as Error).message.slice(0, 200)}`] };
  }
  const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map((r) => r.name);
  const integrity = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").all().map((r) => r.integrity_check).join("; ");
  const broken = db.query<Record<string, unknown>, []>("PRAGMA foreign_key_check").all().length;
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get()?.n ?? 0;
  db.close();
  if (integrity !== "ok") problems.push(`integrity_check: ${integrity.slice(0, 200)}`);
  if (broken) problems.push(`${broken} broken references (foreign_key_check)`);
  if (!tables.includes("users")) problems.push("The dump has no users table.");
  return { tables: tables.length, integrity, brokenReferences: broken, counts, problems };
}

/** Restored counts may trail the live ones slightly (writes after the export), never exceed or collapse. */
export function compareCounts(restored: Record<string, number>, live: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const t of STABLE_TABLES) {
    if (!(t in live)) continue;
    const r = restored[t] ?? 0;
    const l = live[t]!;
    if (r > l) problems.push(`${t}: backup has ${r} rows, the live database only ${l}`);
    else if (r < Math.floor(l * 0.98) - 5) problems.push(`${t}: backup has ${r} rows, the live database ${l}`);
  }
  return problems;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("Usage: bun scripts/platform/restore-check.ts <dump.sql> [--compare production|staging|local]");
    process.exit(2);
  }
  const report = restoreDump(readFileSync(file, "utf8"));
  const i = process.argv.indexOf("--compare");
  if (i > 0 && report.problems.length === 0) {
    const target = parseTarget(["--target", process.argv[i + 1] ?? "production"]) as Target;
    const liveTables = new Set(d1Query<{ name: string }>(target, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
    // One row of scalar subqueries (D1 refuses long UNION chains).
    const present = STABLE_TABLES.filter((t) => liveTables.has(t));
    const live = present.length ? (d1Query<Record<string, number>>(target, `SELECT ${present.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(", ")}`)[0] ?? {}) : {};
    report.problems.push(...compareCounts(report.counts, live));
    console.log(`Compared with ${target}: ${STABLE_TABLES.map((t) => `${t} ${report.counts[t] ?? 0}/${live[t] ?? "?"}`).join(", ")}`);
  }
  console.log(`Restored ${report.tables} tables; integrity ${report.integrity}; broken references ${report.brokenReferences}.`);
  if (report.problems.length) {
    for (const p of report.problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log("✓ The backup restores cleanly.");
}
