import { describe, expect, it } from "vitest";
import { eligibleGroups, evaluateApproval } from "@/lib/governance/approval";
import { APPROVAL_POLICIES } from "@/lib/governance/catalog";
import {
  GovernanceViolation,
  assertCanAuthorRule,
  assertCanGrantPermissions,
  assertCanGrantRole,
  assertCanRevokeRole,
  validateRuleShape,
} from "@/lib/governance/invariants";
import { resolvePosition } from "@/lib/governance/positions";
import { POSITIONS } from "@/lib/governance/catalog";
import type { ApprovalPolicy } from "@/lib/governance/types";
import { subject } from "../support/subjects";

const policy = (key: string): ApprovalPolicy => {
  const p = APPROVAL_POLICIES.find((x) => x.key === key)!;
  return { key: p.key, name: p.name, mode: p.mode, threshold: p.threshold ?? null, approvers: p.approvers, allowSelfApproval: false };
};
const ctx = { requestedBy: "author" };

describe("approval policies", () => {
  const president = subject({ id: "pres", positions: ["president"] });
  const gs = subject({ id: "gs", positions: ["general-secretary"] });
  const m1 = subject({ id: "m1", roles: ["moderator"] });
  const m2 = subject({ id: "m2", roles: ["moderator"] });

  it("President OR GS: either approves", () => {
    const p = policy("president-or-gs");
    expect(evaluateApproval(p, [{ actorId: "gs", decision: "APPROVE", matchedGroups: eligibleGroups(p, gs, ctx) }]).status).toBe("APPROVED");
  });
  it("President AND GS: needs both, not the same person twice", () => {
    const p = policy("president-and-gs");
    const one = [{ actorId: "pres", decision: "APPROVE" as const, matchedGroups: eligibleGroups(p, president, ctx) }];
    expect(evaluateApproval(p, one).status).toBe("PENDING");
    const both = [...one, { actorId: "gs", decision: "APPROVE" as const, matchedGroups: eligibleGroups(p, gs, ctx) }];
    expect(evaluateApproval(p, both).status).toBe("APPROVED");
    const doubleHatted = subject({ id: "dh", positions: ["president", "general-secretary"] });
    const solo = [{ actorId: "dh", decision: "APPROVE" as const, matchedGroups: eligibleGroups(p, doubleHatted, ctx) }];
    expect(solo[0].matchedGroups).toEqual([0, 1]);
    expect(evaluateApproval(p, solo).status).toBe("PENDING");
  });
  it("2 of 3 Moderators: distinct approvers, adaptive threshold", () => {
    const p = policy("two-moderators");
    const first = [{ actorId: "m1", decision: "APPROVE" as const, matchedGroups: eligibleGroups(p, m1, ctx) }];
    expect(evaluateApproval(p, first).status).toBe("PENDING");
    expect(evaluateApproval(p, [...first, { actorId: "m2", decision: "APPROVE", matchedGroups: eligibleGroups(p, m2, ctx) }]).status).toBe("APPROVED");
    expect(evaluateApproval(p, first, 1).status).toBe("APPROVED");
    expect(evaluateApproval(p, first, 5).status).toBe("PENDING");
  });
  it("one eligible rejection rejects; ineligible votes are ignored", () => {
    const p = policy("president-or-gs");
    const random = subject({ id: "r", positions: ["treasurer"] });
    expect(eligibleGroups(p, random, ctx)).toEqual([]);
    const steps = [
      { actorId: "r", decision: "REJECT" as const, matchedGroups: [] },
      { actorId: "pres", decision: "REJECT" as const, matchedGroups: eligibleGroups(p, president, ctx) },
    ];
    expect(evaluateApproval(p, steps.slice(0, 1)).status).toBe("PENDING");
    expect(evaluateApproval(p, steps).status).toBe("REJECTED");
  });
  it("authors cannot approve their own requests; inactive approvers cannot decide", () => {
    const p = policy("president-or-gs");
    expect(eligibleGroups(p, president, { requestedBy: "pres" })).toEqual([]);
    expect(eligibleGroups(p, subject({ id: "x", positions: ["president"], status: "SUSPENDED" }), ctx)).toEqual([]);
  });
});

