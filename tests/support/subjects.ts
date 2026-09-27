import { GRANTS_V2, POSITIONS, REVOKES_V2, ROLES, RULES } from "@/lib/governance/catalog";
import type { Grant, Rule, Subject, UserStatus } from "@/lib/governance/types";

/** Build a Subject the way the server loader does, from catalog defaults. */
export function subject(opts: {
  id?: string;
  roles?: string[];
  positions?: string[];
  status?: UserStatus;
  committeeId?: string;
}): Subject {
  const roles = [...(opts.roles ?? [])];
  const positions = (opts.positions ?? []).map((key) => ({ key, committeeId: opts.committeeId ?? "c-2026" }));
  if (positions.length > 0 && !roles.includes("executive")) roles.push("executive");
  const grants: Grant[] = [];
  for (const r of roles) {
    const def = ROLES.find((x) => x.key === r);
    for (const g of def?.grants ?? []) grants.push({ permission: g.permission, scope: g.scope ?? "ALL", scopeValue: g.scopeValue ?? "", source: `role:${r}` });
  }
  for (const p of positions) {
    const def = POSITIONS.find((x) => x.key === p.key);
    for (const g of def?.grants ?? []) grants.push({ permission: g.permission, scope: g.scope ?? "ALL", scopeValue: g.scopeValue ?? "", source: `position:${p.key}` });
  }
  // Seed migration 0004: later grants and least-privilege revocations.
  for (const g of GRANTS_V2) {
    if (g.role && roles.includes(g.role)) grants.push({ permission: g.permission, scope: g.scope ?? "ALL", scopeValue: g.scopeValue ?? "", source: `role:${g.role}` });
    if (g.position && positions.some((p) => p.key === g.position)) grants.push({ permission: g.permission, scope: g.scope ?? "ALL", scopeValue: g.scopeValue ?? "", source: `position:${g.position}` });
  }
  for (const r of REVOKES_V2) {
    for (let i = grants.length - 1; i >= 0; i--) {
      if (grants[i].source === `role:${r.role}` && grants[i].permission === r.permission && grants[i].scope === (r.scope ?? "ALL")) grants.splice(i, 1);
    }
  }
  return { userId: opts.id ?? "u-actor", status: opts.status ?? "ACTIVE", roles, positions, grants };
}

export function catalogRules(): Rule[] {
  return RULES.map((r) => ({
    id: `rule:${r.key}`,
    key: r.key,
    name: r.name,
    effect: r.effect,
    permission: r.permission,
    resourceType: r.resourceType ?? null,
    scope: r.scope ?? "ALL",
    scopeValue: r.scopeValue ?? "",
    priority: r.priority,
    isProtected: Boolean(r.isProtected),
    approvalPolicyKey: r.approvalPolicy ?? null,
    conditions: r.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value, group: c.group ?? 0 })),
  }));
}
