/**
 * Governance administration: roles, positions and their permissions, rules,
 * approval policies, settings — plus "explain" for administrators.
 *
 * Every write here goes through the invariants in lib/governance/invariants.ts
 * before anything touches the database. Changes to protected governance
 * (Moderator role, protected rules/settings) go through the
 * governance-protected approval policy whenever a second Moderator exists.
 */
import { batchTransition, staleAnswer, unchangedSince } from "../transition";
import { checkContentSetting } from "../../governance/content-settings";
import { evaluate, holdsProtectedRole } from "../../governance/engine";
import {
  assertCanAuthorRule,
  assertCanEditProtected,
  assertCanGrantPermissions,
  assertCanGrantRole,
  assertCanRevokeRole,
  assertNotSelf,
  validateRuleShape,
} from "../../governance/invariants";
import { CONDITION_FIELDS, CONDITION_OPERATORS, SCOPES, type Resource, type RuleEffect, type Scope } from "../../governance/types";
import { defaultLevel, LEVEL_VALUES } from "../../governance/levels";
import { auditManyStmt, auditStmt } from "../audit";
import { loadActor, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { notifyEachStmts, notifyStmts } from "../notifications";
import { getSetting, requireRecentAuth } from "../security";
import { emailProvider, forgetEmailSettings, lastSuccessfulTest, TEST_VALID_DAYS } from "../email";
import { TRIGGER_EVENTS, type NotifyTarget } from "../triggers";
import { toSlug, Validator } from "../validate";
import { eligibleApprovers, loadPolicy, registerApprovalHandler, startApproval } from "./approvals";
import { positionRenamedStmt } from "../people-sync";

// ───────────────────────────── protected change routing ─────────────────────────────

type ProtectedChange =
  | { kind: "role.grant"; userId: string; roleKey: string; reason: string | null; expiresAt?: string | null }
  | { kind: "role.revoke"; userRoleId: string; reason: string | null; userId?: string; person?: string; roleKey?: string }
  | { kind: "rule.status"; ruleId: string; status: string }
  | { kind: "setting.system"; key: string; value: unknown };

/**
 * Apply now if no other Moderator could approve (bootstrap / sole Moderator);
 * otherwise open a governance-protected approval request.
 */
async function routeProtected(ctx: Ctx, change: ProtectedChange, title: string, apply: () => Promise<D1StatementLike[]>): Promise<{ applied: boolean; requestId?: string }> {
  const actor = requireActor(ctx);
  const policyKey = await getSetting(ctx, "governance.protected_change_policy", "governance-protected");
  const { policy } = await loadPolicy(ctx, policyKey);
  const others = await eligibleApprovers(ctx, policy, actor.user.id);
  if (others.length === 0) {
    await ctx.db.batch([...(await apply()), auditStmt(ctx, { action: "governance.protected_applied_alone", reason: "No other Moderator is appointed to approve.", after: change })]);
    return { applied: true };
  }
  const resourceId = change.kind === "role.grant" ? `${change.userId}:${change.roleKey}` : change.kind === "role.revoke" ? change.userRoleId : change.kind === "rule.status" ? change.ruleId : change.key;
  const { requestId } = await startApproval(ctx, { policyKey, resourceType: "governance", resourceId, action: "governance.protected_change", title, payload: change });
  return { applied: false, requestId };
}

registerApprovalHandler("governance.protected_change", {
  async onApproved(ctx, req) {
    const change = JSON.parse(req.payload_json ?? "{}") as ProtectedChange;
    // Re-check invariants at approval time against the requester's current authority.
    const requester = await loadActor(ctx.db, req.requested_by);
    if (!requester) throw new AppError(409, "REQUESTER_GONE", "The requesting account no longer exists.");
    const asRequester: Ctx = { ...ctx, actor: requester };
    switch (change.kind) {
      case "role.grant":
        return roleGrantStatements(asRequester, change.userId, change.roleKey, change.reason, req.id, change.expiresAt ?? null);
      case "role.revoke":
        return roleRevokeStatements(asRequester, change.userRoleId, change.reason, req.id);
      case "rule.status":
        return ruleStatusStatements(asRequester, change.ruleId, change.status, req.id);
      case "setting.system":
        return [ctx.db.stmt("UPDATE system_settings SET value_json = ?2, updated_at = ?3, updated_by = ?4 WHERE key = ?1", change.key, JSON.stringify(change.value), nowIso(), req.requested_by),
          auditStmt(ctx, { action: "settings.system_update", resourceType: "system_setting", resourceId: change.key, after: { value: change.value }, reason: `Approved (request ${req.id})` })];
      default:
        return [];
    }
  },
});

// ───────────────────────────── sensitive grants ─────────────────────────────

type GrantInput = { permission: string; scope: Scope; scopeValue: string };

export type SensitiveChange =
  | { kind: "role.grant"; userId: string; roleKey: string; reason: string | null; expiresAt?: string | null }
  | { kind: "role.permission"; roleId: string; grant: GrantInput }
  | { kind: "position.permission"; positionId: string; grant: GrantInput }
  | { kind: "direct.grant"; userId: string; grant: GrantInput; expiresAt: string | null; reason: string | null };

export interface GrantOutcome {
  applied: boolean;
  requestId?: string;
  message?: string;
}

/** Is this permission marked sensitive in the database? */
async function isSensitivePermission(ctx: Ctx, key: string): Promise<boolean> {
  return Boolean(await ctx.db.first("SELECT 1 FROM permissions WHERE key = ?1 AND is_sensitive = 1", key));
}

/** Which of these permissions are marked sensitive in the database. */
async function sensitiveIn(ctx: Ctx, keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await ctx.db.all<{ key: string }>(
    "SELECT key FROM permissions WHERE is_sensitive = 1 AND key IN (SELECT value FROM json_each(?1)) ORDER BY key", JSON.stringify(keys));
  return rows.map((r) => r.key);
}

/**
 * Moderators grant sensitive permissions directly. Anyone else (the President, the General
 * Secretary) opens an approval request for a Moderator; the change is rebuilt and every
 * invariant re-checked against the requester's authority at approval time.
 */
async function routeSensitive(ctx: Ctx, change: SensitiveChange, sensitive: string[], title: string, build: () => Promise<D1StatementLike[]>): Promise<GrantOutcome> {
  const actor = requireActor(ctx);
  // Handing out sensitive powers needs the password entered recently in this session.
  if (sensitive.length > 0) await requireRecentAuth(ctx);
  if (sensitive.length === 0 || (actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject))) {
    await ctx.db.batch(await build());
    return { applied: true };
  }
  const policyKey = await getSetting(ctx, "governance.sensitive_grant_policy", "sensitive-grant");
  const resourceId =
    change.kind === "role.grant" ? `role:${change.userId}:${change.roleKey}`
      : change.kind === "role.permission" ? `rp:${change.roleId}:${change.grant.permission}:${change.grant.scope}:${change.grant.scopeValue}`
        : change.kind === "position.permission" ? `pp:${change.positionId}:${change.grant.permission}:${change.grant.scope}:${change.grant.scopeValue}`
          : `up:${change.userId}:${change.grant.permission}:${change.grant.scope}:${change.grant.scopeValue}`;
  const { requestId } = await startApproval(ctx, { policyKey, resourceType: "governance", resourceId, action: "governance.sensitive_grant", title, payload: change });
  const list = sensitive.join(", ");
  return {
    applied: false,
    requestId,
    message: `${list} ${sensitive.length === 1 ? "is a sensitive permission" : "are sensitive permissions"}, so a Moderator, the President or the General Secretary approves this first. You'll be notified.`,
  };
}

registerApprovalHandler("governance.sensitive_grant", {
  async onApproved(ctx, req) {
    const change = JSON.parse(req.payload_json ?? "{}") as SensitiveChange;
    const requester = await loadActor(ctx.db, req.requested_by);
    if (!requester) throw new AppError(409, "REQUESTER_GONE", "The requesting account no longer exists.");
    const asRequester: Ctx = { ...ctx, actor: requester };
    switch (change.kind) {
      case "role.grant":
        return roleGrantStatements(asRequester, change.userId, change.roleKey, change.reason, req.id, change.expiresAt ?? null);
      case "role.permission":
        return rolePermissionStatements(asRequester, change.roleId, change.grant, true, req.id);
      case "position.permission":
        return positionPermissionStatements(asRequester, change.positionId, change.grant, true, req.id);
      case "direct.grant":
        return directGrantStatements(asRequester, change.userId, change.grant, change.expiresAt, change.reason, req.id);
      default:
        return [];
    }
  },
});

function checkGrantShape(grant: GrantInput) {
  if (!SCOPES.includes(grant.scope)) throw new ValidationError("Unknown scope.");
  if (["CATEGORY", "POSITION", "COMMITTEE", "EVENT"].includes(grant.scope) && !grant.scopeValue.trim()) throw new ValidationError(`Scope ${grant.scope} needs a value.`);
  if (grant.permission === "*") throw new ValidationError("The wildcard permission belongs to the Moderator role only.");
}

// ───────────────────────────── roles ─────────────────────────────

