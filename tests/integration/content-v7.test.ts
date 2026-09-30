/**
 * Round 8 blog and events: edits of a live post wait for approval, re-publishing keeps the date,
 * event check-in is atomic and works by QR code, the programme and duplicates, and the public
 * read model (real times, cancelled events, lean lists).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { decideApproval, listApprovals } from "@/lib/server/services/approvals";
import { createPost, publishPost, unpublishPost, updatePost } from "@/lib/server/services/posts";
import { checkInByCode, checkInCode, createEvent, duplicateEvent, publishEvent, registerForEvent, saveEventAgenda, setEventStatus, setRegistrationStatus } from "@/lib/server/services/events";
import { readEvent, readEvents } from "@/lib/public/read";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const one = <T = Record<string, unknown>>(sql: string, ...p: string[]) => w.sqlite.prepare(sql).get(...p) as T;

describe("blog", () => {
  it("a member's edit of their live post waits for approval; the live post doesn't change until then", async () => {
    const member = await w.user({ email: "writer@x.bd", name: "Writer", roles: ["member"] });
    const pubsec = await w.user({ email: "pub@x.bd", roles: ["member"], positions: ["publication-secretary"] });
    const { id } = await createPost(await w.ctx(member), { title: "Workshop notes", type: "BLOG", body: "First version of the notes." });
    const sent = await publishPost(await w.ctx(member), id);
    await decideApproval(await w.ctx(pubsec), sent.requestId!, "APPROVE");
    const live = one<{ updated_at: string }>("SELECT updated_at FROM posts WHERE id = ?", id);
    await updatePost(await w.ctx(member), id, { title: "Workshop notes", body: "Sneaky new text that nobody reviewed.", expectedUpdatedAt: live.updated_at });
    expect(one("SELECT status, body_markdown, pending_revision_id IS NOT NULL AS pending FROM posts WHERE id = ?", id)).toEqual({ status: "PUBLISHED", body_markdown: "First version of the notes.", pending: 1 });
    // A second edit before the decision is refused with a reason.
    await expect(updatePost(await w.ctx(member), id, { title: "Again", body: "x" })).rejects.toMatchObject({ code: "EDIT_PENDING" });
    const request = (await listApprovals(await w.ctx(pubsec), { forMe: true })).find((r) => r.action === "posts.update_live")!;
    await decideApproval(await w.ctx(pubsec), request.id, "APPROVE");
    expect(one("SELECT body_markdown, pending_revision_id FROM posts WHERE id = ?", id)).toEqual({ body_markdown: "Sneaky new text that nobody reviewed.", pending_revision_id: null });
  });

  it("publishing again keeps the original publication date", async () => {
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const { id } = await createPost(await w.ctx(pres), { title: "News", type: "BLOG", body: "Words." });
    await publishPost(await w.ctx(pres), id);
    w.sqlite.prepare("UPDATE posts SET published_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(id);
    await unpublishPost(await w.ctx(pres), id, null);
    await publishPost(await w.ctx(pres), id);
    expect(one("SELECT published_at FROM posts WHERE id = ?", id)).toEqual({ published_at: "2026-01-01T00:00:00.000Z" });
  });
});

describe("events", () => {
  async function event(capacity = 1) {
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const { id } = await createEvent(await w.ctx(pres), { title: "Robotics Night", startAt: "2030-05-01T18:00", endAt: "2030-05-01T21:00", registrationEnabled: "on", capacity: String(capacity) });
    await publishEvent(await w.ctx(pres), id);
    return { pres, id };
  }

  it("check-in by QR code: valid codes only, for this event, once; seats can't be overbooked", async () => {
    const { pres, id } = await event(1);
    const a = await w.user({ email: "a@x.bd", roles: ["member"], name: "Anika" });
    const b = await w.user({ email: "b@x.bd", roles: ["member"], name: "Babul" });
    await registerForEvent(await w.ctx(a), "robotics-night", { name: "Anika" });
    expect((await registerForEvent(await w.ctx(b), "robotics-night", { name: "Babul" })).status).toBe("WAITLISTED");
    const regA = one<{ id: string }>("SELECT id FROM event_registrations WHERE user_id = ?", a).id;
    const regB = one<{ id: string }>("SELECT id FROM event_registrations WHERE user_id = ?", b).id;
    const code = await checkInCode(await w.ctx(a), regA);
    await expect(checkInByCode(await w.ctx(pres), `${regA}.forged000000000`, id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(checkInByCode(await w.ctx(a), code, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await checkInByCode(await w.ctx(pres), code, id)).toMatchObject({ name: "Anika", already: false });
    expect(await checkInByCode(await w.ctx(pres), code, id)).toMatchObject({ already: true });
    expect(one("SELECT checked_in_at IS NOT NULL AS done FROM event_registrations WHERE id = ?", regA)).toEqual({ done: 1 });
    // The only seat is taken: admitting from the waitlist is refused.
    await expect(setRegistrationStatus(await w.ctx(pres), regB, "REGISTERED")).rejects.toMatchObject({ code: "FULL" });
  });

  it("the programme, duplicates, real times and cancelled events on the public side", async () => {
    const { pres, id } = await event(10);
    await saveEventAgenda(await w.ctx(pres), id, [{ title: "Opening", startsAt: "2030-05-01T18:00" }, { title: "Demos", speaker: "Robotics team" }, { title: "" }]);
    const pub = (await readEvent(w.db, "robotics-night"))!;
    expect(pub.agenda.map((a) => a.title)).toEqual(["Opening", "Demos"]);
    expect(pub.event).toMatchObject({ startAt: "2030-05-01T12:00:00.000Z", endAt: "2030-05-01T15:00:00.000Z" });
    expect((await readEvents(w.db))[0]).not.toHaveProperty("description");
    const copy = await duplicateEvent(await w.ctx(pres), id);
    expect(one("SELECT status, title FROM events WHERE id = ?", copy.id)).toEqual({ status: "DRAFT", title: "Robotics Night (copy)" });
    expect(one<{ n: number }>("SELECT COUNT(*) n FROM event_agenda_items WHERE event_id = ?", copy.id).n).toBe(2);
    await setEventStatus(await w.ctx(pres), id, "CANCELLED", "Rain");
    expect((await readEvent(w.db, "robotics-night"))!.event.status).toBe("CANCELLED");
    expect((await readEvents(w.db)).map((e) => e.slug)).not.toContain("robotics-night");
  });
});
