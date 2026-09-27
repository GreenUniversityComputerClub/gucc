/**
 * The authorization engine.
 *
 *   Permission → Scope → Rule → Approval → Decision
 *
 * Evaluation is deterministic. Given the same subject, resource and rules it
 * always returns the same decision with the same trace:
 *
 *   1. Only ACTIVE accounts are authorized for anything.
 *   2. Matching rules are ordered: protected first, then priority (high→low),
 *      then effect severity (DENY, REQUIRE_APPROVAL, ALLOW), then id.
 *   3. A protected DENY wins outright.
 *   4. Any other explicit DENY overrides every ALLOW.
 *   5. The subject needs a scoped grant, or a matching ALLOW rule.
 *   6. If a REQUIRE_APPROVAL rule matches, the action is routed to approval.
 *
 * One foundational invariant is enforced here rather than configured: holders
 * of a protected role (Moderator) can only be restricted by protected rules,
 * which only protected-governance authority may edit. Without it, anyone able
 * to write an ordinary rule could lock the Moderators out.
 */
import { conditionsPass } from "./conditions";
import type { Decision, Grant, MatchedRule, Resource, Rule, RuleEffect, Scope, Subject } from "./types";

export const PROTECTED_ROLES = ["moderator"] as const;

export function matchesPermission(pattern: string, key: string): boolean {
  if (pattern === "*") return true;
  if (pattern === key) return true;
  if (pattern.endsWith(".*")) return key.startsWith(pattern.slice(0, -1));
  return false;
}

function eqi(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

/**
 * Does the scope admit this subject acting on this resource?
 * Without a resource we are answering "could they ever?" — used to decide
 * whether to show a section at all — so every scope counts as possible.
 */
export function scopeSatisfied(scope: Scope, scopeValue: string, subject: Subject, resource?: Resource): boolean {
  if (scope === "ALL") return true;
  if (!resource) return true;
  const uid = subject.userId;
  switch (scope) {
    case "OWN":
      return resource.ownerId === uid || resource.createdBy === uid;
    case "ASSIGNED":
      return (resource.assignedUserIds ?? []).includes(uid);
    case "COMMITTEE": {
      if (!resource.committeeId) return false;
      if (scopeValue) return resource.committeeId === scopeValue;
      return subject.positions.some((p) => p.committeeId === resource.committeeId);
    }
    case "POSITION":
      return subject.positions.some((p) => eqi(p.key, scopeValue));
    case "CATEGORY": {
      if (!resource.category) return false;
      return scopeValue
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .some((v) => eqi(v, resource.category));
    }
    case "EVENT": {
      if (!scopeValue || scopeValue.toUpperCase() === "ASSIGNED") {
        if (resource.type === "event") return (resource.assignedUserIds ?? []).includes(uid);
        return (resource.eventAssignedUserIds ?? []).includes(uid);
      }
      return resource.eventId === scopeValue || (resource.type === "event" && resource.id === scopeValue);
    }
    default:
      return false;
  }
}

export function describeScope(scope: Scope, scopeValue: string): string {
  if (scope === "ALL") return "all";
  return scopeValue ? `${scope}:${scopeValue}` : scope;
}

const EFFECT_RANK: Record<RuleEffect, number> = { DENY: 0, REQUIRE_APPROVAL: 1, ALLOW: 2 };

export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort(
    (a, b) =>
      Number(b.isProtected) - Number(a.isProtected) ||
      b.priority - a.priority ||
      EFFECT_RANK[a.effect] - EFFECT_RANK[b.effect] ||
      a.id.localeCompare(b.id),
  );
}

export function holdsProtectedRole(subject: Subject): boolean {
  return subject.roles.some((r) => (PROTECTED_ROLES as readonly string[]).includes(r));
}

/**
 * The two derived memberships the services ask about. They're computed when the subject is
 * loaded (lib/server/authz.ts) from positions in the current committee, never granted by hand,
 * and kept here so no service compares role names itself (tests/unit/authorization-guard.test.ts).
 */
/** Holds a position in the club's own committee (or is a Moderator). */
export function isClubExecutive(subject: Subject): boolean {
  return subject.roles.includes("executive") || holdsProtectedRole(subject);
}

/** Holds a position only in an affiliated committee (e.g. CSS): their posts and events need approval. */
export function isAffiliateExecutive(subject: Subject): boolean {
  return subject.roles.includes("unit-executive");
}

function ruleApplies(rule: Rule, subject: Subject, permission: string, resource?: Resource): boolean {
  if (!matchesPermission(rule.permission, permission)) return false;
  if (rule.resourceType && (!resource || !eqi(rule.resourceType, resource.type))) return false;
  if (!conditionsPass(rule.conditions, subject, resource)) return false;
  return scopeSatisfied(rule.scope, rule.scopeValue, subject, resource);
}

