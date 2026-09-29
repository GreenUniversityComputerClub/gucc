/**
 * Loads a Subject and the active rules from D1 and asks the governance engine.
 * This is the single entry point for authorization: services call
 * `authorize()` / `requirePermission()`, never compare role or position names.
 */
import { evaluate, heldScopes, MODERATOR_EQUAL_POSITIONS } from "../governance/engine";
import type { Decision, Grant, Resource, Rule, RuleEffect, Scope, Subject, SubjectPosition } from "../governance/types";
import type { Actor, Ctx } from "./context";
import type { Db } from "./db";
import { nowIso } from "./db";
import { AuthRequiredError, ForbiddenError } from "./errors";

/**
 * Units of the current committee whose listings carry position authority: GUCC's own. Other
 * units on the executives page (e.g. CSS) are separate committees; their people get an account
 * and the affiliate baseline (role "unit-executive"), never a GUCC position's powers, even when
 * a title such as "General Secretary" is the same.
 */
export const GOVERNING_UNIT_SQL = `(COALESCE(cm.unit_key, '') = '' OR cm.unit_key IN (SELECT value FROM json_each(COALESCE(
  (SELECT value_json FROM system_settings WHERE key = 'governance.governing_units'), '["gucc"]'))))`;

const MY_LISTINGS = `
  FROM committee_members cm
  JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id = ?1 AND pr.deleted_at IS NULL
  JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
  WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now'))`;

const MY_POSITION_IDS = `SELECT cm.position_id ${MY_LISTINGS} AND ${GOVERNING_UNIT_SQL}`;
/** The account holds the President's or the General Secretary's position (equal to a Moderator). */
const MY_MODERATOR_EQUAL = `SELECT 1 FROM positions lp WHERE lp.id IN (${MY_POSITION_IDS}) AND lp.key IN (${MODERATOR_EQUAL_POSITIONS.map((k) => `'${k}'`).join(", ")})`;

/**
 * SQL: does the account `userCol` hold Moderator authority (the Moderator role, or the President's
 * or General Secretary's position in a governing unit of the current committee)?
 */
export const HAS_MODERATOR_AUTHORITY_SQL = (userCol: string) => `(
  EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ${userCol} AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND r.is_protected = 1)
  OR EXISTS (SELECT 1 FROM committee_members cm
          JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id = ${userCol} AND pr.deleted_at IS NULL
          JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
          JOIN positions p ON p.id = cm.position_id AND p.is_active = 1 AND p.deleted_at IS NULL
          WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now')) AND ${GOVERNING_UNIT_SQL}
            AND p.key IN (${MODERATOR_EQUAL_POSITIONS.map((k) => `'${k}'`).join(", ")})))`;
const MY_AFFILIATE_LISTING = `SELECT 1 ${MY_LISTINGS} AND NOT ${GOVERNING_UNIT_SQL}`;