export async function listRoles(ctx: Ctx) {
  requirePermission(ctx, "roles.read");
  const roles = await ctx.db.all<{ id: string; key: string; name: string; description: string | null; is_protected: number; max_holders: number | null; holders: number }>(
    `SELECT r.id, r.key, r.name, r.description, r.is_protected, r.max_holders,
            (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL WHERE ur.role_id = r.id AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS holders
     FROM roles r WHERE r.deleted_at IS NULL ORDER BY r.rank`,
  );
  const grants = await ctx.db.all<{ role_id: string; permission: string; scope: string; scope_value: string }>(
    "SELECT rp.role_id, p.key AS permission, rp.scope, rp.scope_value FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id ORDER BY p.key",
  );
  const holders = await ctx.db.all<{ id: string; role_id: string; user_id: string; email: string; name: string | null; granted_at: string }>(
    `SELECT ur.id, ur.role_id, ur.user_id, u.email, p.full_name AS name, ur.granted_at FROM user_roles ur JOIN users u ON u.id = ur.user_id
     LEFT JOIN profiles p ON p.user_id = u.id WHERE ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND u.deleted_at IS NULL ORDER BY ur.granted_at`,
  );
  return roles.map((r) => ({ ...r, grants: grants.filter((g) => g.role_id === r.id), members: holders.filter((h) => h.role_id === r.id) }));
}

async function roleContext(ctx: Ctx, roleKey: string) {
  const role = await ctx.db.first<{ id: string; key: string; is_protected: number; max_holders: number | null }>("SELECT id, key, is_protected, max_holders FROM roles WHERE key = ?1 AND deleted_at IS NULL", roleKey);
  if (!role) throw new NotFoundError("Role");
  const active = (await ctx.db.value<number>(
    "SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL AND u.status = 'ACTIVE' WHERE ur.role_id = ?1 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))", role.id)) ?? 0;
  const configuredMax = role.is_protected ? await getSetting<number>(ctx, "governance.max_moderators", role.max_holders ?? 3) : null;
  return { role, ctx: { roleKey: role.key, roleIsProtected: Boolean(role.is_protected), roleMaxHolders: role.max_holders, activeHolders: active, configuredMax } };
}

/** Mark the given people's run-out holdings of a role as ended (revoked when they expired). */
function expireRolesStmt(ctx: Ctx, userIds: string[], roleId: string): D1StatementLike {
  return ctx.db.stmt(
    `UPDATE user_roles SET revoked_at = expires_at WHERE role_id = ?2 AND user_id IN (SELECT value FROM json_each(?1))
       AND revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?3`, JSON.stringify(userIds), roleId, nowIso());
}

async function roleGrantStatements(ctx: Ctx, userId: string, roleKey: string, reason: string | null, viaRequest?: string, expiresAt: string | null = null): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const { role, ctx: rc } = await roleContext(ctx, roleKey);
  assertCanGrantRole(actor.subject, userId, rc);
  const target = await ctx.db.first<{ status: string }>("SELECT status FROM users WHERE id = ?1 AND deleted_at IS NULL", userId);
  if (!target) throw new NotFoundError("User");
  if (target.status !== "ACTIVE") throw new AppError(409, "NOT_ACTIVE", "Roles can only be granted to active members.");
  if (await ctx.db.first("SELECT id FROM user_roles WHERE user_id = ?1 AND role_id = ?2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?3)", userId, role.id, nowIso())) throw new ConflictError("They already hold that role.");
  if (expiresAt && expiresAt <= nowIso()) throw new ValidationError("The end date must be in the future.", { expiresAt: "Choose a future date." });
  return [
    // A holding that has run out still counts for the one-active-holding index: close it first.
    expireRolesStmt(ctx, [userId], role.id),
    ctx.db.stmt("INSERT INTO user_roles (id, user_id, role_id, granted_by, granted_at, reason, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", newId("ur"), userId, role.id, actor.user.id, nowIso(), reason, expiresAt),
    auditStmt(ctx, { action: "role.grant", resourceType: "user", resourceId: userId, reason: viaRequest ? `${reason ?? ""} (approved request ${viaRequest})`.trim() : reason, after: { role: roleKey } }),
    ...notifyStmts(ctx, [userId], { type: "role.granted", title: `You were given the ${rc.roleKey.replace(/-/g, " ")} role`, body: reason ?? undefined, link: `/dashboard/access/${userId}` }),
  ];
}

async function roleRevokeStatements(ctx: Ctx, userRoleId: string, reason: string | null, viaRequest?: string): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const ur = await ctx.db.first<{ user_id: string; key: string }>("SELECT ur.user_id, r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.id = ?1 AND ur.revoked_at IS NULL", userRoleId);
  if (!ur) throw new NotFoundError("Role assignment");
  const { ctx: rc } = await roleContext(ctx, ur.key);
  assertCanRevokeRole(actor.subject, ur.user_id, rc);
  return [
    ctx.db.stmt("UPDATE user_roles SET revoked_at = ?2, revoked_by = ?3, reason = COALESCE(?4, reason) WHERE id = ?1 AND revoked_at IS NULL", userRoleId, nowIso(), actor.user.id, reason),
    auditStmt(ctx, { action: "role.revoke", resourceType: "user", resourceId: ur.user_id, reason: viaRequest ? `${reason ?? ""} (approved request ${viaRequest})`.trim() : reason, before: { role: ur.key } }),
  ];
}

export async function grantRole(ctx: Ctx, userId: string, roleKey: string, reason: string | null, expiresAtRaw?: string | null): Promise<GrantOutcome> {
  requirePermission(ctx, "roles.assign", { type: "user", id: userId });
  const { role } = await roleContext(ctx, roleKey);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;
  // Validate first so an impossible grant is rejected immediately, not after approval.
  await roleGrantStatements(ctx, userId, roleKey, reason, undefined, expiresAt);
  if (role.is_protected) return routeProtected(ctx, { kind: "role.grant", userId, roleKey, reason, expiresAt }, `Grant ${roleKey} role`, () => roleGrantStatements(ctx, userId, roleKey, reason, undefined, expiresAt));
  const keys = await ctx.db.all<{ key: string }>("SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?1", role.id);
  return routeSensitive(ctx, { kind: "role.grant", userId, roleKey, reason, expiresAt }, await sensitiveIn(ctx, keys.map((k) => k.key)), `Grant the ${roleKey} role`,
    () => roleGrantStatements(ctx, userId, roleKey, reason, undefined, expiresAt));
}

/**
 * Give one role to many members at once (preview, then apply). Roles with protected or sensitive
 * permissions are given one person at a time (from the profile), so each can be approved.
 */
export async function grantRoleBulk(ctx: Ctx, input: { userIds?: unknown; roleKey?: unknown; reason?: unknown; expiresAt?: unknown }, apply: boolean) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "roles.assign");
  const roleKey = String(input.roleKey ?? "");
  const { role, ctx: rc } = await roleContext(ctx, roleKey);
  const ids = [...new Set(Array.isArray(input.userIds) ? input.userIds.map(String) : [])].slice(0, 201);
  if (!ids.length) throw new ValidationError("Select at least one member.");
  if (ids.length > 200) throw new ValidationError("Select at most 200 members at a time.");
  if (role.is_protected) throw new AppError(409, "ONE_AT_A_TIME", "Moderator roles are given one person at a time.");
  const keys = await ctx.db.all<{ key: string }>("SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?1", role.id);
  const sensitive = await sensitiveIn(ctx, keys.map((k) => k.key));
  const moderator = actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject);
  if (sensitive.length && !moderator) throw new AppError(409, "ONE_AT_A_TIME", "This role includes sensitive permissions, so give it to each person from their profile; a Moderator, the President or the General Secretary approves each one.");
  const reason = String(input.reason ?? "").trim().slice(0, 300) || null;
  const expiresAt = input.expiresAt ? new Date(String(input.expiresAt)).toISOString() : null;
  if (expiresAt && expiresAt <= nowIso()) throw new ValidationError("The end date must be in the future.", { expiresAt: "Choose a future date." });
  const users = await ctx.db.all<{ id: string; name: string; status: string; holds: number }>(
    `SELECT u.id, COALESCE(p.full_name, u.email) AS name, u.status,
            EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ?2 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?3)) AS holds
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id IN (SELECT value FROM json_each(?1)) AND u.deleted_at IS NULL`,
    JSON.stringify(ids), role.id, nowIso());
  let added = 0;
  const items = users.map((u) => {
    let blocked: string | null = u.status !== "ACTIVE" ? "Account isn't active." : u.holds ? "Already has this role." : null;
    if (!blocked && role.max_holders !== null && rc.activeHolders + added >= role.max_holders) blocked = `The role allows ${role.max_holders} holder${role.max_holders === 1 ? "" : "s"}.`;
    if (!blocked) {
      try {
        assertCanGrantRole(actor.subject, u.id, rc);
      } catch (e) {
        blocked = e instanceof Error ? e.message : "Not allowed.";
      }
    }
    if (!blocked) added++;
    return { id: u.id, name: u.name, change: blocked ? null : `Gets ${role.key.replace(/-/g, " ")}`, blocked };
  });
  const ok = items.filter((i) => !i.blocked);
  const plan = { title: `Give the ${role.key.replace(/-/g, " ")} role`, items, changes: ok.length, blocked: items.length - ok.length, canApply: ok.length > 0 };
  if (!apply) return { plan, message: null as string | null };
  if (!ok.length) throw new AppError(400, "NOTHING_TO_CHANGE", "None of the selected members can get this role.");
  if (sensitive.length) await requireRecentAuth(ctx);
  const now = nowIso();
  await ctx.db.batch([
    expireRolesStmt(ctx, ok.map((i) => i.id), role.id),
    ctx.db.stmt(
      `INSERT INTO user_roles (id, user_id, role_id, granted_by, granted_at, reason, expires_at)
       SELECT 'ur_' || lower(hex(randomblob(12))), value, ?2, ?3, ?4, ?5, ?6 FROM json_each(?1) WHERE true ON CONFLICT DO NOTHING`,
      JSON.stringify(ok.map((i) => i.id)), role.id, actor.user.id, now, reason, expiresAt),
    auditStmt(ctx, { action: "role.grant_bulk", resourceType: "role", resourceId: role.id, reason, after: { role: role.key, people: ok.length, expiresAt }, decision }),
    ...auditManyStmt(ctx, ok.map((i) => ({ action: "role.grant", resourceType: "user", resourceId: i.id, reason, after: { role: role.key }, decision }))),
    ...notifyEachStmts(ctx, ok.map((i) => ({ userId: i.id, type: "role.granted", title: `You were given the ${role.key.replace(/-/g, " ")} role`, body: reason ?? undefined, link: `/dashboard/access/${i.id}` }))),
  ]);
  return { plan, message: `Gave the ${role.key.replace(/-/g, " ")} role to ${ok.length} member${ok.length === 1 ? "" : "s"}${plan.blocked ? `; ${plan.blocked} left as they were` : ""}.` };
}