function toMatched(rule: Rule): MatchedRule {
  return { id: rule.id, name: rule.name, effect: rule.effect, isProtected: rule.isProtected };
}

export function findGrant(subject: Subject, permission: string, resource?: Resource): Grant | undefined {
  // Prefer the broadest grant so explanations name the most useful source.
  const candidates = subject.grants.filter(
    (g) => matchesPermission(g.permission, permission) && scopeSatisfied(g.scope, g.scopeValue, subject, resource),
  );
  return candidates.sort((a, b) => Number(b.scope === "ALL") - Number(a.scope === "ALL"))[0];
}

export function evaluate(subject: Subject, permission: string, resource: Resource | undefined, rules: Rule[]): Decision {
  const trace: string[] = [];
  const target = resource ? `${resource.type}${resource.id ? `#${resource.id}` : ""}` : "any resource";
  trace.push(`Checking ${permission} on ${target}.`);

  if (subject.status !== "ACTIVE") {
    const summary = `Account status is ${subject.status}; only active accounts can perform administrative actions.`;
    trace.push(summary);
    return { outcome: "DENY", permission, trace, matchedRules: [], summary };
  }

  const immune = holdsProtectedRole(subject);
  const applicable = sortRules(rules).filter((rule) => {
    if (!ruleApplies(rule, subject, permission, resource)) return false;
    if (immune && !rule.isProtected && rule.effect !== "ALLOW") {
      trace.push(`Skipped "${rule.name}": Moderator authority can only be restricted by protected rules.`);
      return false;
    }
    return true;
  });
  const matchedRules = applicable.map(toMatched);
  for (const rule of applicable) {
    trace.push(`Rule matched: "${rule.name}" (${rule.effect}${rule.isProtected ? ", protected" : ""}, priority ${rule.priority}).`);
  }

  const protectedDeny = applicable.find((r) => r.isProtected && r.effect === "DENY");
  if (protectedDeny) {
    const summary = `Denied by protected governance rule "${protectedDeny.name}".`;
    trace.push(summary);
    return { outcome: "DENY", permission, trace, matchedRules, summary };
  }

  const deny = applicable.find((r) => r.effect === "DENY");
  if (deny) {
    const summary = `Denied by rule "${deny.name}". Explicit denials override any grant.`;
    trace.push(summary);
    return { outcome: "DENY", permission, trace, matchedRules, summary };
  }

  const grant = findGrant(subject, permission, resource);
  const allowRule = applicable.find((r) => r.effect === "ALLOW");
  if (grant) {
    trace.push(`Granted through ${grant.source} with scope ${describeScope(grant.scope, grant.scopeValue)}.`);
  } else if (allowRule) {
    trace.push(`Allowed by rule "${allowRule.name}".`);
  } else {
    const heldElsewhere = subject.grants.find((g) => matchesPermission(g.permission, permission));
    const summary = heldElsewhere
      ? `You hold ${permission} only for scope ${describeScope(heldElsewhere.scope, heldElsewhere.scopeValue)} (via ${heldElsewhere.source}), which does not cover this ${resource?.type ?? "resource"}.`
      : `No role, position or rule grants ${permission}.`;
    trace.push(summary);
    return { outcome: "DENY", permission, trace, matchedRules, summary };
  }

  const approval = applicable.find((r) => r.effect === "REQUIRE_APPROVAL");
  if (approval) {
    const via = grant ? `You have ${permission} (via ${grant.source})` : `Rule "${allowRule!.name}" allows ${permission}`;
    const summary = `${via}, but this action requires approval under "${approval.name}".`;
    trace.push(summary);
    return {
      outcome: "REQUIRE_APPROVAL",
      permission,
      trace,
      matchedGrant: grant,
      matchedRules,
      approvalPolicyKey: approval.approvalPolicyKey ?? undefined,
      approvalRuleId: approval.id,
      summary,
    };
  }

  const summary = grant
    ? `Allowed: ${permission} via ${grant.source}.`
    : `Allowed: ${permission} by rule "${allowRule!.name}".`;
  return { outcome: "ALLOW", permission, trace, matchedGrant: grant, matchedRules, summary };
}

/** Scopes through which the subject holds a permission — used to filter lists server-side. */
export function heldScopes(subject: Subject, permission: string): Array<{ scope: Scope; scopeValue: string }> {
  if (subject.status !== "ACTIVE") return [];
  const seen = new Map<string, { scope: Scope; scopeValue: string }>();
  for (const g of subject.grants) {
    if (matchesPermission(g.permission, permission)) seen.set(`${g.scope}:${g.scopeValue}`, { scope: g.scope, scopeValue: g.scopeValue });
  }
  return [...seen.values()];
}
