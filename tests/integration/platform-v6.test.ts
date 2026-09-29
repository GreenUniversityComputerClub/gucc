import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createCommittee } from "@/lib/server/services/committees";
import { savePosition } from "@/lib/server/services/governance";
import { updateOwnProfile } from "@/lib/server/services/members";
import { setOwnAvatar, updatePerson } from "@/lib/server/services/people";
import { chatHome, myConversations, pulse, reportMessage, resolveReport, sendInThread, sendToPerson, setMessagePrivacy, thread } from "@/lib/server/services/messaging";
import { markNotificationUnread, markSeenAtPath, myNotifications, sessionCounts } from "@/lib/server/services/community";
import { deleteOwnAccount } from "@/lib/server/services/account";
import { hashPassword } from "@/lib/server/crypto";
import { buildCommittee, type CommitteeRow, type MemberRow, type PublicExecutive } from "@/lib/public/shapes";
import { COMMITTEES_SQL, MEMBERS_SQL } from "@/lib/public/queries";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

/** A public, ready image uploaded by `by` (what an avatar upload leaves behind). */
function photo(id: string, by: string | null = null) {
  w.sqlite.prepare(
    "INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, visibility, status, uploaded_by) VALUES (?, 'R2', 'public', ?, 'p.png', 'image/png', 'IMAGE', 'PUBLIC', 'READY', ?)",
  ).run(id, `media/${id}/master.png`, by);
  return id;
}

/** Everyone the public roster shows for a committee, by name. */
function roster(committeeId: string): Record<string, PublicExecutive> {
  const c = (w.sqlite.prepare(COMMITTEES_SQL).all() as unknown as CommitteeRow[]).find((x) => x.id === committeeId)!;
  const built = buildCommittee(c, w.sqlite.prepare(MEMBERS_SQL).all() as unknown as MemberRow[]);
  const people = [...((built.facultyMembers as PublicExecutive[]) ?? []), ...((built.studentExecutives as PublicExecutive[]) ?? [])];
  return Object.fromEntries(people.map((p) => [p.name, p]));
}

const row = (sql: string, ...params: Array<string | number | null>) => w.sqlite.prepare(sql).get(...params) as Record<string, unknown>;

