/**
 * Governance v4: the President and General Secretary manage access within bounds, direct and
 * time-limited grants, sensitive grants waiting for a Moderator, trusted authors, the club-wide
 * auto-publish switch, positions, and affiliated committees (CSS) that never inherit GUCC powers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { authorize, loadActor } from "@/lib/server/authz";
import { decideApproval } from "@/lib/server/services/approvals";
import { accessMatrix, personAccess, publishersSummary } from "@/lib/server/services/access";
import { createEvent, publishEvent } from "@/lib/server/services/events";
import {
  archivePosition, archiveRole, copyGrants, createRole, grantDirectPermission, grantRoleBulk, revokeDirectPermission, setRoleGrant,
  savePosition, setRuleStatus, trustAuthor, updateRole,
} from "@/lib/server/services/governance";
import { createPost, publishPost } from "@/lib/server/services/posts";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

async function leaders() {
  return {
    moderator: await w.user({ email: "mod@x.bd", roles: ["moderator", "member"] }),
    president: await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] }),
    gs: await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] }),
    exec: await w.user({ email: "exec@x.bd", roles: ["member"], positions: ["executive-member"] }),
    member: await w.user({ email: "member@x.bd", roles: ["member"] }),
  };
}

/** A person listed only in the CSS unit of the current committee. */
async function cssPerson(email: string, position: string) {
  const id = await w.user({ email, roles: ["member"] });
  const profile = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(id) as { id: string }).id;
  w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, unit_key, display_order, is_active) VALUES (?, ?, ?, ?, ?, 'STUDENT', 'css', 1, 1)")
    .run(`cm_css_${email}`, w.committeeId, profile, `pos:${position}`, position);
  return id;
}

const postBody = { type: "BLOG", title: "Hello GUCC", body: "A first post with enough words to publish.", category: "General" };

describe("direct permission grants", () => {
  it("the General Secretary grants a permission for a limited time; it applies, then expires", async () => {
    const p = await leaders();
    const res = await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "events.read", scope: "ALL", reason: "Helping with Tech Fest" });
    expect(res).toMatchObject({ applied: true });
    expect((await loadActor(w.db, p.member))!.subject.grants.some((g) => g.permission === "events.read" && g.source === "direct")).toBe(true);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'permission.granted'").get(p.member)).toEqual({ n: 1 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'permission.grant_direct'").get()).toEqual({ n: 1 });

    w.sqlite.prepare("UPDATE user_permissions SET expires_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?").run(p.member);
    expect((await loadActor(w.db, p.member))!.subject.grants.some((g) => g.source === "direct")).toBe(false);
  });

  it("refuses self-grants, past end dates and duplicates; the General Secretary has a Moderator's reach", async () => {
    const p = await leaders();
    await expect(grantDirectPermission(await w.ctx(p.gs), { userId: p.gs, permission: "events.read" })).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    // Equal to a Moderator: protected and club-wide powers can be handed out directly.
    expect(await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "roles.assign" })).toMatchObject({ applied: true });
    expect(await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "users.delete" })).toMatchObject({ applied: true });
    await expect(grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "events.read", expiresAt: "2020-01-01" })).rejects.toMatchObject({ code: "VALIDATION" });
    await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "events.read" });
    await expect(grantDirectPermission(await w.ctx(p.president), { userId: p.member, permission: "events.read" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(grantDirectPermission(await w.ctx(p.exec), { userId: p.member, permission: "events.read" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a sensitive grant by the General Secretary applies at once (equal to a Moderator)", async () => {
    const p = await leaders();
    const res = await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "users.suspend", reason: "Moderation help" });
    expect(res.applied).toBe(true);
    expect(authorize({ ...(await w.ctx(p.member)) }, "users.suspend").outcome).toBe("ALLOW");
  });

  it("a Moderator grants sensitive permissions directly; revoking needs no approval", async () => {
    const p = await leaders();
    const res = await grantDirectPermission(await w.ctx(p.moderator), { userId: p.member, permission: "users.suspend" });
    expect(res.applied).toBe(true);
    const id = (w.sqlite.prepare("SELECT id FROM user_permissions WHERE user_id = ?").get(p.member) as { id: string }).id;
    await revokeDirectPermission(await w.ctx(p.gs), id, "Not needed any more");
    expect(w.sqlite.prepare("SELECT revoked_at IS NOT NULL AS r FROM user_permissions WHERE id = ?").get(id)).toEqual({ r: 1 });
  });
});

