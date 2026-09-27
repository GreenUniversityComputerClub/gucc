#!/usr/bin/env bun
/**
 * Break-glass recovery, for when the dashboard itself can't fix a lockout: every Moderator lost
 * their authenticator, a bad rule denies everyone, an account is compromised. It is not an app
 * feature: it needs the club's Cloudflare credentials (whoever can run releases), an explicit
 * target, and a typed confirmation. Every action writes a `breakglass.*` entry to the activity log
 * and notifies every Moderator in the app.
 *
 *   bun scripts/platform/break-glass.ts <command> --target production --confirm-production [options]
 *
 *   reset-mfa --email a@b          turn off two-factor for one account (they set it up again)
 *   revoke-sessions --email a@b    sign one account out everywhere
 *   grant-moderator --email a@b    give the Moderator role to an existing active account, even
 *                                  when other Moderators exist (refused past the role's limit
 *                                  unless --over-limit)
 *   disable-rule --key some-rule   switch off one governance rule (e.g. one that denies everyone)
 *   time-travel                    print how to restore the database to a point in time
 *
 * It never prints secrets, and it asks before changing anything.
 */
import { createInterface } from "node:readline/promises";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sqlValue } from "../../lib/migration/sql";
import { assertProductionConfirmed, d1ExecuteFile, d1Query, parseTarget, type Target } from "./lib/wrangler";

const COMMANDS = ["reset-mfa", "revoke-sessions", "grant-moderator", "disable-rule", "time-travel"] as const;
type Command = (typeof COMMANDS)[number];

const argv = process.argv.slice(2);
const command = argv[0] as Command;
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
if (!COMMANDS.includes(command)) {
  console.error(`Usage: bun scripts/platform/break-glass.ts <${COMMANDS.join("|")}> --target <local|staging|production> [--confirm-production] [--email a@b | --key rule-key]`);
  process.exit(2);
}
const target: Target = parseTarget(argv);

if (command === "time-travel") {
  console.log(`D1 Time Travel restores the whole database to any minute in the last 30 days (free plan: 7 days).
It replaces everything written after that moment, so use it only for real damage.

  1. Find the moment:   bunx wrangler d1 time-travel info DB --env ${target} --timestamp 2026-09-27T10:00:00Z
  2. Take a backup now: bunx wrangler d1 export DB --remote --env ${target} --output before-restore.sql
  3. Restore:           bunx wrangler d1 time-travel restore DB --env ${target} --bookmark <bookmark from step 1>
  4. Check:             bun scripts/platform/verify.ts --target ${target}   and the System health page

The encrypted weekly backups (GitHub → Actions → "Weekly database backup") are the fallback: see
docs/platform/RUNBOOK.md, "Restore from a backup".`);
  process.exit(0);
}

assertProductionConfirmed(target, argv, `run break-glass ${command}`);

const email = arg("--email")?.trim().toLowerCase();
const key = arg("--key")?.trim();
if (command === "disable-rule") {
  if (!key || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(key)) {
    console.error("--key must be a rule key (lowercase letters, digits, hyphens).");
    process.exit(2);
  }
} else if (!email || !/^[^\s'"@]+@[^\s'"@]+\.[^\s'"@]+$/.test(email)) {
  console.error("--email must be an account's email address.");
  process.exit(2);
}

const now = new Date().toISOString();
const statements: string[] = [];
let subject = "";
let resourceType = "user";
let resourceId = "";
let summary = "";

