/**
 * Member features of v4: messaging (privacy, blocks, reports, edit window), the activity log,
 * self-service security (devices, email change, account deletion) and cancelling a registration.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/server/crypto";
import { activityFeed, diffSnapshots } from "@/lib/server/services/activity";
import { changeEmail, confirmEmailChange, deleteOwnAccount, mySessions, revokeOtherSessions } from "@/lib/server/services/account";
import { cancelMyRegistration } from "@/lib/server/services/events";
import {
  deleteMessage, editMessage, listReports, myConversations, reportMessage, resolveReport, sendInThread, sendToPerson, setBlock, setMessagePrivacy, thread, unreadConversations,
} from "@/lib/server/services/messaging";
import { updateOwnProfile } from "@/lib/server/services/members";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const PEPPER = "test-pepper-0123456789";

describe("messaging", () => {
  it("two members talk; the recipient is notified once per unread stretch and sees 'Seen' state", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Hi! Are you coming to the workshop?" });
    await sendInThread(await w.ctx(a), conversationId, "It starts at 3.");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'message.received'").get(b)).toEqual({ n: 1 });
    expect(await unreadConversations(await w.ctx(b))).toBe(1);
    const t = await thread(await w.ctx(b), conversationId);
    expect(t.messages.map((m) => m.body)).toEqual(["Hi! Are you coming to the workshop?", "It starts at 3."]);
    expect(await unreadConversations(await w.ctx(b))).toBe(0);
    await sendInThread(await w.ctx(b), conversationId, "Yes, see you there.");
    const list = await myConversations(await w.ctx(a));
    expect(list[0]).toMatchObject({ id: conversationId, unread: 1, last_body: "Yes, see you there." });
    // Starting again with the same person continues the same thread.
    expect((await sendToPerson(await w.ctx(b), { userId: a, body: "One more thing" })).conversationId).toBe(conversationId);
  });

  it("respects privacy settings and blocks in both directions; applicants can't send", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    await setMessagePrivacy(await w.ctx(b), { privacy: "EXECUTIVES" });
    await expect(sendToPerson(await w.ctx(a), { userId: b, body: "hello" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendToPerson(await w.ctx(exec), { userId: b, body: "hello from the committee" })).resolves.toBeTruthy();
    await setMessagePrivacy(await w.ctx(b), { privacy: "EVERYONE" });
    await setBlock(await w.ctx(b), a, true);
    await expect(sendToPerson(await w.ctx(a), { userId: b, body: "hello?" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendToPerson(await w.ctx(b), { userId: a, body: "hello?" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const applicant = await w.user({ email: "new@x.bd", status: "PENDING_APPROVAL" });
    await expect(sendToPerson(await w.ctx(applicant), { userId: exec, body: "hi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendToPerson(await w.ctx(a), { userId: a, body: "me" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("edits only within 15 minutes; deleting hides the text", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "typo here" });
    const id = (w.sqlite.prepare("SELECT id FROM messages WHERE conversation_id = ?").get(conversationId) as { id: string }).id;
    await editMessage(await w.ctx(a), id, "no typo here");
    await expect(editMessage(await w.ctx(b), id, "not mine")).rejects.toMatchObject({ code: "NOT_FOUND" });
    w.sqlite.prepare("UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id);
    await expect(editMessage(await w.ctx(a), id, "too late")).rejects.toMatchObject({ code: "TOO_LATE" });
    await deleteMessage(await w.ctx(a), id);
    expect((await thread(await w.ctx(b), conversationId)).messages[0]).toMatchObject({ deleted: true, body: null });
  });

  it("a reported message reaches moderators; other messages in the thread stay private", async () => {
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "A perfectly normal message" });
    await sendInThread(await w.ctx(a), conversationId, "Something rude");
    const rude = (w.sqlite.prepare("SELECT id FROM messages WHERE body = 'Something rude'").get() as { id: string }).id;
    await reportMessage(await w.ctx(b), rude, "Insulting language");
    await expect(listReports(await w.ctx(a))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const reports = await listReports(await w.ctx(pres));
    expect(reports).toHaveLength(1);
    expect(reports[0].body).toBe("Something rude");
    expect(JSON.stringify(reports)).not.toContain("perfectly normal");
    await resolveReport(await w.ctx(pres), reports[0].id, "ACTIONED", "Removed", true);
    expect(w.sqlite.prepare("SELECT deleted_at IS NOT NULL AS gone FROM messages WHERE id = ?").get(rude)).toEqual({ gone: 1 });
    // Leaders can't open a conversation they're not part of.
    await expect(thread(await w.ctx(pres), conversationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sending a message stays within the statement budget", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const ctx = await w.ctx(a);
    const before = ctx.db.queries;
    await sendToPerson(ctx, { userId: b, body: "first" });
    expect(ctx.db.queries - before).toBeLessThanOrEqual(20);
  });
});

describe("activity log", () => {
  it("reads as sentences, filters by area and person, and pages with a cursor", async () => {
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"], name: "Priya President" });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    for (let i = 0; i < 45; i++) {
      w.sqlite.prepare("INSERT INTO audit_logs (id, actor_user_id, actor_label, action, resource_type, resource_id, created_at) VALUES (?, ?, 'Priya President', 'member.approve', 'user', ?, ?)")
        .run(`aud_${i}`, pres, member, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString());
    }
    const first = await activityFeed(await w.ctx(pres), { area: "Members" });
    expect(first.entries).toHaveLength(40);
    expect(first.entries[0]).toMatchObject({ verb: "approved the membership of", showTarget: true, area: "Members" });
    expect(first.entries[0].sentence).toMatch(/^Priya President approved the membership of /);
    const second = await activityFeed(await w.ctx(pres), { area: "Members", before: first.next! });
    expect(second.entries).toHaveLength(5);
    expect(second.next).toBeNull();
    // Members read only their own activity.
    await expect(activityFeed(await w.ctx(member), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(activityFeed(await w.ctx(member), { actor: member })).resolves.toBeTruthy();
  });

  it("shows field-by-field changes and hides secrets", () => {
    expect(diffSnapshots(JSON.stringify({ name: "Old", phone: "017", same: 1 }), JSON.stringify({ name: "New", phone: "018", same: 1 }))).toEqual([{ field: "name", before: "Old", after: "New" }]);
  });
});

describe("self-service", () => {
  it("members edit their own profile, including skills; applicants can fix their details", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    await updateOwnProfile(await w.ctx(m), { fullName: "Mina Member", skills: "Python, UI design, Python", twitter: "https://x.com/mina", publicEmail: "mina@example.com" });
    expect(w.sqlite.prepare("SELECT skills_json, twitter_url, public_email FROM profiles WHERE user_id = ?").get(m)).toEqual({ skills_json: '["Python","UI design"]', twitter_url: "https://x.com/mina", public_email: "mina@example.com" });
    const applicant = await w.user({ email: "a@x.bd", status: "PENDING_APPROVAL" });
    await expect(updateOwnProfile(await w.ctx(applicant), { fullName: "Anika Applicant" })).resolves.toBeUndefined();
  });

  it("lists devices, signs out the others and changes the sign-in email with the password", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), m);
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, '2099-01-01', 'Mozilla/5.0 (Linux; Android 14) Chrome/120')").run("a".repeat(64), m);
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, '2099-01-01', 'Mozilla/5.0 (Windows NT 10.0) Firefox/120')").run("b".repeat(64), m);
    const devices = await mySessions(await w.ctx(m), null);
    expect(devices.map((d) => d.device).sort()).toEqual(["Chrome on Android", "Firefox on Windows"]);
    expect((await revokeOtherSessions(await w.ctx(m), null)).signedOut).toBe(2);
    await expect(changeEmail(await w.ctx(m), { password: "wrong", email: "new@x.bd" })).rejects.toMatchObject({ code: "VALIDATION" });
    // With email working, the new address confirms from a link; the old one is told, and nothing changes until then.
    const asked = await changeEmail(await w.ctx(m), { password: "correct-Horse-battery", email: "New@X.bd" });
    expect(asked.message).toMatch(/Check new@x.bd for a confirmation link.*spam/);
    expect(w.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(m)).toEqual({ email: "m@x.bd" });
    expect(w.emails.map((e) => e.to).sort()).toEqual(["m@x.bd", "new@x.bd"]);
    const link = w.emails.find((e) => e.to === "new@x.bd")!.text.match(/confirm-email\?token=([\w-]+)/)![1]!;
    await expect(confirmEmailChange(await w.ctx(null), "not-a-real-token")).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, '2099-01-01')").run("c".repeat(64), m);
    expect(await confirmEmailChange(await w.ctx(null), link)).toEqual({ email: "new@x.bd" });
    expect(w.sqlite.prepare("SELECT email, email_verified_at IS NOT NULL AS verified FROM users WHERE id = ?").get(m)).toEqual({ email: "new@x.bd", verified: 1 });
    // Every device signs in again, the old address hears about it, and the link works once.
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND revoked_at IS NULL").get(m)).toEqual({ n: 0 });
    expect(w.emails.at(-1)).toMatchObject({ to: "m@x.bd", subject: "Your GUCC sign-in email was changed" });
    await expect(confirmEmailChange(await w.ctx(null), link)).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("changes the sign-in email at once when email isn't set up, signing out other devices", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), m);
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, '2099-01-01')").run("d".repeat(64), m);
    const c = await w.ctx(m);
    const res = await changeEmail({ ...c, sendEmail: undefined, env: { ...c.env, APP_ENV: "production" } }, { password: "correct-Horse-battery", email: "other@x.bd" });
    expect(res.message).toMatch(/Sign in with other@x.bd/);
    expect(w.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(m)).toEqual({ email: "other@x.bd" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND revoked_at IS NULL").get(m)).toEqual({ n: 0 });
  });

  it("deleting an account removes private details, keeps committee history and protects the last Moderator", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator", "member"] });
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    for (const id of [mod, exec, member]) w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), id);
    await expect(deleteOwnAccount(await w.ctx(mod), { password: "correct-Horse-battery", confirm: "DELETE" })).rejects.toMatchObject({ code: "LAST_PROTECTED_HOLDER" });
    await expect(deleteOwnAccount(await w.ctx(member), { password: "correct-Horse-battery", confirm: "nope" })).rejects.toMatchObject({ code: "VALIDATION" });
    await deleteOwnAccount(await w.ctx(member), { password: "correct-Horse-battery", confirm: "DELETE" });
    expect(w.sqlite.prepare("SELECT status, email LIKE 'deleted+%' AS anon FROM users WHERE id = ?").get(member)).toEqual({ status: "ARCHIVED", anon: 1 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM profiles WHERE user_id = ?").get(member)).toEqual({ n: 0 });
    await deleteOwnAccount(await w.ctx(exec), { password: "correct-Horse-battery", confirm: "DELETE" });
    // The executive listing stays in history, unlinked.
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id WHERE p.deleted_at IS NULL AND p.user_id IS NULL").get()).toEqual({ n: 1 });
  });

  it("cancelling a registration frees the seat for the first person waiting", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    w.sqlite.exec("INSERT INTO events (id, slug, title, status, start_at, capacity, registration_enabled) VALUES ('evt_x', 'x', 'Workshop', 'PUBLISHED', '2099-01-01T10:00:00Z', 1, 1)");
    w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status, created_at) VALUES ('reg_a', 'evt_x', ?, 'A', 'a@x.bd', 'REGISTERED', '2026-01-01')").run(a);
    w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status, created_at) VALUES ('reg_b', 'evt_x', ?, 'B', 'b@x.bd', 'WAITLISTED', '2026-01-02')").run(b);
    await expect(cancelMyRegistration(await w.ctx(b), "reg_a")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelMyRegistration(await w.ctx(a), "reg_a");
    expect(w.sqlite.prepare("SELECT id, status FROM event_registrations ORDER BY id").all()).toEqual([{ id: "reg_a", status: "CANCELLED" }, { id: "reg_b", status: "REGISTERED" }]);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'event.promoted'").get(b)).toEqual({ n: 1 });
  });
});
