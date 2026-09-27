#!/usr/bin/env bun
/**
 * Fresh, isolated database for the end-to-end suite.
 *
 * Everything lives in .e2e/state (never the development database in
 * .wrangler/state): schema, the club's real data and the E2E Moderator.
 * Playwright then starts its own API Worker (:8788) and website (:3001)
 * against it, so test accounts can never appear on the site you develop on.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const STATE = ".e2e/state";
process.env.GUCC_LOCAL_STATE = STATE;

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`E2E preparation failed: ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

rmSync(STATE, { recursive: true, force: true });
// The E2E build's data cache holds the previous run's pages (with its test
// accounts); drop it so the site is built from this fresh database.
rmSync(".next-e2e/cache/fetch-cache", { recursive: true, force: true });
run("bunx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", STATE]);
run("bun", ["scripts/platform/migrate.ts", "--target", "local"]);
console.log(`E2E database ready in ${STATE}.`);
