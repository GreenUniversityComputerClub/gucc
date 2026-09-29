import { beforeEach, describe, expect, it } from "vitest";
import { createPost, getPostForEdit, publishPost, updatePost } from "@/lib/server/services/posts";
import { decideApproval, listApprovals } from "@/lib/server/services/approvals";
import { createRule, explainDecision, grantRole, revokeRole, setRuleStatus, updateSystemSetting } from "@/lib/server/services/governance";
import { assignExecutive, createCommittee } from "@/lib/server/services/committees";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const status = (id: string) => (w.sqlite.prepare("SELECT status FROM posts WHERE id = ?").get(id) as { status: string }).status;

describe("publication approval workflow", () => {
  it("routes the Publication Secretary's post to President or GS and publishes on approval", async () => {
    const pub = await w.user({ email: "pub@x.bd", positions: ["publication-secretary"] });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const treasurer = await w.user({ email: "t@x.bd", positions: ["treasurer"] });

    const { id } = await createPost(await w.ctx(pub), { type: "NEWS", title: "Hackathon results", body: "We won.", category: "Club News" });
    const result = await publishPost(await w.ctx(pub), id);
    expect(result.outcome).toBe("PENDING_APPROVAL");
    expect(result.message).toContain("Publication Approval");
    expect(status(id)).toBe("PENDING_APPROVAL");

    // Duplicate submissions collapse onto the open request.
    const again = await publishPost(await w.ctx(pub), id).catch((e) => e);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM approval_requests WHERE resource_id = ?").get(id)).toEqual({ n: 1 });
    void again;

    const requestId = result.requestId!;
    await expect(decideApproval(await w.ctx(pub), requestId, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(await w.ctx(treasurer), requestId, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listApprovals(await w.ctx(gs), {})).find((r) => r.id === requestId)?.canDecide).toBe(true);

    const decided = await decideApproval(await w.ctx(gs), requestId, "APPROVE", "Looks good");
    expect(decided.status).toBe("APPROVED");
    expect(status(id)).toBe("PUBLISHED");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'approval.approved'").get(pub)).toEqual({ n: 1 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE resource_id = ? AND action = 'post.publish'").get(id)).toEqual({ n: 1 });
  });

  it("rejection needs a reason, marks the post rejected, and resubmission opens a new request", async () => {
    const pub = await w.user({ email: "pub@x.bd", positions: ["publication-secretary"] });
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createPost(await w.ctx(pub), { type: "BLOG", title: "Draft article", body: "..." });
    const { requestId } = await publishPost(await w.ctx(pub), id);
    await expect(decideApproval(await w.ctx(pres), requestId!, "REJECT", "")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await decideApproval(await w.ctx(pres), requestId!, "REJECT", "Needs sources");
    expect(status(id)).toBe("REJECTED");
    await updatePost(await w.ctx(pub), id, { title: "Draft article", body: "... with sources", changeReason: "Added sources" });
    expect(status(id)).toBe("DRAFT");
    const second = await publishPost(await w.ctx(pub), id);
    expect(second.requestId).not.toBe(requestId);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM post_revisions WHERE post_id = ?").get(id)).toEqual({ n: 2 });
  });

  it("executives and members without publish rights submit to the content reviewers; members write blog posts only", async () => {
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    const { id } = await createPost(await w.ctx(exec), { type: "BLOG", title: "My first post", body: "Hello" });
    const res = await publishPost(await w.ctx(exec), id);
    expect(res.outcome).toBe("PENDING_APPROVAL");
    const policy = w.sqlite.prepare("SELECT policy_snapshot FROM approval_requests WHERE resource_id = ?").get(id) as { policy_snapshot: string };
    expect(JSON.parse(policy.policy_snapshot).key).toBe("content-reviewers");
    await expect(createPost(await w.ctx(member), { type: "NEWS", title: "Club news", body: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    const mine = await createPost(await w.ctx(member), { type: "BLOG", title: "A member's post", body: "x" });
    expect((await publishPost(await w.ctx(member), mine.id)).outcome).toBe("PENDING_APPROVAL");
  });

  it("an executive cannot edit someone else's post (OWN scope) and gets an explanation", async () => {
    const a = await w.user({ email: "a@x.bd", positions: ["executive-member"] });
    const b = await w.user({ email: "b@x.bd", positions: ["executive-member"] });
    const { id } = await createPost(await w.ctx(a), { type: "BLOG", title: "A's post", body: "x" });
    await expect(updatePost(await w.ctx(b), id, { title: "Hijacked", body: "y" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPostForEdit(await w.ctx(b), id)).resolves.toBeTruthy(); // executives may read drafts
  });

  it("President publishes directly", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createPost(await w.ctx(pres), { type: "ANNOUNCEMENT", title: "General meeting", body: "Friday" });
    expect((await publishPost(await w.ctx(pres), id)).outcome).toBe("PUBLISHED");
  });
});

describe("dynamic rules", () => {
  it("a President-created rule changes behaviour without code changes, and can be explained", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const vpa = await w.user({ email: "v@x.bd", positions: ["vice-president-activities"] });
    const ctx = await w.ctx(pres);
    const { id: ruleId } = await createRule(ctx, {
      name: "VP Activities events need GS approval", effect: "REQUIRE_APPROVAL", permission: "events.publish", resourceType: "event",
      scope: "ALL", approvalPolicyKey: "president-or-gs", conditions: [{ field: "actor.position", operator: "eq", value: "vice-president-activities" }],
    });
    const before = await explainDecision(await w.ctx(pres), { userId: vpa, permission: "events.publish", resource: { type: "event", id: "e1" } });
    expect(before.decision.outcome).toBe("ALLOW");
    await setRuleStatus(await w.ctx(pres), ruleId, "ACTIVE");
    const after = await explainDecision(await w.ctx(pres), { userId: vpa, permission: "events.publish", resource: { type: "event", id: "e1" } });
    expect(after.decision.outcome).toBe("REQUIRE_APPROVAL");
    expect(after.decision.summary).toContain("VP Activities events need GS approval");
  });

  it("blocks privilege escalation through rules", async () => {
    // An administrator can write rules but has no Moderator authority.
    const admin = await w.user({ email: "ad@x.bd", roles: ["administrator"] });
    w.sqlite.exec("INSERT OR IGNORE INTO role_permissions (role_id, permission_id, scope, scope_value) SELECT 'role:administrator', id, 'ALL', '' FROM permissions WHERE key IN ('rules.create', 'rules.read')");
    await expect(createRule(await w.ctx(admin), { name: "Me delete", effect: "ALLOW", permission: "users.delete", scope: "ALL",
      conditions: [{ field: "actor.role", operator: "eq", value: "administrator" }] })).rejects.toMatchObject({ code: "ESCALATION" });
    await expect(createRule(await w.ctx(admin), { name: "Lock mods", effect: "DENY", permission: "*", scope: "ALL",
      conditions: [{ field: "actor.role", operator: "eq", value: "moderator" }] })).rejects.toMatchObject({ code: "WILDCARD_RULE" });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    await expect(createRule(await w.ctx(exec), { name: "x", effect: "ALLOW", permission: "posts.publish", scope: "ALL",
      conditions: [{ field: "actor.id", operator: "eq", value: exec }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("protected rules: the President (equal to a Moderator) may change them; an executive may not", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    await expect(setRuleStatus(await w.ctx(exec), "rule:protected-roles-assign", "INACTIVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await setRuleStatus(await w.ctx(pres), "rule:protected-roles-assign", "INACTIVE")).toMatchObject({ applied: true });
  });
});

describe("Moderator protection", () => {
  it("sole Moderator acts alone (audited); with two, changes need the other's approval", async () => {
    const m1 = await w.user({ email: "m1@x.bd", roles: ["moderator"] });
    const candidate = await w.user({ email: "c@x.bd", roles: ["member"] });
    const third = await w.user({ email: "c3@x.bd", roles: ["member"] });
    const res = await grantRole(await w.ctx(m1), candidate, "moderator", "Faculty advisor");
    expect(res.applied).toBe(true);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'governance.protected_applied_alone'").get()).toEqual({ n: 1 });

    const pending = await grantRole(await w.ctx(m1), third, "moderator", "Second advisor");
    expect(pending.applied).toBe(false);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id = ? AND role_id = 'role:moderator'").get(third)).toEqual({ n: 0 });
    await expect(decideApproval(await w.ctx(m1), pending.requestId!, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(await w.ctx(candidate), pending.requestId!, "APPROVE", "Agreed");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id = ? AND role_id = 'role:moderator' AND revoked_at IS NULL").get(third)).toEqual({ n: 1 });
  });

  it("caps Moderators at three and never removes the last one", async () => {
    const m1 = await w.user({ email: "m1@x.bd", roles: ["moderator"] });
    await w.user({ email: "m2@x.bd", roles: ["moderator"] });
    await w.user({ email: "m3@x.bd", roles: ["moderator"] });
    const fourth = await w.user({ email: "m4@x.bd", roles: ["member"] });
    await expect(grantRole(await w.ctx(m1), fourth, "moderator", null)).rejects.toMatchObject({ code: "ROLE_CAP" });

    const w2 = await createWorld();
    const solo = await w2.user({ email: "solo@x.bd", roles: ["moderator"] });
    const ur = w2.sqlite.prepare("SELECT id FROM user_roles WHERE user_id = ?").get(solo) as { id: string };
    await expect(revokeRole(await w2.ctx(solo), ur.id, "leaving")).rejects.toMatchObject({ code: "LAST_PROTECTED_HOLDER" });
  });

  it("nobody grants roles to themselves; the President, equal to a Moderator, can appoint one", async () => {
    const m1 = await w.user({ email: "m1@x.bd", roles: ["moderator"] });
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const other = await w.user({ email: "o@x.bd", roles: ["member"] });
    await expect(grantRole(await w.ctx(m1), m1, "administrator", null)).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    await expect(grantRole(await w.ctx(pres), pres, "moderator", null)).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    // With another Moderator appointed, the change is a protected one: that Moderator confirms it.
    expect(await grantRole(await w.ctx(pres), other, "moderator", null)).toMatchObject({ applied: false, requestId: expect.any(String) });
  });

  it("protected settings need Moderator authority", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    await expect(updateSystemSetting(await w.ctx(exec), "governance.max_moderators", "5")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSystemSetting(await w.ctx(pres), "governance.max_moderators", "10")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateSystemSetting(await w.ctx(pres), "media.max_upload_mb", "12")).resolves.toMatchObject({ applied: true });
  });
});

describe("committees and executives", () => {
  it("a new current committee archives the old one and keeps its history", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createCommittee(await w.ctx(pres), { name: "GUCC 2027", slug: "2027", termLabel: "2027", status: "CURRENT" });
    const rows = w.sqlite.prepare("SELECT id, status FROM committees ORDER BY slug").all();
    expect(rows).toEqual([{ id: w.committeeId, status: "ARCHIVED" }, { id, status: "CURRENT" }]);
    // The old committee's members remain, just inactive.
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM committee_members WHERE committee_id = ? AND is_active = 0").get(w.committeeId)).toEqual({ n: 1 });
  });

  it("enforces single-holder positions, blocks self-assignment and protected positions", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    await expect(assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "Other", positionId: "pos:president", section: "STUDENT" })).rejects.toMatchObject({ code: "CONFLICT" });
    const presProfile = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(pres) as { id: string }).id;
    await expect(assignExecutive(await w.ctx(pres), w.committeeId, { profileId: presProfile, positionId: "pos:treasurer", section: "STUDENT" })).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    // The President has the Moderators' authority, so protected positions are theirs to fill too.
    expect((await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "Dr. Y", positionId: "pos:moderator", section: "FACULTY" })).id).toBeTruthy();
    const ok = await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "New Treasurer", studentId: "241002001", positionId: "pos:treasurer", section: "STUDENT" });
    expect(ok.id).toBeTruthy();
  });

  it("assigning a position grants its permissions immediately", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const newbie = await w.user({ email: "n@x.bd", roles: ["member"] });
    const profile = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(newbie) as { id: string }).id;
    expect((await explainDecision(await w.ctx(pres), { userId: newbie, permission: "events.create", resource: { type: "event", category: "sports" } })).decision.outcome).toBe("DENY");
    await assignExecutive(await w.ctx(pres), w.committeeId, { profileId: profile, positionId: "pos:sports-secretary", section: "STUDENT" });
    const d = await explainDecision(await w.ctx(pres), { userId: newbie, permission: "events.create", resource: { type: "event", category: "sports" } });
    expect(d.decision.outcome).toBe("ALLOW");
    expect(d.subject.roles).toContain("executive");
  });
});