describe("content from executives", () => {
  it("an executive's post waits for approval; once trusted, their next one publishes directly", async () => {
    const p = await leaders();
    const first = await createPost(await w.ctx(p.exec), postBody);
    expect((await publishPost(await w.ctx(p.exec), first.id)).outcome).toBe("PENDING_APPROVAL");
    await trustAuthor(await w.ctx(p.gs), { userId: p.exec, kind: "posts" });
    const second = await createPost(await w.ctx(p.exec), { ...postBody, title: "Second post" });
    expect((await publishPost(await w.ctx(p.exec), second.id)).outcome).toBe("PUBLISHED");
    // Trust covers their own posts only.
    const gsPost = await createPost(await w.ctx(p.gs), { ...postBody, title: "Leaders' note" });
    expect(authorize(await w.ctx(p.exec), "posts.publish", { type: "post", id: gsPost.id, createdBy: p.gs, ownerId: p.gs }).outcome).not.toBe("ALLOW");
    const summary = await publishersSummary(await w.ctx(p.gs));
    expect(summary.trusted.map((t) => t.user_id)).toContain(p.exec);
  });

  it("the club-wide switch lets every executive publish their own events directly", async () => {
    const p = await leaders();
    const ev = await createEvent(await w.ctx(p.exec), { title: "Coding night", startAt: "2026-12-01T10:00", category: "Workshop", venue: "Lab 3" });
    expect((await publishEvent(await w.ctx(p.exec), ev.id)).outcome).toBe("PENDING_APPROVAL");
    await setRuleStatus(await w.ctx(p.president), "rule:executives-publish-own-events", "ACTIVE");
    const ev2 = await createEvent(await w.ctx(p.exec), { title: "Coding night 2", startAt: "2026-12-08T10:00", category: "Workshop", venue: "Lab 3" });
    expect((await publishEvent(await w.ctx(p.exec), ev2.id)).outcome).toBe("PUBLISHED");
  });
});

