import { describe, expect, it } from "vitest";
import { evaluate, heldScopes, matchesPermission, scopeSatisfied, sortRules } from "@/lib/governance/engine";
import type { Rule } from "@/lib/governance/types";
import { catalogRules, subject } from "../support/subjects";

const rules = catalogRules();
const post = (over: Record<string, unknown> = {}) => ({ type: "post", id: "p1", createdBy: "someone-else", category: "general", ...over });

describe("permission matching", () => {
  it("handles exact, wildcard and namespace patterns", () => {
    expect(matchesPermission("*", "posts.publish")).toBe(true);
    expect(matchesPermission("posts.*", "posts.publish")).toBe(true);
    expect(matchesPermission("posts.*", "postsx.publish")).toBe(false);
    expect(matchesPermission("posts.publish", "posts.update")).toBe(false);
  });
});

describe("account status gate", () => {
  it("denies every action for non-active accounts, even Moderators", () => {
    for (const status of ["PENDING_APPROVAL", "SUSPENDED", "ARCHIVED", "EMAIL_VERIFICATION_PENDING"] as const) {
      const d = evaluate(subject({ roles: ["moderator"], status }), "posts.publish", post(), rules);
      expect(d.outcome).toBe("DENY");
      expect(d.summary).toContain(status);
    }
  });
});

describe("Moderator", () => {
  const mod = subject({ roles: ["moderator"] });
  it("holds every permission including governance", () => {
    for (const p of ["governance.protected", "roles.assign", "settings.system", "audit.read", "rules.activate", "posts.publish"]) {
      expect(evaluate(mod, p, undefined, rules).outcome).toBe("ALLOW");
    }
  });
  it("cannot be restricted by an ordinary DENY rule", () => {
    const lockout: Rule = { id: "r-lockout", name: "Lock out mods", effect: "DENY", permission: "*", scope: "ALL", scopeValue: "", priority: 999, isProtected: false,
      conditions: [{ field: "actor.role", operator: "eq", value: "moderator", group: 0 }] };
    const d = evaluate(mod, "users.suspend", { type: "user", id: "u2" }, [...rules, lockout]);
    expect(d.outcome).toBe("ALLOW");
    expect(d.trace.join(" ")).toContain("only be restricted by protected rules");
  });
  it("is restricted by a protected DENY rule", () => {
    const protectedDeny: Rule = { id: "r-p", name: "Freeze", effect: "DENY", permission: "posts.delete", scope: "ALL", scopeValue: "", priority: 1, isProtected: true, conditions: [] };
    expect(evaluate(mod, "posts.delete", post(), [...rules, protectedDeny]).outcome).toBe("DENY");
  });
});

describe("President and GS", () => {
  for (const pos of ["president", "general-secretary"]) {
    const s = subject({ positions: [pos] });
    it(`${pos} runs operations`, () => {
      for (const p of ["members.approve", "events.publish", "posts.publish", "media.delete", "executives.assign", "rules.create", "approvals.decide"]) {
        expect(evaluate(s, p, { type: "x", id: "1" }, rules).outcome, p).toBe("ALLOW");
      }
    });
    it(`${pos} cannot touch protected governance`, () => {
      for (const p of ["governance.protected", "roles.assign", "roles.update", "permissions.assign", "settings.system", "approvals.policies", "positions.permissions"]) {
        const d = evaluate(s, p, undefined, rules);
        expect(d.outcome, p).toBe("DENY");
      }
    });
  }
  it("a protected deny explains itself", () => {
    const d = evaluate(subject({ positions: ["president"] }), "roles.assign", undefined, rules);
    expect(d.summary).toMatch(/protected governance rule/);
  });
});

