/**
 * Shared types for the governance engine.
 *
 * Everything under lib/governance is pure: no database, no Cloudflare, no
 * Next.js. The server layer loads a Subject and the active Rules from D1 and
 * hands them in, which keeps every authorization decision unit-testable and
 * reproducible from an audit record.
 */

export const SCOPES = ["OWN", "ASSIGNED", "COMMITTEE", "POSITION", "CATEGORY", "EVENT", "ALL"] as const;
export type Scope = (typeof SCOPES)[number];

export const USER_STATUSES = [
  "REGISTERED",
  "EMAIL_VERIFICATION_PENDING",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "ARCHIVED",
  "REJECTED",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** A permission held through a role or a position, limited to a scope. */
export interface Grant {
  permission: string;
  scope: Scope;
  scopeValue: string;
  /** Where it came from, for explanations: "role:moderator", "position:president". */
  source: string;
}

export interface SubjectPosition {
  key: string;
  committeeId: string;
  unitKey?: string | null;
}

/** The actor being authorized, as loaded from D1 for one request. */
export interface Subject {
  userId: string;
  status: UserStatus;
  roles: string[];
  positions: SubjectPosition[];
  grants: Grant[];
}

/** What is being acted on. Only the fields relevant to the action need be set. */
export interface Resource {
  type: string;
  id?: string | null;
  ownerId?: string | null;
  createdBy?: string | null;
  category?: string | null;
  status?: string | null;
  committeeId?: string | null;
  eventId?: string | null;
  eventType?: string | null;
  /** Users assigned to this resource, e.g. an event's coordinators. */
  assignedUserIds?: string[];
  /** Users assigned to the event this resource belongs to (event media). */
  eventAssignedUserIds?: string[];
  isProtected?: boolean;
  meta?: Record<string, unknown>;
}

export const CONDITION_OPERATORS = ["eq", "neq", "in", "not_in", "exists", "not_exists", "is_true", "is_false"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CONDITION_FIELDS = [
  "actor.role",
  "actor.position",
  "actor.status",
  "actor.committee",
  "actor.id",
  "resource.type",
  "resource.category",
  "resource.status",
  "resource.event_type",
  "resource.committee",
  "resource.owner",
  "resource.creator",
  "resource.assigned",
  "resource.event_assigned",
  "resource.protected",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number] | `resource.meta.${string}`;

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value?: unknown;
  /** Conditions sharing a group are AND-ed; groups are OR-ed. */
  group: number;
}

export type RuleEffect = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface Rule {
  id: string;
  key?: string | null;
  name: string;
  effect: RuleEffect;
  /** Exact key, "resource.*", or "*". */
  permission: string;
  resourceType?: string | null;
  scope: Scope;
  scopeValue: string;
  priority: number;
  isProtected: boolean;
  conditions: RuleCondition[];
  approvalPolicyKey?: string | null;
}

export type Outcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface MatchedRule {
  id: string;
  name: string;
  effect: RuleEffect;
  isProtected: boolean;
}

export interface Decision {
  outcome: Outcome;
  permission: string;
  /** Step-by-step trace, shown to administrators on denial. */
  trace: string[];
  matchedGrant?: Grant;
  matchedRules: MatchedRule[];
  approvalPolicyKey?: string;
  approvalRuleId?: string;
  /** One sentence suitable for an error message. */
  summary: string;
}

export interface ApproverSpec {
  type: "position" | "role" | "user" | "assigned";
  value?: string;
}

export type ApprovalMode = "ANY" | "ALL" | "THRESHOLD";

export interface ApprovalPolicy {
  key: string;
  name: string;
  mode: ApprovalMode;
  threshold?: number | null;
  approvers: ApproverSpec[];
  allowSelfApproval: boolean;
}

export interface ApprovalStep {
  actorId: string;
  decision: "APPROVE" | "REJECT";
  /** Indices into policy.approvers the actor qualified for when they decided. */
  matchedGroups: number[];
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
