/**
 * The club's leadership looking after accounts (round 9): deleting an account, bulk-deleting
 * applications, and changing someone's sign-in email. Moderators, the President and the General
 * Secretary have the same power; changes to one of them need another of them to approve.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { bulkDeleteApplications, changeMemberEmail, deleteMemberAccount } from "@/lib/server/services/accounts-admin";
import { decideApproval } from "@/lib/server/services/approvals";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const row = <T>(sql: string, ...args: unknown[]) => w.sqlite.prepare(sql).get(...(args as never[])) as T;

describe("deleting accounts", () => {
  it("the President, the General Secretary and a Moderator may delete a member's account; a member may not", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const president = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"], name: "Plain Member" });
    const victims = await Promise.all([1, 2, 3].map((i) => w.user({ email: `v${i}@x.bd`, roles: ["member"], name: `Victim ${i}` })));
    await expect(deleteMemberAccount(await w.ctx(member), victims[0]!, { reason: "spam", confirmName: "Victim 1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const [i, leader] of [mod, president, gs].entries()) {
      const r = await deleteMemberAccount(await w.ctx(leader), victims[i]!, { reason: "Asked to leave the club", confirmName: `Victim ${i + 1}` });
      expect(r.deleted).toBe(true);
      expect(row<{ status: string; deleted_at: string | null; email: string }>("SELECT status, deleted_at, email FROM users WHERE id = ?", victims[i])).toMatchObject({ status: "ARCHIVED", email: `deleted+${victims[i]}@invalid` });
    }
    // The person is told at their old address, and the deletion is in the activity log.
    expect(w.emails.filter((e) => e.subject === "Your GUCC account was closed").map((e) => e.to).sort()).toEqual(["v1@x.bd", "v2@x.bd", "v3@x.bd"]);
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM audit_logs WHERE action = 'account.delete'").n).toBe(3);
  });

  it("asks for the name, a reason, and never deletes yourself this way", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const v = await w.user({ email: "v@x.bd", roles: ["member"], name: "Rafi Ahmed" });
    await expect(deleteMemberAccount(await w.ctx(mod), v, { reason: "spam", confirmName: "Rafi" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteMemberAccount(await w.ctx(mod), v, { reason: "", confirmName: "Rafi Ahmed" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteMemberAccount(await w.ctx(mod), mod, { reason: "bye", confirmName: "mod" })).rejects.toMatchObject({ code: "VALIDATION" });
    // The email works as the confirmation too.
    await expect(deleteMemberAccount(await w.ctx(mod), v, { reason: "spam", confirmName: "V@X.BD" })).resolves.toMatchObject({ deleted: true });
  });

  it("an account with Moderator authority needs another leader's approval, which the person can't give", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const mod2 = await w.user({ email: "mod2@x.bd", roles: ["moderator"] });
    const president = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"], name: "The President" });
    const r = await deleteMemberAccount(await w.ctx(mod), president, { reason: "Left the university", confirmName: "The President" });
    expect(r).toMatchObject({ deleted: false });
    expect(row<{ status: string }>("SELECT status FROM users WHERE id = ?", president).status).toBe("ACTIVE");
    // The President can't approve their own deletion; the requester can't approve their own request.
    await expect(decideApproval(await w.ctx(president), r.requestId!, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(await w.ctx(mod), r.requestId!, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideApproval(await w.ctx(mod2), r.requestId!, "APPROVE");
    expect(row<{ status: string }>("SELECT status FROM users WHERE id = ?", president).status).toBe("ARCHIVED");
  });

  it("the last Moderator can't be deleted", async () => {
    const president = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"], name: "Only Mod" });
    await expect(deleteMemberAccount(await w.ctx(president), mod, { reason: "test", confirmName: "Only Mod" })).rejects.toMatchObject({ code: "LAST_PROTECTED_HOLDER" });
  });

  it("bulk-deletes applications only, in a fixed number of statements", async () => {
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    const spam = await Promise.all([1, 2, 3, 4, 5].map((i) => w.user({ email: `spam${i}@x.bd`, status: i % 2 ? "REJECTED" : "PENDING_APPROVAL" })));
    const member = await w.user({ email: "real@x.bd", roles: ["member"] });
    const c = await w.ctx(gs);
    const before = c.db.queries;
    const r = await bulkDeleteApplications(c, [...spam, member], "Spam sign-ups");
    expect(r.deleted).toBe(5);
    expect(r.skipped).toEqual([{ id: member, name: "real", why: "is a member, not an application" }]);
    expect(c.db.queries - before).toBeLessThan(30);
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM users WHERE status = 'ARCHIVED'").n).toBe(5);
  });
});

describe("changing someone's sign-in email", () => {
  it("a leader changes it: verified, devices signed out, both addresses told", async () => {
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    const exec = await w.user({ email: "old@green.edu.bd", roles: ["member"], positions: ["executive-member"], name: "Nusrat" });
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', ?, '2099-01-01')").run(exec);
    const r = await changeMemberEmail(await w.ctx(gs), exec, { email: "Nusrat@Gmail.com", reason: "Lost the university mailbox" });
    expect(r.changed).toBe(true);
    expect(row<{ email: string; v: string | null }>("SELECT email, email_verified_at v FROM users WHERE id = ?", exec)).toMatchObject({ email: "nusrat@gmail.com" });
    expect(row<{ revoked_at: string | null }>("SELECT revoked_at FROM sessions WHERE id = 's1'").revoked_at).not.toBeNull();
    expect(w.emails.filter((e) => e.subject === "Your GUCC sign-in email was changed").map((e) => e.to).sort()).toEqual(["nusrat@gmail.com", "old@green.edu.bd"]);
  });

  it("refuses an address another account uses, and a member without the permission", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    await expect(changeMemberEmail(await w.ctx(mod), a, { email: "b@x.bd", reason: "typo" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeMemberEmail(await w.ctx(b), a, { email: "new@x.bd", reason: "typo" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