export async function revokeRole(ctx: Ctx, userRoleId: string, reason: string | null) {
  requirePermission(ctx, "roles.assign");
  const ur = await ctx.db.first<{ key: string; name: string; is_protected: number; user_id: string; person: string }>(
    `SELECT r.key, r.name, r.is_protected, ur.user_id, COALESCE(p.full_name, u.email) AS person FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     JOIN users u ON u.id = ur.user_id LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE ur.id = ?1 AND ur.revoked_at IS NULL`, userRoleId);
  if (!ur) throw new NotFoundError("Role assignment");
  await roleRevokeStatements(ctx, userRoleId, reason);
  // Who and which role travel with the request, so the approver sees what they approve.
  if (ur.is_protected) return routeProtected(ctx, { kind: "role.revoke", userRoleId, reason, userId: ur.user_id, person: ur.person, roleKey: ur.key }, `Remove the ${ur.name} role from ${ur.person}`, () => roleRevokeStatements(ctx, userRoleId, reason));
  await ctx.db.batch(await roleRevokeStatements(ctx, userRoleId, reason));
  return { applied: true };
}

/** Create a system role (never protected). It starts with no permissions. */
export async function createRole(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "roles.create");
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, min: 2, max: 60, label: "Name" }),
    description: v.string("description", { max: 300, label: "Description" }),
    rank: v.int("rank", { min: 2, max: 1000, label: "Rank" }) ?? 60,
  };
  v.done();
  const key = toSlug(d.name!);
  if (!key || (await ctx.db.first("SELECT id FROM roles WHERE key = ?1", key))) throw new ConflictError("A role with that name already exists.");
  const id = `role:${key}`;
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO roles (id, key, name, description, rank, is_protected, created_at, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, ?7)",
      id, key, d.name, d.description, d.rank, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "role.create", resourceType: "role", resourceId: id, after: d, decision }),
  ]);
  return { id };
}

/**
 * Add or remove a permission on a role. Needs permissions.assign; you can only hand out what
 * you hold club-wide yourself; protected permissions and the protected (Moderator) role need
 * Moderator authority; sensitive permissions added by a non-Moderator wait for a Moderator.
 */
async function rolePermissionStatements(ctx: Ctx, roleId: string, grant: GrantInput, add: boolean, viaRequest?: string): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "permissions.assign", { type: "role", id: roleId });
  checkGrantShape(grant);
  const role = await ctx.db.first<{ key: string; name: string; is_protected: number }>("SELECT key, name, is_protected FROM roles WHERE id = ?1 AND deleted_at IS NULL", roleId);
  if (!role) throw new NotFoundError("Role");
  assertCanEditProtected(actor.subject, `The ${role.name} role`, Boolean(role.is_protected));
  const perm = await ctx.db.first<{ id: string }>("SELECT id FROM permissions WHERE key = ?1", grant.permission);
  if (!perm) throw new NotFoundError("Permission");
  if (add) assertCanGrantPermissions(actor.subject, [grant.permission]);
  return [
    add
      ? ctx.db.stmt("INSERT INTO role_permissions (role_id, permission_id, scope, scope_value, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING",
          roleId, perm.id, grant.scope, grant.scopeValue.trim(), nowIso(), actor.user.id)
      : ctx.db.stmt("DELETE FROM role_permissions WHERE role_id = ?1 AND permission_id = ?2 AND scope = ?3 AND scope_value = ?4", roleId, perm.id, grant.scope, grant.scopeValue.trim()),
    auditStmt(ctx, { action: add ? "role.grant_add" : "role.grant_remove", resourceType: "role", resourceId: roleId, after: { ...grant, role: role.name }, decision,
      reason: viaRequest ? `Approved (request ${viaRequest})` : null }),
  ];
}

export async function setRoleGrant(ctx: Ctx, roleId: string, grant: GrantInput, add: boolean): Promise<GrantOutcome> {
  const stmts = await rolePermissionStatements(ctx, roleId, grant, add);
  if (!add) {
    await ctx.db.batch(stmts);
    return { applied: true };
  }
  const role = await ctx.db.value<string>("SELECT name FROM roles WHERE id = ?1", roleId);
  return routeSensitive(ctx, { kind: "role.permission", roleId, grant }, await sensitiveIn(ctx, [grant.permission]), `Add ${grant.permission} to the ${role} role`,
    () => rolePermissionStatements(ctx, roleId, grant, add));
}

const SYSTEM_ROLE_KEYS = ["moderator", "administrator", "executive", "member"];
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Rename or recolour a role. Protected roles need Moderator authority. */
export async function updateRole(ctx: Ctx, roleId: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "roles.update", { type: "role", id: roleId });
  const before = await ctx.db.first<{ name: string; description: string | null; color: string | null; is_protected: number }>(
    "SELECT name, description, color, is_protected FROM roles WHERE id = ?1 AND deleted_at IS NULL", roleId);
  if (!before) throw new NotFoundError("Role");
  assertCanEditProtected(actor.subject, `The ${before.name} role`, Boolean(before.is_protected));
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, min: 2, max: 60, label: "Name" }),
    description: v.string("description", { max: 300, label: "Description" }),
    color: v.string("color", { max: 7, label: "Colour", pattern: COLOR_RE, patternMessage: "Use a colour like #22c55e." }),
  };
  v.done();
  const fresh = await unchangedSince(ctx, "roles", roleId, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt("UPDATE roles SET name = ?2, description = ?3, color = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?1", roleId, d.name, d.description, d.color, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "role.update", resourceType: "role", resourceId: roleId, before, after: d, decision }),
  ], () => staleAnswer(ctx, "roles", roleId));
}

/** Archive a custom role. Built-in roles stay; a role still held must be revoked first. */
export async function archiveRole(ctx: Ctx, roleId: string): Promise<void> {
  requireActor(ctx);
  const decision = requirePermission(ctx, "roles.delete", { type: "role", id: roleId });
  const role = await ctx.db.first<{ key: string; name: string; is_protected: number }>("SELECT key, name, is_protected FROM roles WHERE id = ?1 AND deleted_at IS NULL", roleId);
  if (!role) throw new NotFoundError("Role");
  if (role.is_protected || SYSTEM_ROLE_KEYS.includes(role.key)) throw new AppError(409, "SYSTEM_ROLE", `${role.name} is a built-in role and can't be archived.`);
  const holders = (await ctx.db.value<number>("SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = ?1 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))", roleId)) ?? 0;
  if (holders > 0) throw new ConflictError(`${holders} ${holders === 1 ? "person holds" : "people hold"} this role. Revoke it from them first.`);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE roles SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1", roleId, nowIso()),
    auditStmt(ctx, { action: "role.archive", resourceType: "role", resourceId: roleId, before: { name: role.name }, decision }),
  ]);
}

// ───────────────────────────── direct permission grants ─────────────────────────────

