/**
 * The contact form's Topic: a known topic is stored and shown in the inbox's notice; anything else
 * (including names every object inherits, such as "constructor") is stored as no topic.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { listMessages, submitContact } from "@/lib/server/services/contact";
import { topicOf } from "@/lib/contact/topics";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const base = { name: "A Visitor", email: "visitor@example.com", message: "We would like to sponsor your next hackathon." };

describe("contact topic", () => {
  it("keeps a known topic and names it in the notice; ignores unknown ones", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    await submitContact(await w.ctx(null), { ...base, topic: "partnership" });
    await submitContact(await w.ctx(null), { ...base, name: "Second Visitor", topic: "constructor" });
    await submitContact(await w.ctx(null), { ...base, name: "Third Visitor" });
    const topics = (w.sqlite.prepare("SELECT name, topic FROM contact_messages ORDER BY name").all() as Array<{ name: string; topic: string | null }>);
    expect(topics).toEqual([
      { name: "A Visitor", topic: "partnership" },
      { name: "Second Visitor", topic: null },
      { name: "Third Visitor", topic: null },
    ]);
    const notices = (w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ? ORDER BY title").all(gs) as Array<{ title: string }>).map((n) => n.title);
    expect(notices).toContain("Contact message from A Visitor (Partnership or sponsorship)");
    expect(notices).toContain("Contact message from Second Visitor");
    const { rows } = await listMessages(await w.ctx(gs), {});
    expect(rows.find((r) => r.name === "A Visitor")?.topic).toBe("partnership");
  });

  it("topicOf accepts only the listed topics", () => {
    expect(topicOf("membership")).toBe("membership");
    for (const bad of ["constructor", "toString", "__proto__", "", 7, null, undefined]) expect(topicOf(bad)).toBeNull();
  });
});