export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  const now = nowIso();
  const [userRes, roleRes, posRes, grantRes, profileRes, affiliateRes] = (await db.batchAll([
    db.stmt(
      `SELECT u.id, u.email, u.status, u.created_at,
              (SELECT confirmed_at FROM user_mfa WHERE user_id = u.id AND confirmed_at IS NOT NULL) AS mfa_at,
              (SELECT value_json FROM system_settings WHERE key = 'security.mfa_required_for_sensitive') AS mfa_required,
              (SELECT updated_at FROM system_settings WHERE key = 'security.mfa_required_for_sensitive') AS mfa_required_since,
              (SELECT value_json FROM system_settings WHERE key = 'security.mfa_grace_days') AS mfa_grace_days
       FROM users u WHERE u.id = ?1 AND u.deleted_at IS NULL`, userId),
    db.stmt(
      `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
       WHERE ur.user_id = ?1 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?2)`,
      userId,
      now,
    ),
    db.stmt(
      `SELECT p.key, cm.committee_id, cm.unit_key FROM committee_members cm
       JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id = ?1 AND pr.deleted_at IS NULL
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
       JOIN positions p ON p.id = cm.position_id AND p.is_active = 1 AND p.deleted_at IS NULL
       WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now')) AND ${GOVERNING_UNIT_SQL}`,
      userId,
    ),
    db.stmt(
      `SELECT 'role:' || r.key AS source, pm.key AS permission, rp.scope, rp.scope_value, pm.is_sensitive,
              COALESCE((SELECT MIN(ur.granted_at) FROM user_roles ur WHERE ur.user_id = ?1 AND ur.role_id = r.id AND ur.revoked_at IS NULL),
                       (SELECT MIN(MAX(cm.created_at, COALESCE(cm.start_date, ''))) ${MY_LISTINGS})) AS since
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
       JOIN permissions pm ON pm.id = rp.permission_id
       WHERE r.id IN (SELECT role_id FROM user_roles WHERE user_id = ?1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?2))
          OR (r.key = 'executive' AND EXISTS (${MY_POSITION_IDS}))
          OR (r.key = 'moderator' AND EXISTS (${MY_MODERATOR_EQUAL}))
          OR (r.key = 'unit-executive' AND EXISTS (${MY_AFFILIATE_LISTING}) AND NOT EXISTS (${MY_POSITION_IDS}))
       UNION ALL
       SELECT 'position:' || p.key, pm.key, pp.scope, pp.scope_value, pm.is_sensitive,
              (SELECT MIN(MAX(cm.created_at, COALESCE(cm.start_date, ''))) ${MY_LISTINGS} AND cm.position_id = p.id)
       FROM position_permissions pp
       JOIN positions p ON p.id = pp.position_id AND p.is_active = 1 AND p.deleted_at IS NULL
       JOIN permissions pm ON pm.id = pp.permission_id
       WHERE pp.position_id IN (${MY_POSITION_IDS})
       UNION ALL
       SELECT 'direct', pm.key, up.scope, up.scope_value, pm.is_sensitive, up.granted_at
       FROM user_permissions up
       JOIN permissions pm ON pm.id = up.permission_id
       WHERE up.user_id = ?1 AND up.revoked_at IS NULL AND (up.expires_at IS NULL OR up.expires_at > ?2)`,
      userId,
      now,
    ),
    db.stmt("SELECT id, full_name FROM profiles WHERE user_id = ?1 AND deleted_at IS NULL", userId),
    db.stmt(`SELECT DISTINCT cm.unit_key ${MY_LISTINGS} AND NOT ${GOVERNING_UNIT_SQL}`, userId),
  ])) as Array<{ results?: Record<string, unknown>[] }>;

  const row = userRes.results?.[0] as (Actor["user"] & { created_at: string; mfa_at: string | null; mfa_required: string | null; mfa_required_since: string | null; mfa_grace_days: string | null }) | undefined;
  if (!row) return null;
  const user: Actor["user"] = { id: row.id, email: row.email, status: row.status };
  const positions: SubjectPosition[] = (posRes.results ?? []).map((r) => ({
    key: String(r.key),
    committeeId: String(r.committee_id),
    unitKey: (r.unit_key as string | null) ?? null,
  }));
  const roles = [...new Set((roleRes.results ?? []).map((r) => String(r.key)))];
  if (positions.length > 0 && !roles.includes("executive")) roles.push("executive");
  // The President and the General Secretary have the Moderators' authority (while they hold the position).
  if (positions.some((p) => (MODERATOR_EQUAL_POSITIONS as readonly string[]).includes(p.key)) && !roles.includes("moderator")) roles.push("moderator");
  // Affiliated committees (e.g. CSS) only: their own content, with the leaders' approval.
  if (positions.length === 0 && (affiliateRes.results ?? []).length > 0 && !roles.includes("unit-executive")) roles.push("unit-executive");
  const allGrants = (grantRes.results ?? []).map((g) => ({
    permission: String(g.permission),
    scope: g.scope as Scope,
    scopeValue: String(g.scope_value ?? ""),
    source: String(g.source),
    sensitive: Number(g.is_sensitive) === 1,
    since: typeof g.since === "string" ? g.since : null,
  }));
  // When the account first held a sensitive permission it holds now: the two-factor grace period
  // starts there, not when the account was created (a long-standing member who is promoted gets
  // the full grace period).
  const sensitiveSince = allGrants.filter((g) => g.sensitive && g.since).map((g) => g.since!).sort()[0] ?? null;
  const security = mfaState(row, allGrants.some((g) => g.sensitive), sensitiveSince);
  // Past the grace period without two-factor, sensitive permissions are withheld (everything
  // else keeps working, including turning two-factor on).
  const grants: Grant[] = allGrants.filter((g) => !(security.mfaBlocked && g.sensitive)).map(({ sensitive: _s, since: _since, ...g }) => g);
  const subject: Subject = { userId: user.id, status: user.status, roles, positions, grants };
  const rules = await loadRules(db);
  const profile = (profileRes.results?.[0] as Actor["profile"]) ?? null;
  return { user, profile, subject, rules, security };
}

