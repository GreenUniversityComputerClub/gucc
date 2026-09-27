/**
 * Reusable approval policies — one implementation for posts, events,
 * announcements, governance changes and anything added later.
 *
 *   ANY        one approval from anyone matching any approver group
 *              ("President OR General Secretary", "any 1 Moderator")
 *   ALL        every approver group approves, each by a different person
 *              ("President AND General Secretary")
 *   THRESHOLD  N distinct approvers from the union of groups
 *              ("2 of 3 Moderators")
 *
 * A single REJECT from an eligible approver rejects the request; the author
 * edits and resubmits, which opens a fresh request.
 */
import type { ApprovalPolicy, ApprovalStatus, ApprovalStep, ApproverSpec, Subject } from "./types";

export interface ApprovalContext {
  requestedBy: string;
  /** Users assigned to the resource, for `{ type: "assigned" }` approvers. */
  assignedUserIds?: string[];
}

function specMatches(spec: ApproverSpec, subject: Subject, ctx: ApprovalContext): boolean {
  const v = (spec.value ?? "").toLowerCase();
  switch (spec.type) {
    case "role":
      return subject.roles.some((r) => r.toLowerCase() === v);
    case "position":
      return subject.positions.some((p) => p.key.toLowerCase() === v);
    case "user":
      return subject.userId === spec.value;
    case "assigned":
      return (ctx.assignedUserIds ?? []).includes(subject.userId);
    default:
      return false;
  }
}

/** Which approver groups this subject qualifies for. Empty = cannot decide. */
export function eligibleGroups(policy: ApprovalPolicy, subject: Subject, ctx: ApprovalContext): number[] {
  if (subject.status !== "ACTIVE") return [];
  if (!policy.allowSelfApproval && subject.userId === ctx.requestedBy) return [];
  const groups: number[] = [];
  policy.approvers.forEach((spec, i) => {
    if (specMatches(spec, subject, ctx)) groups.push(i);
  });
  return groups;
}

/**
 * Can each group be satisfied by a different approver? Small bipartite
 * matching; policies have a handful of groups so backtracking is plenty.
 */
function allGroupsCovered(groupCount: number, approvals: ApprovalStep[]): { covered: boolean; satisfied: number[] } {
  const assignment = new Map<number, string>();
  const tryAssign = (group: number, visited: Set<string>): boolean => {
    for (const step of approvals) {
      if (!step.matchedGroups.includes(group) || visited.has(step.actorId)) continue;
      visited.add(step.actorId);
      const holderGroup = [...assignment.entries()].find(([, actor]) => actor === step.actorId)?.[0];
      if (holderGroup === undefined || tryAssign(holderGroup, visited)) {
        if (holderGroup !== undefined) assignment.delete(holderGroup);
        assignment.set(group, step.actorId);
        return true;
      }
    }
    return false;
  };
  for (let g = 0; g < groupCount; g++) tryAssign(g, new Set());
  const satisfied = [...assignment.keys()].sort((a, b) => a - b);
  return { covered: satisfied.length === groupCount, satisfied };
}

export interface ApprovalEvaluation {
  status: ApprovalStatus;
  approvals: number;
  required: string;
  satisfiedGroups: number[];
}

export function describePolicy(policy: ApprovalPolicy, effectiveThreshold?: number): string {
  const names = policy.approvers.map((a) => (a.type === "assigned" ? "an assigned approver" : `${a.type} ${a.value}`));
  if (policy.mode === "ANY") return `one approval from ${names.join(" or ")}`;
  if (policy.mode === "ALL") return `approval from ${names.join(" and ")}`;
  const n = effectiveThreshold ?? policy.threshold ?? 1;
  return `${n} approval${n === 1 ? "" : "s"} from ${names.join(" / ")}`;
}

/**
 * @param effectiveThreshold lets the caller lower a THRESHOLD policy when
 *   fewer eligible approvers exist than it asks for (e.g. "2 Moderators" while
 *   only one other Moderator is appointed). Never raised above the policy.
 */
export function evaluateApproval(policy: ApprovalPolicy, steps: ApprovalStep[], effectiveThreshold?: number): ApprovalEvaluation {
  const eligible = steps.filter((s) => s.matchedGroups.length > 0);
  const approvals = eligible.filter((s) => s.decision === "APPROVE");
  const required = describePolicy(policy, effectiveThreshold);

  if (eligible.some((s) => s.decision === "REJECT")) {
    return { status: "REJECTED", approvals: approvals.length, required, satisfiedGroups: [] };
  }

  const distinct = new Map<string, ApprovalStep>();
  for (const a of approvals) distinct.set(a.actorId, a);
  const unique = [...distinct.values()];

  if (policy.mode === "ANY") {
    const satisfied = [...new Set(unique.flatMap((s) => s.matchedGroups))].sort((a, b) => a - b);
    return { status: unique.length >= 1 ? "APPROVED" : "PENDING", approvals: unique.length, required, satisfiedGroups: satisfied };
  }

  if (policy.mode === "ALL") {
    const { covered, satisfied } = allGroupsCovered(policy.approvers.length, unique);
    return { status: covered ? "APPROVED" : "PENDING", approvals: unique.length, required, satisfiedGroups: satisfied };
  }

  const configured = Math.max(1, policy.threshold ?? 1);
  const threshold = Math.max(1, Math.min(configured, effectiveThreshold ?? configured));
  const satisfied = [...new Set(unique.flatMap((s) => s.matchedGroups))].sort((a, b) => a - b);
  return { status: unique.length >= threshold ? "APPROVED" : "PENDING", approvals: unique.length, required, satisfiedGroups: satisfied };
}