describe("rule examples from the specification", () => {
  it("Publication Approval: the Publication Secretary's publish goes to approval", () => {
    const d = evaluate(subject({ positions: ["publication-secretary"] }), "posts.publish", post({ status: "DRAFT" }), rules);
    expect(d.outcome).toBe("REQUIRE_APPROVAL");
    expect(d.approvalPolicyKey).toBe("president-or-gs");
    expect(d.summary).toBe('You have posts.publish (via position:publication-secretary), but this action requires approval under "Publication Approval".');
  });
  it("Technical Publishing: the Programming Secretary publishes technical posts directly", () => {
    const s = subject({ positions: ["programming-secretary"] });
    expect(evaluate(s, "posts.publish", post({ category: "technical" }), rules).outcome).toBe("ALLOW");
    expect(evaluate(s, "posts.publish", post({ category: "cultural" }), rules).outcome).toBe("DENY");
  });
  it("Photography Event Media Access: only for assigned events", () => {
    const s = subject({ id: "photo", positions: ["photography-secretary"] });
    const assigned = { type: "event_media", eventId: "e1", eventAssignedUserIds: ["photo"] };
    const other = { type: "event_media", eventId: "e2", eventAssignedUserIds: ["someone"] };
    expect(evaluate(s, "media.upload", assigned, rules).outcome).toBe("ALLOW");
    expect(evaluate(s, "media.upload", other, rules).outcome).toBe("DENY");
  });
  it("Executive Event Management: coordinators edit only assigned events", () => {
    const s = subject({ id: "coord", positions: ["event-coordinator"] });
    expect(evaluate(s, "events.update", { type: "event", id: "e1", assignedUserIds: ["coord"] }, rules).outcome).toBe("ALLOW");
    const denied = evaluate(s, "events.update", { type: "event", id: "e2", assignedUserIds: [] }, rules);
    expect(denied.outcome).toBe("DENY");
    expect(denied.summary).toMatch(/only for scope ASSIGNED/);
  });
});

describe("scopes", () => {
  const s = subject({ id: "me", positions: ["executive-member"], committeeId: "c1" });
  it("OWN", () => {
    expect(evaluate(s, "posts.update", post({ createdBy: "me" }), rules).outcome).toBe("ALLOW");
    expect(evaluate(s, "posts.update", post(), rules).outcome).toBe("DENY");
  });
  it("CATEGORY accepts comma lists case-insensitively", () => {
    const sports = subject({ positions: ["sports-secretary"] });
    expect(evaluate(sports, "events.update", { type: "event", category: "Sports" }, rules).outcome).toBe("ALLOW");
    expect(evaluate(sports, "events.update", { type: "event", category: "technical" }, rules).outcome).toBe("DENY");
  });
  it("COMMITTEE matches the actor's committees", () => {
    expect(scopeSatisfied("COMMITTEE", "", s, { type: "x", committeeId: "c1" })).toBe(true);
    expect(scopeSatisfied("COMMITTEE", "", s, { type: "x", committeeId: "c2" })).toBe(false);
  });
  it("heldScopes lists every scope for list filtering", () => {
    expect(heldScopes(s, "posts.update")).toEqual([{ scope: "OWN", scopeValue: "" }]);
    expect(heldScopes(subject({ roles: ["moderator"] }), "posts.update")).toEqual([{ scope: "ALL", scopeValue: "" }]);
  });
});

describe("determinism and precedence", () => {
  const base = { permission: "events.delete", scope: "ALL" as const, scopeValue: "", conditions: [] };
  it("explicit deny overrides allow regardless of order", () => {
    const allow: Rule = { ...base, id: "a", name: "allow", effect: "ALLOW", priority: 500, isProtected: false };
    const deny: Rule = { ...base, id: "b", name: "deny", effect: "DENY", priority: 1, isProtected: false };
    const s = subject({ positions: ["president"] });
    expect(evaluate(s, "events.delete", { type: "event" }, [allow, deny]).outcome).toBe("DENY");
    expect(evaluate(s, "events.delete", { type: "event" }, [deny, allow]).outcome).toBe("DENY");
  });
  it("sorts protected, then priority, then severity, then id", () => {
    const mk = (id: string, p: number, eff: Rule["effect"], prot = false): Rule => ({ ...base, id, name: id, effect: eff, priority: p, isProtected: prot });
    const sorted = sortRules([mk("z", 1, "ALLOW"), mk("y", 5, "ALLOW"), mk("x", 5, "DENY"), mk("w", 0, "ALLOW", true)]).map((r) => r.id);
    expect(sorted).toEqual(["w", "x", "y", "z"]);
  });
  it("normal members get nothing administrative", () => {
    const m = subject({ roles: ["member"] });
    for (const p of ["posts.create", "events.create", "members.approve", "media.upload"]) {
      expect(evaluate(m, p, undefined, rules).outcome).toBe("DENY");
    }
  });
});