function mfaState(row: { created_at: string; mfa_at: string | null; mfa_required: string | null; mfa_required_since: string | null; mfa_grace_days: string | null }, holdsSensitive: boolean, sensitiveSince: string | null = null) {
  const mfaEnabled = Boolean(row.mfa_at);
  const mfaRequired = holdsSensitive && row.mfa_required !== "false";
  const graceDays = Number(row.mfa_grace_days ?? 7);
  // The grace period runs from the latest of: the account's creation, the rule being switched on,
  // and the account first holding a sensitive permission.
  const since = [row.created_at, row.mfa_required_since, sensitiveSince].filter(Boolean).sort().at(-1) ?? row.created_at;
  const mfaDeadline = mfaRequired && !mfaEnabled ? new Date(new Date(since).getTime() + (Number.isFinite(graceDays) ? graceDays : 7) * 86_400_000).toISOString() : null;
  return { mfaEnabled, holdsSensitive, mfaRequired, mfaDeadline, mfaBlocked: Boolean(mfaDeadline && mfaDeadline < nowIso()) };
}

const EFFECT_MAP: Record<string, RuleEffect> = {
  ALLOW: "ALLOW",
  ASSIGN_PERMISSION: "ALLOW",
  DENY: "DENY",
  REMOVE_PERMISSION: "DENY",
  REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
};