async function directGrantStatements(ctx: Ctx, userId: string, grant: GrantInput, expiresAt: string | null, reason: string | null, viaRequest?: string): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "permissions.assign", { type: "user", id: userId });
  assertNotSelf(actor.subject, userId, "permissions");
  checkGrantShape(grant);
  const perm = await ctx.db.first<{ id: string; description: string | null }>("SELECT id, description FROM permissions WHERE key = ?1", grant.permission);
  if (!perm) throw new NotFoundError("Permission");
  assertCanGrantPermissions(actor.subject, [grant.permission]);
  const target = await ctx.db.first<{ status: string }>("SELECT status FROM users WHERE id = ?1 AND deleted_at IS NULL", userId);
  if (!target) throw new NotFoundError("User");
  if (target.status !== "ACTIVE") throw new AppError(409, "NOT_ACTIVE", "Permissions can only be granted to active members.");
  if (expiresAt && expiresAt <= nowIso()) throw new ValidationError("The end date must be in the future.", { expiresAt: "Choose a future date." });
  if (await ctx.db.first("SELECT id FROM user_permissions WHERE user_id = ?1 AND permission_id = ?2 AND scope = ?3 AND scope_value = ?4 AND revoked_at IS NULL",
    userId, perm.id, grant.scope, grant.scopeValue.trim())) throw new ConflictError("They already have that permission.");
  const until = expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" })}` : "";
  return [
    ctx.db.stmt(
      "INSERT INTO user_permissions (id, user_id, permission_id, scope, scope_value, reason, expires_at, granted_by, granted_at, approval_request_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      newId("upm"), userId, perm.id, grant.scope, grant.scopeValue.trim(), reason, expiresAt, actor.user.id, nowIso(), viaRequest ?? null,
    ),
    auditStmt(ctx, { action: "permission.grant_direct", resourceType: "user", resourceId: userId, after: { ...grant, expiresAt }, reason: viaRequest ? `${reason ?? ""} (approved request ${viaRequest})`.trim() : reason, decision }),
    ...notifyStmts(ctx, [userId], { type: "permission.granted", title: `New permission: ${perm.description ?? grant.permission}${until}`, body: reason ?? undefined, link: `/dashboard/access/${userId}` }),
  ];
}

export async function grantDirectPermission(ctx: Ctx, input: Record<string, unknown>): Promise<GrantOutcome> {
  const v = new Validator(input);
  const d = {
    userId: v.string("userId", { required: true, max: 80, label: "Member" }),
    permission: v.string("permission", { required: true, max: 80, label: "Permission" }),
    scope: v.oneOf("scope", SCOPES, { label: "Scope" }) ?? "ALL",
    scopeValue: v.string("scopeValue", { max: 120, label: "Scope value" }) ?? "",
    expiresAt: v.string("expiresAt", { max: 40, label: "Until" }),
    reason: v.string("reason", { max: 300, label: "Reason" }),
  };
  v.done();
  const expiresAt = d.expiresAt ? new Date(d.expiresAt).toISOString() : null;
  const grant: GrantInput = { permission: d.permission!, scope: d.scope as Scope, scopeValue: d.scopeValue };
  await directGrantStatements(ctx, d.userId!, grant, expiresAt, d.reason ?? null); // validate now, not at approval
  return routeSensitive(ctx, { kind: "direct.grant", userId: d.userId!, grant, expiresAt, reason: d.reason ?? null }, await sensitiveIn(ctx, [grant.permission]),
    `Grant ${grant.permission} to a member`, () => directGrantStatements(ctx, d.userId!, grant, expiresAt, d.reason ?? null));
}

export async function revokeDirectPermission(ctx: Ctx, grantId: string, reason: string | null): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "permissions.assign");
  const row = await ctx.db.first<{ user_id: string; key: string; scope: string; scope_value: string }>(
    "SELECT up.user_id, p.key, up.scope, up.scope_value FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.id = ?1 AND up.revoked_at IS NULL", grantId);
  if (!row) throw new NotFoundError("Permission grant");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE user_permissions SET revoked_at = ?2, revoked_by = ?3 WHERE id = ?1 AND revoked_at IS NULL", grantId, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "permission.revoke_direct", resourceType: "user", resourceId: row.user_id, before: { permission: row.key, scope: row.scope, scopeValue: row.scope_value }, reason, decision }),
    ...notifyStmts(ctx, [row.user_id], { type: "permission.revoked", title: `A permission was removed: ${row.key}`, body: reason ?? undefined, link: `/dashboard/access/${row.user_id}` }),
  ]);
}

/**
 * "Trust this author": their own posts or events publish without approval. It is a direct,
 * optionally time-limited grant of posts.publish / events.publish on their own items.
 */
export async function trustAuthor(ctx: Ctx, input: Record<string, unknown>): Promise<GrantOutcome> {
  const kind = input.kind === "events" ? "events" : input.kind === "posts" ? "posts" : null;
  if (!kind) throw new ValidationError("Choose posts or events.");
  return grantDirectPermission(ctx, { userId: input.userId, permission: `${kind}.publish`, scope: "OWN", expiresAt: input.expiresAt, reason: input.reason ?? `Trusted to publish their own ${kind} without approval` });
}

// ───────────────────────────── permissions & positions ─────────────────────────────

export async function listPermissions(ctx: Ctx) {
  requireActor(ctx);
  return ctx.db.all<{ id: string; key: string; resource: string; action: string; description: string | null; is_sensitive: number }>(
    "SELECT id, key, resource, action, description, is_sensitive FROM permissions ORDER BY resource, action",
  );
}