describe("people data has one source", () => {
  it("a new profile photo shows at once in every year the person served, past committees included", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    const old = photo("med_old", exec);
    // As in production: the listings carry a copy of the profile photo, with a framing.
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = ?, avatar_position_x = 40, avatar_position_y = 30, avatar_scale = 1.5, student_id = '221902084' WHERE user_id = ?").run(old, exec);
    w.sqlite.prepare("UPDATE committee_members SET avatar_media_id = ?, avatar_position_x = 40, avatar_position_y = 30, avatar_scale = 1.5 WHERE committee_id = ?").run(old, w.committeeId);
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2025', '2025', 'GUCC 2025', '2025', 'ARCHIVED')").run();
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, avatar_media_id, avatar_position_x, avatar_position_y, avatar_scale) SELECT 'cm_2025', 'cmt_2025', id, 'pos:executive-member', 'Executive Member', 'STUDENT', 0, ?, 5, 5, 2 FROM profiles WHERE user_id = ?").run(old, exec);
    expect(roster(w.committeeId)["Nadia Rahman"]!.avatarUrl).toContain("med_old");
    expect(roster("cmt_2025")["Nadia Rahman"]!.avatarUrl).toContain("med_old");

    await setOwnAvatar(await w.ctx(exec), photo("med_new", exec));

    // The current roster, and the past year (which the /executives/<student id> page also reads).
    for (const year of [w.committeeId, "cmt_2025"]) {
      const shown = roster(year)["Nadia Rahman"]!;
      expect(shown.avatarUrl).toContain("med_new");
      // The old zoom belonged to the old picture.
      expect(shown.avatarPosition).toBeUndefined();
      expect(shown.avatarScale).toBeUndefined();
    }
    expect(count("SELECT COUNT(*) n FROM committee_members WHERE avatar_media_id IS NOT NULL AND profile_id = (SELECT id FROM profiles WHERE user_id = ?)", exec)).toBe(0);

    // Removing the photo shows initials everywhere, not an old copy.
    await setOwnAvatar(await w.ctx(exec), null);
    expect(roster(w.committeeId)["Nadia Rahman"]!.avatarUrl).toBeUndefined();
    expect(roster("cmt_2025")["Nadia Rahman"]!.avatarUrl).toBeUndefined();
  });

  it("an admin changing someone's photo (no account needed) updates their past years too", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, person_type, student_id, avatar_media_id) VALUES ('prf_alumna', 'Farhana Alam', 'STUDENT', '191902001', ?)").run(photo("med_2019"));
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2020', '2020', 'GUCC 2020', '2020', 'ARCHIVED')").run();
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, avatar_media_id) VALUES ('cm_2020', 'cmt_2020', 'prf_alumna', 'pos:executive-member', 'Executive Member', 'STUDENT', 0, 'med_2019')").run();
    await updatePerson(await w.ctx(pres), "prf_alumna", { fullName: "Farhana Alam", avatarMediaId: photo("med_2026") });
    expect(roster("cmt_2020")["Farhana Alam"]!.avatarUrl).toContain("med_2026");
  });

  it("someone without a profile photo keeps the photo their past listing has", async () => {
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, person_type) VALUES ('prf_old', 'Imported Person', 'STUDENT')").run();
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2018', '2018', 'GUCC 2018', '2018', 'ARCHIVED')").run();
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, avatar_media_id) VALUES ('cm_2018', 'cmt_2018', 'prf_old', 'pos:executive-member', 'Executive Member', 'STUDENT', 0, ?)").run(photo("med_legacy"));
    expect(roster("cmt_2018")["Imported Person"]!.avatarUrl).toContain("med_legacy");
    // A profile photo that isn't usable yet (still being processed) doesn't hide it either.
    w.sqlite.prepare("INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, visibility, status) VALUES ('med_wip', 'R2', 'public', 'media/med_wip/master.png', 'p.png', 'image/png', 'IMAGE', 'PUBLIC', 'PENDING')").run();
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = 'med_wip' WHERE id = 'prf_old'").run();
    expect(roster("cmt_2018")["Imported Person"]!.avatarUrl).toContain("med_legacy");
  });

  it("the 0010 clean-up gives past listings the profile's photo and keeps the only copy someone has", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Rafi", roles: ["member"], positions: ["executive-member"] });
    const profileId = row("SELECT id FROM profiles WHERE user_id = ?", exec).id as string;
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = ? WHERE id = ?").run(photo("med_now", exec), profileId);
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, person_type) VALUES ('prf_nophoto', 'No Photo', 'STUDENT')").run();
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2022', '2022', 'GUCC 2022', '2022', 'ARCHIVED')").run();
    const add = w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, avatar_media_id, avatar_position_x, avatar_position_y, avatar_scale) VALUES (?, 'cmt_2022', ?, 'pos:executive-member', 'Executive Member', 'STUDENT', ?, ?, 10, 10, 1.4)");
    add.run("cm_old_photo", profileId, 0, photo("med_then"));
    add.run("cm_only_copy", "prf_nophoto", 1, photo("med_only"));
    const sql = readFileSync("migrations/0010_platform_v6.sql", "utf8");
    const step = sql.slice(sql.indexOf("UPDATE committee_members SET\n    avatar_position_x"), sql.indexOf("-- Name and faculty designation"));
    w.sqlite.exec(step);
    expect(row("SELECT avatar_media_id, avatar_scale FROM committee_members WHERE id = 'cm_old_photo'")).toEqual({ avatar_media_id: null, avatar_scale: null });
    expect(row("SELECT avatar_media_id, avatar_scale FROM committee_members WHERE id = 'cm_only_copy'")).toEqual({ avatar_media_id: "med_only", avatar_scale: 1.4 });
    expect(roster("cmt_2022")["Rafi"]!.avatarUrl).toContain("med_now");
  });

  it("keeps the framing when the same photo is saved again", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const exec = await w.user({ email: "e@x.bd", name: "Karim", roles: ["member"], positions: ["executive-member"] });
    const p = photo("med_same");
    const profileId = row("SELECT id FROM profiles WHERE user_id = ?", exec).id as string;
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = ? WHERE id = ?").run(p, profileId);
    w.sqlite.prepare("UPDATE committee_members SET avatar_position_x = 10, avatar_position_y = 20, avatar_scale = 1.2 WHERE profile_id = ?").run(profileId);
    await updatePerson(await w.ctx(pres), profileId, { fullName: "Karim Uddin", avatarMediaId: p });
    const k = roster(w.committeeId)["Karim Uddin"]!;
    expect(k.avatarPosition).toEqual({ x: 10, y: 20 });
    expect(k.avatarScale).toBe(1.2);
  });

  it("a renamed profile shows its new name on the current roster", async () => {
    const exec = await w.user({ email: "e@x.bd", name: "Old Name", roles: ["member"], positions: ["executive-member"] });
    await updateOwnProfile(await w.ctx(exec), { fullName: "New Name", publicEmail: "mailto:new@x.bd" });
    expect(roster(w.committeeId)["New Name"]).toBeDefined();
    // Imported "mailto:" prefixes are cleaned on save.
    expect(row("SELECT public_email FROM profiles WHERE user_id = ?", exec).public_email).toBe("new@x.bd");
  });

  it("archiving a committee freezes who held which post; the photo keeps following the person", async () => {
    const pres = await w.user({ email: "pres@x.bd", name: "Leader", roles: ["member"], positions: ["president"] });
    const exec = await w.user({ email: "e@x.bd", name: "Tanvir", roles: ["member"], positions: ["executive-member"] });
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = ?, github_url = 'https://github.com/tanvir' WHERE user_id = ?").run(photo("med_term", exec), exec);

    await createCommittee(await w.ctx(pres), { name: "GUCC 2027", slug: "2027", termLabel: "2027", status: "CURRENT" });
    const frozen = row("SELECT avatar_media_id, display_name, legacy_json FROM committee_members WHERE committee_id = ? AND profile_id = (SELECT id FROM profiles WHERE user_id = ?)", w.committeeId, exec);
    // No photo copy: the photo stays the profile's.
    expect(frozen).toMatchObject({ avatar_media_id: null, display_name: "Tanvir" });
    expect(JSON.parse(String(frozen.legacy_json))).toMatchObject({ github: "https://github.com/tanvir" });

    await updateOwnProfile(await w.ctx(exec), { fullName: "Tanvir Hasan", github: "https://github.com/other" });
    await setOwnAvatar(await w.ctx(exec), photo("med_later", exec));
    const past = roster(w.committeeId)["Tanvir"]!;
    // The name and links of that term stay; the photo is the person's newest.
    expect(past.github).toBe("https://github.com/tanvir");
    expect(past.avatarUrl).toContain("med_later");
  });

  it("renaming a position renames live listings that used the old name, not chosen titles or history", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const a = await w.user({ email: "a@x.bd", name: "A", roles: ["member"], positions: ["sports-secretary"] });
    const b = await w.user({ email: "b@x.bd", name: "B", roles: ["member"], positions: ["sports-secretary"] });
    const name = row("SELECT name FROM positions WHERE id = 'pos:sports-secretary'").name as string;
    w.sqlite.prepare("UPDATE committee_members SET position_title = ? WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)").run(name, a);
    w.sqlite.prepare("UPDATE committee_members SET position_title = 'Sports Lead (Women)' WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)").run(b);
    const pos = row("SELECT category FROM positions WHERE id = 'pos:sports-secretary'");
    await savePosition(await w.ctx(mod), "pos:sports-secretary", { name: "Sports & Games Secretary", category: pos.category });
    const people = roster(w.committeeId);
    expect(people["A"]!.position).toBe("Sports & Games Secretary");
    expect(people["B"]!.position).toBe("Sports Lead (Women)");
  });
});

