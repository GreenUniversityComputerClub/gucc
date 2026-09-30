/**
 * Round 8 messaging: group conversations (who may create, rename and manage them), reactions,
 * replies, truthful club badges, the member directory, and the live events a change produces.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import type { LiveItem } from "@/lib/server/live";
import { verifyPass, type RoomPass } from "@/lib/server/live";
import {
  chatDirectory, chatHome, deleteMessage, myConversations, reactToMessage, sendInThread, sendToPerson, setBlock, setConversationState, setMessagePrivacy, thread,
} from "@/lib/server/services/messaging";
import { addGroupMembers, createGroup, deleteGroup, leaveGroup, removeGroupMember, setGroupRole, transferGroup, updateGroup } from "@/lib/server/services/messaging-groups";
import { positionShort } from "@/lib/server/person-badge";
import { sessionCounts } from "@/lib/server/services/community";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const n = (sql: string, ...p: Array<string | number | null>) => Number((w.sqlite.prepare(sql).get(...p) as { n: number }).n);
const live = async (userId: string): Promise<Ctx & { live: LiveItem[] }> => ({ ...(await w.ctx(userId)), live: [] });

async function people() {
  const owner = await w.user({ email: "o@x.bd", name: "Orin", roles: ["member"] });
  const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
  const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
  const pres = await w.user({ email: "p@x.bd", name: "Priya", roles: ["member"], positions: ["president"] });
  const treasurer = await w.user({ email: "t@x.bd", name: "Tanvir", roles: ["member"], positions: ["treasurer"] });
  return { owner, a, b, pres, treasurer };
}

describe("group conversations", () => {
  it("any member starts one with at least two people; everyone sees it with a system line and a notice", async () => {
    const { owner, a, b } = await people();
    await expect(createGroup(await w.ctx(owner), { name: "Posters", memberIds: [a] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createGroup(await w.ctx(owner), { name: " ", memberIds: [a, b] })).rejects.toMatchObject({ code: "VALIDATION" });
    const ctx = await live(owner);
    const { conversationId } = await createGroup(ctx, { name: "Poster team", memberIds: [a, b], description: "Designs for the fair" });
    expect(ctx.live.some((i) => i.ev.t === "conv" && i.to.includes(a) && i.to.includes(b))).toBe(true);
    const [row] = await myConversations(await w.ctx(a));
    expect(row).toMatchObject({ id: conversationId, isGroup: true, other_name: "Poster team", memberCount: 3, unread: 1, last_kind: "SYSTEM" });
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title LIKE 'Orin added you%'", a)).toBe(1);
    const t = await thread(await w.ctx(a), conversationId);
    expect(t.group).toMatchObject({ name: "Poster team", description: "Designs for the fair", ownerId: owner, canManage: false });
    expect(t.group!.members.map((m) => m.name)).toEqual(["Orin", "Anika", "Babul"]);
    expect(t.messages[0]).toMatchObject({ kind: "SYSTEM", body: "Orin created the group “Poster team” with Anika and Babul." });
    const room = await verifyPass<RoomPass>({ AUTH_SECRET: "test-auth-secret-0123456789abcdef" }, t.room, "room");
    expect(room).toMatchObject({ u: a, c: conversationId });
    expect(room!.m.sort()).toEqual([owner, b].sort());
  });

  it("can't include people who don't accept messages from the creator", async () => {
    const { owner, a, b } = await people();
    await setMessagePrivacy(await w.ctx(b), { privacy: "NOBODY" });
    await expect(createGroup(await w.ctx(owner), { name: "Nope", memberIds: [a, b] })).rejects.toMatchObject({ code: "VALIDATION" });
    await setMessagePrivacy(await w.ctx(b), { privacy: "EVERYONE" });
    await setBlock(await w.ctx(a), owner, true);
    await expect(createGroup(await w.ctx(owner), { name: "Nope", memberIds: [a, b] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("a group message reaches every member once per unread stretch (never when muted) and counts as unread", async () => {
    const { owner, a, b } = await people();
    const { conversationId } = await createGroup(await w.ctx(owner), { name: "Crew", memberIds: [a, b] });
    await thread(await w.ctx(a), conversationId);
    await thread(await w.ctx(b), conversationId);
    await setConversationState(await w.ctx(b), conversationId, { muted: true });
    const ctx = await live(owner);
    await sendInThread(ctx, conversationId, "Meeting at 3");
    await sendInThread(await w.ctx(owner), conversationId, "Bring markers");
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'message.received' AND title = 'Orin in Crew'", a)).toBe(1);
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND title = 'Orin in Crew'", b)).toBe(0);
    expect((await sessionCounts(await w.ctx(a))).unreadMessages).toBe(1);
    const msg = ctx.live.find((i) => i.ev.t === "msg")!;
    expect(msg.to.sort()).toEqual([owner, a, b].sort());
    expect(msg.ev).toMatchObject({ t: "msg", c: conversationId, group: "Crew", m: { body: "Meeting at 3", senderName: "Orin" } });
    const t = await thread(await w.ctx(a), conversationId);
    expect(t.messages.at(-1)).toMatchObject({ body: "Bring markers", sender: { name: "Orin" } });
  });

  it("the owner and holders of chat.groups.manage (the six senior positions) change it; other members can't", async () => {
    const { owner, a, pres, treasurer } = await people();
    const { conversationId } = await createGroup(await w.ctx(owner), { name: "Crew", memberIds: [a, pres, treasurer] });
    await expect(updateGroup(await w.ctx(a), conversationId, { name: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The Treasurer isn't one of the six senior positions.
    await expect(updateGroup(await w.ctx(treasurer), conversationId, { name: "Treasury" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateGroup(await w.ctx(pres), conversationId, { name: "Fair crew", description: "Everything for the fair" });
    expect((await thread(await w.ctx(pres), conversationId)).group).toMatchObject({ name: "Fair crew", canManage: true });
    await updateGroup(await w.ctx(owner), conversationId, { name: "Fair crew 2026" });
    const t = await thread(await w.ctx(a), conversationId);
    const sys = t.messages.filter((m) => m.kind === "SYSTEM").map((m) => m.body);
    expect(sys).toEqual([
      "Orin created the group “Crew” with Anika, Priya and Tanvir.",
      "Priya renamed the group to “Fair crew” and updated the description.",
      "Orin renamed the group to “Fair crew 2026”.",
    ]);
    // Leaders can't open groups they aren't in.
    const vp = await w.user({ email: "vp@x.bd", roles: ["member"], positions: ["vice-president-technical"] });
    await expect(updateGroup(await w.ctx(vp), conversationId, { name: "Mine" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("add, remove, leave (ownership passes on), size limit and delete", async () => {
    const { owner, a, b, pres } = await people();
    const { conversationId } = await createGroup(await w.ctx(owner), { name: "Crew", memberIds: [a, b] });
    await expect(addGroupMembers(await w.ctx(a), conversationId, [pres])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await addGroupMembers(await w.ctx(owner), conversationId, [pres])).toEqual({ added: 1 });
    w.sqlite.prepare("UPDATE system_settings SET value_json = '4' WHERE key = 'chat.max_group_members'").run();
    const extra = await w.user({ email: "x@x.bd", roles: ["member"] });
    await expect(addGroupMembers(await w.ctx(owner), conversationId, [extra])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(removeGroupMember(await w.ctx(pres), conversationId, owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await removeGroupMember(await w.ctx(pres), conversationId, b);
    await expect(sendInThread(await w.ctx(b), conversationId, "still here?")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await myConversations(await w.ctx(b))).toHaveLength(0);
    // Removed members can be added back.
    expect(await addGroupMembers(await w.ctx(owner), conversationId, [b])).toEqual({ added: 1 });
    await leaveGroup(await w.ctx(owner), conversationId);
    expect(n("SELECT COUNT(*) n FROM conversation_members WHERE conversation_id = ? AND role = 'OWNER' AND left_at IS NULL", conversationId)).toBe(1);
    expect((await thread(await w.ctx(a), conversationId)).group!.ownerId).toBe(a);
    await deleteGroup(await w.ctx(a), conversationId);
    await expect(thread(await w.ctx(b), conversationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await myConversations(await w.ctx(a))).toHaveLength(0);
  });
});

describe("reactions and replies", () => {
  it("one reaction per person per message: set, change, remove; members only; not across a block", async () => {
    const { a, b, owner } = await people();
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Posters are done!" });
    const msgId = (await thread(await w.ctx(b), conversationId)).messages[0]!.id;
    const ctx = await live(b);
    await reactToMessage(ctx, msgId, "love");
    expect(ctx.live[0]).toMatchObject({ to: expect.arrayContaining([a, b]), ev: { t: "react", id: msgId, u: b, e: "love" } });
    await reactToMessage(await w.ctx(b), msgId, "haha");
    await reactToMessage(await w.ctx(a), msgId, "like");
    expect((await thread(await w.ctx(a), conversationId)).messages[0]!.reactions.sort((x, y) => x.u.localeCompare(y.u)))
      .toEqual([{ u: a, e: "like" }, { u: b, e: "haha" }].sort((x, y) => x.u.localeCompare(y.u)));
    await reactToMessage(await w.ctx(b), msgId, null);
    expect(n("SELECT COUNT(*) n FROM message_reactions WHERE message_id = ?", msgId)).toBe(1);
    await expect(reactToMessage(await w.ctx(b), msgId, "fire")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(reactToMessage(await w.ctx(owner), msgId, "like")).rejects.toMatchObject({ code: "NOT_FOUND" });
    // No notification rows for reactions.
    expect(n("SELECT COUNT(*) n FROM notifications WHERE resource_id = ? AND type <> 'message.received'", msgId)).toBe(0);
    await setBlock(await w.ctx(a), b, true);
    await expect(reactToMessage(await w.ctx(b), msgId, "sad")).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Deleting a message removes its reactions.
    await setBlock(await w.ctx(a), b, false);
    await deleteMessage(await w.ctx(a), msgId);
    expect(n("SELECT COUNT(*) n FROM message_reactions WHERE message_id = ?", msgId)).toBe(0);
  });

  it("a reply shows what it answers; replying to another conversation's message is refused", async () => {
    const { a, b, owner } = await people();
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Can you print 20 posters?" });
    const other = await sendToPerson(await w.ctx(owner), { userId: a, body: "Unrelated" });
    const q = (await thread(await w.ctx(b), conversationId)).messages[0]!.id;
    const foreign = (await thread(await w.ctx(a), other.conversationId)).messages[0]!.id;
    await sendInThread(await w.ctx(b), conversationId, "Yes, by Friday", "reply-00001", q);
    await expect(sendInThread(await w.ctx(b), conversationId, "hm", "reply-00002", foreign)).rejects.toMatchObject({ code: "VALIDATION" });
    const t = await thread(await w.ctx(a), conversationId);
    expect(t.messages.at(-1)).toMatchObject({ body: "Yes, by Friday", replyTo: { id: q, name: "Anika", body: "Can you print 20 posters?" } });
  });
});

describe("who people are", () => {
  it("badges: short position and the latest committee's year (past executives too), the Moderator role or the profile", async () => {
    const { owner, a, pres, treasurer } = await people();
    const mod = await w.user({ email: "mod@x.bd", name: "Dr Mod", roles: ["moderator"] });
    w.sqlite.prepare("UPDATE profiles SET person_type = 'FACULTY' WHERE user_id = ?").run(mod);
    // A past executive: Joint Information Secretary in 2025, no current position.
    const past = await w.user({ email: "past@x.bd", name: "Rafi", roles: ["member"] });
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2025', '2025', 'GUCC 2025', '2025', 'ARCHIVED')").run();
    w.sqlite.prepare(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order)
      SELECT 'cm_past', 'cmt_2025', id, 'pos:executive-member', 'Joint Information Secretary', 'STUDENT', 5 FROM profiles WHERE user_id = ?`).run(past);
    const year = (w.sqlite.prepare("SELECT slug FROM committees WHERE id = ?").get(w.committeeId) as { slug: string }).slug;
    const { people: dir } = await chatDirectory(await w.ctx(owner));
    const label = (id: string) => dir.find((p) => p.user_id === id)?.badge;
    expect(label(a)).toMatchObject({ short: "Member", tier: "member" });
    expect(label(pres)).toMatchObject({ short: `PRES-${year}`, tier: "leader" });
    expect(label(treasurer)).toMatchObject({ short: `TREAS-${year}`, tier: "executive" });
    expect(label(past)).toMatchObject({ short: "JIS-2025", tier: "former", label: "Joint Information Secretary · 2025 (former)" });
    expect(label(mod)).toMatchObject({ short: "Moderator", tier: "leader" });
    expect(["General Secretary", "Joint General Secretary (activity)", "Vice-president (technical)", "Organizing Secretary", "Executive Member", "President", "Treasurer"].map(positionShort))
      .toEqual(["GS", "JGS", "VP", "OS", "EM", "PRES", "TREAS"]);
    // Blocked either way, or accepting nobody: not in the directory.
    await setBlock(await w.ctx(a), owner, true);
    await setMessagePrivacy(await w.ctx(pres), { privacy: "NOBODY" });
    const after = (await chatDirectory(await w.ctx(owner))).people.map((p) => p.user_id);
    expect(after).not.toContain(a);
    expect(after).not.toContain(pres);
    expect(after).not.toContain(owner);
  });

  it("active status is shared both ways or not at all", async () => {
    const { a, b } = await people();
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "hi" });
    w.sqlite.prepare("UPDATE users SET last_active_at = '2026-09-30T10:00:00.000Z' WHERE id = ?").run(b);
    expect((await thread(await w.ctx(a), conversationId)).person?.lastActiveAt).toBe("2026-09-30T10:00:00.000Z");
    await setMessagePrivacy(await w.ctx(a), { showActive: false });
    expect((await thread(await w.ctx(a), conversationId)).person?.lastActiveAt).toBeNull();
    expect((await chatHome(await w.ctx(a))).settings.showActive).toBe(false);
  });
});

describe("group admins", () => {
  it("the owner makes admins; admins edit and add or remove members, but not other admins or the owner", async () => {
    const { owner, a, b, treasurer } = await people();
    const { conversationId: id } = await createGroup(await w.ctx(owner), { name: "Fair crew", memberIds: [a, b, treasurer] });
    const role = (u: string) => (w.sqlite.prepare("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(id, u) as { role: string }).role;
    // A plain member can't change anything.
    await expect(updateGroup(await w.ctx(a), id, { name: "Mine" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setGroupRole(await w.ctx(owner), id, a, "ADMIN");
    expect(role(a)).toBe("ADMIN");
    // An admin renames, promotes a member, removes a member...
    await updateGroup(await w.ctx(a), id, { name: "Fair crew 2026" });
    await setGroupRole(await w.ctx(a), id, b, "ADMIN");
    await removeGroupMember(await w.ctx(a), id, treasurer);
    // ...but can't remove another admin, demote one, remove the owner or delete the group.
    await expect(removeGroupMember(await w.ctx(a), id, b)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setGroupRole(await w.ctx(a), id, b, "MEMBER")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeGroupMember(await w.ctx(a), id, owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteGroup(await w.ctx(a), id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // An admin may step down; the owner may demote.
    await setGroupRole(await w.ctx(b), id, b, "MEMBER");
    expect(role(b)).toBe("MEMBER");
    const lines = (w.sqlite.prepare("SELECT body FROM messages WHERE conversation_id = ? AND kind = 'SYSTEM' ORDER BY created_at").all(id) as Array<{ body: string }>).map((r) => r.body).join(" | ");
    expect(lines).toMatch(/made Anika an admin/);
    expect(lines).toMatch(/is no longer an admin/);
  });

  it("the owner hands the group over and stays an admin; when an owner leaves, an admin takes over first", async () => {
    const { owner, a, b } = await people();
    const { conversationId: id } = await createGroup(await w.ctx(owner), { name: "Fair crew", memberIds: [a, b] });
    const role = (u: string) => (w.sqlite.prepare("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(id, u) as { role: string }).role;
    await expect(transferGroup(await w.ctx(a), id, a)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await transferGroup(await w.ctx(owner), id, a);
    expect([role(owner), role(a)]).toEqual(["ADMIN", "OWNER"]);
    // b is an admin now; the new owner (a) leaves: b (the admin), not the earliest member, takes over.
    await setGroupRole(await w.ctx(a), id, b, "ADMIN");
    await setGroupRole(await w.ctx(owner), id, owner, "MEMBER");
    await leaveGroup(await w.ctx(a), id);
    expect(role(b)).toBe("OWNER");
    // Roles show in the conversation for everyone, owner first.
    const t = await thread(await w.ctx(owner), id);
    expect(t.group?.members.map((m) => m.role)).toEqual(["OWNER", "MEMBER"]);
    expect(t.group?.canManage).toBe(false);
  });

  it("group members' photos show in the member list (a nested photo isn't lost)", async () => {
    const { owner, a, b } = await people();
    w.sqlite.prepare("INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, visibility, status, uploaded_by) VALUES ('med_face', 'R2', 'public', 'media/med_face/master.webp', 'f.webp', 'image/webp', 'IMAGE', 'PUBLIC', 'READY', ?)").run(a);
    w.sqlite.prepare("UPDATE profiles SET avatar_media_id = 'med_face' WHERE user_id = ?").run(a);
    const { conversationId: id } = await createGroup(await w.ctx(owner), { name: "Faces", memberIds: [a, b] });
    const t = await thread(await w.ctx(owner), id);
    expect(t.group?.members.find((m) => m.id === a)?.avatarUrl).toContain("med_face");
    expect(t.group?.members.find((m) => m.id === b)?.avatarUrl).toBeNull();
  });
});
