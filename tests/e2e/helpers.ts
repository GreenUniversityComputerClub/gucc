import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Lookups in the isolated E2E database (.e2e/state); retries while the Worker holds the lock. */
export function d1<T = Record<string, unknown>>(sql: string): T[] {
  for (let attempt = 0; ; attempt++) {
    try {
      const state = process.env.GUCC_LOCAL_STATE ?? ".e2e/state";
      const out = execFileSync("bunx", ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", state, "--json", "--command", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      return (JSON.parse(out.slice(out.indexOf("["))) as Array<{ results: T[] }>).flatMap((r) => r.results);
    } catch (e) {
      if (attempt >= 8 || !String((e as { stderr?: string; stdout?: string }).stdout ?? e).includes("SQLITE_BUSY") && !String(e).includes("SQLITE_BUSY")) throw e;
      execFileSync("sleep", ["1"]);
    }
  }
}

/** Latest link sent to an address, from the development mail log. */
export async function mailLink(to: string, pathPart: string): Promise<string> {
  const log = process.env.E2E_MAIL_LOG ?? ".e2e/api-worker.log";
  for (let i = 0; i < 30; i++) {
    const text = readFileSync(log, "utf8");
    const blocks = text.split("[dev email]").filter((b) => b.includes(`to=${to}`));
    const last = blocks.at(-1);
    const m = last?.match(new RegExp(`https?://[^\\s]*${pathPart.replace(/[/?]/g, "\\$&")}[^\\s]*`));
    if (m) {
      const u = new URL(m[0]);
      return `${u.pathname}${u.search}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No ${pathPart} email for ${to}`);
}

export async function login(page: Page, email: string, password: string, next?: string) {
  // The suite signs the same accounts in many times; the API allows 10 sign-ins per account per 15 minutes.
  d1("DELETE FROM rate_limits WHERE key LIKE 'auth.login.%'");
  await page.context().clearCookies();
  await page.goto(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"));
  await settle(page);
}

/** Wait until the page has hydrated and stopped fetching, so clicks reach React handlers. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
}

export async function signUp(page: Page, u: { name: string; email: string; password: string; studentId?: string }) {
  await page.context().clearCookies();
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full name").fill(u.name);
  if (u.studentId) await page.getByLabel("Student ID").fill(u.studentId);
  await page.getByLabel("Department").fill("CSE");
  await page.getByLabel("Email", { exact: true }).fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByLabel("Repeat Password").fill(u.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/sign-up-success/);
}

export const MODERATOR = { email: process.env.E2E_MODERATOR_EMAIL ?? "moderator@local.test", password: process.env.E2E_MODERATOR_PASSWORD ?? "Local-admin-pass-2026!" };

/** An ACTIVE member with a known password, created directly in the E2E database (idempotent). */
export async function ensureMember(email: string, name: string, password: string): Promise<string> {
  const { hashPassword } = await import("../../lib/server/crypto");
  const { readFileSync: read } = await import("node:fs");
  const pepper = read(".env.local", "utf8").match(/^PASSWORD_PEPPER=(.+)$/m)?.[1]?.trim();
  const hash = await hashPassword(password, pepper);
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const id = `usr_e2e_${email.replace(/[^a-z0-9]/gi, "_")}`;
  const now = new Date().toISOString();
  d1(`INSERT INTO users (id, email, password_hash, status, email_verified_at, approved_at, created_at, updated_at) VALUES (${q(id)}, ${q(email)}, ${q(hash)}, 'ACTIVE', ${q(now)}, ${q(now)}, ${q(now)}, ${q(now)})
      ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL`);
  d1(`INSERT INTO profiles (id, user_id, full_name) VALUES (${q(`prf_${id}`)}, ${q(id)}, ${q(name)}) ON CONFLICT(id) DO NOTHING`);
  d1(`INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) SELECT ${q(`ur_${id}`)}, ${q(id)}, 'role:member', ${q(now)}, 'E2E' WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ${q(id)} AND role_id = 'role:member' AND revoked_at IS NULL)`);
  d1(`DELETE FROM user_mfa WHERE user_id = ${q(id)}`);
  return id;
}