export async function loadRules(db: Db): Promise<Rule[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT r.id, r.key, r.name, r.permission_key, r.resource_type, r.scope, r.scope_value, r.priority, r.is_protected,
            (SELECT a.action_type FROM rule_actions a
              WHERE a.rule_id = r.id AND a.action_type IN ('ALLOW','DENY','REQUIRE_APPROVAL','ASSIGN_PERMISSION','REMOVE_PERMISSION')
              ORDER BY a.sort_order LIMIT 1) AS effect,
            ap.key AS policy_key,
            (SELECT json_group_array(json_object('field', c.field, 'operator', c.operator, 'value', c.value_json, 'group', c.group_no))
               FROM rule_conditions c WHERE c.rule_id = r.id) AS conditions
     FROM rules r
     LEFT JOIN approval_policies ap ON ap.id = r.approval_policy_id AND ap.deleted_at IS NULL
     WHERE r.status = 'ACTIVE' AND r.deleted_at IS NULL AND r.trigger = 'AUTHORIZE'`,
  );
  return rows
    .filter((r) => r.effect && EFFECT_MAP[String(r.effect)])
    .map((r) => ({
      id: String(r.id),
      key: (r.key as string | null) ?? null,
      name: String(r.name),
      effect: EFFECT_MAP[String(r.effect)],
      permission: String(r.permission_key),
      resourceType: (r.resource_type as string | null) ?? null,
      scope: r.scope as Scope,
      scopeValue: String(r.scope_value ?? ""),
      priority: Number(r.priority),
      isProtected: Boolean(r.is_protected),
      approvalPolicyKey: (r.policy_key as string | null) ?? null,
      conditions: (JSON.parse(String(r.conditions ?? "[]")) as Array<{ field: string; operator: string; value: string | null; group: number }>).map((c) => ({
        field: c.field as never,
        operator: c.operator as never,
        value: c.value === null || c.value === undefined ? undefined : safeParse(c.value),
        group: Number(c.group ?? 0),
      })),
    }));
}

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function requireActor(ctx: Ctx): Actor {
  if (!ctx.actor) throw new AuthRequiredError();
  return ctx.actor;
}

export function authorize(ctx: Ctx, permission: string, resource?: Resource): Decision {
  const actor = requireActor(ctx);
  return evaluate(actor.subject, permission, resource, actor.rules);
}

/**
 * Throws unless the decision is ALLOW. REQUIRE_APPROVAL is returned to the
 * caller only when `allowApproval` is set (publish flows route it to the
 * approval engine); otherwise it is treated as a denial.
 */
export function requirePermission(ctx: Ctx, permission: string, resource?: Resource, opts: { allowApproval?: boolean } = {}): Decision {
  const decision = authorize(ctx, permission, resource);
  if (decision.outcome === "ALLOW") return decision;
  if (decision.outcome === "REQUIRE_APPROVAL" && opts.allowApproval) return decision;
  throw new ForbiddenError(decision.summary, decision);
}

export function can(ctx: Ctx, permission: string, resource?: Resource): boolean {
  if (!ctx.actor) return false;
  return evaluate(ctx.actor.subject, permission, resource, ctx.actor.rules).outcome !== "DENY";
}

/** Scopes the actor holds a permission through, for server-side list filtering. */
export function scopesFor(ctx: Ctx, permission: string) {
  if (!ctx.actor) return [];
  return heldScopes(ctx.actor.subject, permission);
}

// ───────────────────────────── resource loaders ─────────────────────────────

export async function postResource(db: Db, id: string): Promise<Resource | null> {
  const row = await db.first<{ id: string; created_by: string | null; status: string; category: string | null; type: string }>(
    `SELECT p.id, p.created_by, p.status, c.slug AS category, p.type FROM posts p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ?1 AND p.deleted_at IS NULL`,
    id,
  );
  if (!row) return null;
  return { type: "post", id: row.id, createdBy: row.created_by, ownerId: row.created_by, status: row.status, category: row.category, meta: { postType: row.type } };
}

export async function eventAssignees(db: Db, eventId: string): Promise<string[]> {
  const rows = await db.all<{ user_id: string }>(
    "SELECT DISTINCT user_id FROM event_people WHERE event_id = ?1 AND user_id IS NOT NULL AND role IN ('COORDINATOR','PHOTOGRAPHER')",
    eventId,
  );
  return rows.map((r) => r.user_id);
}

export async function eventResource(db: Db, id: string): Promise<Resource | null> {
  const row = await db.first<{ id: string; created_by: string | null; status: string; category: string | null; committee_id: string | null }>(
    `SELECT e.id, e.created_by, e.status, c.slug AS category, e.committee_id FROM events e LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.id = ?1 AND e.deleted_at IS NULL`,
    id,
  );
  if (!row) return null;
  const assigned = await eventAssignees(db, id);
  return {
    type: "event", id: row.id, createdBy: row.created_by, ownerId: row.created_by, status: row.status, category: row.category,
    committeeId: row.committee_id, assignedUserIds: assigned, eventId: row.id, eventAssignedUserIds: assigned,
  };
}

export async function userResource(db: Db, id: string): Promise<Resource | null> {
  const row = await db.first<{ id: string; status: string; is_mod: number }>(
    `SELECT u.id, u.status,
            ${HAS_MODERATOR_AUTHORITY_SQL("u.id")} AS is_mod
     FROM users u WHERE u.id = ?1 AND u.deleted_at IS NULL`,
    id,
  );
  if (!row) return null;
  return { type: "user", id: row.id, ownerId: row.id, status: row.status, isProtected: Boolean(row.is_mod) };
}
