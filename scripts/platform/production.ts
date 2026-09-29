#!/usr/bin/env bun
/**
 * One-command production setup for the GUCC backend (Cloudflare free plan).
 *
 *   bun scripts/platform/production.ts                 check only (no changes)
 *   bun scripts/platform/production.ts --apply         do everything below
 *
 * Cloudflare access: CLOUDFLARE_API_TOKEN in .env.local, or — when that is empty —
 * the session from `bunx wrangler login` (--wrangler-login insists on the latter).
 *
 * Steps (each is idempotent, so an interrupted run can simply be repeated):
 *   1. check the Cloudflare access can write D1, R2 and Workers
 *   2. back up the production database (d1 export → migration/backup/, git-ignored)
 *   3. apply schema migrations
 *   4. import the in-repo data (executives, events, blog, contests, forms, …)
 *   5. verify the imported data strictly
 *   6. create the public and private R2 buckets
 *   7. generate the Worker secrets that are missing (never printed; existing
 *      secrets — especially PASSWORD_PEPPER — are never replaced)
 *   8. deploy the API Worker, uploading those secrets with it
 *   9. move legacy images into the public bucket
 *  10. verify again against the live Worker, then smoke-test /health and the API
 *
 * The production API_SHARED_SECRET is kept in .env.local (PRODUCTION_API_SHARED_SECRET)
 * for copying into Vercel → Project → Settings → Environment Variables.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { d1Export, loadCloudflareEnv, migrationsApply, wrangler } from "./lib/wrangler";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
// Set before loading the environment so every child script inherits it.
if (process.argv.includes("--wrangler-login")) process.env.GUCC_CF_AUTH = "wrangler-login";
const env = loadCloudflareEnv();
const OAUTH = !env.CLOUDFLARE_API_TOKEN;
const ENV_FILE = path.join(ROOT, ".env.local");
const WORKER = "gucc-api";
const BUCKETS = ["gucc-media-public-production", "gucc-media-private-production"];
const step = (n: number, s: string) => console.log(`\n[${n}] ${s}`);
const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} failed`);
}

async function cf<T>(p: string): Promise<{ success: boolean; result: T; errors?: Array<{ code: number; message: string }> }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${p}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
  return res.json() as never;
}

/** With `wrangler login`: the session must belong to this account and be able to write D1 and Workers. */
function checkWranglerLogin(): string {
  if (!env.CLOUDFLARE_ACCOUNT_ID) fail("Set CLOUDFLARE_ACCOUNT_ID in .env.local.");
  const who = wrangler(["whoami"], { quiet: true });
  if (!who.ok || !who.stdout.includes(env.CLOUDFLARE_ACCOUNT_ID!)) fail("Not logged in to this account. Run `bunx wrangler login` and try again.");
  const missing = ["d1 (write)", "workers_scripts (write)", "workers (write)"].filter((s) => !who.stdout.includes(s));
  if (missing.length) fail(`The wrangler login is missing: ${missing.join(", ")}. Run \`bunx wrangler login\` again.`);
  console.log("  wrangler login can write D1, R2 and Workers ✓");
  // The workers.dev subdomain is part of the production MEDIA_BASE_URL in wrangler.jsonc.
  const sub = readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8").match(new RegExp(`https://${WORKER}\\.([a-z0-9-]+)\\.workers\\.dev`))?.[1];
  return sub ?? fail("Could not find the workers.dev subdomain in wrangler.jsonc (env.production MEDIA_BASE_URL).");
}