describe("affiliated committees (CSS)", () => {
  it("a CSS General Secretary gets an account and their own content, never GUCC powers", async () => {
    const p = await leaders();
    const css = await cssPerson("css-gs@x.bd", "general-secretary");
    const actor = (await loadActor(w.db, css))!;
    expect(actor.subject.positions).toEqual([]);
    expect(actor.subject.roles).toContain("unit-executive");
    expect(actor.subject.roles).not.toContain("executive");
    const ctx = await w.ctx(css);
    for (const perm of ["members.approve", "members.read", "roles.assign", "approvals.decide", "executives.assign", "media.read"]) {
      expect(authorize(ctx, perm).outcome).toBe("DENY");
    }
    // Their post goes to the President or General Secretary, who can approve it.
    const post = await createPost(ctx, postBody);
    const pub = await publishPost(ctx, post.id);
    expect(pub.outcome).toBe("PENDING_APPROVAL");
    const req = w.sqlite.prepare("SELECT policy_id FROM approval_requests WHERE resource_id = ?").get(post.id) as { policy_id: string };
    expect(req.policy_id).toBe("policy:president-or-gs");
    const requestId = (w.sqlite.prepare("SELECT id FROM approval_requests WHERE resource_id = ?").get(post.id) as { id: string }).id;
    await decideApproval(await w.ctx(p.gs), requestId, "APPROVE");
    expect(w.sqlite.prepare("SELECT status FROM posts WHERE id = ?").get(post.id)).toEqual({ status: "PUBLISHED" });
  });

  it("a CSS listing can't approve GUCC requests, even with the same title", async () => {
    const p = await leaders();
    const cssGs = await cssPerson("css-gs2@x.bd", "general-secretary");
    const post = await createPost(await w.ctx(p.exec), postBody);
    const pub = await publishPost(await w.ctx(p.exec), post.id);
    const requestId = (w.sqlite.prepare("SELECT id FROM approval_requests WHERE resource_id = ?").get(post.id) as { id: string }).id;
    expect(pub.outcome).toBe("PENDING_APPROVAL");
    await expect(decideApproval(await w.ctx(cssGs), requestId, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("roles and positions", () => {
  it("the President creates, edits and archives a role; archiving waits until no one holds it", async () => {
    const p = await leaders();
    const { id } = await createRole(await w.ctx(p.president), { name: "Web Team", description: "Keeps the site running" });
    await updateRole(await w.ctx(p.president), id, { name: "Web & Media Team", color: "#22c55e" });
    expect(w.sqlite.prepare("SELECT name, color FROM roles WHERE id = ?").get(id)).toEqual({ name: "Web & Media Team", color: "#22c55e" });
    w.sqlite.prepare("INSERT INTO user_roles (id, user_id, role_id) VALUES ('ur_web', ?, ?)").run(p.member, id);
    await expect(archiveRole(await w.ctx(p.president), id)).rejects.toMatchObject({ code: "CONFLICT" });
    w.sqlite.prepare("UPDATE user_roles SET revoked_at = '2026-01-01' WHERE id = 'ur_web'").run();
    await archiveRole(await w.ctx(p.president), id);
    await expect(archiveRole(await w.ctx(p.president), "role:member")).rejects.toMatchObject({ code: "SYSTEM_ROLE" });
  });

  it("the General Secretary creates a position with copied permissions; sensitive ones are left out", async () => {
    const p = await leaders();
    const { id } = await savePosition(await w.ctx(p.gs), null, { name: "Web Development Secretary", category: "SECRETARIAT", rank: 36, parentId: "pos:general-secretary", aliases: "Web Dev Secretary" });
    const res = await copyGrants(await w.ctx(p.gs), { kind: "position", id }, { kind: "position", id: "pos:programming-secretary" });
    expect(res.copied).toBeGreaterThan(0);
    const row = w.sqlite.prepare("SELECT aliases_json FROM positions WHERE id = ?").get(id) as { aliases_json: string };
    expect(JSON.parse(row.aliases_json).aliases).toEqual(["Web Dev Secretary"]);
    // Held positions can't be archived; empty ones can.
    await expect(archivePosition(await w.ctx(p.gs), "pos:executive-member")).rejects.toMatchObject({ code: "CONFLICT" });
    await archivePosition(await w.ctx(p.gs), id);
    expect(w.sqlite.prepare("SELECT deleted_at IS NOT NULL AS gone FROM positions WHERE id = ?").get(id)).toEqual({ gone: 1 });
  });
});

describe("access read models", () => {
  it("explains a person's access and lists leaders in the matrix, within the statement budget", async () => {
    const p = await leaders();
    await grantDirectPermission(await w.ctx(p.gs), { userId: p.member, permission: "events.read" });
    const ctx = await w.ctx(p.gs);
    const before = ctx.db.queries;
    const person = await personAccess(ctx, p.member);
    expect(person.direct).toHaveLength(1);
    // The member role reads their own events; the direct grant adds the rest.
    expect(person.effective.find((g) => g.permission === "events.read")?.sources.some((x) => x.source === "direct")).toBe(true);
    const matrix = await accessMatrix(ctx);
    expect(ctx.db.queries - before).toBeLessThanOrEqual(45);
    const gsRow = matrix.people.find((x) => x.id === p.gs)!;
    expect(gsRow.cells["members.approve"]?.level).toBe("ALL");
    expect(matrix.people.find((x) => x.id === p.moderator)?.moderator).toBe(true);
    // Members can see their own access, not other people's.
    await expect(personAccess(await w.ctx(p.member), p.member)).resolves.toBeTruthy();
    await expect(personAccess(await w.ctx(p.member), p.gs)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("giving a role to many members", () => {
  it("previews, skips who can't get it, and grants the rest together; sensitive roles go one by one", async () => {
    const p = await leaders();
    const extra = await w.user({ email: "x@x.bd", roles: ["member"] });
    const pending = await w.user({ email: "pending@x.bd", status: "PENDING_APPROVAL" });
    const { id } = await createRole(await w.ctx(p.president), { name: "Volunteers" });
    const preview = await grantRoleBulk(await w.ctx(p.gs), { userIds: [p.member, extra, pending], roleKey: "volunteers", reason: "Workshop crew" }, false);
    expect(preview.plan.items.find((i) => i.id === pending)?.blocked).toMatch(/isn't active/);
    expect(preview.plan.changes).toBe(2);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE role_id = ?").get(id)).toEqual({ n: 0 });
    const done = await grantRoleBulk(await w.ctx(p.gs), { userIds: [p.member, extra, pending], roleKey: "volunteers", reason: "Workshop crew" }, true);
    expect(done.message).toMatch(/2 members/);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE role_id = ? AND revoked_at IS NULL").get(id)).toEqual({ n: 2 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type = 'role.granted'").get()).toEqual({ n: 2 });
    // Again: both already hold it.
    await expect(grantRoleBulk(await w.ctx(p.gs), { userIds: [p.member, extra], roleKey: "volunteers" }, true)).rejects.toMatchObject({ code: "NOTHING_TO_CHANGE" });
    // A role with a sensitive permission: the General Secretary, like a Moderator, may give it in bulk.
    await setRoleGrant(await w.ctx(p.moderator), id, { permission: "users.suspend", scope: "ALL", scopeValue: "" }, true);
    await expect(grantRoleBulk(await w.ctx(p.gs), { userIds: [p.exec], roleKey: "volunteers" }, true)).resolves.toBeTruthy();
    await expect(grantRoleBulk(await w.ctx(p.gs), { userIds: [p.exec], roleKey: "moderator" }, false)).rejects.toMatchObject({ code: "ONE_AT_A_TIME" });
  });
});

