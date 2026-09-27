import type { ConditionField, ConditionOperator, Resource, RuleCondition, Subject } from "./types";

type Value = string | number | boolean | null | undefined | string[];

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(norm);
  if (v === undefined || v === null || v === "") return [];
  return String(v)
    .split(",")
    .map(norm)
    .filter(Boolean);
}

/** Resolve a condition field to the value it names for this actor/resource. */
export function resolveField(field: ConditionField, subject: Subject, resource?: Resource): Value {
  const uid = subject.userId;
  switch (field) {
    case "actor.role":
      return subject.roles;
    case "actor.position":
      return subject.positions.map((p) => p.key);
    case "actor.status":
      return subject.status;
    case "actor.committee":
      return subject.positions.map((p) => p.committeeId);
    case "actor.id":
      return uid;
    case "resource.type":
      return resource?.type;
    case "resource.category":
      return resource?.category ?? undefined;
    case "resource.status":
      return resource?.status ?? undefined;
    case "resource.event_type":
      return resource?.eventType ?? undefined;
    case "resource.committee":
      return resource?.committeeId ?? undefined;
    case "resource.owner":
      return resource?.ownerId === uid ? "self" : (resource?.ownerId ?? undefined);
    case "resource.creator":
      return resource?.createdBy === uid ? "self" : (resource?.createdBy ?? undefined);
    case "resource.assigned":
      return resource ? (resource.assignedUserIds ?? []).includes(uid) : undefined;
    case "resource.event_assigned":
      return resource ? (resource.eventAssignedUserIds ?? []).includes(uid) : undefined;
    case "resource.protected":
      return resource ? Boolean(resource.isProtected) : undefined;
    default: {
      if (field.startsWith("resource.meta.")) {
        const key = field.slice("resource.meta.".length);
        const raw = resource?.meta?.[key];
        return raw === undefined || raw === null ? undefined : (raw as Value);
      }
      return undefined;
    }
  }
}

/**
 * Array-valued fields (roles, positions, committees) use membership semantics:
 * `eq x` means "includes x", `in [a,b]` means "includes any of a, b".
 */
export function testCondition(operator: ConditionOperator, actual: Value, expected: unknown): boolean {
  const isArray = Array.isArray(actual);
  const actualList = isArray ? (actual as string[]).map(norm) : actual === undefined || actual === null ? [] : [norm(actual)];
  switch (operator) {
    case "eq":
      return actualList.includes(norm(expected));
    case "neq":
      return !actualList.includes(norm(expected));
    case "in": {
      const set = asList(expected);
      return actualList.some((a) => set.includes(a));
    }
    case "not_in": {
      const set = asList(expected);
      return !actualList.some((a) => set.includes(a));
    }
    case "exists":
      return actualList.length > 0 && actualList.some((a) => a !== "");
    case "not_exists":
      return actualList.length === 0 || actualList.every((a) => a === "");
    case "is_true":
      return actual === true || norm(actual) === "true";
    case "is_false":
      return actual === false || norm(actual) === "false";
    default:
      return false;
  }
}

/** Groups are OR-ed, conditions inside a group AND-ed. No conditions = always. */
export function conditionsPass(conditions: RuleCondition[], subject: Subject, resource?: Resource): boolean {
  if (conditions.length === 0) return true;
  const groups = new Map<number, RuleCondition[]>();
  for (const c of conditions) {
    const list = groups.get(c.group) ?? [];
    list.push(c);
    groups.set(c.group, list);
  }
  for (const group of groups.values()) {
    if (group.every((c) => testCondition(c.operator, resolveField(c.field, subject, resource), c.value))) return true;
  }
  return false;
}
