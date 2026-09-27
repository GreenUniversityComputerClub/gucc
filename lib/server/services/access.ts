/**
 * Read models for access management: one person's effective access, the leaders' overview
 * matrix, and who may publish without approval. Every query is set-based, so each call stays
 * within the D1 statement budget however many people there are.
 */
import { evaluate, holdsProtectedRole } from "../../governance/engine";
import type { Resource, Scope } from "../../governance/types";
import { can, eventResource, GOVERNING_UNIT_SQL, loadActor, postResource, requireActor, requirePermission, userResource } from "../authz";
import type { Ctx } from "../context";
import { nowIso } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { eligibleApprovers, loadPolicy } from "./approvals";
import { scopeOptions } from "../views/governance";

export interface EffectiveGrant {
  permission: string;
  description: string | null;
  sensitive: boolean;
  sources: Array<{ source: string; scope: Scope; scopeValue: string }>;
}

/** Everything that decides what one account may do, grouped by permission. */
export async function personAccess(ctx: Ctx, userId: string) {
  const actor = requireActor(ctx);
  // Whoever may give roles or permissions sees what the person already has.
  if (actor.user.id !== userId && !can(ctx, "roles.assign") && !can(ctx, "permissions.assign")) requirePermission(ctx, "roles.read", { type: "user", id: userId });
  const now = nowIso();
  const [user, roles, direct, positions, pending, perms] = (await ctx.db.batchAll([
    ctx.db.stmt(`SELECT u.id, u.email, u.status, p.id AS profile_id, p.full_name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
                 WHERE u.id = ?1 AND u.deleted_at IS NULL`, userId),
    ctx.db.stmt(`SELECT ur.id, r.key, r.name, r.color, r.is_protected, ur.granted_at, ur.expires_at, ur.reason, gp.full_name AS granted_by_name
                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
                 LEFT JOIN profiles gp ON gp.user_id = ur.granted_by
                 WHERE ur.user_id = ?1 AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?2) ORDER BY r.rank`, userId, now),
    ctx.db.stmt(`SELECT up.id, pm.key AS permission, pm.description, pm.is_sensitive, up.scope, up.scope_value, up.expires_at, up.reason, up.granted_at,
                        gp.full_name AS granted_by_name
                 FROM user_permissions up JOIN permissions pm ON pm.id = up.permission_id
                 LEFT JOIN profiles gp ON gp.user_id = up.granted_by
                 WHERE up.user_id = ?1 AND up.revoked_at IS NULL AND (up.expires_at IS NULL OR up.expires_at > ?2) ORDER BY up.granted_at DESC`, userId, now),
    ctx.db.stmt(`SELECT pos.name AS position, cm.position_title, c.name AS committee, cm.unit_key, CASE WHEN ${GOVERNING_UNIT_SQL} THEN 1 ELSE 0 END AS governing
                 FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id = ?1 AND pr.deleted_at IS NULL
                 JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
                 JOIN positions pos ON pos.id = cm.position_id
                 WHERE cm.deleted_at IS NULL AND cm.is_active = 1 ORDER BY pos.rank`, userId),
    ctx.db.stmt(`SELECT id, title, created_at FROM approval_requests
                 WHERE status = 'PENDING' AND action IN ('governance.sensitive_grant', 'governance.protected_change') AND instr(resource_id, ?1) > 0
                 ORDER BY created_at DESC LIMIT 10`, userId),
    ctx.db.stmt("SELECT key, description, is_sensitive FROM permissions"),
  ])) as Array<{ results?: Record<string, unknown>[] }>;
  const person = user.results?.[0] as { id: string; email: string; status: string; profile_id: string | null; name: string | null } | undefined;
  if (!person) throw new NotFoundError("Account");

  const subject = (await loadActor(ctx.db, userId))?.subject;
  const meta = new Map((perms.results ?? []).map((p) => [String(p.key), { description: (p.description as string | null) ?? null, sensitive: Boolean(p.is_sensitive) }]));
  const byPermission = new Map<string, EffectiveGrant>();
  for (const g of subject?.grants ?? []) {
    const entry = byPermission.get(g.permission) ?? { permission: g.permission, ...(meta.get(g.permission) ?? { description: null, sensitive: false }), sources: [] };
    entry.sources.push({ source: g.source ?? "", scope: g.scope, scopeValue: g.scopeValue });
    byPermission.set(g.permission, entry);
  }
  const effective = [...byPermission.values()].sort((a, b) => a.permission.localeCompare(b.permission));
  const canGrant = can(ctx, "permissions.assign");
  const canAssignRoles = can(ctx, "roles.assign");
  const grantOptions = canGrant || canAssignRoles
    ? {
        // `sensitive`: the role includes a sensitive permission, so a Moderator approves it (unless a
        // Moderator gives it) and the person must use two-factor sign-in.
        roles: await ctx.db.all<{ key: string; name: string; is_protected: number; sensitive: number }>(
          `SELECT r.key, r.name, r.is_protected,
                  EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions pm ON pm.id = rp.permission_id AND (pm.is_sensitive = 1 OR pm.key = '*') WHERE rp.role_id = r.id) AS sensitive
           FROM roles r WHERE r.deleted_at IS NULL AND r.key NOT IN ('executive', 'member') ORDER BY r.rank, r.name`),
        permissions: (perms.results ?? []).filter((p) => p.key !== "*").map((p) => ({ key: String(p.key), description: (p.description as string | null) ?? null, sensitive: Boolean(p.is_sensitive) }))
          .sort((a, b) => a.key.localeCompare(b.key)),
        scopes: await scopeOptions(ctx),
      }
    : null;
  return {
    person,
    isModerator: Boolean(subject && holdsProtectedRole(subject)),
    positions: positions.results ?? [],
    roles: roles.results ?? [],
    direct: direct.results ?? [],
    pending: pending.results ?? [],
    effective,
    canGrant,
    canAssignRoles,
    grantOptions,
  };
}

