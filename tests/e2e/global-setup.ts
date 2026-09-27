import { readFileSync } from "node:fs";
import { hashPassword } from "../../lib/server/crypto";
import { d1, MODERATOR } from "./helpers";

/**
 * Local test database only:
 *  - clear rate-limit counters so repeated runs from one machine aren't throttled;
 *  - make sure the E2E Moderator exists with a known password (hashed with the
 *    local PASSWORD_PEPPER from .env.local, exactly as the Worker hashes).
 */
export default async function globalSetup() {
  d1("DELETE FROM rate_limits");
  const pepper = readFileSync(".env.local", "utf8").match(/^PASSWORD_PEPPER=(.+)$/m)?.[1]?.trim();
  const hash = await hashPassword(MODERATOR.password, pepper);
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const now = new Date().toISOString();
  // Reuse an existing account with this email (e.g. created by bootstrap-moderator).
  const existing = d1<{ id: string }>(`SELECT id FROM users WHERE email = ${q(MODERATOR.email)}`)[0];
  if (existing && existing.id !== "usr_e2e_moderator") {
    d1(`UPDATE users SET password_hash = ${q(hash)}, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE id = ${q(existing.id)}`);
    return;
  }
  d1(`INSERT INTO users (id, email, password_hash, status, email_verified_at, approved_at, created_at, updated_at)
      VALUES ('usr_e2e_moderator', ${q(MODERATOR.email)}, ${q(hash)}, 'ACTIVE', ${q(now)}, ${q(now)}, ${q(now)}, ${q(now)})
      ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL`);
  d1(`INSERT INTO profiles (id, user_id, full_name, person_type) VALUES ('prf_e2e_moderator', 'usr_e2e_moderator', 'E2E Moderator', 'FACULTY') ON CONFLICT(id) DO NOTHING`);
  d1(`INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) SELECT 'ur_e2e_moderator', 'usr_e2e_moderator', 'role:moderator', ${q(now)}, 'E2E setup'
      WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 'usr_e2e_moderator' AND role_id = 'role:moderator' AND revoked_at IS NULL)`);
  d1(`INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) SELECT 'ur_e2e_moderator_member', 'usr_e2e_moderator', 'role:member', ${q(now)}, 'E2E setup'
      WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 'usr_e2e_moderator' AND role_id = 'role:member' AND revoked_at IS NULL)`);
}