async function checkToken(): Promise<string> {
  if (OAUTH) return checkWranglerLogin();
  if (!env.CLOUDFLARE_ACCOUNT_ID) fail("Set CLOUDFLARE_ACCOUNT_ID in .env.local.");
  const acc = env.CLOUDFLARE_ACCOUNT_ID!;
  const verify = await cf<{ id: string; status: string }>(`/accounts/${acc}/tokens/verify`);
  const user = verify.success ? verify : await cf<{ id: string; status: string }>(`/user/tokens/verify`);
  if (!user.success || user.result.status !== "active") fail("The API token is not valid or not active.");
  const details = await cf<{ policies: Array<{ permission_groups: Array<{ name: string }> }> }>(`/accounts/${acc}/tokens/${user.result.id}`);
  const sub = await cf<{ subdomain: string }>(`/accounts/${acc}/workers/subdomain`);
  if (details.success) {
    const names = new Set(details.result.policies.flatMap((p) => p.permission_groups.map((g) => g.name)));
    const need = [["D1 Write", "D1 Edit"], ["Workers R2 Storage Write", "Workers R2 Storage Edit"], ["Workers Scripts Write", "Workers Scripts Edit"]];
    const missing = need.filter((alts) => !alts.some((a) => names.has(a))).map((a) => a[1].replace(" Edit", ": Edit"));
    if (missing.length) {
      fail(`The token is missing: ${missing.join(", ")}.\n  Create one at https://dash.cloudflare.com/profile/api-tokens ("Edit Cloudflare Workers" template, plus D1: Edit),\n  put it in .env.local as CLOUDFLARE_API_TOKEN=…, and run this again\n  (or empty CLOUDFLARE_API_TOKEN and run \`bunx wrangler login\`).`);
    }
    console.log("  token can write D1, R2 and Workers ✓");
  } else {
    console.log("  (cannot read the token's permission list; continuing — each step will fail clearly if a permission is missing)");
  }
  return sub.success ? sub.result.subdomain : fail("Could not read the workers.dev subdomain.");
}

function secretNames(): Set<string> {
  const r = wrangler(["secret", "list", "--env", "production", "--format", "json"], { quiet: true });
  if (!r.ok) return new Set();
  try {
    return new Set((JSON.parse(r.stdout.slice(r.stdout.indexOf("["))) as Array<{ name: string }>).map((s) => s.name));
  } catch {
    return new Set();
  }
}