/** The permissions the overview matrix shows, in column order. */
export const MATRIX_PERMISSIONS = [
  "members.approve", "executives.assign", "events.publish", "posts.publish", "media.upload", "recruitment.manage",
  "messages.read", "lostfound.moderate", "roles.assign", "permissions.assign", "audit.read", "settings.manage", "users.reset_password",
] as const;

/**
 * People with any management access, and where each key permission comes from. Rules can
 * still narrow or widen this at decision time; the person's Access tab explains a decision.
 */
export async function accessMatrix(ctx: Ctx, opts: { q?: string } = {}) {
  requirePermission(ctx, "roles.read");
  const now = nowIso();
  const keys = JSON.stringify(MATRIX_PERMISSIONS);
  const rows = await ctx.db.all<{ user_id: string; source: string; permission: string; scope: Scope; scope_value: string }>(
    `WITH holders AS (
       SELECT DISTINCT pr.user_id FROM committee_members cm
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
       JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL AND pr.deleted_at IS NULL
       JOIN positions pos ON pos.id = cm.position_id AND pos.is_active = 1 AND pos.deleted_at IS NULL
       WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now')) AND ${GOVERNING_UNIT_SQL}
     ), grants AS (
       SELECT ur.user_id, r.name AS source, p.key AS permission, rp.scope, rp.scope_value
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
       JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > ?1)
       UNION ALL
       SELECT h.user_id, 'Executive', p.key, rp.scope, rp.scope_value
       FROM holders h JOIN role_permissions rp ON rp.role_id = 'role:executive' JOIN permissions p ON p.id = rp.permission_id
       UNION ALL
       SELECT pr.user_id, pos.name, p.key, pp.scope, pp.scope_value
       FROM committee_members cm
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' AND c.deleted_at IS NULL
       JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL AND pr.deleted_at IS NULL
       JOIN positions pos ON pos.id = cm.position_id AND pos.is_active = 1 AND pos.deleted_at IS NULL
       JOIN position_permissions pp ON pp.position_id = pos.id JOIN permissions p ON p.id = pp.permission_id
       WHERE cm.deleted_at IS NULL AND cm.is_active = 1 AND (cm.end_date IS NULL OR cm.end_date >= date('now')) AND ${GOVERNING_UNIT_SQL}
       UNION ALL
       SELECT up.user_id, 'Direct grant', p.key, up.scope, up.scope_value
       FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
       WHERE up.revoked_at IS NULL AND (up.expires_at IS NULL OR up.expires_at > ?1)
     )
     SELECT g.user_id, g.source, g.permission, g.scope, g.scope_value FROM grants g
     JOIN users u ON u.id = g.user_id AND u.deleted_at IS NULL AND u.status = 'ACTIVE'
     WHERE g.permission = '*' OR g.permission IN (SELECT value FROM json_each(?2))`,
    now, keys,
  );
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const people = ids.length
    ? await ctx.db.all<{ id: string; email: string; name: string | null }>(
        `SELECT u.id, u.email, p.full_name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
         WHERE u.id IN (SELECT value FROM json_each(?1))`, JSON.stringify(ids))
    : [];
  const q = (opts.q ?? "").trim().toLowerCase();
  const result = people
    .filter((p) => !q || (p.name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .map((p) => {
      const mine = rows.filter((r) => r.user_id === p.id);
      const everything = mine.some((r) => r.permission === "*");
      const cells = Object.fromEntries(MATRIX_PERMISSIONS.map((key) => {
        const hits = mine.filter((r) => r.permission === key);
        if (everything) return [key, { level: "ALL" as const, sources: ["Moderator"] }];
        if (hits.length === 0) return [key, null];
        const level = hits.some((h) => h.scope === "ALL") ? ("ALL" as const) : ("SCOPED" as const);
        return [key, { level, sources: [...new Set(hits.map((h) => (h.scope === "ALL" ? h.source : `${h.source} (${h.scope.toLowerCase()}${h.scope_value ? `: ${h.scope_value}` : ""})`)))] }];
      }));
      return { ...p, moderator: everything, cells };
    })
    .sort((a, b) => Number(b.moderator) - Number(a.moderator) || (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return { permissions: MATRIX_PERMISSIONS, people: result };
}

/** Who can publish posts and events without an approval step, and which rules apply. */
export async function publishersSummary(ctx: Ctx) {
  if (!can(ctx, "approvals.read")) requirePermission(ctx, "roles.read");
  const now = nowIso();
  const [positions, roles, direct, rules] = (await ctx.db.batchAll([
    ctx.db.stmt(`SELECT pos.name, p.key AS permission, pp.scope, pp.scope_value FROM position_permissions pp
                 JOIN positions pos ON pos.id = pp.position_id AND pos.deleted_at IS NULL AND pos.is_active = 1
                 JOIN permissions p ON p.id = pp.permission_id WHERE p.key IN ('posts.publish', 'events.publish') ORDER BY pos.rank`),
    ctx.db.stmt(`SELECT r.name, p.key AS permission, rp.scope, rp.scope_value FROM role_permissions rp
                 JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL JOIN permissions p ON p.id = rp.permission_id
                 WHERE p.key IN ('posts.publish', 'events.publish', '*') ORDER BY r.rank`),
    ctx.db.stmt(`SELECT up.id, up.user_id, pr.full_name AS name, u.email, p.key AS permission, up.scope, up.expires_at FROM user_permissions up
                 JOIN users u ON u.id = up.user_id JOIN permissions p ON p.id = up.permission_id LEFT JOIN profiles pr ON pr.user_id = up.user_id
                 WHERE p.key IN ('posts.publish', 'events.publish') AND up.revoked_at IS NULL AND (up.expires_at IS NULL OR up.expires_at > ?1)
                 ORDER BY up.granted_at DESC`, now),
    ctx.db.stmt(`SELECT r.id, r.key, r.name, r.description, r.status, r.permission_key, a.action_type FROM rules r JOIN rule_actions a ON a.rule_id = r.id
                 WHERE r.deleted_at IS NULL AND r.trigger = 'AUTHORIZE' AND r.permission_key IN ('posts.publish', 'events.publish') ORDER BY r.priority DESC`),
  ])) as Array<{ results?: Record<string, unknown>[] }>;
  return { positions: positions.results ?? [], roles: roles.results ?? [], trusted: direct.results ?? [], rules: rules.results ?? [] };
}

// ───────────────────────────── access simulator ─────────────────────────────

export type SimulatorResourceType = "none" | "post" | "event" | "committee" | "user";

/** Real things to test against: recent posts and events, committees, and members. */
export async function simulatorOptions(ctx: Ctx) {
  requirePermission(ctx, "rules.read");
  requirePermission(ctx, "users.read");
  const [posts, events, committees, permissions] = (await ctx.db.batchAll([
    ctx.db.stmt("SELECT id, title, type, status FROM posts WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 40"),
    ctx.db.stmt("SELECT id, title, status FROM events WHERE deleted_at IS NULL ORDER BY COALESCE(start_at, created_at) DESC LIMIT 40"),
    ctx.db.stmt("SELECT id, name, status FROM committees WHERE deleted_at IS NULL ORDER BY slug DESC LIMIT 20"),
    ctx.db.stmt("SELECT key, description, is_sensitive FROM permissions WHERE key <> '*' ORDER BY key"),
  ])) as [
    { results: Array<{ id: string; title: string; type: string; status: string }> },
    { results: Array<{ id: string; title: string; status: string }> },
    { results: Array<{ id: string; name: string; status: string }> },
    { results: Array<{ key: string; description: string | null; is_sensitive: number }> },
  ];
  return { posts: posts.results ?? [], events: events.results ?? [], committees: committees.results ?? [], permissions: permissions.results ?? [] };
}

export interface SimulationStep {
  label: string;
  detail: string;
  status: "pass" | "fail" | "info" | "wait";
}

/**
 * "Could this person do this, to this thing, right now, and why?" The same engine that decides
 * real requests, run for someone else, step by step: account status → where the permission
 * comes from (roles, positions, direct grants) → whether its scope covers the resource → rules →
 * approval policy and who could approve → the two-factor pause → the answer.
 */
export async function simulateAccess(ctx: Ctx, input: { userId: string; permission: string; resourceType?: string; resourceId?: string }) {
  requirePermission(ctx, "rules.read");
  requirePermission(ctx, "users.read");
  const target = await loadActor(ctx.db, input.userId);
  if (!target) throw new NotFoundError("Member");
  const permission = String(input.permission ?? "");
  const known = await ctx.db.first<{ key: string; is_sensitive: number; description: string | null }>("SELECT key, is_sensitive, description FROM permissions WHERE key = ?1", permission);
  if (!known) throw new ValidationError("Choose a permission from the list.");

  const type = (input.resourceType ?? "none") as SimulatorResourceType;
  let resource: Resource | undefined;
  let resourceLabel = "anything (no particular item)";
  if (type !== "none") {
    if (!input.resourceId) throw new ValidationError("Choose the item to test against.");
    if (type === "post") resource = (await postResource(ctx.db, input.resourceId)) ?? undefined;
    else if (type === "event") resource = (await eventResource(ctx.db, input.resourceId)) ?? undefined;
    else if (type === "user") resource = (await userResource(ctx.db, input.resourceId)) ?? undefined;
    else if (type === "committee") {
      const c = await ctx.db.first<{ id: string }>("SELECT id FROM committees WHERE id = ?1 AND deleted_at IS NULL", input.resourceId);
      resource = c ? { type: "committee_member", committeeId: c.id } : undefined;
    }
    if (!resource) throw new NotFoundError("Item");
    const name = await ctx.db.value<string>(
      type === "post" ? "SELECT title FROM posts WHERE id = ?1" : type === "event" ? "SELECT title FROM events WHERE id = ?1"
        : type === "committee" ? "SELECT name FROM committees WHERE id = ?1" : "SELECT COALESCE(p.full_name, u.email) FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?1",
      input.resourceId);
    resourceLabel = `${type === "committee" ? "committee" : type} “${name ?? input.resourceId}”`;
  }

  const decision = evaluate(target.subject, permission, resource, target.rules);
  const steps: SimulationStep[] = [];
  const s = target.subject;
  steps.push(s.status === "ACTIVE"
    ? { label: "Account", detail: "Active.", status: "pass" }
    : { label: "Account", detail: `${s.status.replace(/_/g, " ").toLowerCase()}: only active accounts can act.`, status: "fail" });

  const sources = s.grants.filter((g) => g.permission === permission || g.permission === "*");
  steps.push(sources.length
    ? { label: "Holds the permission through", detail: sources.map((g) => `${(g.source ?? "").replace(/^role:/, "role ").replace(/^position:/, "position ").replace(/^direct$/, "a direct grant")} (${SCOPE_WORDS[g.scope] ?? g.scope}${g.scopeValue ? `: ${g.scopeValue}` : ""})`).join("; "), status: "pass" }
    : { label: "Holds the permission through", detail: "Nothing: no role, position or direct grant gives it.", status: "fail" });

  const mfaPaused = Boolean(target.security?.mfaBlocked && known.is_sensitive);
  if (known.is_sensitive) {
    steps.push(mfaPaused
      ? { label: "Two-factor sign-in", detail: "Required for this sensitive permission and not turned on past the grace period, so it is paused until they turn it on.", status: "fail" }
      : { label: "Two-factor sign-in", detail: target.security?.mfaEnabled ? "On." : target.security?.mfaRequired ? `Not on yet; required by ${target.security.mfaDeadline?.slice(0, 10) ?? "soon"}.` : "Not required.", status: target.security?.mfaEnabled || !target.security?.mfaRequired ? "pass" : "wait" });
  }

  if (decision.matchedGrant) {
    steps.push({ label: "Scope", detail: `Covers ${resourceLabel} through ${SCOPE_WORDS[decision.matchedGrant.scope] ?? decision.matchedGrant.scope}.`, status: "pass" });
  } else if (sources.length && decision.outcome === "DENY" && s.status === "ACTIVE" && !mfaPaused) {
    steps.push({ label: "Scope", detail: `None of their grants covers ${resourceLabel}.`, status: "fail" });
  }

  for (const r of decision.matchedRules) {
    const priority = target.rules.find((x) => x.id === r.id)?.priority;
    steps.push({ label: `Rule “${r.name}”`, detail: `${r.effect === "DENY" ? "Denies" : r.effect === "REQUIRE_APPROVAL" ? "Requires approval" : "Allows"}${priority !== undefined ? ` (priority ${priority})` : ""}${r.isProtected ? ", protected" : ""}.`, status: r.effect === "DENY" ? "fail" : r.effect === "REQUIRE_APPROVAL" ? "wait" : "pass" });
  }

  let approvers: string[] = [];
  let policyName: string | null = null;
  if (decision.outcome === "REQUIRE_APPROVAL" && decision.approvalPolicyKey) {
    const { policy } = await loadPolicy(ctx, decision.approvalPolicyKey);
    policyName = policy.name;
    const ids = await eligibleApprovers(ctx, policy, input.userId, resource?.assignedUserIds ?? []);
    const names = ids.length
      ? await ctx.db.all<{ name: string }>("SELECT COALESCE(p.full_name, u.email) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id IN (SELECT value FROM json_each(?1)) ORDER BY name", JSON.stringify(ids.slice(0, 20)))
      : [];
    approvers = names.map((n) => n.name);
    steps.push({ label: "Approval", detail: `${policy.name} (${policy.mode === "ANY" ? "any one of them" : policy.mode === "ALL" ? "all of them" : `${policy.threshold} of them`}): ${approvers.length ? approvers.join(", ") : "nobody can approve right now"}.`, status: "wait" });
  }

  return {
    outcome: decision.outcome,
    summary: decision.summary,
    permission: { key: known.key, description: known.description, sensitive: Boolean(known.is_sensitive) },
    resource: resourceLabel,
    steps,
    trace: decision.trace,
    policy: policyName,
    approvers,
  };
}

const SCOPE_WORDS: Record<string, string> = {
  ALL: "everything", OWN: "their own items", ASSIGNED: "items they're assigned to", COMMITTEE: "a committee", POSITION: "a position",
  CATEGORY: "a category", EVENT: "an event",
};
