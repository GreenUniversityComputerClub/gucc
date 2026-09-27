#!/usr/bin/env bun
/**
 * Appoint the first Moderator. The governance model forbids anyone granting
 * roles to themselves, so the very first Moderator has to come from outside
 * the app: this script, run by whoever holds the Cloudflare credentials.
 *
 *   BOOTSTRAP_PASSWORD='…' bun scripts/platform/bootstrap-moderator.ts --target local --email you@green.edu.bd --name "Full Name"
 *   bun scripts/platform/bootstrap-moderator.ts --target production --confirm-production --email existing@account
 *
 * - If the account exists (e.g. they registered on the site), it is activated
 *   and granted the Moderator role; its password is left untouched.
 * - Otherwise it is created ACTIVE with the password from BOOTSTRAP_PASSWORD
 *   (read from the environment, never from the command line or logs).
 * - Refuses when an active Moderator already exists: from then on Moderators
 *   are appointed in the app, with a second Moderator's approval.
 */
import { hashPassword } from "../../lib/server/crypto";
import { sqlValue } from "../../lib/migration/sql";
import { passwordProblem } from "../../lib/server/validate";
import { assertProductionConfirmed, d1ExecuteFile, d1Query, parseTarget } from "./lib/wrangler";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const target = parseTarget(argv);
assertProductionConfirmed(target, argv, "appoint a Moderator");
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const email = arg("--email")?.trim().toLowerCase();
const name = arg("--name")?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: --email <address> [--name <full name>] [--target local|staging|production]");
  process.exit(2);
}

const existingMods = d1Query<{ n: number }>(target, "SELECT COUNT(*) AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role_id = 'role:moderator' AND ur.revoked_at IS NULL AND u.status = 'ACTIVE'")[0].n;
if (existingMods > 0) {
  console.error(`An active Moderator already exists (${existingMods}). Appoint further Moderators from /admin/roles.`);
  process.exit(3);
}

const user = d1Query<{ id: string; status: string }>(target, `SELECT id, status FROM users WHERE email = ${sqlValue(email)} AND deleted_at IS NULL`)[0];
const now = new Date().toISOString();
const statements: string[] = [];
let userId: string;
if (user) {
  userId = user.id;
  statements.push(`UPDATE users SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, ${sqlValue(now)}), approved_at = COALESCE(approved_at, ${sqlValue(now)}), updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(userId)};`);
} else {
  const password = process.env.BOOTSTRAP_PASSWORD ?? "";
  const problem = passwordProblem(password, email);
  if (problem) {
    console.error(`Set BOOTSTRAP_PASSWORD to the new account's password. ${problem}`);
    process.exit(2);
  }
  if (!name) {
    console.error("--name is required when creating a new account.");
    process.exit(2);
  }
  userId = `usr_${crypto.randomUUID()}`;
  statements.push(
    `INSERT INTO users (id, email, password_hash, status, email_verified_at, approved_at, password_changed_at, created_at, updated_at) VALUES (${sqlValue(userId)}, ${sqlValue(email)}, ${sqlValue(await hashPassword(password))}, 'ACTIVE', ${sqlValue(now)}, ${sqlValue(now)}, ${sqlValue(now)}, ${sqlValue(now)}, ${sqlValue(now)});`,
    `INSERT INTO profiles (id, user_id, full_name, person_type, created_at, updated_at) VALUES (${sqlValue(`prf_${crypto.randomUUID()}`)}, ${sqlValue(userId)}, ${sqlValue(name)}, 'FACULTY', ${sqlValue(now)}, ${sqlValue(now)});`,
  );
}
statements.push(
  `INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) VALUES (${sqlValue(`ur_${crypto.randomUUID()}`)}, ${sqlValue(userId)}, 'role:moderator', ${sqlValue(now)}, 'Bootstrap: first Moderator appointed from the command line');`,
  `INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) VALUES (${sqlValue(`ur_${crypto.randomUUID()}`)}, ${sqlValue(userId)}, 'role:member', ${sqlValue(now)}, 'Bootstrap') ON CONFLICT DO NOTHING;`,
  `INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, reason, created_at) VALUES (${sqlValue(`aud_${crypto.randomUUID()}`)}, NULL, 'bootstrap-cli', 'governance.bootstrap_moderator', 'user', ${sqlValue(userId)}, 'First Moderator appointed outside the app (no Moderator existed)', ${sqlValue(now)});`,
);

const dir = mkdtempSync(path.join(tmpdir(), "gucc-bootstrap-"));
const file = path.join(dir, "bootstrap.sql");
writeFileSync(file, statements.join("\n"), { mode: 0o600 });
const ok = d1ExecuteFile(target, file);
rmSync(dir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log(`${email} is now the first Moderator on ${target}${user ? " (existing account activated)" : ""}.`);