export async function listPositions(ctx: Ctx) {
  requirePermission(ctx, "positions.read");
  const positions = await ctx.db.all<{ id: string; key: string; name: string; description: string | null; category: string; rank: number; parent_id: string | null; is_active: number; is_protected: number; max_holders: number | null; aliases_json: string | null; holders: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT'
                  WHERE cm.position_id = p.id AND cm.deleted_at IS NULL AND cm.is_active = 1) AS holders
     FROM positions p WHERE p.deleted_at IS NULL ORDER BY p.governance_level DESC, p.rank, p.name`,
  );
  const grants = await ctx.db.all<{ position_id: string; permission: string; scope: string; scope_value: string }>(
    "SELECT pp.position_id, p.key AS permission, pp.scope, pp.scope_value FROM position_permissions pp JOIN permissions p ON p.id = pp.permission_id ORDER BY p.key",
  );
  return positions.map((p) => ({ ...p, grants: grants.filter((g) => g.position_id === p.id) }));
}

const POSITION_CATEGORIES = ["FACULTY", "LEADERSHIP", "SECRETARIAT", "COORDINATOR", "EXECUTIVE", "OTHER"] as const;

export async function savePosition(ctx: Ctx, id: string | null, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, min: 2, max: 80, label: "Name" }),
    description: v.string("description", { max: 500, label: "Description" }),
    category: v.oneOf("category", POSITION_CATEGORIES, { required: true, label: "Category" }),
    rank: v.int("rank", { min: 0, max: 1000, label: "Display order" }),
    parentId: v.string("parentId", { max: 80 }),
    maxHolders: v.int("maxHolders", { min: 1, max: 50, label: "Maximum holders" }),
    isActive: input.isActive === undefined ? true : v.bool("isActive"),
    aliases: v.string("aliases", { max: 600, label: "Other titles" }),
    governanceLevel: v.int("governanceLevel", { min: 0, max: 100, label: "Level" }),
  };
  v.done();
  if (d.governanceLevel != null && !LEVEL_VALUES.includes(d.governanceLevel)) throw new ValidationError("Choose one of the listed levels.", { governanceLevel: "Choose a level." });
  // Only a Moderator moves a position to, or away from, President level or above. Saving other
  // details of such a position (its level unchanged) is fine for whoever may edit it.
  const moderator = holdsProtectedRole(actor.subject);
  const storedLevel = id ? await ctx.db.value<number>("SELECT governance_level FROM positions WHERE id = ?1", id) : null;
  const levelChanges = d.governanceLevel != null && d.governanceLevel !== storedLevel;
  if (levelChanges && !moderator && (d.governanceLevel! >= 90 || (storedLevel ?? 0) >= 90)) {
    throw new ValidationError("Only a Moderator, the President or the General Secretary can move a position to or from President level.", { governanceLevel: "Keep the current level." });
  }
  const now = nowIso();
  // Other titles this position appears under ("Vice President", …), one per line or comma.
  const aliases = [...new Set((d.aliases ?? "").split(/[\n,]/).map((a) => a.trim()).filter((a) => a && a.toLowerCase() !== d.name!.toLowerCase()))].slice(0, 12);
  if (d.parentId && !(await ctx.db.first("SELECT id FROM positions WHERE id = ?1 AND deleted_at IS NULL", d.parentId))) {
    throw new ValidationError("Choose an existing parent position.", { parentId: "Unknown position." });
  }
  if (!id) {
    const decision = requirePermission(ctx, "positions.create");
    const key = toSlug(d.name!);
    if (await ctx.db.first("SELECT id FROM positions WHERE key = ?1", key)) throw new ConflictError("A position with that name already exists.");
    const newIdValue = `pos:${key}`;
    // Display order defaults from the level (lower shows first); leaders rarely need to set it.
    const level = d.governanceLevel ?? defaultLevel(d.category!);
    d.rank ??= 110 - level;
    await ctx.db.batch([
      ctx.db.stmt(
        "INSERT INTO positions (id, key, name, description, category, rank, parent_id, display_order, is_active, max_holders, aliases_json, governance_level, created_at, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?8, ?9, ?12, ?13, ?10, ?10, ?11)",
        newIdValue, key, d.name, d.description, d.category, d.rank, d.parentId, d.isActive ? 1 : 0, d.maxHolders, now, actor.user.id, JSON.stringify({ aliases, pattern: null }),
        d.governanceLevel ?? defaultLevel(d.category!),
      ),
      auditStmt(ctx, { action: "position.create", resourceType: "position", resourceId: newIdValue, after: d, decision }),
    ]);
    return { id: newIdValue };
  }
  const before = await ctx.db.first<{ is_protected: number; name: string }>("SELECT is_protected, name FROM positions WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!before) throw new NotFoundError("Position");
  const decision = requirePermission(ctx, "positions.update", { type: "position", id, isProtected: Boolean(before.is_protected) });
  assertCanEditProtected(actor.subject, `The ${before.name} position`, Boolean(before.is_protected));
  if (d.parentId === id) throw new ValidationError("A position cannot be its own parent.", { parentId: "Choose a different parent." });
  // No loops: the chosen parent may not sit under this position.
  if (d.parentId && (await ctx.db.first(
    `WITH RECURSIVE up(pid, depth) AS (SELECT parent_id, 1 FROM positions WHERE id = ?1 UNION ALL SELECT p.parent_id, up.depth + 1 FROM positions p JOIN up ON p.id = up.pid WHERE up.depth < 50)
     SELECT 1 FROM up WHERE pid = ?2 LIMIT 1`, d.parentId, id))) {
    throw new ValidationError("That parent sits under this position, which would make a loop.", { parentId: "Choose a different parent." });
  }
  const fresh = await unchangedSince(ctx, "positions", id, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt(
      `UPDATE positions SET name = ?2, description = ?3, category = ?4, rank = COALESCE(?5, rank), display_order = COALESCE(?5, display_order), parent_id = ?6, is_active = ?7, max_holders = ?8, updated_at = ?9, updated_by = ?10,
         aliases_json = CASE WHEN ?11 IS NULL THEN aliases_json ELSE json_object('aliases', json(?11), 'pattern', json_extract(aliases_json, '$.pattern')) END,
         governance_level = COALESCE(?12, governance_level)
       WHERE id = ?1`,
      id, d.name, d.description, d.category, d.rank, d.parentId, d.isActive ? 1 : 0, d.maxHolders, now, actor.user.id, d.aliases == null ? null : JSON.stringify(aliases), d.governanceLevel ?? null),
    // Live listings still showing the old name follow the rename; chosen titles and past committees stay.
    ...(d.name && d.name !== before.name ? [positionRenamedStmt(ctx, id, before.name, d.name, now)] : []),
    auditStmt(ctx, { action: "position.update", resourceType: "position", resourceId: id, before, after: d, decision }),
  ], () => staleAnswer(ctx, "positions", id));
  // The recruitment form lists positions by name.
  ctx.revalidate?.(["committees", "recruitment"]);
  return { id };
}

async function positionPermissionStatements(ctx: Ctx, positionId: string, grant: GrantInput, add: boolean, viaRequest?: string): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "positions.permissions", { type: "position", id: positionId });
  checkGrantShape(grant);
  const perm = await ctx.db.first<{ id: string }>("SELECT id FROM permissions WHERE key = ?1", grant.permission);
  if (!perm) throw new NotFoundError("Permission");
  if (add) assertCanGrantPermissions(actor.subject, [grant.permission]);
  const pos = await ctx.db.first<{ is_protected: number; name: string }>("SELECT is_protected, name FROM positions WHERE id = ?1", positionId);
  if (!pos) throw new NotFoundError("Position");
  assertCanEditProtected(actor.subject, `The ${pos.name} position`, Boolean(pos.is_protected));
  return [
    add
      ? ctx.db.stmt("INSERT INTO position_permissions (position_id, permission_id, scope, scope_value, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING",
          positionId, perm.id, grant.scope, grant.scopeValue.trim(), nowIso(), actor.user.id)
      : ctx.db.stmt("DELETE FROM position_permissions WHERE position_id = ?1 AND permission_id = ?2 AND scope = ?3 AND scope_value = ?4", positionId, perm.id, grant.scope, grant.scopeValue.trim()),
    auditStmt(ctx, { action: add ? "position.grant_add" : "position.grant_remove", resourceType: "position", resourceId: positionId, after: { ...grant, position: pos.name }, decision,
      reason: viaRequest ? `Approved (request ${viaRequest})` : null }),
  ];
}

export async function setPositionGrant(ctx: Ctx, positionId: string, grant: GrantInput, add: boolean): Promise<GrantOutcome> {
  const stmts = await positionPermissionStatements(ctx, positionId, grant, add);
  if (!add) {
    await ctx.db.batch(stmts);
    return { applied: true };
  }
  const name = await ctx.db.value<string>("SELECT name FROM positions WHERE id = ?1", positionId);
  return routeSensitive(ctx, { kind: "position.permission", positionId, grant }, await sensitiveIn(ctx, [grant.permission]), `Add ${grant.permission} to the ${name} position`,
    () => positionPermissionStatements(ctx, positionId, grant, add));
}

type GrantHolder = { kind: "role" | "position"; id: string };

/**
 * Give a role or position the permissions of another role or position, in one step. Only what
 * the actor could grant one by one is copied now; sensitive permissions (which need a
 * Moderator's approval) and ones the actor doesn't hold club-wide are listed so they can be
 * added separately.
 */
export async function copyGrants(ctx: Ctx, target: GrantHolder, source: GrantHolder): Promise<{ copied: number; skipped: Array<{ permission: string; why: string }>; message: string }> {
  const actor = requireActor(ctx);
  const decision = target.kind === "role"
    ? requirePermission(ctx, "permissions.assign", { type: "role", id: target.id })
    : requirePermission(ctx, "positions.permissions", { type: "position", id: target.id });
  const holder = target.kind === "role"
    ? await ctx.db.first<{ is_protected: number; name: string }>("SELECT is_protected, name FROM roles WHERE id = ?1 AND deleted_at IS NULL", target.id)
    : await ctx.db.first<{ is_protected: number; name: string }>("SELECT is_protected, name FROM positions WHERE id = ?1 AND deleted_at IS NULL", target.id);
  if (!holder) throw new NotFoundError(target.kind === "role" ? "Role" : "Position");
  assertCanEditProtected(actor.subject, `${holder.name}`, Boolean(holder.is_protected));
  const source_sql = source.kind === "role"
    ? "SELECT rp.permission_id, p.key, rp.scope, rp.scope_value, p.is_sensitive FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?1"
    : "SELECT pp.permission_id, p.key, pp.scope, pp.scope_value, p.is_sensitive FROM position_permissions pp JOIN permissions p ON p.id = pp.permission_id WHERE pp.position_id = ?1";
  const grants = await ctx.db.all<{ permission_id: string; key: string; scope: Scope; scope_value: string; is_sensitive: number }>(source_sql, source.id);
  const moderator = actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject);
  const skipped: Array<{ permission: string; why: string }> = [];
  const copy: typeof grants = [];
  for (const g of grants) {
    if (g.key === "*") {
      skipped.push({ permission: g.key, why: "Belongs to the Moderator role only" });
      continue;
    }
    try {
      assertCanGrantPermissions(actor.subject, [g.key]);
    } catch {
      skipped.push({ permission: g.key, why: "You don't hold it club-wide" });
      continue;
    }
    if (g.is_sensitive && !moderator) {
      skipped.push({ permission: g.key, why: "Sensitive: add it on its own (it needs Moderator authority)" });
      continue;
    }
    copy.push(g);
  }
  if (copy.length > 0) {
    const table = target.kind === "role" ? "role_permissions (role_id," : "position_permissions (position_id,";
    await ctx.db.batch([
      ctx.db.stmt(
        `INSERT INTO ${table} permission_id, scope, scope_value, created_at, created_by)
         SELECT ?1, json_extract(value, '$.p'), json_extract(value, '$.s'), json_extract(value, '$.v'), ?2, ?3 FROM json_each(?4) WHERE true
         ON CONFLICT DO NOTHING`,
        target.id, nowIso(), actor.user.id, JSON.stringify(copy.map((g) => ({ p: g.permission_id, s: g.scope, v: g.scope_value }))),
      ),
      auditStmt(ctx, { action: `${target.kind}.grants_copy`, resourceType: target.kind, resourceId: target.id, after: { from: source, permissions: copy.map((g) => g.key) }, decision }),
    ]);
  }
  const message = `Copied ${copy.length} permission${copy.length === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} left out: ${skipped.map((x) => `${x.permission} (${x.why.toLowerCase()})`).join("; ")}.` : ""}`;
  return { copied: copy.length, skipped, message };
}

