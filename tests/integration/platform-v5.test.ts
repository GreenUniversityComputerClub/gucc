/**
 * Round 6: the 0009 content changes, and the fixes from the dashboard audit (security, governance,
 * events, media, reminders).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { hashPassword } from "@/lib/server/crypto";
import { Db } from "@/lib/server/db";
import { accountMessage } from "@/lib/server/email";
import { changePassword } from "@/lib/server/services/auth";
import { deleteMessage, listReports, reportMessage, sendToPerson } from "@/lib/server/services/messaging";
import { grantRole } from "@/lib/server/services/governance";
import { startApproval } from "@/lib/server/services/approvals";
import { updateAssignment, updateCommittee } from "@/lib/server/services/committees";
import { cancelMyRegistration, createEvent, publishEvent, setEventStatus, setRegistrationStatus, updateEvent } from "@/lib/server/services/events";
import { createPost, publishPost, updatePost } from "@/lib/server/services/posts";
import { removeLostFoundImage } from "@/lib/server/services/community";
import { resolveMediaAccess, uploadMedia } from "@/lib/server/services/media";
import { runMaintenance } from "@/lib/server/services/maintenance";
import { confirmMfaReplace, confirmMfaSetup, startMfaReplace, startMfaSetup, verifyMfaLogin } from "@/lib/server/services/mfa";
import { login } from "@/lib/server/services/auth";
import { base32Decode, totpAt } from "@/lib/server/totp";
import { loadActor } from "@/lib/server/authz";
import { holdsProtectedRole } from "@/lib/governance/engine";
import { usersWith } from "@/lib/server/notifications";
import { createWorld, type TestWorld } from "../support/d1";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PASSWORD = "correct-Horse-battery-9";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const json = (sql: string, ...args: unknown[]) => JSON.parse((w.sqlite.prepare(sql).get(...(args as never[])) as { v: string }).v);
async function withPassword(opts: Parameters<TestWorld["user"]>[0]) {
  const id = await w.user(opts);
  w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(PASSWORD, "test-pepper-0123456789"), id);
  return id;
}
const codeFor = async (secret: string, offset = 0) => totpAt(base32Decode(secret.replace(/\s/g, "")), Date.now() / 1000 + offset * 30);

describe("0009 content", () => {
  it("drops Class Scheduler and Certificate Verification from the Services menu, keeping the rest", () => {
    const items = json("SELECT value_json AS v FROM organization_settings WHERE key = 'nav.services'").items as Array<{ label: string; href: string }>;
    expect(items.map((i) => i.href)).toEqual(["/lost-found"]);
  });

  it("shows Sagufta Sabah Nakshi as Deputy Moderator in Feroza Naznin's place, with the same message", () => {
    const people = json("SELECT value_json AS v FROM organization_settings WHERE key = 'page.home'").moderators.people as Array<Record<string, string>>;
    expect(people[1]).toMatchObject({ name: "Sagufta Sabah Nakshi", title: "Deputy Moderator, GUCC", photo: "/executives/nakshi.png", initials: "SN" });
    expect(people[1]!.message).toMatch(/^The energy and dedication/);
    expect(people.map((p) => p.name)).not.toContain("Feroza Naznin");
  });

  it("switches the email settings to SMTP2GO's free plan", () => {
    const rows = w.sqlite.prepare("SELECT key, value_json, description FROM system_settings WHERE key LIKE 'email.%' ORDER BY key").all() as Array<Record<string, string>>;
    expect(rows.find((r) => r.key === "email.monthly_limit")?.value_json).toBe("1000");
    expect(rows.find((r) => r.key === "email.daily_limit")?.value_json).toBe("40");
    expect(rows.every((r) => !/Resend/.test(r.description ?? ""))).toBe(true);
  });
});

describe("account emails", () => {
  it("carry a plain-text and an HTML part, the spam hint and a Reply-To to the club", async () => {
    const c = await w.ctx(null);
    const m = accountMessage({ ...c, env: { ...c.env, CONTACT_EMAIL: "gucc@green.edu.bd" } }, { to: "a@x.bd", subject: "Verify", text: "Open https://example.test/a?b=1 now" }, "account.verify");
    expect(m.text).toMatch(/contacts so our emails don't land in spam/);
    expect(m.html).toContain('<a href="https://example.test/a?b=1">');
    expect(m.replyTo).toBe("gucc@green.edu.bd");
    // Messages to the club itself stay as they are.
    expect(accountMessage(c, { to: "club@x.bd", subject: "S", text: "T", replyTo: "sender@x.bd" }, "contact.message")).toEqual({ to: "club@x.bd", subject: "S", text: "T", replyTo: "sender@x.bd" });
  });
});

describe("security", () => {
  it("limits password guesses through Change password", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    for (let i = 0; i < 10; i++) await expect(changePassword(await w.ctx(id), id, "wrong", "New-Password-1234!")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(changePassword(await w.ctx(id), id, PASSWORD, "New-Password-1234!")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("moves two-factor to a new phone without turning it off; the old app works until the new one is confirmed", async () => {
    const id = await withPassword({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const { secret: oldSecret } = await startMfaSetup(await w.ctx(id));
    await confirmMfaSetup(await w.ctx(id), await codeFor(oldSecret));
    await expect(startMfaReplace(await w.ctx(id), { password: "wrong", code: await codeFor(oldSecret, 1) })).rejects.toMatchObject({ code: "VALIDATION" });
    const { secret: newSecret } = await startMfaReplace(await w.ctx(id), { password: PASSWORD, code: await codeFor(oldSecret, 1) });
    await expect(confirmMfaReplace(await w.ctx(id), "000000")).rejects.toMatchObject({ code: "VALIDATION" });
    const { recoveryCodes } = await confirmMfaReplace(await w.ctx(id), await codeFor(newSecret));
    expect(recoveryCodes).toHaveLength(10);
    // Sign-in now takes the new app's code, not the old one's.
    const pending = await login(await w.ctx(), { email: "p@x.bd", password: PASSWORD });
    await expect(verifyMfaLogin(await w.ctx(), pending.token, await codeFor(oldSecret, 2))).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await verifyMfaLogin(await w.ctx(), pending.token, await codeFor(newSecret, 1))).token).toBeTruthy();
    expect(w.sqlite.prepare("SELECT pending_secret_enc FROM user_mfa WHERE user_id = ?").get(id)).toEqual({ pending_secret_enc: null });
  });

  it("keeps what was reported even if its author deletes it, and doesn't notify twice", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Something rude" });
    const msg = w.sqlite.prepare("SELECT id FROM messages WHERE conversation_id = ?").get(conversationId) as { id: string };
    await reportMessage(await w.ctx(b), msg.id, "Rude");
    await reportMessage(await w.ctx(b), msg.id, "Rude again");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type = 'report.new'").get()).toEqual({ n: 1 });
    await deleteMessage(await w.ctx(a), msg.id);
    const mod = w.sqlite.prepare("SELECT id FROM users WHERE email = 'mod@x.bd'").get() as { id: string };
    const reports = await listReports(await w.ctx(mod.id));
    expect(reports[0]).toMatchObject({ body: "Something rude" });
    // The recipient's notification no longer shows the deleted text.
    expect(w.sqlite.prepare("SELECT body FROM notifications WHERE type = 'message.received'").get()).toEqual({ body: null });
  });
});

describe("governance", () => {
  it("gives a role again after an earlier, time-limited holding ran out", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    w.sqlite.prepare("DELETE FROM user_roles WHERE user_id = ?").run(m);
    w.sqlite.prepare("INSERT INTO user_roles (id, user_id, role_id, granted_at, expires_at) VALUES ('ur_old', ?, 'role:member', '2020-01-01', '2020-02-01')").run(m);
    await grantRole(await w.ctx(pres), m, "member", "Back again");
    const rows = w.sqlite.prepare("SELECT id, revoked_at IS NOT NULL AS ended FROM user_roles WHERE user_id = ? ORDER BY granted_at").all(m);
    expect(rows).toEqual([{ id: "ur_old", ended: 1 }, { id: expect.any(String), ended: 0 }]);
  });

  it("refuses a request its requester would have to approve", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    await expect(startApproval(await w.ctx(pres), { policyKey: "president-and-gs", resourceType: "governance", resourceId: "x", action: "governance.sensitive_grant", title: "Test" }))
      .rejects.toMatchObject({ code: "NO_APPROVER" });
  });

  it("keeps a listing's bio when the short form saves, and never switches the current committee off", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    const listing = w.sqlite.prepare("SELECT id FROM committee_members WHERE position_id = 'pos:executive-member'").get() as { id: string };
    w.sqlite.prepare("UPDATE committee_members SET bio = 'Loves robotics' WHERE id = ?").run(listing.id);
    await updateAssignment(await w.ctx(pres), listing.id, { title: "Executive Member", displayOrder: 3 });
    expect(w.sqlite.prepare("SELECT bio, display_order FROM committee_members WHERE id = ?").get(listing.id)).toEqual({ bio: "Loves robotics", display_order: 3 });
    await expect(updateCommittee(await w.ctx(pres), w.committeeId, { name: "GUCC 2026", slug: "2026", termLabel: "2026", status: "ARCHIVED" }))
      .rejects.toMatchObject({ code: "CURRENT_COMMITTEE" });
  });
});

describe("the President and the General Secretary are equal to the Moderators", () => {
  it("hold Moderator authority and every permission while they hold the position; other leaders don't", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const jgs = await w.user({ email: "j@x.bd", positions: ["joint-general-secretary"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    for (const id of [pres, gs, mod]) {
      const a = (await loadActor(w.db, id))!;
      expect(holdsProtectedRole(a.subject)).toBe(true);
      expect(a.subject.grants.some((g) => g.permission === "*")).toBe(true);
    }
    expect(holdsProtectedRole((await loadActor(w.db, jgs))!.subject)).toBe(false);
    // They are asked whenever "the Moderators" must decide something.
    expect((await usersWith(await w.ctx(null), { roles: ["moderator"] })).sort()).toEqual([pres, gs, mod].sort());
    // Ending the listing ends the authority.
    w.sqlite.prepare("UPDATE committee_members SET end_date = '2020-01-01', is_active = 0 WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = ?)").run(pres);
    expect(holdsProtectedRole((await loadActor(w.db, pres))!.subject)).toBe(false);
  });
});

describe("events", () => {
  it("lets only public events become ongoing or completed, and cancels a waiting approval", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createEvent(await w.ctx(pres), { title: "Draft talk", startAt: "2030-01-01T10:00" });
    await expect(setEventStatus(await w.ctx(pres), id, "ONGOING", null)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    await publishEvent(await w.ctx(pres), id);
    await setEventStatus(await w.ctx(pres), id, "ONGOING", null);
    await setEventStatus(await w.ctx(pres), id, "COMPLETED", null);
    await expect(setEventStatus(await w.ctx(pres), id, "ONGOING", null)).rejects.toMatchObject({ code: "BAD_TRANSITION" });
  });

  it("gives an event with a Bangla title a working address", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createEvent(await w.ctx(pres), { title: "নবীন বরণ", startAt: "2030-01-01T10:00" });
    expect((w.sqlite.prepare("SELECT slug FROM events WHERE id = ?").get(id) as { slug: string }).slug).toMatch(/^event-[0-9a-f]{8}$/);
  });

  it("moves the waitlist up when a seat frees or capacity grows, and a cancel counts once", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const users = [await w.user({ email: "a@x.bd", roles: ["member"] }), await w.user({ email: "b@x.bd", roles: ["member"] }), await w.user({ email: "c@x.bd", roles: ["member"] })];
    const { id } = await createEvent(await w.ctx(pres), { title: "Workshop", startAt: "2030-01-01T10:00", registrationEnabled: "on", capacity: "1" });
    users.forEach((u, i) => w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(`reg_${i}`, id, u, `P${i}`, `${i}@x.bd`, i === 0 ? "REGISTERED" : "WAITLISTED", `2029-01-0${i + 1}`));
    await setRegistrationStatus(await w.ctx(pres), "reg_0", "CANCELLED");
    const status = () => (w.sqlite.prepare("SELECT id, status FROM event_registrations ORDER BY id").all() as Array<{ status: string }>).map((r) => r.status);
    expect(status()).toEqual(["CANCELLED", "REGISTERED", "WAITLISTED"]);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE type = 'event.promoted'").get()).toEqual({ n: 1 });
    await updateEvent(await w.ctx(pres), id, { title: "Workshop", startAt: "2030-01-01T10:00", registrationEnabled: "on", capacity: "5" });
    expect(status()).toEqual(["CANCELLED", "REGISTERED", "REGISTERED"]);
    await cancelMyRegistration(await w.ctx(users[1]!), "reg_1");
    await expect(cancelMyRegistration(await w.ctx(users[1]!), "reg_1")).rejects.toMatchObject({ code: "NOT_ACTIVE" });
  });
});

describe("posts", () => {
  it("syncs any number of tags in three statements and follows a new publish time", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createPost(await w.ctx(pres), { type: "BLOG", title: "Tags", body: "x", tags: Array.from({ length: 20 }, (_, i) => `tag ${i}`).join(",") });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM post_tags WHERE post_id = ?").get(id)).toEqual({ n: 20 });
    const db = new Db(w.db.raw);
    await updatePost({ ...(await w.ctx(pres)), db }, id, { title: "Tags", body: "y", tags: "one,two" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM post_tags WHERE post_id = ?").get(id)).toEqual({ n: 2 });
    expect(db.queries).toBeLessThan(25);

    const later = "2031-06-01T10:00:00.000Z";
    const { id: scheduled } = await createPost(await w.ctx(pres), { type: "NEWS", title: "Later", body: "x", scheduledAt: "2031-01-01T10:00" });
    await publishPost(await w.ctx(pres), scheduled);
    await updatePost(await w.ctx(pres), scheduled, { title: "Later", body: "x", scheduledAt: later });
    expect((w.sqlite.prepare("SELECT published_at FROM posts WHERE id = ?").get(scheduled) as { published_at: string }).published_at).toBe(later);
  });
});

describe("media", () => {
  it("takes a removed lost & found photo offline", async () => {
    const owner = await w.user({ email: "o@x.bd", roles: ["member"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const img = await uploadMedia(await w.ctx(mod), { files: { master: PNG }, originalFilename: "id-card.png" });
    w.sqlite.prepare(`INSERT INTO lost_found_posts (id, user_id, type, title, category, description, location, occurred_at, image_media_id, contact_method, status)
      VALUES ('lf_1', ?, 'found', 'Card', 'id', 'Found near gate', 'Gate', '2026-09-01', ?, 'in_app', 'active')`).run(owner, img.id);
    const key = (w.sqlite.prepare("SELECT object_key FROM media WHERE id = ?").get(img.id) as { object_key: string }).object_key;
    expect(await resolveMediaAccess(await w.ctx(null), key)).not.toBeNull();
    await removeLostFoundImage(await w.ctx(mod), "lf_1");
    expect(await resolveMediaAccess(await w.ctx(null), key)).toBeNull();
    expect(w.bucket.objects.has(key)).toBe(false);
  });
});

describe("reminders", () => {
  it("reminds about a task due within a day and a meeting within the hour, once", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    w.sqlite.prepare("INSERT INTO tasks (id, title, assignee_user_id, created_by, due_at) VALUES ('t1', 'Posters', ?, ?, ?)").run(m, gs, soon(5));
    w.sqlite.prepare("INSERT INTO meetings (id, title, starts_at, created_by) VALUES ('mt1', 'Planning', ?, ?)").run(soon(0.5), gs);
    w.sqlite.prepare("INSERT INTO meeting_participants (meeting_id, user_id) VALUES ('mt1', ?)").run(m);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const first = await runMaintenance(await w.ctx(null));
    expect(first).toMatchObject({ taskReminders: 1, meetingReminders: 1 });
    const again = await runMaintenance(await w.ctx(null));
    expect(again).toMatchObject({ taskReminders: 0, meetingReminders: 0 });
  });
});

// Keeps the Ctx type import used when helpers change.
export type _Ctx = Ctx;
