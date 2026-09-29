#!/usr/bin/env bun
/**
 * Release the API Worker after the first setup. Every step is safe to repeat. (The first setup,
 * with the data import, is production.ts; after go-live the database is the source of truth and
 * is never re-imported.)
 *
 *   bun run release:api:production          (= --target production --confirm-production)
 *   bun scripts/platform/release.ts --target staging
 *
 *   1. preflight   pending migrations must be additive (migration-lint.ts), so the previous
 *                  Worker still runs on the migrated database
 *   2. backup      exported and checked (not empty, has the tables) before anything changes
 *   3. migrate     new migrations only; the new code never meets an old schema
 *   4. deploy      the Worker; the previous version's id is kept
 *   5. smoke test  /health answers with this code's API version; unauthenticated calls refused
 *   6. integrity   read-only quick_check and foreign_key_check
 *   7. ranking     the footer's contributor ranking is recomputed from the git history (optional:
 *                  a failure leaves the previous ranking and doesn't fail the release)
 *
 * If 4 or 5 fails, the previous Worker version is restored automatically (`wrangler rollback`);
 * the migrations stay, which is safe because they are additive. Failures in 1–3 stop before the
 * live Worker changes. The runbook (docs/platform/RUNBOOK.md) lists every failure and its fix.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assertProductionConfirmed, d1Export, d1Query, loadCloudflareEnv, migrationsApply, parseTarget, wrangler } from "./lib/wrangler";
import { LINT_FROM, lintFiles } from "./lib/migration-lint";
import { API_VERSION } from "../../lib/version";

const argv = process.argv.slice(2);
const target = parseTarget(argv);
if (target === "local") {
  console.error("Releases go to staging or production. Locally: bun run db:migrate:local and restart bun run dev:api.");
  process.exit(2);
}
assertProductionConfirmed(target, argv, "release the API");
const env = loadCloudflareEnv();
const ROOT = process.cwd();
const step = (n: number, s: string) => console.log(`\n[${n}] ${s}`);
const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// Where this environment's Worker answers (the first MEDIA_BASE_URL after its env block starts).
const cfg = readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
const start = cfg.search(new RegExp(`"${target}"\\s*:\\s*\\{`));
const base = start >= 0 ? cfg.slice(start).match(/"MEDIA_BASE_URL":\s*"([^"]+)"/)?.[1] : undefined;
if (!base) fail(`Couldn't find env.${target} MEDIA_BASE_URL in wrangler.jsonc to test against.`);

step(1, "Preflight: pending migrations are additive");
const dir = path.join(ROOT, "migrations");
let applied = new Set<string>();
try {
  applied = new Set(d1Query<{ name: string }>(target, "SELECT name FROM d1_migrations").map((r) => r.name));
} catch {
  console.log("  (no migrations applied yet)");
}
const pending = readdirSync(dir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
// Migrations before LINT_FROM were written for an empty database and ran before the lint existed.
const problems = lintFiles(dir, pending.filter((f) => f >= LINT_FROM));
for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.rule}: ${p.text}`);
if (problems.length) fail("A pending migration isn't additive (above), so an automatic rollback wouldn't be safe. Nothing was changed.");
console.log(`  ${pending.length ? `pending: ${pending.join(", ")}` : "no pending migrations"}; ${applied.size} already applied`);

step(2, "Backing up the database");
mkdirSync(path.join(ROOT, "migration/backup"), { recursive: true });
const backup = path.join(ROOT, "migration/backup", `${target}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
if (!d1Export(target, backup)) fail("The backup failed, so nothing was changed. Check your Cloudflare access and try again.");
{
  const size = statSync(backup).size;
  const dump = readFileSync(backup, "utf8");
  const tables = (dump.match(/CREATE TABLE/gi) ?? []).length;
  const live = d1Query<{ n: number }>(target, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")[0]?.n ?? 0;
  console.log(`  saved ${path.relative(ROOT, backup)} (${(size / 1024).toFixed(0)} KB, ${tables} tables; the database has ${live})`);
  if (size < 1024 || !/CREATE TABLE [`"]?users/i.test(dump) || tables < Math.min(live, 10)) fail("The backup looks incomplete, so nothing was changed. Try again; if it repeats, check `wrangler d1 export` by hand.");
}

step(3, "Applying new migrations");
if (!migrationsApply(target)) fail(`Migrations failed; the Worker was not deployed. The live Worker is unchanged. Restore from ${path.relative(ROOT, backup)} or D1 Time Travel only if the database is damaged (RUNBOOK.md).`);

step(4, "Deploying the API Worker");
const status = wrangler(["deployments", "status", "--env", target, "--json"], { quiet: true });
let previous: string | null = null;
try {
  const parsed = JSON.parse(status.stdout.slice(status.stdout.indexOf("{"))) as { versions?: Array<{ version_id?: string; percentage?: number }> };
  previous = parsed.versions?.sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0]?.version_id ?? null;
} catch {
  previous = null;
}
console.log(`  live version before this release: ${previous ?? "unknown (first deploy?)"}`);

function rollback(why: string): never {
  if (!previous) return fail(`${why} There is no earlier version to roll back to; fix and release again.`);
  console.error(`\n  ${why} Rolling back to ${previous} …`);
  const r = spawnSync("bunx", ["wrangler", "rollback", previous, "--env", target, "--yes", "--message", `Automatic rollback: ${why}`.slice(0, 100)], { stdio: "inherit", env });
  return fail(r.status === 0
    ? `${why} The previous Worker is live again (the migrations stay; they're additive). Fix, then release again.`
    : `${why} The automatic rollback ALSO failed. Roll back by hand now: bunx wrangler rollback ${previous} --env ${target}`);
}

const deploy = spawnSync("bunx", ["wrangler", "deploy", "--env", target], { stdio: "inherit", env });
if (deploy.status !== 0) fail("Deploy failed before anything went live. The previous version is still serving.");

step(5, "Smoke test");
type Health = { ok?: boolean; version?: string };
const readHealth = (): Promise<Health | null> => fetch(`${base}/health`).then((r) => (r.ok ? (r.json() as Promise<Health>) : null)).catch(() => null);
let health = await readHealth();
// A new version can take a few seconds to reach every location.
for (let attempt = 1; attempt < 6 && (!health?.ok || health.version !== API_VERSION); attempt++) {
  await new Promise((r) => setTimeout(r, 3000));
  health = await readHealth();
}
const locked = await fetch(`${base}/v1/public/committees`).then((r) => r.status).catch(() => 0);
const unknown = await fetch(`${base}/v1/rpc/no.such`, { method: "POST" }).then((r) => r.status).catch(() => 0);
console.log(`  /health: ${health?.ok ? "ok" : "FAILED"}, version ${health?.version ?? "?"} (expected ${API_VERSION}); no API key → ${locked} and ${unknown} (expected 401)`);
if (!health?.ok) rollback("The new Worker's health check failed.");
if (health?.version !== API_VERSION) rollback(`The live Worker reports version ${health?.version ?? "none"}, not ${API_VERSION}.`);
if (locked !== 401 || unknown !== 401) rollback("The new Worker answered a request without the API key.");

step(6, "Database integrity (read-only)");
// Reads only: SQLite's own checks on the live database after the migrations (D1 allows quick_check,
// not the slower integrity_check).
const integrity = d1Query<{ quick_check: string }>(target, "PRAGMA quick_check");
const fk = d1Query<Record<string, unknown>>(target, "PRAGMA foreign_key_check");
const latest = d1Query<{ name: string }>(target, "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1")[0]?.name;
console.log(`  integrity: ${integrity.map((r) => r.quick_check).join(", ") || "no answer"}; broken references: ${fk.length}; newest migration: ${latest ?? "?"}`);
if (integrity[0]?.quick_check !== "ok" || fk.length > 0) {
  // The Worker is fine; the data needs a look. Stop the pipeline so the website isn't deployed on top.
  fail("The database reports problems (above). The API release itself is live; investigate before deploying the website (RUNBOOK.md, 'Integrity check failed'). Nothing was modified by this check.");
}
step(7, "Contributor ranking");
// Every release refreshes the footer's fair ranking from the full history (no GitHub secret needed
// for most commits); a failure only means the site keeps the previous ranking.
const ranking = spawnSync("bun", ["scripts/platform/contributors.ts", "--apply", "--target", target, ...(target === "production" ? ["--confirm-production"] : [])], { stdio: "inherit", env });
if (ranking.status !== 0) console.log("  The contributor ranking wasn't refreshed; the site keeps the previous one. Run it again later with: bun scripts/platform/contributors.ts --apply --target " + target + (target === "production" ? " --confirm-production" : ""));

console.log(`\n✓ Released to ${target} (${base}), API version ${API_VERSION}.`);
