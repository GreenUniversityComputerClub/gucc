/**
 * Thin wrapper around `wrangler d1 …` for the platform scripts.
 *
 * Targets:
 *   local       miniflare state in .wrangler/state (development)
 *   staging     remote gucc-db-staging   (env.staging in wrangler.jsonc)
 *   production  remote gucc-db-production (env.production) — every write
 *               requires --confirm-production on the command line.
 *
 * Credentials come from the environment (CLOUDFLARE_ACCOUNT_ID and, optionally,
 * CLOUDFLARE_API_TOKEN from the git-ignored .env.local) and are never printed or written
 * to reports. With CLOUDFLARE_API_TOKEN empty, Wrangler uses the session from
 * `wrangler login`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type Target = "local" | "staging" | "production";

export function parseTarget(argv: string[]): Target {
  const i = argv.indexOf("--target");
  const t = (i >= 0 ? argv[i + 1] : "local") as Target;
  if (!["local", "staging", "production"].includes(t)) throw new Error(`Unknown --target ${t}. Use local, staging or production.`);
  return t;
}

export function assertProductionConfirmed(target: Target, argv: string[], action: string): void {
  if (target === "production" && !argv.includes("--confirm-production")) {
    console.error(`Refusing to ${action} on PRODUCTION without --confirm-production.`);
    process.exit(2);
  }
}

/** Load CLOUDFLARE_* from .env.local for remote targets without echoing them. */
export function loadCloudflareEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const file = path.join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*(CLOUDFLARE_[A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  // Wrangler reads .env.local itself, so a token there always wins over `wrangler login`.
  if (env.GUCC_CF_AUTH === "wrangler-login" && env.CLOUDFLARE_API_TOKEN) {
    throw new Error("To use `wrangler login`, leave CLOUDFLARE_API_TOKEN empty in .env.local.");
  }
  return env;
}

/**
 * Local state directory. Defaults to Wrangler's .wrangler/state (what `bun run dev:api`
 * uses); the end-to-end suite points GUCC_LOCAL_STATE at .e2e/state so tests never touch
 * the development database.
 */
export function localStateFlags(): string[] {
  return process.env.GUCC_LOCAL_STATE ? ["--persist-to", process.env.GUCC_LOCAL_STATE] : [];
}

function targetFlags(target: Target): string[] {
  if (target === "local") return ["--local", ...localStateFlags()];
  return ["--remote", "--env", target];
}

export function wrangler(args: string[], opts: { input?: string; quiet?: boolean } = {}): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync("bunx", ["wrangler", ...args], {
    env: loadCloudflareEnv(),
    encoding: "utf8",
    input: opts.input,
    maxBuffer: 512 * 1024 * 1024,
  });
  const ok = res.status === 0;
  if (!ok && !opts.quiet) {
    console.error(res.stderr || res.stdout);
  }
  return { ok, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

export function d1ExecuteFile(target: Target, file: string): boolean {
  const args = ["d1", "execute", "DB", ...targetFlags(target), "--file", file, "--yes"];
  const res = wrangler(args);
  if (res.ok) process.stdout.write(res.stdout.split("\n").filter((l) => /commands executed|Executed|rows written/i.test(l)).join("\n") + "\n");
  return res.ok;
}

/** Run one read query and return its rows. */
export function d1Query<T = Record<string, unknown>>(target: Target, sql: string): T[] {
  const args = ["d1", "execute", "DB", ...targetFlags(target), "--json", "--command", sql];
  const res = wrangler(args);
  if (!res.ok) throw new Error(`Query failed: ${sql.slice(0, 120)}`);
  const start = res.stdout.indexOf("[");
  const parsed = JSON.parse(res.stdout.slice(start)) as Array<{ results: T[]; success: boolean }>;
  return parsed.flatMap((p) => p.results ?? []);
}

export function d1Export(target: Target, outFile: string): boolean {
  if (target === "local") return false;
  return wrangler(["d1", "export", "DB", "--remote", "--env", target, "--output", outFile]).ok;
}

export function migrationsApply(target: Target): boolean {
  return wrangler(["d1", "migrations", "apply", "DB", ...targetFlags(target)], { input: "y\n" }).ok;
}
