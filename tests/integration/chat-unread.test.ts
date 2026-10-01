/**
 * What's waiting: each conversation says how many messages from the others arrived since I last
 * read it, and "Mark as unread" brings a conversation back as unread until I open it again.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import type { LiveItem } from "@/lib/server/live";
import { markConversationRead, markConversationUnread, myConversations, sendInThread, sendToPerson, thread } from "@/lib/server/services/messaging";
import { createGroup } from "@/lib/server/services/messaging-groups";
import { sessionCounts } from "@/lib/server/services/community";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const live = async (userId: string): Promise<Ctx & { live: LiveItem[] }> => ({ ...(await w.ctx(userId)), live: [] });
const row = async (userId: string, conversationId: string) => (await myConversations(await w.ctx(userId))).find((c) => c.id === conversationId)!;
// Messages sent in the same millisecond would share a timestamp: space them out.
const later = () => new Promise((r) => setTimeout(r, 5));

describe("unread counts", () => {
  it("count the others' messages since I last read, never mine or system lines", async () => {
    const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "one" });
    await later();
    await sendInThread(await w.ctx(a), conversationId, "two");
    await later();
    await sendInThread(await w.ctx(a), conversationId, "three");
    expect(await row(b, conversationId)).toMatchObject({ unread: 1, unreadCount: 3 });
    expect(await row(a, conversationId)).toMatchObject({ unread: 0, unreadCount: 0 });

    await thread(await w.ctx(b), conversationId);
    expect(await row(b, conversationId)).toMatchObject({ unread: 0, unreadCount: 0 });
    await later();
    await sendInThread(await w.ctx(a), conversationId, "four");
    expect((await row(b, conversationId)).unreadCount).toBe(1);

    // A group: the system line that created it doesn't count.
    const c = await w.user({ email: "c@x.bd", name: "Chandni", roles: ["member"] });
    const g = await createGroup(await w.ctx(a), { name: "Crew", memberIds: [b, c] });
    await later();
    await sendInThread(await w.ctx(a), g.conversationId, "hello crew");
    expect((await row(b, g.conversationId)).unreadCount).toBe(1);
  });
});

describe("mark as unread", () => {
  it("brings a read conversation back as unread on every device, until it's opened", async () => {
    const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "hi" });
    await later();
    await sendInThread(await w.ctx(a), conversationId, "are you there?");
    await markConversationRead(await w.ctx(b), conversationId);
    await later();
    await sendInThread(await w.ctx(b), conversationId, "yes");
    expect((await row(b, conversationId)).unread).toBe(0);

    const ctx = await live(b);
    await markConversationUnread(ctx, conversationId);
    expect(await row(b, conversationId)).toMatchObject({ unread: 1, unreadCount: 1 });
    expect((await sessionCounts(await w.ctx(b))).unreadMessages).toBe(1);
    // My other tabs update their lists and badges; the other person isn't told.
    expect(ctx.live.some((x) => x.to.includes(b) && x.ev.t === "sync")).toBe(true);
    expect(ctx.live.some((x) => x.to.includes(a))).toBe(false);
    // Anika still sees her messages as seen.
    expect((await thread(await w.ctx(a), conversationId)).seenAt).not.toBeNull();

    await thread(await w.ctx(b), conversationId);
    expect((await row(b, conversationId)).unread).toBe(0);
  });

  it("needs a message from someone else, in a conversation I'm in", async () => {
    const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
    const out = await w.user({ email: "o@x.bd", name: "Outsider", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "hi" });
    await expect(markConversationUnread(await w.ctx(a), conversationId)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(markConversationUnread(await w.ctx(out), conversationId)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