if (command === "disable-rule") {
  const rule = d1Query<{ id: string; name: string; status: string }>(target, `SELECT id, name, status FROM rules WHERE key = ${sqlValue(key!)}`)[0];
  if (!rule) {
    console.error(`No rule with key ${key}.`);
    process.exit(3);
  }
  if (rule.status !== "ACTIVE") {
    console.log(`Rule "${rule.name}" is already ${rule.status.toLowerCase()}. Nothing to do.`);
    process.exit(0);
  }
  subject = `rule "${rule.name}" (${key})`;
  resourceType = "rule";
  resourceId = rule.id;
  summary = `Rule "${rule.name}" was switched off from the command line (break-glass).`;
  statements.push(`UPDATE rules SET status = 'INACTIVE', updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(rule.id)} AND status = 'ACTIVE';`);
} else {
  const user = d1Query<{ id: string; status: string; mfa: number; sessions: number; moderator: number }>(target,
    `SELECT u.id, u.status,
            (SELECT COUNT(*) FROM user_mfa m WHERE m.user_id = u.id AND m.confirmed_at IS NOT NULL) AS mfa,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ${sqlValue(now)}) AS sessions,
            (SELECT COUNT(*) FROM user_roles r WHERE r.user_id = u.id AND r.role_id = 'role:moderator' AND r.revoked_at IS NULL) AS moderator
     FROM users u WHERE u.email = ${sqlValue(email!)} AND u.deleted_at IS NULL`)[0];
  if (!user) {
    console.error(`No account with that email on ${target}.`);
    process.exit(3);
  }
  subject = email!;
  resourceId = user.id;
  if (command === "reset-mfa") {
    if (!user.mfa) {
      console.log("Two-factor isn't on for this account. Nothing to do.");
      process.exit(0);
    }
    summary = `Two-factor sign-in was turned off for ${email} from the command line (break-glass); they must set it up again.`;
    statements.push(
      `DELETE FROM user_mfa WHERE user_id = ${sqlValue(user.id)};`,
      `UPDATE sessions SET revoked_at = ${sqlValue(now)} WHERE user_id = ${sqlValue(user.id)} AND revoked_at IS NULL;`,
    );
  } else if (command === "revoke-sessions") {
    summary = `${email} was signed out on every device from the command line (break-glass).`;
    statements.push(`UPDATE sessions SET revoked_at = ${sqlValue(now)} WHERE user_id = ${sqlValue(user.id)} AND revoked_at IS NULL;`);
  } else {
    if (user.status !== "ACTIVE") {
      console.error(`The account is ${user.status}; only an active account can become a Moderator.`);
      process.exit(3);
    }
    if (user.moderator) {
      console.log("This account is already a Moderator. Nothing to do.");
      process.exit(0);
    }
    const limit = d1Query<{ holders: number; max: number | null }>(target,
      "SELECT (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.status = 'ACTIVE' WHERE ur.role_id = 'role:moderator' AND ur.revoked_at IS NULL) AS holders, (SELECT max_holders FROM roles WHERE id = 'role:moderator') AS max")[0]!;
    if (limit.max !== null && limit.holders >= limit.max && !argv.includes("--over-limit")) {
      console.error(`There are already ${limit.holders} of ${limit.max} Moderators. Revoke one in the app, or pass --over-limit if none of them can act.`);
      process.exit(3);
    }
    summary = `${email} was made a Moderator from the command line (break-glass).`;
    statements.push(`INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) VALUES (${sqlValue(`ur_${crypto.randomUUID()}`)}, ${sqlValue(user.id)}, 'role:moderator', ${sqlValue(now)}, 'Break-glass: appointed from the command line');`);
  }
}

const action = `breakglass.${command.replace(/-/g, "_")}`;
statements.push(
  `INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, reason, created_at) VALUES (${sqlValue(`aud_${crypto.randomUUID()}`)}, NULL, 'break-glass (Cloudflare account)', ${sqlValue(action)}, ${sqlValue(resourceType)}, ${sqlValue(resourceId)}, ${sqlValue(summary)}, ${sqlValue(now)});`,
  // Every Moderator hears about it in the app (and by email when email is on, via the next notice they get).
  `INSERT INTO notifications (id, user_id, type, title, body, link, channel, created_at)
   SELECT 'ntf_' || lower(hex(randomblob(16))), ur.user_id, 'security.breakglass', 'Break-glass recovery was used', ${sqlValue(summary)}, '/dashboard/activity', 'IN_APP', ${sqlValue(now)}
   FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.status = 'ACTIVE' WHERE ur.role_id = 'role:moderator' AND ur.revoked_at IS NULL;`,
);

console.log(`\n${summary}\nTarget: ${target}. This is logged in the activity log and every Moderator is notified.`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type "${subject}" to continue: `)).trim();
rl.close();
if (typed !== subject) {
  console.error("Didn't match. Nothing was changed.");
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), "gucc-breakglass-"));
const file = path.join(dir, "breakglass.sql");
writeFileSync(file, statements.join("\n"), { mode: 0o600 });
const ok = d1ExecuteFile(target, file);
rmSync(dir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log(`✓ Done on ${target}.`);