describe("protected governance invariants", () => {
  const mod = subject({ id: "mod", roles: ["moderator"] });
  const pres = subject({ id: "pres", positions: ["president"] });
  const modRole = { roleKey: "moderator", roleIsProtected: true, roleMaxHolders: 3, configuredMax: 3 };

  const violation = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(GovernanceViolation);
      return (e as GovernanceViolation).code;
    }
    return "NONE";
  };

  it("no self-escalation", () => expect(violation(() => assertCanGrantRole(mod, "mod", { ...modRole, activeHolders: 1 }))).toBe("SELF_ESCALATION"));
  it("only Moderators grant the Moderator role", () => expect(violation(() => assertCanGrantRole(pres, "x", { ...modRole, activeHolders: 1 }))).toBe("PROTECTED_ROLE"));
  it("at most three Moderators", () => expect(violation(() => assertCanGrantRole(mod, "x", { ...modRole, activeHolders: 3 }))).toBe("ROLE_CAP"));
  it("the last Moderator cannot be removed", () => expect(violation(() => assertCanRevokeRole(mod, "mod", { ...modRole, activeHolders: 1 }))).toBe("LAST_PROTECTED_HOLDER"));
  it("President cannot remove a Moderator", () => expect(violation(() => assertCanRevokeRole(pres, "mod", { ...modRole, activeHolders: 3 }))).toBe("PROTECTED_ROLE"));
  it("a Moderator may step down when others remain", () => expect(violation(() => assertCanRevokeRole(mod, "mod", { ...modRole, activeHolders: 2 }))).toBe("NONE"));

  it("cannot grant permissions you do not hold club-wide", () => {
    const coord = subject({ positions: ["event-coordinator"] });
    expect(violation(() => assertCanGrantPermissions(coord, ["events.update"]))).toBe("ESCALATION");
    expect(violation(() => assertCanGrantPermissions(pres, ["events.update"]))).toBe("NONE");
    expect(violation(() => assertCanGrantPermissions(pres, ["audit.read"]))).toBe("ESCALATION");
    expect(violation(() => assertCanGrantPermissions(pres, ["roles.assign"]))).toBe("PROTECTED_PERMISSION");
  });

  it("rule authoring guards", () => {
    expect(violation(() => assertCanAuthorRule(pres, { effect: "ALLOW", permission: "posts.publish", isProtected: false }))).toBe("NONE");
    expect(violation(() => assertCanAuthorRule(pres, { effect: "ALLOW", permission: "audit.read", isProtected: false }))).toBe("ESCALATION");
    expect(violation(() => assertCanAuthorRule(pres, { effect: "DENY", permission: "*", isProtected: false }))).toBe("WILDCARD_RULE");
    expect(violation(() => assertCanAuthorRule(pres, { effect: "DENY", permission: "posts.publish", isProtected: true }))).toBe("PROTECTED_RULE");
    expect(violation(() => assertCanAuthorRule(mod, { effect: "DENY", permission: "*", isProtected: true }))).toBe("NONE");
  });

  it("rule shape validation", () => {
    const errs = validateRuleShape({ name: "", permission: "nope.x", effect: "REQUIRE_APPROVAL", scope: "CATEGORY", scopeValue: "", approvalPolicyKey: null,
      conditions: [{ field: "actor.position", operator: "eq", value: "" }], knownPermissions: ["posts.publish"], knownPolicies: ["president-or-gs"] });
    expect(errs).toHaveLength(5);
  });
});

describe("legacy position titles", () => {
  const cases: Array<[string, string | undefined]> = [
    ["President", "president"],
    ["Vice-President (Activity)", "vice-president-activities"],
    ["Assistant General Secretary", "joint-general-secretary"],
    ["Executive Member – 2", "executive-member"],
    ["Executive Member-7", "executive-member"],
    ["Graphics and Multimedia Coordinators -1", "graphics-multimedia-coordinator"],
    ["Chair", "chair"],
    ["Former Deputy Moderator", "deputy-moderator"],
    ["Chief Vibes Officer", undefined],
  ];
  it.each(cases)("%s → %s", (title, key) => expect(resolvePosition(title, POSITIONS)?.key).toBe(key));
});
