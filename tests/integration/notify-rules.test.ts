import { beforeEach, describe, expect, it } from "vitest";
import { createNotifyRule, setRuleStatus } from "@/lib/server/services/governance";
import { createEvent, publishEvent, updateEvent } from "@/lib/server/services/events";
import { submitContact } from "@/lib/server/services/contact";
import { authorize } from "@/lib/server/authz";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
let sports: string;
beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
  sports = await w.user({ email: "sports@x.bd", positions: ["sports-secretary"] });
});
const inbox = (userId: string) => (w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ? ORDER BY created_at").all(userId) as Array<{ title: string }>).map((n) => n.title);

describe("notification rules", () => {
  it("notify the chosen people only when the conditions hold, and never change access", async () => {
    const { id } = await createNotifyRule(await w.ctx(gs), {
      name: "Sports events", event: "event.published",
      conditions: [{ field: "resource.category", operator: "eq", value: "sports" }],
      targets: [{ kind: "position", key: "sports-secretary" }], message: "Please plan the photography.",
    });
    // A draft does nothing until someone activates it.
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const early = await createEvent(await w.ctx(pres), { title: "Early football", category: "Sports", startAt: "2030-03-01T10:00" });
    await publishEvent(await w.ctx(pres), early.id);
    expect(inbox(sports)).toEqual([]);

    await setRuleStatus(await w.ctx(gs), id, "ACTIVE");
    const football = await createEvent(await w.ctx(pres), { title: "Football final", category: "Sports", startAt: "2030-03-02T10:00" });
    const seminar = await createEvent(await w.ctx(pres), { title: "AI seminar", category: "Technical", startAt: "2030-03-03T10:00" });
    await publishEvent(await w.ctx(pres), football.id);
    await publishEvent(await w.ctx(pres), seminar.id);
    expect(inbox(sports)).toEqual(["Sports events: Football final"]);
    expect(w.sqlite.prepare("SELECT body FROM notifications WHERE user_id = ?").get(sports)).toEqual({ body: "Please plan the photography." });
    // The rule is not an access rule: the Sports Secretary still can't publish technical events.
    expect(authorize({ ...(await w.ctx(sports)) }, "events.publish", { type: "event", category: "technical" }).outcome).not.toBe("ALLOW");
  });

  it("validates targets and needs rule rights", async () => {
    await expect(createNotifyRule(await w.ctx(gs), { name: "Bad", event: "event.published", conditions: [], targets: [{ kind: "position", key: "no-such-position" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createNotifyRule(await w.ctx(gs), { name: "Bad", event: "nothing.happens", conditions: [], targets: [{ kind: "role", key: "moderator" }] }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createNotifyRule(await w.ctx(sports), { name: "Mine", event: "event.published", conditions: [], targets: [{ kind: "role", key: "moderator" }] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("works for visitors' actions too (a contact message)", async () => {
    const info = await w.user({ email: "info@x.bd", positions: ["information-secretary"] });
    const { id } = await createNotifyRule(await w.ctx(gs), { name: "Inbox", event: "message.received", conditions: [], targets: [{ kind: "permission", key: "messages.read" }] });
    await setRuleStatus(await w.ctx(gs), id, "ACTIVE");
    await submitContact(await w.ctx(null), { name: "A Visitor", email: "visitor@example.com", message: "Hello, I would like to join the club." });
    expect(inbox(info)).toEqual(["Inbox: A Visitor"]);
    expect(inbox(gs)).toEqual(["Inbox: A Visitor"]);
  });
});

describe("event changes", () => {
  it("tell registered people when a public event's time or place changes", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    const base = { title: "Workshop", startAt: "2030-04-01T10:00", venue: "Room 301", registrationEnabled: "on", capacity: "50" };
    const { id } = await createEvent(await w.ctx(pres), base);
    await publishEvent(await w.ctx(pres), id);
    w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status) VALUES ('r1', ?, ?, 'M', 'm@x.bd', 'REGISTERED')").run(id, member);
    await updateEvent(await w.ctx(pres), id, { ...base, description: "More details" });
    expect(inbox(member)).toEqual([]);
    await updateEvent(await w.ctx(pres), id, { ...base, venue: "Auditorium" });
    expect(inbox(member)).toEqual(["Changed: Workshop"]);
  });
});
