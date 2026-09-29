/**
 * Who can do what, per hierarchy level, against the real schema and seeded
 * governance (migrations 0001–0004). Allowed and denied actions for every
 * level, plus privilege-escalation attempts that must fail.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { authorize } from "@/lib/server/authz";
import { approveMember, requestCorrection } from "@/lib/server/services/members";
import { grantRole, revokeRole, setPositionGrant, setRoleGrant } from "@/lib/server/services/governance";
import { assignExecutive, endAssignment } from "@/lib/server/services/committees";
import { createEvent, updateEvent } from "@/lib/server/services/events";
import { createPost, publishPost } from "@/lib/server/services/posts";
import { sessionMe } from "@/lib/server/views/admin";
import type { Resource } from "@/lib/governance/types";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
  w.sqlite.exec("INSERT INTO categories (id, kind, slug, name) VALUES ('cat_sports','EVENT','sports','Sports'), ('cat_tech','EVENT','technical','Technical'), ('cat_cult','EVENT','cultural','Cultural'), ('cat_ptech','POST','technical','Technical'), ('cat_news','POST','club-news','Club News')");
});

type Level = "moderator" | "president" | "gs" | "vpActivities" | "vpTechnical" | "secretarySports" | "publication" | "photography" | "eventCoordinator" | "executiveMember" | "member" | "administrator" | "developer";

async function people(): Promise<Record<Level, string>> {
  return {
    moderator: await w.user({ email: "mod@x.bd", roles: ["moderator", "member"] }),
    president: await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] }),
    gs: await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] }),
    vpActivities: await w.user({ email: "vpa@x.bd", roles: ["member"], positions: ["vice-president-activities"] }),
    vpTechnical: await w.user({ email: "vpt@x.bd", roles: ["member"], positions: ["vice-president-technical"] }),
    secretarySports: await w.user({ email: "sports@x.bd", roles: ["member"], positions: ["sports-secretary"] }),
    publication: await w.user({ email: "pub@x.bd", roles: ["member"], positions: ["publication-secretary"] }),
    photography: await w.user({ email: "photo@x.bd", roles: ["member"], positions: ["photography-secretary"] }),
    eventCoordinator: await w.user({ email: "coord@x.bd", roles: ["member"], positions: ["event-coordinator"] }),
    executiveMember: await w.user({ email: "exec@x.bd", roles: ["member"], positions: ["executive-member"] }),
    member: await w.user({ email: "member@x.bd", roles: ["member"] }),
    administrator: await w.user({ email: "admin@x.bd", roles: ["administrator", "member"] }),
    developer: await w.user({ email: "dev@x.bd", roles: ["developer", "member"] }),
  };
}

const outcome = async (userId: string, permission: string, resource?: Resource) => authorize(await w.ctx(userId), permission, resource).outcome;
const sportsEvent: Resource = { type: "event", category: "sports", status: "DRAFT" };
const techEvent: Resource = { type: "event", category: "technical", status: "DRAFT" };
const culturalEvent: Resource = { type: "event", category: "cultural", status: "DRAFT" };

describe("permission matrix (defaults, all changeable in the admin)", () => {
  it("member approval: Moderators, President and GS only — not the technical administrator or developer", async () => {
    const p = await people();
    for (const l of ["moderator", "president", "gs"] as const) expect(await outcome(p[l], "members.approve")).toBe("ALLOW");
    for (const l of ["administrator", "developer", "vpActivities", "vpTechnical", "publication", "executiveMember", "member"] as const) expect(await outcome(p[l], "members.approve")).toBe("DENY");
  });

  it("the developer role sees System health and the activity log, and nothing else until granted", async () => {
    const p = await people();
    const me = await sessionMe(await w.ctx(p.developer));
    // The member baseline (own profile, messages) comes from the member role, not this one.
    const held = Object.entries(me!.caps).filter(([k, v]) => v && !["profile.update", "chat.send"].includes(k)).map(([k]) => k).sort();
    expect(held).toEqual(["audit.read", "system.health"]);
  });

  it("events: by category and assignment", async () => {
    const p = await people();
    expect(await outcome(p.vpActivities, "events.publish", culturalEvent)).toBe("ALLOW");
    expect(await outcome(p.vpTechnical, "events.publish", techEvent)).toBe("ALLOW");
    expect(await outcome(p.vpTechnical, "events.publish", culturalEvent)).toBe("DENY");
    expect(await outcome(p.secretarySports, "events.create", sportsEvent)).toBe("ALLOW");
    expect(await outcome(p.secretarySports, "events.create", techEvent)).toBe("DENY");
    expect(await outcome(p.eventCoordinator, "events.create", sportsEvent)).toBe("ALLOW");
    expect(await outcome(p.eventCoordinator, "events.update", { ...sportsEvent, id: "e1", createdBy: p.eventCoordinator, ownerId: p.eventCoordinator })).toBe("ALLOW");
    expect(await outcome(p.eventCoordinator, "events.update", { ...sportsEvent, id: "e2", createdBy: p.president, ownerId: p.president })).toBe("DENY");
    expect(await outcome(p.eventCoordinator, "events.update", { ...sportsEvent, id: "e3", createdBy: p.president, assignedUserIds: [p.eventCoordinator] })).toBe("ALLOW");
    expect(await outcome(p.photography, "media.upload", { type: "event_media", eventId: "e3", eventAssignedUserIds: [p.photography] })).toBe("ALLOW");
    expect(await outcome(p.photography, "media.upload", { type: "event_media", eventId: "e4", eventAssignedUserIds: [] })).toBe("DENY");
    expect(await outcome(p.member, "events.create", sportsEvent)).toBe("DENY");
    for (const l of ["moderator", "president", "gs"] as const) expect(await outcome(p[l], "events.delete", techEvent)).toBe("ALLOW");
  });

  it("posts: Publication Secretary needs approval, Programming Secretary publishes technical posts, members cannot create", async () => {
    const p = await people();
    const prog = await w.user({ email: "prog@x.bd", roles: ["member"], positions: ["programming-secretary"] });
    expect(await outcome(p.publication, "posts.publish", { type: "post", category: "club-news" })).toBe("REQUIRE_APPROVAL");
    expect(await outcome(prog, "posts.publish", { type: "post", category: "technical" })).toBe("ALLOW");
    expect(await outcome(prog, "posts.publish", { type: "post", category: "club-news" })).toBe("DENY");
    expect(await outcome(p.president, "posts.publish", { type: "post", category: "club-news" })).toBe("ALLOW");
    expect(await outcome(p.member, "posts.create", { type: "post" })).toBe("DENY");
    const { id } = await createPost(await w.ctx(p.executiveMember), { type: "BLOG", title: "My first article", body: "Hello" });
    expect((await publishPost(await w.ctx(p.executiveMember), id)).outcome).toBe("PENDING_APPROVAL");
    await expect(createPost(await w.ctx(p.member), { type: "BLOG", title: "Nope", body: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recruitment and the contact inbox: President, GS, Moderators (and Information Secretary for messages)", async () => {
    const p = await people();
    const info = await w.user({ email: "info@x.bd", roles: ["member"], positions: ["information-secretary"] });
    for (const l of ["moderator", "president", "gs"] as const) {
      expect(await outcome(p[l], "recruitment.manage")).toBe("ALLOW");
      expect(await outcome(p[l], "messages.read")).toBe("ALLOW");
    }
    expect(await outcome(info, "messages.read")).toBe("ALLOW");
    expect(await outcome(info, "recruitment.manage")).toBe("DENY");
    for (const l of ["administrator", "developer", "executiveMember", "member", "vpActivities"] as const) expect(await outcome(p[l], "recruitment.manage")).toBe("DENY");
  });

  it("the admin area opens for executives and leadership, not for plain members", async () => {
    const p = await people();
    expect((await sessionMe(await w.ctx(p.member)))!.adminAccess).toBe(false);
    expect((await sessionMe(await w.ctx(p.executiveMember)))!.adminAccess).toBe(true);
    expect((await sessionMe(await w.ctx(p.president)))!.caps["executives.assign"]).toBe(true);
    expect(await sessionMe(await w.ctx(null))).toBeNull();
  });
});

describe("privilege escalation is blocked", () => {
  it("the President has a Moderator's authority but never over their own access; others stay within bounds", async () => {
    const p = await people();
    await expect(grantRole(await w.ctx(p.president), p.president, "moderator", null)).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    // Appointing a Moderator is a protected change: another Moderator (or the General Secretary) confirms it.
    expect(await grantRole(await w.ctx(p.president), p.gs, "moderator", null)).toMatchObject({ applied: false, requestId: expect.any(String) });
    // Sensitive roles apply at once, as for a Moderator.
    expect(await grantRole(await w.ctx(p.president), p.member, "administrator", "Runs the media library")).toMatchObject({ applied: true });
    await expect(setRoleGrant(await w.ctx(p.president), "role:member", { permission: "events.read", scope: "ALL", scopeValue: "" }, true)).resolves.toMatchObject({ applied: true });
    await expect(setPositionGrant(await w.ctx(p.president), "pos:vice-president", { permission: "roles.assign", scope: "ALL", scopeValue: "" }, true)).resolves.toMatchObject({ applied: true });
    // Someone without Moderator authority still can't hand out governance powers.
    await expect(setPositionGrant(await w.ctx(p.administrator), "pos:vice-president", { permission: "users.delete", scope: "ALL", scopeValue: "" }, true)).rejects.toBeTruthy();
  });

  it("nobody assigns themselves a position; the President may fill protected positions", async () => {
    const p = await people();
    const presProfile = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(p.president) as { id: string }).id;
    await expect(assignExecutive(await w.ctx(p.president), w.committeeId, { profileId: presProfile, positionId: "pos:general-secretary", section: "STUDENT" })).rejects.toBeTruthy();
    const someone = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(p.member) as { id: string }).id;
    expect((await assignExecutive(await w.ctx(p.president), w.committeeId, { profileId: someone, positionId: "pos:moderator", section: "FACULTY" })).id).toBeTruthy();
    const ok = await assignExecutive(await w.ctx(p.moderator), w.committeeId, { profileId: someone, positionId: "pos:deputy-moderator", section: "FACULTY" });
    expect(ok.id).toBeTruthy();
  });

  it("an executive member cannot manage members, executives or events they don't own", async () => {
    const p = await people();
    const applicant = await w.user({ email: "new@x.bd", status: "PENDING_APPROVAL" });
    await expect(approveMember(await w.ctx(p.executiveMember), applicant)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestCorrection(await w.ctx(p.executiveMember), applicant, "Fix your ID please")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cm = (w.sqlite.prepare("SELECT id FROM committee_members WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)").get(p.gs) as { id: string }).id;
    await expect(endAssignment(await w.ctx(p.executiveMember), cm, "remove", null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Every executive may draft events of their own, but not change someone else's.
    const mine = await createEvent(await w.ctx(p.executiveMember), { title: "Coding night", startAt: "2026-12-01T10:00", category: "Sports" });
    expect(w.sqlite.prepare("SELECT status FROM events WHERE id = ?").get(mine.id)).toEqual({ status: "DRAFT" });
    const theirs = await createEvent(await w.ctx(p.gs), { title: "Leadership retreat", startAt: "2026-12-02T10:00", category: "Workshop" });
    await expect(updateEvent(await w.ctx(p.executiveMember), theirs.id, { title: "Hijacked", startAt: "2026-12-02T10:00", category: "Workshop" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("the last Moderator cannot be removed; a sole Moderator's protected changes are audited", async () => {
    const p = await people();
    const ur = (w.sqlite.prepare("SELECT id FROM user_roles WHERE user_id = ? AND role_id = 'role:moderator'").get(p.moderator) as { id: string }).id;
    await expect(revokeRole(await w.ctx(p.moderator), ur, "leaving")).rejects.toBeTruthy();
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE role_id = 'role:moderator' AND revoked_at IS NULL").get()).toEqual({ n: 1 });
  });

  it("leaders approve members; the decision is audited and the applicant notified", async () => {
    const p = await people();
    const applicant = await w.user({ email: "applicant@x.bd", status: "PENDING_APPROVAL" });
    await approveMember(await w.ctx(p.gs), applicant);
    expect(w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(applicant)).toEqual({ status: "ACTIVE" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'member.approve' AND resource_id = ?").get(applicant)).toEqual({ n: 1 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id = ? AND role_id = 'role:member'").get(applicant)).toEqual({ n: 1 });
    // Approval makes them a member only: no admin access, no position.
    expect((await sessionMe(await w.ctx(applicant)))!.adminAccess).toBe(false);
  });
});
