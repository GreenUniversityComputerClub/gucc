/**
 * @mentions in chat (round 9): mentioned group members are told even when they muted the group;
 * people outside the group, across a block, or whose name was deleted from the text aren't;
 * "@everyone" is for the group's owner and admins; direct chats only link the name.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { editMessage, sendInThread, sendToPerson, setBlock, setConversationState, thread } from "@/lib/server/services/messaging";
import { createGroup, setGroupRole } from "@/lib/server/services/messaging-groups";
import { emailCategory } from "@/lib/server/email-outbox";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const notices = (user: string, type: string) =>
  (w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at").all(user, type) as Array<{ title: string }>).map((r) => r.title);

async function group() {
  const owner = await w.user({ email: "o@x.bd", name: "Orin", roles: ["member"] });
  const a = await w.user({ email: "a@x.bd", name: "Anika Rahman", roles: ["member"] });
  const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
  const outsider = await w.user({ email: "z@x.bd", name: "Zara", roles: ["member"] });
  const { conversationId } = await createGroup(await w.ctx(owner), { name: "Crew", memberIds: [a, b] });
  w.sqlite.exec("DELETE FROM notifications");
  return { owner, a, b, outsider, c: conversationId };
}

describe("mentions in groups", () => {
  it("tells the person mentioned, even with the group muted; others get the usual notice", async () => {
    const { owner, a, b, outsider, c } = await group();
    await setConversationState(await w.ctx(a), c, { muted: true });
    // Babul has read the group, so a new message notifies him as usual.
    await thread(await w.ctx(b), c);
    const sent = await sendInThread(await w.ctx(owner), c, "@Anika Rahman can you bring the banner? @Zara too", "client-mention-1", null, [a, outsider]);
    // Zara isn't in the group: not a mention.
    expect(sent.mentions).toEqual([{ u: a, n: "Anika Rahman", h: expect.any(String) }]);
    expect(notices(a, "message.mention")).toEqual(["Orin mentioned you in Crew"]);
    expect(notices(a, "message.received")).toEqual([]);
    expect(notices(b, "message.received")).toEqual(["Orin in Crew"]);
    expect(notices(outsider, "message.mention")).toEqual([]);
    const t = await thread(await w.ctx(b), c);
    expect(t.messages.at(-1)!.mentions).toEqual(sent.mentions);
    expect(emailCategory("message.mention")).toBe("messages");
  });

  it("skips a name no longer in the text, yourself, and people across a block", async () => {
    const { owner, a, b, c } = await group();
    await setBlock(await w.ctx(b), owner, true);
    const sent = await sendInThread(await w.ctx(owner), c, "Hello @Orin and @Babul", "client-mention-2", null, [a, owner, b]);
    expect(sent.mentions).toEqual([]);
    expect(notices(a, "message.mention")).toEqual([]);
    expect(notices(b, "message.mention")).toEqual([]);
  });

  it("@everyone: only the owner and admins, and it tells everyone", async () => {
    const { owner, a, b, c } = await group();
    await expect(sendInThread(await w.ctx(a), c, "@everyone meeting now", "client-everyone-1", null, ["*"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setGroupRole(await w.ctx(owner), c, a, "ADMIN");
    w.sqlite.exec("DELETE FROM notifications");
    const sent = await sendInThread(await w.ctx(a), c, "@everyone meeting now", "client-everyone-2", null, ["*"]);
    expect(sent.mentions).toEqual([{ u: "*", n: "everyone" }]);
    expect(notices(owner, "message.mention")).toEqual(["Anika Rahman mentioned everyone in Crew"]);
    expect(notices(b, "message.mention")).toEqual(["Anika Rahman mentioned everyone in Crew"]);
    expect(notices(a, "message.mention")).toEqual([]);
  });

  it("an edit links names again but tells nobody new", async () => {
    const { owner, a, b, c } = await group();
    const sent = await sendInThread(await w.ctx(owner), c, "Who can help?", "client-edit-1", null, []);
    const { mentions } = await editMessage(await w.ctx(owner), sent.id, "Who can help? @Babul", [b]);
    expect(mentions).toEqual([{ u: b, n: "Babul", h: expect.any(String) }]);
    expect(notices(b, "message.mention")).toEqual([]);
    expect((await thread(await w.ctx(a), c)).messages.at(-1)!.mentions).toEqual(mentions);
  });
});

describe("mentions in direct chats", () => {
  it("link any member's name without a notice", async () => {
    const a = await w.user({ email: "a@x.bd", name: "Anika", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", name: "Babul", roles: ["member"] });
    const z = await w.user({ email: "z@x.bd", name: "Zara", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(a), { userId: b, body: "Hi" });
    const sent = await sendInThread(await w.ctx(a), conversationId, "Ask @Zara about it", "client-dm-1", null, [z, "*"]);
    expect(sent.mentions).toEqual([{ u: z, n: "Zara", h: expect.any(String) }]);
    expect(notices(z, "message.mention")).toEqual([]);
  });
});
