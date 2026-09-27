/**
 * Race-free state changes: when two leaders act on the same thing at the same moment, exactly
 * one change happens (one audit entry, one notification, one email), and the other person is
 * told who got there first.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { conflictMessage } from "@/lib/server/errors";
import { decideApproval } from "@/lib/server/services/approvals";
import { assignExecutive } from "@/lib/server/services/committees";
import { approveMember, rejectMember, suspendUser } from "@/lib/server/services/members";
import { createPost, publishPost } from "@/lib/server/services/posts";
import { assertStmt, batchTransition } from "@/lib/server/transition";
import { AppError } from "@/lib/server/errors";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const n = (sql: string, ...args: string[]) => (w.sqlite.prepare(sql).get(...args) as { n: number }).n;

describe("two leaders at once", () => {
  it("approving the same application: one approval, one notice, the other hears who did it", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"], name: "Rafi President" });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"], name: "Nadia Secretary" });
    const applicant = await w.user({ email: "new@x.bd", status: "PENDING_APPROVAL" });
    const [a, b] = [await w.ctx(pres), await w.ctx(gs)];
    const results = await Promise.allSettled([approveMember(a, applicant), approveMember(b, applicant)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "ALREADY_DONE", status: 409 });
    expect(lost.reason.message).toMatch(/^This application was just approved by (Rafi President|Nadia Secretary)\. Reload to see it\.$/);
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'member.approve' AND resource_id = ?", applicant)).toBe(1);
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'member.approved'", applicant)).toBe(1);
    expect(n("SELECT COUNT(*) n FROM user_roles WHERE user_id = ? AND role_id = 'role:member' AND revoked_at IS NULL", applicant)).toBe(1);
    // One email, not two.
    expect(w.emails.filter((e) => e.to === "new@x.bd")).toHaveLength(1);
  });

  it("approve and reject at the same moment: only one decision stands", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const applicant = await w.user({ email: "new@x.bd", status: "PENDING_APPROVAL" });
    const [a, b] = [await w.ctx(pres), await w.ctx(gs)];
    const results = await Promise.allSettled([approveMember(a, applicant), rejectMember(b, applicant, "Not a student here")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const status = (w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(applicant) as { status: string }).status;
    expect(["ACTIVE", "REJECTED"]).toContain(status);
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('member.approve', 'member.reject') AND resource_id = ?", applicant)).toBe(1);
  });

  it("suspending twice: the second is told it's already done", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const member = await w.user({ email: "x@x.bd", roles: ["member"] });
    await suspendUser(await w.ctx(mod), member, "Spam");
    await expect(suspendUser(await w.ctx(mod), member, "Spam")).rejects.toMatchObject({ code: "BAD_STATE" });
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'user.suspend'")).toBe(1);
  });

  it("deciding the same approval request: the approved change happens once", async () => {
    const pub = await w.user({ email: "pub@x.bd", positions: ["publication-secretary"] });
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const { id } = await createPost(await w.ctx(pub), { type: "NEWS", title: "Results", body: "We won.", category: "Club News" });
    const { requestId } = await publishPost(await w.ctx(pub), id);
    const [a, b] = [await w.ctx(pres), await w.ctx(gs)];
    const results = await Promise.allSettled([decideApproval(a, requestId!, "APPROVE"), decideApproval(b, requestId!, "APPROVE")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "RESOLVED" });
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'post.publish' AND resource_id = ?", id)).toBe(1);
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'approval.approved'", pub)).toBe(1);
    expect(n("SELECT COUNT(*) n FROM approval_steps WHERE request_id = ?", requestId!)).toBe(1);
  });

  it("publishing the same post twice at once: published once", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createPost(await w.ctx(pres), { type: "NEWS", title: "Results", body: "We won.", category: "Club News" });
    const [a, b] = [await w.ctx(pres), await w.ctx(pres)];
    const results = await Promise.allSettled([publishPost(a, id), publishPost(b, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'post.publish' AND resource_id = ?", id)).toBe(1);
  });

  it("appointing two Presidents at the same moment: only one is appointed", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const [a, b] = [await w.ctx(mod), await w.ctx(mod)];
    const results = await Promise.allSettled([
      assignExecutive(a, w.committeeId, { fullName: "First Person", positionId: "pos:president", section: "STUDENT" }),
      assignExecutive(b, w.committeeId, { fullName: "Second Person", positionId: "pos:president", section: "STUDENT" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect(n("SELECT COUNT(*) n FROM committee_members WHERE position_id = 'pos:president' AND deleted_at IS NULL AND end_date IS NULL")).toBe(1);
  });
});

describe("assertions", () => {
  it("abort the whole batch, so nothing before them is kept", async () => {
    const ctx = await w.ctx();
    await expect(batchTransition(ctx, [
      ctx.db.stmt("INSERT INTO rate_limits (key, window_start, count) VALUES ('before', 1, 1)"),
      assertStmt(ctx, "1 = 0"),
    ], () => new AppError(409, "LOST", "lost"))).rejects.toMatchObject({ code: "LOST" });
    expect(n("SELECT COUNT(*) n FROM rate_limits WHERE key = 'before'")).toBe(0);
    await batchTransition(ctx, [ctx.db.stmt("INSERT INTO rate_limits (key, window_start, count) VALUES ('ok', 1, 1)"), assertStmt(ctx, "1 = 1")], () => new AppError(409, "LOST", "lost"));
    expect(n("SELECT COUNT(*) n FROM rate_limits WHERE key = 'ok'")).toBe(1);
  });

  it("unique violations read as plain sentences", () => {
    expect(conflictMessage("D1_ERROR: UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT")).toBe("An account with that email already exists.");
    expect(conflictMessage("UNIQUE constraint failed: index 'committee_members_uq'")).toBe("This person already holds that position in this committee.");
    expect(conflictMessage("UNIQUE constraint failed: recruitment_applications.campaign_id, recruitment_applications.student_id")).toBe("An application with this student ID already exists for this recruitment.");
    expect(conflictMessage("UNIQUE constraint failed: event_registrations.event_id, event_registrations.email")).toBe("This person is already registered for the event.");
    expect(conflictMessage("UNIQUE constraint failed: something_new.col")).toBe("That record already exists.");
  });
});