/** Archive a position no one holds in the current committee. History keeps its listings. */
export async function archivePosition(ctx: Ctx, positionId: string): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "positions.delete", { type: "position", id: positionId });
  const pos = await ctx.db.first<{ name: string; is_protected: number }>("SELECT name, is_protected FROM positions WHERE id = ?1 AND deleted_at IS NULL", positionId);
  if (!pos) throw new NotFoundError("Position");
  assertCanEditProtected(actor.subject, `The ${pos.name} position`, Boolean(pos.is_protected));
  const held = (await ctx.db.value<number>(
    `SELECT COUNT(*) FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.deleted_at IS NULL
     WHERE cm.position_id = ?1 AND cm.deleted_at IS NULL AND cm.end_date IS NULL
       AND ((c.status = 'CURRENT' AND cm.is_active = 1) OR c.status = 'UPCOMING')`, positionId)) ?? 0;
  // The upcoming committee counts too: its people would get no permissions once it becomes current.
  if (held > 0) throw new ConflictError(`${held} ${held === 1 ? "person holds" : "people hold"} ${pos.name} in the current or upcoming committee. Move or end their listings first.`);
  const children = (await ctx.db.value<number>("SELECT COUNT(*) FROM positions WHERE parent_id = ?1 AND deleted_at IS NULL", positionId)) ?? 0;
  if (children > 0) throw new ConflictError(`${pos.name} has ${children} position${children === 1 ? "" : "s"} under it. Move them to another parent first.`);
  // A recruitment call still offering it would silently lose it from its public form.
  const campaign = await ctx.db.first<{ title: string }>(
    "SELECT title FROM recruitment_campaigns WHERE status IN ('DRAFT','OPEN') AND EXISTS (SELECT 1 FROM json_each(positions_json) j WHERE j.value = ?1) LIMIT 1", positionId);
  if (campaign) throw new ConflictError(`The recruitment call “${campaign.title}” offers ${pos.name}. Remove it from the call (or close the call) first.`);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE positions SET deleted_at = ?2, is_active = 0, updated_at = ?2, updated_by = ?3 WHERE id = ?1", positionId, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "position.archive", resourceType: "position", resourceId: positionId, before: { name: pos.name }, decision }),
  ]);
  ctx.revalidate?.(["committees", "recruitment"]);
}

// ───────────────────────────── rules ─────────────────────────────

export interface RuleInput {
  name: string;
  description?: string;
  effect: RuleEffect;
  permission: string;
  resourceType?: string | null;
  scope: Scope;
  scopeValue?: string;
  priority?: number;
  approvalPolicyKey?: string | null;
  isProtected?: boolean;
  conditions: Array<{ field: string; operator: string; value?: unknown; group?: number }>;
}

export async function listRules(ctx: Ctx) {
  requirePermission(ctx, "rules.read");
  const rules = await ctx.db.all<{ id: string; key: string | null; name: string; description: string | null; permission_key: string; resource_type: string | null; scope: string; scope_value: string; priority: number; is_protected: number; status: string; version: number; updated_at: string; policy_key: string | null; effect: string | null; trigger: string; params_json: string | null }>(
    `SELECT r.id, r.key, r.name, r.description, r.permission_key, r.resource_type, r.scope, r.scope_value, r.priority, r.is_protected, r.status, r.version, r.updated_at, r.trigger,
            ap.key AS policy_key, (SELECT action_type FROM rule_actions a WHERE a.rule_id = r.id ORDER BY sort_order LIMIT 1) AS effect,
            (SELECT params_json FROM rule_actions a WHERE a.rule_id = r.id ORDER BY sort_order LIMIT 1) AS params_json
     FROM rules r LEFT JOIN approval_policies ap ON ap.id = r.approval_policy_id WHERE r.deleted_at IS NULL
     ORDER BY r.is_protected DESC, r.priority DESC, r.name`,
  );
  const conditions = await ctx.db.all<{ rule_id: string; field: string; operator: string; value_json: string | null; group_no: number }>(
    "SELECT rule_id, field, operator, value_json, group_no FROM rule_conditions ORDER BY rule_id, group_no, sort_order",
  );
  return rules.map((r) => ({ ...r, conditions: conditions.filter((c) => c.rule_id === r.id).map((c) => ({ field: c.field, operator: c.operator, value: c.value_json ? JSON.parse(c.value_json) : null, group: c.group_no })) }));
}

async function validateRuleInput(ctx: Ctx, input: RuleInput): Promise<void> {
  const known = (await ctx.db.all<{ key: string }>("SELECT key FROM permissions")).map((p) => p.key);
  const policies = (await ctx.db.all<{ key: string }>("SELECT key FROM approval_policies WHERE deleted_at IS NULL")).map((p) => p.key);
  const errors = validateRuleShape({
    name: input.name ?? "", permission: input.permission ?? "", effect: input.effect, scope: input.scope, scopeValue: input.scopeValue ?? "",
    approvalPolicyKey: input.approvalPolicyKey, conditions: input.conditions ?? [], knownPermissions: known, knownPolicies: policies,
  });
  for (const c of input.conditions ?? []) {
    if (!(CONDITION_FIELDS as readonly string[]).includes(c.field) && !c.field.startsWith("resource.meta.")) errors.push(`Unknown condition field "${c.field}".`);
    if (!(CONDITION_OPERATORS as readonly string[]).includes(c.operator)) errors.push(`Unknown operator "${c.operator}".`);
  }
  if (!SCOPES.includes(input.scope)) errors.push("Unknown scope.");
  if ((input.conditions ?? []).length > 10) errors.push("Use at most 10 conditions.");
  if (errors.length) throw new ValidationError(errors.join(" "));
}

