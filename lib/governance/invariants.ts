/**
 * Foundational security invariants.
 *
 * These are the only governance facts hard-coded on purpose. Everything else
 * (who may publish, which positions exist, what needs approval) is data. These
 * stay in code because they protect the data itself: if a configurable rule
 * could switch them off, a single compromised executive account could grant
 * itself everything.
 *
 * Each function throws GovernanceViolation with a human-readable reason and is
 * called server-side before the corresponding write, never only in the UI.
 */
import { findGrant, holdsProtectedRole, matchesPermission } from "./engine";
import type { Subject } from "./types";

export class GovernanceViolation extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GovernanceViolation";
    this.code = code;
  }
}

export const PROTECTED_PERMISSIONS = [
  "*",
  "governance.protected",
  "roles.create",
  "roles.update",
  "roles.delete",
  "roles.assign",
  "permissions.assign",
  "settings.system",
  "approvals.policies",
  "positions.permissions",
] as const;

export function isProtectedPermission(key: string): boolean {
  return (PROTECTED_PERMISSIONS as readonly string[]).some((p) => p === key || (key.endsWith(".*") && matchesPermission(key, p)));
}

function hasProtectedAuthority(actor: Subject): boolean {
  return actor.status === "ACTIVE" && holdsProtectedRole(actor);
}

/** Nobody changes their own roles, positions or permissions. */
export function assertNotSelf(actor: Subject, targetUserId: string | null | undefined, what: string): void {
  if (targetUserId && actor.userId === targetUserId) {
    throw new GovernanceViolation("SELF_ESCALATION", `You cannot change your own ${what}. Another authorized administrator must do it.`);
  }
}

export interface RoleChangeContext {
  roleKey: string;
  roleIsProtected: boolean;
  roleMaxHolders?: number | null;
  /** Active holders before the change. */
  activeHolders: number;
  /** Configured cap from system settings (governance.max_moderators) for protected roles. */
  configuredMax?: number | null;
}

export function assertCanGrantRole(actor: Subject, targetUserId: string, ctx: RoleChangeContext): void {
  assertNotSelf(actor, targetUserId, "roles");
  if (ctx.roleIsProtected && !hasProtectedAuthority(actor)) {
    throw new GovernanceViolation("PROTECTED_ROLE", `Only a Moderator can grant the ${ctx.roleKey} role.`);
  }
  const cap = ctx.roleIsProtected ? (ctx.configuredMax ?? ctx.roleMaxHolders) : ctx.roleMaxHolders;
  if (cap != null && ctx.activeHolders >= cap) {
    throw new GovernanceViolation("ROLE_CAP", `The ${ctx.roleKey} role already has ${ctx.activeHolders} of ${cap} allowed holders.`);
  }
}

export function assertCanRevokeRole(actor: Subject, targetUserId: string, ctx: RoleChangeContext): void {
  if (ctx.roleIsProtected && !hasProtectedAuthority(actor)) {
    throw new GovernanceViolation("PROTECTED_ROLE", `Only a Moderator can revoke the ${ctx.roleKey} role.`);
  }
  if (ctx.roleIsProtected && ctx.activeHolders <= 1) {
    throw new GovernanceViolation("LAST_PROTECTED_HOLDER", `The last ${ctx.roleKey} cannot be removed. Appoint another first.`);
  }
  // Revoking another person's non-protected role is fine; revoking your own is
  // allowed too (stepping down), except for the last protected holder above.
  void targetUserId;
}

/**
 * An actor may only hand out permissions they hold themselves, club-wide.
 * Protected permissions additionally need Moderator authority.
 */
export function assertCanGrantPermissions(actor: Subject, permissionKeys: string[]): void {
  for (const key of permissionKeys) {
    if (isProtectedPermission(key) && !hasProtectedAuthority(actor)) {
      throw new GovernanceViolation("PROTECTED_PERMISSION", `Only a Moderator can grant ${key}.`);
    }
    const grant = findGrant(actor, key);
    if (!grant || grant.scope !== "ALL") {
      throw new GovernanceViolation("ESCALATION", `You cannot grant ${key} because you do not hold it club-wide yourself.`);
    }
  }
}

export function assertCanEditProtected(actor: Subject, what: string, isProtected: boolean): void {
  if (isProtected && !hasProtectedAuthority(actor)) {
    throw new GovernanceViolation("PROTECTED_RESOURCE", `${what} is protected. Only a Moderator can change it.`);
  }
}

export interface RuleDraft {
  effect: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  permission: string;
  isProtected: boolean;
}

/**
 * Validates a rule before it is saved or activated.
 *  - protected rules, wildcard rules and rules touching protected permissions
 *    need Moderator authority;
 *  - an ALLOW rule cannot grant more than its author holds;
 *  - a DENY/approval rule over a sensitive permission is "dangerous" and also
 *    needs Moderator authority.
 */
export function assertCanAuthorRule(actor: Subject, draft: RuleDraft): void {
  const protectedAuthority = hasProtectedAuthority(actor);
  if (draft.isProtected && !protectedAuthority) {
    throw new GovernanceViolation("PROTECTED_RULE", "Only a Moderator can create or edit protected rules.");
  }
  if (draft.permission === "*" && !protectedAuthority) {
    throw new GovernanceViolation("WILDCARD_RULE", "Rules that apply to every permission need Moderator authority.");
  }
  if (isProtectedPermission(draft.permission) && !protectedAuthority) {
    throw new GovernanceViolation("PROTECTED_PERMISSION", `Rules over ${draft.permission} need Moderator authority.`);
  }
  if (draft.effect === "ALLOW" && !protectedAuthority) {
    const keys = draft.permission.endsWith(".*") ? [draft.permission] : [draft.permission];
    for (const key of keys) {
      const grant = findGrant(actor, key);
      if (!grant || grant.scope !== "ALL") {
        throw new GovernanceViolation("ESCALATION", `An ALLOW rule for ${key} would grant more than you hold yourself.`);
      }
    }
  }
}

/** Validation errors for a rule's shape; empty when valid. */
export function validateRuleShape(input: {
  name: string;
  permission: string;
  effect: string;
  scope: string;
  scopeValue: string;
  approvalPolicyKey?: string | null;
  conditions: Array<{ field: string; operator: string; value?: unknown }>;
  knownPermissions: string[];
  knownPolicies: string[];
}): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Give the rule a name.");
  const permOk =
    input.permission === "*" ||
    input.knownPermissions.includes(input.permission) ||
    (input.permission.endsWith(".*") && input.knownPermissions.some((k) => k.startsWith(input.permission.slice(0, -1))));
  if (!permOk) errors.push(`Unknown permission "${input.permission}".`);
  if (!["ALLOW", "DENY", "REQUIRE_APPROVAL"].includes(input.effect)) errors.push("Choose an action: allow, deny or require approval.");
  if (input.effect === "REQUIRE_APPROVAL" && (!input.approvalPolicyKey || !input.knownPolicies.includes(input.approvalPolicyKey))) {
    errors.push("A rule that requires approval must name an existing approval policy.");
  }
  if (["CATEGORY", "POSITION"].includes(input.scope) && !input.scopeValue.trim()) {
    errors.push(`Scope ${input.scope} needs a value.`);
  }
  if (input.conditions.length === 0 && input.effect !== "DENY") {
    errors.push("Add at least one condition, otherwise the rule applies to everyone.");
  }
  for (const c of input.conditions) {
    if (["eq", "neq", "in", "not_in"].includes(c.operator)) {
      const v = c.value;
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) errors.push(`Condition on ${c.field} needs a value.`);
    }
  }
  return errors;
}
