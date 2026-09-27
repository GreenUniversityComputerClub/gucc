#!/usr/bin/env bun
/**
 * Link the first administrator's account to their executive profile — for example the
 * current General Secretary — so the position's permissions apply. There is no special
 * "superuser": what the account may do comes from the position, like everyone else's.
 *
 *   1. They register on the website with their own email (no password ever goes here).
 *   2. bun scripts/platform/bootstrap-admin.ts --target production --confirm-production \
 *        --email <the email they registered with> --student-id 232002184
 *
 * The account is activated and attached to the profile with that student ID (its committee
 * history stays); the details they entered at sign-up fill any gaps in the profile.
 *
 * Only for the very first administrator: it refuses once any active account can approve
 * members (through a role or a current position). From then on, leaders approve and link
 * accounts in /admin/members, with the audit trail that comes with it.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sqlValue } from "../../lib/migration/sql";
import { assertProductionConfirmed, d1ExecuteFile, d1Query, parseTarget } from "./lib/wrangler";

const argv = process.argv.slice(2);
const target = parseTarget(argv);
assertProductionConfirmed(target, argv, "link an administrator");
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const email = arg("--email")?.trim().toLowerCase();
const studentId = arg("--student-id")?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !studentId || !/^\d{9}$/.test(studentId)) {
  console.error("Usage: --email <registered email> --student-id <9 digits> [--target local|staging|production] [--confirm-production]");
  process.exit(2);
}

const user = d1Query<{ id: string; status: string }>(target, `SELECT id, status FROM users WHERE email = ${sqlValue(email)} AND deleted_at IS NULL`)[0];
if (!user) {
  console.error(`No account uses ${email}. Register on the website with that email first, then run this again.`);
  process.exit(3);
}
if (["SUSPENDED", "REJECTED", "ARCHIVED"].includes(user.status)) {
  console.error(`That account is ${user.status}; it can't be made an administrator this way.`);
  process.exit(3);
}
const profile = d1Query<{ id: string; full_name: string; user_id: string | null }>(target, `SELECT id, full_name, user_id FROM profiles WHERE student_id = ${sqlValue(studentId)} AND deleted_at IS NULL`)[0];
if (!profile) {
  console.error(`No profile has student ID ${studentId}.`);
  process.exit(3);
}
if (profile.user_id && profile.user_id !== user.id) {
  console.error(`The profile of ${profile.full_name} already belongs to another account.`);
  process.exit(3);
}

// First administrator only.
const approvers = d1Query<{ n: number }>(target, `
  SELECT COUNT(DISTINCT u.id) AS n FROM users u WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.id <> ${sqlValue(user.id)} AND (
    EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND p.key IN ('members.approve', '*') AND rp.scope = 'ALL')
    OR EXISTS (SELECT 1 FROM profiles pr JOIN committee_members cm ON cm.profile_id = pr.id AND cm.deleted_at IS NULL AND cm.is_active = 1
               JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' JOIN position_permissions pp ON pp.position_id = cm.position_id
               JOIN permissions p ON p.id = pp.permission_id WHERE pr.user_id = u.id AND p.key IN ('members.approve', '*') AND pp.scope = 'ALL'))`)[0].n;
if (approvers > 0) {
  console.error("An active account can already approve members. Link accounts from /admin/members instead (it is audited there).");
  process.exit(3);
}

const holds = d1Query<{ title: string; committee: string }>(target, `
  SELECT cm.position_title AS title, c.name AS committee FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
  WHERE cm.profile_id = ${sqlValue(profile.id)} AND cm.deleted_at IS NULL AND cm.is_active = 1`);
if (!holds.length) console.warn(`Note: ${profile.full_name} holds no position in the current committee, so linking gives no administrative access.`);

const own = d1Query<{ id: string }>(target, `SELECT id FROM profiles WHERE user_id = ${sqlValue(user.id)} AND deleted_at IS NULL AND id <> ${sqlValue(profile.id)}`)[0];
const now = new Date().toISOString();
const statements: string[] = [];
if (own) {
  statements.push(
    `UPDATE profiles SET department = COALESCE(profiles.department, o.department), batch = COALESCE(profiles.batch, o.batch), phone = COALESCE(profiles.phone, o.phone) FROM (SELECT department, batch, phone FROM profiles WHERE id = ${sqlValue(own.id)}) AS o WHERE profiles.id = ${sqlValue(profile.id)};`,
    `UPDATE profiles SET user_id = NULL, deleted_at = ${sqlValue(now)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(own.id)};`,
  );
}
statements.push(
  `UPDATE profiles SET user_id = ${sqlValue(user.id)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(profile.id)};`,
  `UPDATE users SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, ${sqlValue(now)}), approved_at = COALESCE(approved_at, ${sqlValue(now)}), correction_note = NULL, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(user.id)};`,
  `INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) SELECT ${sqlValue(`ur_${crypto.randomUUID()}`)}, ${sqlValue(user.id)}, 'role:member', ${sqlValue(now)}, 'Bootstrap: first administrator' WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = ${sqlValue(user.id)} AND role_id = 'role:member' AND revoked_at IS NULL);`,
  `INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, reason, after_json, created_at) VALUES (${sqlValue(`aud_${crypto.randomUUID()}`)}, NULL, 'bootstrap-cli', 'governance.bootstrap_admin', 'user', ${sqlValue(user.id)}, 'First administrator linked outside the app (no one could approve members yet)', ${sqlValue(JSON.stringify({ profileId: profile.id, studentId, holds: holds.map((h) => h.title) }))}, ${sqlValue(now)});`,
);

const dir = mkdtempSync(path.join(tmpdir(), "gucc-bootstrap-"));
const file = path.join(dir, "bootstrap.sql");
writeFileSync(file, statements.join("\n"), { mode: 0o600 });
const ok = d1ExecuteFile(target, file);
rmSync(dir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log(`${email} is now ${profile.full_name}'s account on ${target}${holds.length ? `, holding ${holds.map((h) => `${h.title} (${h.committee})`).join(", ")}` : ""}.`);