function ruleRowStatements(ctx: Ctx, id: string, input: RuleInput, version: number, _policyId: string | null): D1StatementLike[] {
  const actor = requireActor(ctx);
  const now = nowIso();
  return [
    ctx.db.stmt("DELETE FROM rule_conditions WHERE rule_id = ?1", id),
    ctx.db.stmt("DELETE FROM rule_actions WHERE rule_id = ?1", id),
    ...input.conditions.map((c, i) =>
      ctx.db.stmt("INSERT INTO rule_conditions (id, rule_id, group_no, field, operator, value_json, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        `${id}:cond:${version}:${i}`, id, c.group ?? 0, c.field, c.operator, c.value === undefined || c.value === null || c.value === "" ? null : JSON.stringify(c.value), i),
    ),
    ctx.db.stmt("INSERT INTO rule_actions (id, rule_id, action_type, params_json, sort_order) VALUES (?1, ?2, ?3, ?4, 0)",
      `${id}:action:${version}`, id, input.effect, input.approvalPolicyKey ? JSON.stringify({ policy: input.approvalPolicyKey }) : null),
    ctx.db.stmt("UPDATE rules SET updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
  ];
}

export async function createRule(ctx: Ctx, input: RuleInput): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "rules.create");
  await validateRuleInput(ctx, input);
  assertCanAuthorRule(actor.subject, { effect: input.effect, permission: input.permission, isProtected: Boolean(input.isProtected), sensitive: await isSensitivePermission(ctx, input.permission) });
  const policyId = input.approvalPolicyKey ? (await loadPolicy(ctx, input.approvalPolicyKey)).id : null;
  const id = newId("rule");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO rules (id, name, description, trigger, permission_key, resource_type, scope, scope_value, priority, approval_policy_id, is_protected, status, version, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, 'AUTHORIZE', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'DRAFT', 1, ?11, ?12, ?11, ?12)`,
      id, input.name.trim(), input.description ?? null, input.permission, input.resourceType || null, input.scope, input.scopeValue ?? "", input.priority ?? 100, policyId,
      input.isProtected ? 1 : 0, now, actor.user.id,
    ),
    ...ruleRowStatements(ctx, id, input, 1, policyId),
    auditStmt(ctx, { action: "rule.create", resourceType: "rule", resourceId: id, after: input, decision }),
  ]);
  return { id };
}

export async function updateRule(ctx: Ctx, id: string, input: RuleInput): Promise<void> {
  const actor = requireActor(ctx);
  const before = await ctx.db.first<{ is_protected: number; version: number; status: string; name: string; trigger: string }>("SELECT is_protected, version, status, name, trigger FROM rules WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!before) throw new NotFoundError("Rule");
  // This editor writes access rules; saving a notification rule here would turn it into one.
  if (before.trigger !== "AUTHORIZE") throw new AppError(409, "NOTIFY_RULE", "This is a notification rule. To change it, create a new one and archive this one.");
  const decision = requirePermission(ctx, "rules.update", { type: "rule", id, isProtected: Boolean(before.is_protected) });
  assertCanEditProtected(actor.subject, `Rule "${before.name}"`, Boolean(before.is_protected));
  await validateRuleInput(ctx, input);
  assertCanAuthorRule(actor.subject, { effect: input.effect, permission: input.permission, isProtected: Boolean(before.is_protected), sensitive: await isSensitivePermission(ctx, input.permission) });
  if (before.is_protected && before.status === "ACTIVE") throw new AppError(409, "DEACTIVATE_FIRST", "Deactivate this protected rule first (another Moderator, the President or the General Secretary confirms that), then edit it.");
  const policyId = input.approvalPolicyKey ? (await loadPolicy(ctx, input.approvalPolicyKey)).id : null;
  const version = before.version + 1;
  const fresh = await unchangedSince(ctx, "rules", id, (input as RuleInput & { expectedUpdatedAt?: unknown }).expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt(
      "UPDATE rules SET name = ?2, description = ?3, permission_key = ?4, resource_type = ?5, scope = ?6, scope_value = ?7, priority = ?8, approval_policy_id = ?9, version = ?10, updated_at = ?11, updated_by = ?12, status = CASE WHEN status = 'ACTIVE' THEN 'ACTIVE' ELSE status END WHERE id = ?1",
      id, input.name.trim(), input.description ?? null, input.permission, input.resourceType || null, input.scope, input.scopeValue ?? "", input.priority ?? 100, policyId, version, nowIso(), actor.user.id,
    ),
    ...ruleRowStatements(ctx, id, input, version, policyId),
    auditStmt(ctx, { action: "rule.update", resourceType: "rule", resourceId: id, before: { version: before.version }, after: { ...input, version }, decision }),
  ], () => staleAnswer(ctx, "rules", id));
}

async function ruleStatusStatements(ctx: Ctx, id: string, status: string, viaRequest?: string): Promise<D1StatementLike[]> {
  const actor = requireActor(ctx);
  const rule = await ctx.db.first<{ is_protected: number; name: string; permission_key: string; status: string; effect: string | null }>(
    "SELECT r.is_protected, r.name, r.permission_key, r.status, (SELECT action_type FROM rule_actions a WHERE a.rule_id = r.id ORDER BY sort_order LIMIT 1) AS effect FROM rules r WHERE r.id = ?1 AND r.deleted_at IS NULL", id);
  if (!rule) throw new NotFoundError("Rule");
  assertCanEditProtected(actor.subject, `Rule "${rule.name}"`, Boolean(rule.is_protected));
  // Notification rules grant and remove nothing, so only access rules go through these checks.
  if (status === "ACTIVE" && rule.effect !== "NOTIFY") assertCanAuthorRule(actor.subject, { effect: (rule.effect ?? "DENY") as RuleEffect, permission: rule.permission_key, isProtected: Boolean(rule.is_protected), sensitive: await isSensitivePermission(ctx, rule.permission_key) });
  const now = nowIso();
  return [
    status === "ARCHIVED"
      ? ctx.db.stmt("UPDATE rules SET status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id)
      : ctx.db.stmt("UPDATE rules SET status = ?2, activated_at = CASE WHEN ?2 = 'ACTIVE' THEN ?3 ELSE activated_at END, activated_by = CASE WHEN ?2 = 'ACTIVE' THEN ?4 ELSE activated_by END, updated_at = ?3, updated_by = ?4 WHERE id = ?1",
          id, status, now, actor.user.id),
    auditStmt(ctx, { action: `rule.${status.toLowerCase()}`, resourceType: "rule", resourceId: id, before: { status: rule.status }, after: { status }, reason: viaRequest ? `Approved (request ${viaRequest})` : null }),
  ];
}

export async function setRuleStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const rule = await ctx.db.first<{ is_protected: number; name: string }>("SELECT is_protected, name FROM rules WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!rule) throw new NotFoundError("Rule");
  requirePermission(ctx, status === "ARCHIVED" ? "rules.delete" : "rules.activate", { type: "rule", id, isProtected: Boolean(rule.is_protected) });
  if (rule.is_protected && status === "ARCHIVED") throw new AppError(409, "PROTECTED", "Protected rules cannot be deleted; deactivate them instead.");
  await ruleStatusStatements(ctx, id, status);
  if (rule.is_protected) return routeProtected(ctx, { kind: "rule.status", ruleId: id, status }, `${status === "ACTIVE" ? "Activate" : "Deactivate"} protected rule "${rule.name}"`, () => ruleStatusStatements(ctx, id, status));
  await ctx.db.batch(await ruleStatusStatements(ctx, id, status));
  return { applied: true };
}

export interface NotifyRuleInput {
  name: string;
  description?: string;
  event: string;
  conditions: Array<{ field: string; operator: string; value?: unknown; group?: number }>;
  targets: NotifyTarget[];
  message?: string;
}

/**
 * A notification rule: WHEN an event happens (and the conditions hold) THEN notify the chosen
 * positions, roles or permission holders. Starts as a draft; activate it from the list.
 */
export async function createNotifyRule(ctx: Ctx, input: NotifyRuleInput): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "rules.create");
  const errors: string[] = [];
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (name.length < 3) errors.push("Give the rule a name (at least 3 characters).");
  if (!(input.event in TRIGGER_EVENTS)) errors.push("Choose when the rule runs.");
  const targets = (Array.isArray(input.targets) ? input.targets : []).filter((t) => t && ["position", "role", "permission"].includes(t.kind) && typeof t.key === "string").slice(0, 10);
  if (!targets.length) errors.push("Choose who to notify.");
  const [positions, roles, permissions] = await Promise.all([
    ctx.db.all<{ key: string }>("SELECT key FROM positions WHERE deleted_at IS NULL AND is_active = 1"),
    ctx.db.all<{ key: string }>("SELECT key FROM roles WHERE deleted_at IS NULL"),
    ctx.db.all<{ key: string }>("SELECT key FROM permissions"),
  ]);
  const known = { position: new Set(positions.map((p) => p.key)), role: new Set(roles.map((r) => r.key)), permission: new Set(permissions.map((p) => p.key)) };
  for (const t of targets) if (!known[t.kind].has(t.key)) errors.push(`Unknown ${t.kind} "${t.key}".`);
  for (const c of input.conditions ?? []) {
    if (!(CONDITION_FIELDS as readonly string[]).includes(c.field) && !c.field.startsWith("resource.meta.")) errors.push(`Unknown condition field "${c.field}".`);
    if (!(CONDITION_OPERATORS as readonly string[]).includes(c.operator)) errors.push(`Unknown operator "${c.operator}".`);
  }
  if ((input.conditions ?? []).length > 10) errors.push("Use at most 10 conditions.");
  if (errors.length) throw new ValidationError(errors.join(" "));
  const id = newId("rule");
  const now = nowIso();
  const conditions = input.conditions ?? [];
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO rules (id, name, description, trigger, permission_key, scope, scope_value, priority, is_protected, status, version, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, 'ALL', '', 0, 0, 'DRAFT', 1, ?6, ?7, ?6, ?7)`,
      id, name, input.description?.slice(0, 500) ?? null, `EVENT:${input.event}`, `event:${input.event}`, now, actor.user.id),
    ...conditions.map((c, i) =>
      ctx.db.stmt("INSERT INTO rule_conditions (id, rule_id, group_no, field, operator, value_json, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        `${id}:cond:1:${i}`, id, c.group ?? 0, c.field, c.operator, c.value === undefined || c.value === null || c.value === "" ? null : JSON.stringify(c.value), i)),
    ctx.db.stmt("INSERT INTO rule_actions (id, rule_id, action_type, params_json, sort_order) VALUES (?1, ?2, 'NOTIFY', ?3, 0)",
      `${id}:action:1`, id, JSON.stringify({ targets, message: input.message?.trim().slice(0, 500) || undefined })),
    auditStmt(ctx, { action: "rule.create", resourceType: "rule", resourceId: id, after: { name, event: input.event, targets, conditions }, decision }),
  ]);
  return { id };
}

/** Evaluate a hypothetical action for any user and return the full trace. */
export async function explainDecision(ctx: Ctx, input: { userId: string; permission: string; resource?: Resource }) {
  requirePermission(ctx, "rules.read");
  requirePermission(ctx, "users.read");
  const target = await loadActor(ctx.db, input.userId);
  if (!target) throw new NotFoundError("User");
  const decision = evaluate(target.subject, input.permission, input.resource, target.rules);
  return { decision, subject: { roles: target.subject.roles, positions: target.subject.positions.map((p) => p.key), status: target.subject.status, grants: target.subject.grants } };
}

// ───────────────────────────── policies & settings ─────────────────────────────

export async function listPolicies(ctx: Ctx) {
  requirePermission(ctx, "approvals.read");
  return ctx.db.all<{ id: string; key: string; name: string; description: string | null; mode: string; threshold: number | null; approvers_json: string; is_protected: number }>(
    "SELECT id, key, name, description, mode, threshold, approvers_json, is_protected FROM approval_policies WHERE deleted_at IS NULL ORDER BY name",
  );
}