/** Two approved members with a conversation (a wrote first). */
async function chatPair() {
  const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
  const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
  const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Hello Babul" });
  return { a, b, conversationId };
}
const count = (sql: string, ...p: Array<string | number | null>) => Number((w.sqlite.prepare(sql).get(...p) as { n: number }).n);

describe("messages show photos and stay correct", () => {
  it("the conversation list and thread show the other person's current photo, never an email", async () => {
    const { a, b, conversationId } = await chatPair();
    await setOwnAvatar(await w.ctx(b), photo("med_b", b));
    const [c] = await myConversations(await w.ctx(a));
    expect(c).toMatchObject({ other_name: "Babul" });
    expect(c!.avatarUrl).toContain("med_b");
    expect(c).not.toHaveProperty("other_email");
    const t = await thread(await w.ctx(a), conversationId);
    expect(t.person?.avatarUrl).toContain("med_b");
    expect(t.sig).toBeTruthy();
  });

  it("a message sent twice with the same client id is stored once", async () => {
    const { a, conversationId } = await chatPair();
    const first = await sendInThread(await w.ctx(a), conversationId, "Are you there?", "client-0001");
    const again = await sendInThread(await w.ctx(a), conversationId, "Are you there?", "client-0001");
    expect(again.id).toBe(first.id);
    expect(count("SELECT COUNT(*) n FROM messages WHERE body = 'Are you there?'")).toBe(1);
  });

  it("pulse changes only when something in the thread changes", async () => {
    const { a, b, conversationId } = await chatPair();
    const s1 = (await pulse(await w.ctx(a), conversationId)).sig;
    expect((await pulse(await w.ctx(a), conversationId)).sig).toBe(s1);
    await sendInThread(await w.ctx(b), conversationId, "Yes, coming!");
    expect((await pulse(await w.ctx(a), conversationId)).sig).not.toBe(s1);
  });

  it("a deleted account shows as Former member", async () => {
    const { a, b } = await chatPair();
    w.sqlite.prepare("UPDATE users SET deleted_at = '2026-01-01', email = 'deleted+x@invalid' WHERE id = ?").run(b);
    const [c] = await myConversations(await w.ctx(a));
    expect(c!.other_name).toBe("Former member");
  });

  it("message settings come back as saved", async () => {
    const { a } = await chatPair();
    await setMessagePrivacy(await w.ctx(a), { privacy: "EXECUTIVES", readReceipts: false });
    expect((await chatHome(await w.ctx(a))).settings).toEqual({ privacy: "EXECUTIVES", readReceipts: false });
  });
});