async function main() {
  if (!existsSync(ENV_FILE)) fail("Create .env.local first: cp .env.example .env.local");
  step(1, "Checking Cloudflare access");
  const subdomain = await checkToken();
  const apiUrl = `https://${WORKER}.${subdomain}.workers.dev`;
  const wranglerCfg = readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
  if (!wranglerCfg.includes(apiUrl)) console.warn(`  ! wrangler.jsonc MEDIA_BASE_URL should be ${apiUrl} (edit env.production.vars).`);
  const tables = wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--json", "--command", "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='committees'"], { quiet: true });
  console.log(`  production database reachable: ${tables.ok ? "yes" : "no"}`);
  if (!APPLY) {
    console.log(`\nCheck complete. Run with --apply to set up production (Worker will be at ${apiUrl}).`);
    return;
  }

  step(2, "Backing up the production database");
  mkdirSync(path.join(ROOT, "migration/backup"), { recursive: true });
  const backup = path.join(ROOT, "migration/backup", `production-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  console.log(d1Export("production", backup) ? `  saved ${path.relative(ROOT, backup)}` : "  (export failed or database empty — continuing; nothing is deleted by later steps)");

  step(3, "Applying schema migrations");
  if (!migrationsApply("production")) fail("Migrations failed.");

  step(4, "Importing in-repo data");
  run("bun", ["scripts/platform/migrate.ts", "--target", "production", "--confirm-production"]);

  step(5, "Verifying the data");
  // Before go-live the database must equal the legacy files exactly. Once people use the site
  // (accounts exist), the database is the source of truth and differs by design.
  const live = wrangler(["d1", "execute", "DB", "--remote", "--env", "production", "--json", "--command", "SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL"], { quiet: true });
  const accounts = live.ok ? Number(live.stdout.match(/"n":\s*(\d+)/)?.[1] ?? 0) : 0;
  if (accounts > 0) console.log(`  ${accounts} accounts exist: the site is live, so the comparison with the legacy files is skipped (later releases: bun run release:api:production).`);
  else run("bun", ["scripts/platform/verify.ts", "--target", "production", "--strict"]);

  step(6, "Creating R2 buckets");
  const list = wrangler(["r2", "bucket", "list"], { quiet: true });
  for (const b of BUCKETS) {
    if (list.stdout.includes(b)) console.log(`  ${b} exists`);
    else if (!wrangler(["r2", "bucket", "create", b]).ok) fail(`Creating ${b} failed (is R2 enabled on the account?).`);
    else console.log(`  created ${b}`);
  }

  step(7, "Worker secrets");
  const have = secretNames();
  const stored = readFileSync(ENV_FILE, "utf8").match(/^PRODUCTION_API_SHARED_SECRET=(.+)$/m)?.[1]?.trim();
  const newSecrets: Record<string, string> = {};
  let shared = stored;
  if (!have.has("API_SHARED_SECRET") || !shared) {
    shared = randomBytes(32).toString("base64url");
    newSecrets.API_SHARED_SECRET = shared;
  }
  // PASSWORD_PEPPER is only ever created, never replaced: changing it breaks every password.
  for (const name of ["AUTH_SECRET", "PASSWORD_PEPPER"]) if (!have.has(name)) newSecrets[name] = randomBytes(32).toString("base64url");
  console.log(Object.keys(newSecrets).length ? `  generated ${Object.keys(newSecrets).join(", ")} (uploaded with the deploy, never printed)` : "  all required secrets already set");
  for (const name of ["TURNSTILE_SECRET_KEY", "SMTP2GO_API_KEY", "GOOGLE_API_KEY"]) {
    if (!have.has(name)) console.log(`  ! ${name} not set (optional now; set with: bunx wrangler secret put ${name} --env production)`);
  }
  if (shared !== stored) {
    const text = readFileSync(ENV_FILE, "utf8");
    const line = `PRODUCTION_API_SHARED_SECRET=${shared}`;
    writeFileSync(ENV_FILE, /^PRODUCTION_API_SHARED_SECRET=.*$/m.test(text) ? text.replace(/^PRODUCTION_API_SHARED_SECRET=.*$/m, line) : `${text.trimEnd()}\n${line}\n`);
    console.log("  saved the production API_SHARED_SECRET in .env.local (PRODUCTION_API_SHARED_SECRET)");
  }

  step(8, "Deploying the API Worker");
  // New secrets go up with the deploy itself (no prompt for a Worker that doesn't exist yet,
  // and no moment where it runs without them). The file is private and deleted right away.
  const secretDir = mkdtempSync(path.join(tmpdir(), "gucc-secrets-"));
  const secretFile = path.join(secretDir, "secrets.json");
  try {
    const args = ["wrangler", "deploy", "--env", "production"];
    if (Object.keys(newSecrets).length) {
      writeFileSync(secretFile, JSON.stringify(newSecrets), { mode: 0o600 });
      args.push("--secrets-file", secretFile);
    }
    run("bunx", args);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }

  step(9, "Moving legacy images to R2");
  run("bun", ["scripts/platform/media.ts", "--target", "production", "--confirm-production"]);

  step(10, "Verifying against the live Worker");
  if (accounts === 0) run("bun", ["scripts/platform/verify.ts", "--target", "production", "--strict", "--media-url", apiUrl]);
  const health = await fetch(`${apiUrl}/health`).then((r) => r.json()).catch(() => null);
  const committees = await fetch(`${apiUrl}/v1/public/committees`, { headers: { "X-Api-Key": shared! } }).then((r) => r.json()).catch(() => null);
  const unauth = await fetch(`${apiUrl}/v1/public/committees`).then((r) => r.status).catch(() => 0);
  console.log(`  /health: ${JSON.stringify(health)}`);
  console.log(`  committees served: ${committees?.data?.committees?.length ?? "none"}; current: ${committees?.data?.current ?? "—"}`);
  console.log(`  request without API key → ${unauth} (expected 401)`);
  console.log(`\n✓ Production backend is live at ${apiUrl}.
  Vercel → Project → Settings → Environment Variables (Production and Preview):
    NEXT_PUBLIC_BASE_URL        https://gucc.green.edu.bd
    NEXT_PUBLIC_API_BASE_URL    ${apiUrl}
    NEXT_PUBLIC_MEDIA_BASE_URL  ${apiUrl}
    API_SHARED_SECRET           the PRODUCTION_API_SHARED_SECRET value in .env.local (mark it Sensitive)
  Then redeploy the frontend and appoint the first Moderator:
    bun scripts/platform/bootstrap-moderator.ts --target production --confirm-production --email <you@…>`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
