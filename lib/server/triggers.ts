/**
 * Notification rules: "WHEN something happens (and these conditions hold) THEN notify these
 * people". They are governance rules with trigger EVENT:<name> and a NOTIFY action, created
 * by Moderators, the President and the General Secretary at /dashboard/rules. They never grant or remove
 * access; authorization only ever reads AUTHORIZE rules (see loadRules).
 *
 * Call sites add triggerStmts() to the batch of the change they describe, so the
 * notification exists exactly when the change does.
 */
import { conditionsPass } from "../governance/conditions";
import type { Resource, RuleCondition, Subject } from "../governance/types";
import type { Ctx } from "./context";
import type { D1StatementLike } from "./db";
import { notifyStmts, usersWith, usersWithPermission } from "./notifications";

export const TRIGGER_EVENTS = {
  "event.submitted": "An event is sent for approval",
  "event.published": "An event is published",
  "post.submitted": "A post is sent for approval",
  "post.published": "A post is published",
  "member.pending": "A membership application arrives",
  "application.submitted": "A recruitment application arrives",
  "message.received": "A contact message arrives",
  "task.completed": "A task is marked done",
  "meeting.scheduled": "A meeting is scheduled",
} as const;
export type TriggerEvent = keyof typeof TRIGGER_EVENTS;

export interface NotifyTarget {
  kind: "position" | "role" | "permission";
  key: string;
}

/** At most this many rules run per event, keeping every request within D1's statement budget. */
const MAX_RULES_PER_EVENT = 5;

// Visitors (a public form) have no roles or positions; conditions on the actor simply fail.
const ANONYMOUS: Subject = { userId: "", status: "REGISTERED", roles: [], positions: [], grants: [] };

export async function triggerStmts(ctx: Ctx, event: TriggerEvent, resource: Resource, info: { title: string; link?: string }): Promise<D1StatementLike[]> {
  const rules = await ctx.db.all<{ id: string; name: string; params_json: string | null; conditions: string | null }>(
    `SELECT r.id, r.name, a.params_json,
            (SELECT json_group_array(json_object('field', c.field, 'operator', c.operator, 'value', c.value_json, 'group', c.group_no)) FROM rule_conditions c WHERE c.rule_id = r.id) AS conditions
     FROM rules r JOIN rule_actions a ON a.rule_id = r.id AND a.action_type = 'NOTIFY'
     WHERE r.status = 'ACTIVE' AND r.deleted_at IS NULL AND r.trigger = ?1 ORDER BY r.priority DESC, r.created_at LIMIT ?2`,
    `EVENT:${event}`, MAX_RULES_PER_EVENT);
  if (!rules.length) return [];
  const subject = ctx.actor?.subject ?? ANONYMOUS;
  const out: D1StatementLike[] = [];
  for (const rule of rules) {
    const conditions = (JSON.parse(rule.conditions ?? "[]") as Array<{ field: string; operator: string; value: string | null; group: number }>)
      .map((c) => ({ field: c.field, operator: c.operator, value: c.value === null ? undefined : safeParse(c.value), group: Number(c.group ?? 0) })) as RuleCondition[];
    if (!conditionsPass(conditions, subject, resource)) continue;
    const params = safeParse(rule.params_json ?? "{}") as { targets?: NotifyTarget[]; message?: string };
    const targets = Array.isArray(params.targets) ? params.targets : [];
    const ids = new Set<string>();
    const positions = targets.filter((t) => t.kind === "position").map((t) => t.key);
    const roles = targets.filter((t) => t.kind === "role").map((t) => t.key);
    if (positions.length || roles.length) (await usersWith(ctx, { positions, roles })).forEach((id) => ids.add(id));
    for (const t of targets.filter((x) => x.kind === "permission").slice(0, 3)) (await usersWithPermission(ctx, t.key)).forEach((id) => ids.add(id));
    if (ctx.actor) ids.delete(ctx.actor.user.id);
    out.push(...notifyStmts(ctx, [...ids], { type: "rule.notify", title: `${rule.name}: ${info.title}`.slice(0, 200), body: params.message, link: info.link, resourceType: resource.type, resourceId: resource.id ?? undefined }));
  }
  return out;
}

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