describe("reporting and blocking", () => {
  it("a report is confirmed, can block at the same time, and a repeat says it was already sent", async () => {
    const { a, b, conversationId } = await chatPair();
    await sendInThread(await w.ctx(b), conversationId, "buy my stuff at http://spam.example");
    const msg = (await thread(await w.ctx(a), conversationId)).messages.find((m) => !m.mine)!;
    await expect(reportMessage(await w.ctx(a), msg.id, { category: "OTHER" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await reportMessage(await w.ctx(a), msg.id, { category: "SPAM", block: true, includeContext: true })).toEqual({ already: false, blocked: true });
    expect(count("SELECT COUNT(*) n FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?", a, b)).toBe(1);
    expect(row("SELECT category, snapshot FROM reports WHERE resource_id = ?", msg.id)).toMatchObject({ category: "SPAM" });
    expect(String(row("SELECT snapshot FROM reports WHERE resource_id = ?", msg.id).snapshot)).toContain("[earlier] Reporter: Hello Babul");
    expect(await reportMessage(await w.ctx(a), msg.id, { category: "SPAM" })).toMatchObject({ already: true });
    expect((await thread(await w.ctx(a), conversationId)).messages.find((m) => m.id === msg.id)?.reported).toBe(true);
  });

  it("reports reach a moderator who can open them; resolving tells both sides and can pause messaging", async () => {
    const { a, b, conversationId } = await chatPair();
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    await sendInThread(await w.ctx(b), conversationId, "you are stupid");
    const msg = (await thread(await w.ctx(a), conversationId)).messages.find((m) => !m.mine)!;
    await reportMessage(await w.ctx(a), msg.id, { category: "HARASSMENT" });
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'report.new'", mod)).toBe(1);

    const reportId = String(row("SELECT id FROM reports WHERE resource_id = ?", msg.id).id);
    await resolveReport(await w.ctx(mod), reportId, "ACTIONED", "Be respectful.", { remove: true, warn: true, restrictDays: 7 });
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'report.resolved'", a)).toBe(1);
    expect(row("SELECT title FROM notifications WHERE user_id = ? AND type = 'report.sender'", b).title).toMatch(/paused until/);
    await expect(sendInThread(await w.ctx(b), conversationId, "sorry")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await chatHome(await w.ctx(b))).restrictedUntil).toBeTruthy();
  });
});

describe("notifications", () => {
  it("record who caused them and show that person's photo", async () => {
    const { a, b } = await chatPair();
    await setOwnAvatar(await w.ctx(a), photo("med_a", a));
    const { rows } = await myNotifications(await w.ctx(b));
    const n = rows.find((r) => r.type === "message.received")!;
    expect(n.actor?.name).toBe("Anika");
    expect(n.actor?.avatarUrl).toContain("med_a");
  });

  it("opening the page a notification points to clears it; mark unread undoes; counts stay right", async () => {
    const { b, conversationId } = await chatPair();
    expect(await sessionCounts(await w.ctx(b))).toMatchObject({ unread: 1, unreadMessages: 1 });
    expect(await markSeenAtPath(await w.ctx(b), `/dashboard/chat/${conversationId}`)).toEqual({ cleared: 1 });
    expect((await sessionCounts(await w.ctx(b))).unread).toBe(0);
    const id = (await myNotifications(await w.ctx(b))).rows[0]!.id;
    await markNotificationUnread(await w.ctx(b), id);
    expect((await sessionCounts(await w.ctx(b))).unread).toBe(1);
    // Other pages, and the notifications page itself, clear nothing.
    expect(await markSeenAtPath(await w.ctx(b), "/dashboard/notifications")).toEqual({ cleared: 0 });
    expect(await markSeenAtPath(await w.ctx(b), "/dashboard/tasks")).toEqual({ cleared: 0 });
  });

  it("the live counts work from the session alone (no permission load)", async () => {
    const { b } = await chatPair();
    const ctx = await w.ctx(null);
    ctx.session = { id: "s", userId: b, createdAt: "", lastSeenAt: null, reauthAt: null, idleHoursSensitive: 12 };
    expect(await sessionCounts(ctx)).toMatchObject({ unread: 1, unreadMessages: 1, openTasks: 0 });
    await expect(sessionCounts(await w.ctx(null))).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("account deletion", () => {
  it("clears public details everywhere, cancels open tasks and shows Former member", async () => {
    const exec = await w.user({ email: "gone@x.bd", name: "Leaving Person", roles: ["member"], positions: ["executive-member"] });
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", "test-pepper-0123456789"), exec);
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = ?, github_url = 'https://github.com/x', bio = 'hi' WHERE user_id = ?").run(photo("med_gone"), exec);
    w.sqlite.prepare("INSERT INTO tasks (id, title, assignee_user_id, created_by) VALUES ('tsk_1', 'Poster', ?, ?)").run(exec, pres);
    await deleteOwnAccount(await w.ctx(exec), { password: "correct-Horse-battery", confirm: "DELETE" });
    const listed = roster(w.committeeId)["Leaving Person"]!;
    expect(listed).toBeDefined();
    expect(listed.avatarUrl).toBeUndefined();
    expect(listed.github).toBeUndefined();
    expect(row("SELECT status FROM tasks WHERE id = 'tsk_1'").status).toBe("CANCELLED");
  });
});

describe("member submissions", () => {
  const post = (title: string, type = "BLOG") => ({ title, type, body: "Some words about the workshop we ran last week." });

  it("an approved member writes a blog post; reviewers (including the Publication Secretary) approve it, not the author", async () => {
    const { createPost, publishPost } = await import("@/lib/server/services/posts");
    const { decideApproval, getApproval, listApprovals } = await import("@/lib/server/services/approvals");
    const member = await w.user({ email: "writer@x.bd", name: "Writer", roles: ["member"] });
    const pubsec = await w.user({ email: "pub@x.bd", roles: ["member"], positions: ["publication-secretary"] });
    await expect(createPost(await w.ctx(member), post("Official news", "NEWS"))).rejects.toMatchObject({ code: "VALIDATION" });
    const { id } = await createPost(await w.ctx(member), post("What I learned at the workshop"));
    const sent = await publishPost(await w.ctx(member), id);
    expect(sent.outcome).toBe("PENDING_APPROVAL");
    const requestId = sent.requestId!;
    expect((await getApproval(await w.ctx(pubsec), requestId)).canDecide).toBe(true);
    // It is in their "Waiting for me" queue too.
    expect((await listApprovals(await w.ctx(pubsec), { forMe: true })).map((r) => r.id)).toContain(requestId);
    await expect(decideApproval(await w.ctx(member), requestId, "APPROVE")).rejects.toBeTruthy();
    await decideApproval(await w.ctx(pubsec), requestId, "APPROVE", "Nice write-up");
    expect(row("SELECT status FROM posts WHERE id = ?", id).status).toBe("PUBLISHED");
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type LIKE 'approval.%'", member)).toBeGreaterThan(0);
  });

  it("limits waiting items, and leaders can pause submissions", async () => {
    const { createPost, publishPost } = await import("@/lib/server/services/posts");
    const member = await w.user({ email: "busy@x.bd", roles: ["member"] });
    for (let i = 1; i <= 3; i++) {
      const { id } = await createPost(await w.ctx(member), post(`Post number ${i}`));
      expect((await publishPost(await w.ctx(member), id)).outcome).toBe("PENDING_APPROVAL");
    }
    const { id } = await createPost(await w.ctx(member), post("Post number 4"));
    await expect(publishPost(await w.ctx(member), id)).rejects.toMatchObject({ code: "VALIDATION" });
    w.sqlite.prepare("UPDATE system_settings SET value_json = 'false' WHERE key = 'content.member_submissions'").run();
    await expect(createPost(await w.ctx(member), post("Post number 5"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a member's event stays private and takes no registrations until approved", async () => {
    const { createEvent, publishEvent, registerForEvent } = await import("@/lib/server/services/events");
    const member = await w.user({ email: "org@x.bd", roles: ["member"] });
    const { id } = await createEvent(await w.ctx(member), { title: "Study circle", startAt: "2030-06-01T10:00", registrationEnabled: "on" });
    expect((await publishEvent(await w.ctx(member), id)).outcome).toBe("PENDING_APPROVAL");
    const slug = String(row("SELECT slug FROM events WHERE id = ?", id).slug);
    await expect(registerForEvent(await w.ctx(null), slug, { name: "Guest", email: "g@x.bd" })).rejects.toBeTruthy();
    expect(row("SELECT value_json FROM system_settings WHERE key = 'events.default_approval_policy'").value_json).toBe('"event-reviewers"');
  });

  it("a policy setting must name a real policy", async () => {
    const { updateSystemSetting } = await import("@/lib/server/services/governance");
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const ctx = await w.ctx(mod);
    w.sqlite.prepare("UPDATE sessions SET reauth_at = ? WHERE user_id = ?").run(new Date().toISOString(), mod);
    await expect(updateSystemSetting(ctx, "content.default_approval_policy", '"no-such-policy"')).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("approval reminders", () => {
  it("reviewers get one reminder when a request has waited two days", async () => {
    const { createPost, publishPost } = await import("@/lib/server/services/posts");
    const { remindStaleApprovals } = await import("@/lib/server/services/approvals");
    const member = await w.user({ email: "w@x.bd", roles: ["member"] });
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const { id } = await createPost(await w.ctx(member), { type: "BLOG", title: "Waiting", body: "x" });
    await publishPost(await w.ctx(member), id);
    expect(await remindStaleApprovals(await w.ctx(null))).toBe(0);
    const later = new Date(Date.now() + 3 * 86_400_000);
    expect(await remindStaleApprovals(await w.ctx(null), later)).toBe(1);
    expect(await remindStaleApprovals(await w.ctx(null), later)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'approval.reminder'", pres)).toBe(1);
  });
});

describe("profiles people can visit", () => {
  it("members see members-only profiles; visitors don't; private stays private; private data never leaks", async () => {
    const { getProfile, membersDirectory } = await import("@/lib/server/services/profiles");
    const owner = await w.user({ email: "owner@x.bd", name: "Rafi Hasan", roles: ["member"] });
    const viewer = await w.user({ email: "viewer@x.bd", name: "Viewer", roles: ["member"] });
    w.sqlite.prepare("UPDATE profiles SET bio = 'I build robots.', phone = '01700000000', student_id = '232002111', skills_json = '[\"React\",\"C++\"]' WHERE user_id = ?").run(owner);
    await updateOwnProfile(await w.ctx(owner), { fullName: "Rafi Hasan", bio: "I build robots." });
    const handle = String(row("SELECT slug FROM profiles WHERE user_id = ?", owner).slug);
    expect(handle).toBe("rafi-hasan");

    const seen = await getProfile(await w.ctx(viewer), handle);
    expect(seen.restricted).toBe(false);
    if (!seen.restricted) {
      expect(seen.bio).toBe("I build robots.");
      expect(seen.skills).toEqual(["React", "C++"]);
      expect(seen.canMessage).toBe(true);
    }
    const json = JSON.stringify(seen);
    for (const secret of ["01700000000", "232002111", "owner@x.bd"]) expect(json).not.toContain(secret);

    expect((await getProfile(await w.ctx(null), handle)).restricted).toBe(true);
    await updateOwnProfile(await w.ctx(owner), { fullName: "Rafi Hasan", visibility: "PUBLIC" });
    expect((await getProfile(await w.ctx(null), handle)).restricted).toBe(false);
    await updateOwnProfile(await w.ctx(owner), { fullName: "Rafi Hasan", visibility: "PRIVATE" });
    expect((await getProfile(await w.ctx(viewer), handle)).restricted).toBe(true);
    expect((await getProfile(await w.ctx(owner), handle)).restricted).toBe(false);
    expect((await membersDirectory(await w.ctx(viewer), {})).rows.map((r) => r.name)).not.toContain("Rafi Hasan");
    await expect(membersDirectory(await w.ctx(null), {})).rejects.toBeTruthy();
  });

  it("a public member page is linked from the executive page, listed in the sitemap, and links back", async () => {
    const { getProfile } = await import("@/lib/server/services/profiles");
    const { readSitemap } = await import("@/lib/public/read");
    const exec = await w.user({ email: "e@x.bd", name: "Sadia Karim", roles: ["member"], positions: ["executive-member"] });
    w.sqlite.prepare("UPDATE profiles SET student_id = '221902084' WHERE user_id = ?").run(exec);
    await updateOwnProfile(await w.ctx(exec), { fullName: "Sadia Karim", visibility: "PUBLIC" });
    const handle = String(row("SELECT slug FROM profiles WHERE user_id = ?", exec).slug);
    expect(roster(w.committeeId)["Sadia Karim"]!.profileHandle).toBe(handle);
    const page = await getProfile(await w.ctx(null), handle);
    expect(!page.restricted && page.executivePage).toBe("/executives/221902084");
    expect((await readSitemap(w.db)).members.map((m) => m.handle)).toContain(handle);

    // Members-only again: no link from the executive page, not in the sitemap.
    await updateOwnProfile(await w.ctx(exec), { fullName: "Sadia Karim", visibility: "MEMBERS" });
    expect(roster(w.committeeId)["Sadia Karim"]!.profileHandle).toBeUndefined();
    expect((await readSitemap(w.db)).members.map((m) => m.handle)).not.toContain(handle);
  });

  it("names clash into distinct handles; committee members stay visible by name and position", async () => {
    const { ensureProfileHandle, getProfile } = await import("@/lib/server/services/profiles");
    const a = await w.user({ email: "a1@x.bd", name: "Same Name", roles: ["member"] });
    const b = await w.user({ email: "b1@x.bd", name: "Same Name", roles: ["member"], positions: ["executive-member"] });
    const pa = String(row("SELECT id FROM profiles WHERE user_id = ?", a).id);
    const pb = String(row("SELECT id FROM profiles WHERE user_id = ?", b).id);
    const [ha, hb] = [await ensureProfileHandle(await w.ctx(a), pa, "Same Name"), await ensureProfileHandle(await w.ctx(b), pb, "Same Name")];
    expect(ha).toBe("same-name");
    expect(hb).toBe("same-name-2");
    w.sqlite.prepare("UPDATE profiles SET visibility = 'PRIVATE', bio = 'secret' WHERE id = ?").run(pb);
    const p = await getProfile(await w.ctx(null), hb);
    expect(p.restricted).toBe(false);
    if (!p.restricted) {
      expect(p.limited).toBe(true);
      expect(p.bio).toBeNull();
      expect(p.current.length).toBe(1);
    }
  });
});

describe("notices say who and what, and open a page the person can use", () => {
  const titles = (userId: string) => (w.sqlite.prepare("SELECT title, body, link FROM notifications WHERE user_id = ? ORDER BY created_at, rowid").all(userId) as Array<{ title: string; body: string | null; link: string | null }>);

  it("a contact message reaches the inbox holders once, when no rule is set up", async () => {
    const { submitContact } = await import("@/lib/server/services/contact");
    const info = await w.user({ email: "info@x.bd", roles: ["member"], positions: ["information-secretary"] });
    const member = await w.user({ email: "plain@x.bd", roles: ["member"] });
    await submitContact(await w.ctx(null, { ipHash: "c7" }), { name: "A Visitor", email: "visitor@example.com", message: "Hello, we would like to sponsor your next event." });
    expect(titles(info)).toEqual([expect.objectContaining({ title: "Contact message from A Visitor", link: "/dashboard/messages" })]);
    expect(titles(member)).toEqual([]);
  });

  it("tasks: a reassigned person is sent to their list; the assignee hears a reopen once; changes are named", async () => {
    const { createTask, updateTask } = await import("@/lib/server/services/work");
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const a = await w.user({ email: "ta@x.bd", name: "Asha", roles: ["member"], positions: ["executive-member"] });
    const b = await w.user({ email: "tb@x.bd", name: "Bilal", roles: ["member"], positions: ["executive-member"] });
    const { id } = await createTask(await w.ctx(pres), { title: "Book the hall", assigneeUserId: a });
    await updateTask(await w.ctx(pres), id, { priority: "HIGH" });
    expect(titles(a).at(-1)!.body).toContain("priority (now high)");
    await updateTask(await w.ctx(a), id, { status: "DONE" });
    await updateTask(await w.ctx(pres), id, { status: "OPEN", details: "The big one, please." });
    const reopened = titles(a).filter((n) => n.title.includes("reopened"));
    expect(reopened).toHaveLength(1);
    expect(titles(a).filter((n) => n.title.startsWith("Task changed"))).toHaveLength(1); // only the earlier priority change
    await updateTask(await w.ctx(pres), id, { assigneeUserId: b });
    expect(titles(a).at(-1)).toMatchObject({ title: "Task moved to someone else: Book the hall", link: "/dashboard/tasks" });
  });

  it("meetings: removed people are told and sent to their list; a move says what it was before", async () => {
    const { scheduleMeeting, updateMeeting } = await import("@/lib/server/services/work");
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const a = await w.user({ email: "ma@x.bd", roles: ["member"], positions: ["executive-member"] });
    const b = await w.user({ email: "mb@x.bd", roles: ["member"], positions: ["executive-member"] });
    const { id } = await scheduleMeeting(await w.ctx(pres), { title: "Sync", startsAt: "2030-05-03T10:00", participants: `${a},${b}` });
    await updateMeeting(await w.ctx(pres), id, { title: "Sync", startsAt: "2030-05-04T10:00", participants: a });
    expect(titles(b).at(-1)).toMatchObject({ title: "You're no longer in: Sync", link: "/dashboard/meetings" });
    expect(titles(a).at(-1)!.body).toMatch(/^Now .*Was /);
  });

  it("role and permission notices open the person's own access page", async () => {
    const { grantRole } = await import("@/lib/server/services/governance");
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const m = await w.user({ email: "m7@x.bd", roles: ["member"] });
    expect(await grantRole(await w.ctx(pres), m, "administrator", "Runs the media library")).toMatchObject({ applied: true });
    expect(titles(m).find((x) => x.title.includes("administrator"))).toMatchObject({ link: `/dashboard/access/${m}` });
  });
});

describe("post versions", () => {
  it("an earlier version can be read, and restoring it keeps the post's current address", async () => {
    const { createPost, updatePost, getRevision, restoreRevision } = await import("@/lib/server/services/posts");
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const { id } = await createPost(await w.ctx(pres), { title: "First title", type: "BLOG", body: "The first words of this post." });
    const first = row("SELECT id FROM post_revisions WHERE post_id = ? AND version = 1", id).id as string;
    const updated = String(row("SELECT updated_at FROM posts WHERE id = ?", id).updated_at);
    await updatePost(await w.ctx(pres), id, { title: "Second title", slug: "second-title", body: "Different words now.", expectedUpdatedAt: updated });
    const rev = await getRevision(await w.ctx(pres), id, first);
    expect(rev).toMatchObject({ version: 1, title: "First title", current_version: 2 });
    await restoreRevision(await w.ctx(pres), id, first);
    expect(row("SELECT title, slug, current_version FROM posts WHERE id = ?", id)).toMatchObject({ title: "First title", slug: "second-title", current_version: 3 });
  });
});