export async function savePolicy(ctx: Ctx, id: string | null, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "approvals.policies");
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, max: 80, label: "Name" }),
    description: v.string("description", { max: 500, label: "Description" }),
    mode: v.oneOf("mode", ["ANY", "ALL", "THRESHOLD"] as const, { required: true, label: "Mode" }),
    threshold: v.int("threshold", { min: 1, max: 10, label: "Threshold" }),
  };
  let approvers: Array<{ type: string; value?: string }> = [];
  try {
    approvers = JSON.parse(String(input.approvers ?? "[]"));
  } catch {
    v.errors.approvers = "Approvers are malformed.";
  }
  v.check(Array.isArray(approvers) && approvers.length > 0 && approvers.every((a) => ["position", "role", "user", "permission"].includes(a.type) && Boolean(a.value)), "approvers", "Add at least one approver group, each with a position, role, permission or person.");
  if (d.mode === "THRESHOLD") v.check(Boolean(d.threshold), "threshold", "A threshold policy needs a number.");
  v.done();
  const now = nowIso();
  if (id) {
    const before = await ctx.db.first<{ is_protected: number; key: string }>("SELECT is_protected, key FROM approval_policies WHERE id = ?1", id);
    if (!before) throw new NotFoundError("Policy");
    assertCanEditProtected(actor.subject, "This policy", Boolean(before.is_protected));
    await ctx.db.batch([
      ctx.db.stmt("UPDATE approval_policies SET name = ?2, description = ?3, mode = ?4, threshold = ?5, approvers_json = ?6, updated_at = ?7, updated_by = ?8 WHERE id = ?1",
        id, d.name, d.description, d.mode, d.threshold, JSON.stringify(approvers), now, actor.user.id),
      auditStmt(ctx, { action: "policy.update", resourceType: "approval_policy", resourceId: id, after: { ...d, approvers }, decision }),
    ]);
    return { id };
  }
  const key = toSlug(d.name!);
  const newPolicyId = `policy:${key}`;
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO approval_policies (id, key, name, description, mode, threshold, approvers_json, created_at, created_by, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?8, ?9)",
      newPolicyId, key, d.name, d.description, d.mode, d.threshold, JSON.stringify(approvers), now, actor.user.id),
    auditStmt(ctx, { action: "policy.create", resourceType: "approval_policy", resourceId: newPolicyId, after: { ...d, approvers }, decision }),
  ]);
  return { id: newPolicyId };
}

export async function listSettings(ctx: Ctx) {
  requirePermission(ctx, "settings.manage");
  const system = await ctx.db.all<{ key: string; value_json: string; is_protected: number; description: string | null; updated_at: string }>("SELECT * FROM system_settings ORDER BY key");
  const org = await ctx.db.all<{ key: string; value_json: string; is_public: number; description: string | null; updated_at: string }>("SELECT * FROM organization_settings ORDER BY key");
  return { system, org };
}

/**
 * Allowed ranges for numeric settings. The free-tier ones can't be raised past what the free
 * plans include, so no setting can make the club pay (R2: 10 GB and 1 million writes a month;
 * SMTP2GO: 1,000 emails a month, 200 a day).
 */
export const SETTING_RANGES: Record<string, { min: number; max: number; unit?: string }> = {
  "media.storage_limit_bytes": { min: 100 * 1024 ** 2, max: Math.floor(9.5 * 1024 ** 3), unit: "bytes (at most 9.5 GiB; R2 includes 10 GB free)" },
  "media.daily_object_writes": { min: 0, max: 30_000, unit: "files a day (at most 30,000; R2 includes 1 million writes a month)" },
  "media.daily_anonymous_files": { min: 0, max: 2_000 },
  "media.max_upload_mb": { min: 1, max: 25 },
  "media.max_dimension": { min: 1000, max: 12_000 },
  "assistant.daily_limit": { min: 0, max: 1_000 },
  "email.daily_limit": { min: 0, max: 200, unit: "emails a day (the SMTP2GO free plan allows 200)" },
  "email.monthly_limit": { min: 0, max: 1_000, unit: "emails a month (the SMTP2GO free plan allows 1,000)" },
  "usage.alert_percent": { min: 10, max: 95 },
  "usage.pause_percent": { min: 50, max: 95 },
  "security.mfa_grace_days": { min: 0, max: 30 },
  "security.session_idle_days": { min: 1, max: 30 },
  "security.session_idle_hours_sensitive": { min: 1, max: 72 },
  "security.session_max_days": { min: 1, max: 90 },
  "security.reauth_minutes": { min: 1, max: 60 },
  "notifications.retention_days": { min: 30, max: 730 },
  "auth.session_days": { min: 1, max: 90 },
};

function checkSettingRange(key: string, value: unknown): void {
  const range = SETTING_RANGES[key];
  if (!range) return;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < range.min || value > range.max) {
    throw new ValidationError(`Enter a whole number from ${range.min.toLocaleString("en-US")} to ${range.max.toLocaleString("en-US")}${range.unit ? ` ${range.unit}` : ""}.`);
  }
}

export async function updateSystemSetting(ctx: Ctx, key: string, rawValue: string, expectedUpdatedAt?: string | null) {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ is_protected: number; value_json: string }>("SELECT is_protected, value_json FROM system_settings WHERE key = ?1", key);
  if (!row) throw new NotFoundError("Setting");
  // Authority before validation, so unauthorized callers learn nothing about the setting.
  requirePermission(ctx, row.is_protected ? "settings.system" : "settings.manage");
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    throw new ValidationError("Enter valid JSON (e.g. true, 30, \"text\").");
  }
  if (typeof value !== typeof JSON.parse(row.value_json)) throw new ValidationError(`This setting expects a ${typeof JSON.parse(row.value_json)}.`);
  if (key === "governance.max_moderators" && (typeof value !== "number" || value < 1 || value > 7)) throw new ValidationError("Between 1 and 7 Moderators.");
  checkSettingRange(key, value);
  // A policy name must exist now, not fail later when someone submits a post.
  if (key.endsWith("_policy") && !(await ctx.db.first("SELECT 1 FROM approval_policies WHERE key = ?1 AND deleted_at IS NULL", String(value)))) {
    throw new ValidationError(`There is no approval policy called "${String(value)}". Use one listed under Rules → Approval policies (for example "content-reviewers").`);
  }
  await requireRecentAuth(ctx);
  // Refused if someone changed this setting after the page was loaded (checked again in the batch).
  const fresh = await unchangedSince(ctx, "system_settings", key, expectedUpdatedAt);
  if (key === "email.enabled" && value === true) {
    const provider = emailProvider(ctx);
    if (!provider || provider.name === "console") throw new AppError(409, "EMAIL_NOT_CONFIGURED", "SMTP2GO isn't configured on the API yet (the SMTP2GO_API_KEY secret and the EMAIL_FROM variable).");
    if (!(await lastSuccessfulTest(ctx))) throw new AppError(409, "EMAIL_NOT_TESTED", `Send a test email from System health first and check that it arrived (a test counts for ${TEST_VALID_DAYS} days).`);
  }
  if (key.startsWith("email.")) forgetEmailSettings(ctx);
  // Switching uploads or email off only ever makes things safer: it applies at once.
  const brake = (key === "email.enabled" || key === "media.uploads_enabled") && value === false;
  if (row.is_protected && brake) {
    await batchTransition(ctx, [
      ...fresh,
      ctx.db.stmt("UPDATE system_settings SET value_json = ?2, updated_at = ?3, updated_by = ?4 WHERE key = ?1", key, JSON.stringify(value), nowIso(), actor.user.id),
      auditStmt(ctx, { action: "settings.system_update", resourceType: "system_setting", resourceId: key, before: { value: JSON.parse(row.value_json) }, after: { value } }),
    ], () => staleAnswer(ctx, "system_settings", key));
    return { applied: true };
  }
  if (row.is_protected) {
    return routeProtected(ctx, { kind: "setting.system", key, value }, `Change protected setting ${key}`, async () => [
      ...fresh,
      ctx.db.stmt("UPDATE system_settings SET value_json = ?2, updated_at = ?3, updated_by = ?4 WHERE key = ?1", key, JSON.stringify(value), nowIso(), actor.user.id),
      auditStmt(ctx, { action: "settings.system_update", resourceType: "system_setting", resourceId: key, before: { value: JSON.parse(row.value_json) }, after: { value } }),
    ]);
  }
  const decision = requirePermission(ctx, "settings.manage");
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt("UPDATE system_settings SET value_json = ?2, updated_at = ?3, updated_by = ?4 WHERE key = ?1", key, JSON.stringify(value), nowIso(), actor.user.id),
    auditStmt(ctx, { action: "settings.update", resourceType: "system_setting", resourceId: key, before: { value: JSON.parse(row.value_json) }, after: { value }, decision }),
  ], () => staleAnswer(ctx, "system_settings", key));
  return { applied: true };
}

export async function updateOrgSetting(ctx: Ctx, key: string, rawValue: string, expectedUpdatedAt?: string | null) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "settings.manage");
  const row = await ctx.db.first<{ value_json: string }>("SELECT value_json FROM organization_settings WHERE key = ?1", key);
  if (!row) throw new NotFoundError("Setting");
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    throw new ValidationError("Enter valid JSON.");
  }
  try {
    value = checkContentSetting(key, value);
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : "This content can't be shown on the site.");
  }
  const fresh = await unchangedSince(ctx, "organization_settings", key, expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt("UPDATE organization_settings SET value_json = ?2, updated_at = ?3, updated_by = ?4 WHERE key = ?1", key, JSON.stringify(value), nowIso(), actor.user.id),
    auditStmt(ctx, { action: "settings.org_update", resourceType: "organization_setting", resourceId: key, before: JSON.parse(row.value_json), after: value, decision }),
  ], () => staleAnswer(ctx, "organization_settings", key));
  ctx.revalidate?.(["settings"]);
}
