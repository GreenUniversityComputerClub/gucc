import { beforeEach, describe, expect, it } from "vitest";
import { createEvent, publishEvent, setEventPeople, updateEvent } from "@/lib/server/services/events";
import { uploadMedia } from "@/lib/server/services/media";
import { readEvent } from "@/lib/public/read";
import { createWorld, type TestWorld } from "../support/d1";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PNG2 = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));

let w: TestWorld;
let tags: string[];
beforeEach(async () => {
  w = await createWorld();
  tags = [];
});
/** A request context that records which cached pages it asks to refresh. */
const ctx = async (userId: string) => ({ ...(await w.ctx(userId)), revalidate: (t: string[]) => void tags.push(...t) });
const row = (id: string) => w.sqlite.prepare("SELECT participants_reported, participants_text, judges_text, banner_media_id, status FROM events WHERE id = ?").get(id) as Record<string, unknown>;

describe("events created from the dashboard", () => {
  it("an executive uploads a banner and posts an event in the legacy format", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const banner = await uploadMedia(await ctx(pres), { files: { master: PNG }, originalFilename: "banner.png", purpose: "library" });
    const { id } = await createEvent(await ctx(pres), {
      title: "Intra-University Programming Contest",
      category: "Contest",
      startAt: "2026-10-10T10:00",
      timeText: "10:00 AM - 4:00 PM",
      venue: "GUB Auditorium",
      description: "Line one.\nLine two.",
      guestsText: "Chief Guest: Prof. A, Vice Chancellor, GUB\n\nSpecial Guest: Prof. B,\nDept. of CSE, SUST",
      judgesText: "Judge: Dr. C - Professor, SUST\n\nD - Engineer, Brain Station 23",
      participants: "1,250",
      bannerMediaId: banner.id,
    });
    expect(row(id)).toMatchObject({ participants_reported: 1250, participants_text: null, banner_media_id: banner.id, status: "DRAFT" });

    await publishEvent(await ctx(pres), id);
    const slug = (w.sqlite.prepare("SELECT slug FROM events WHERE id = ?").get(id) as { slug: string }).slug;
    const pub = await readEvent(w.db, slug);
    expect(pub?.event).toMatchObject({ name: "Intra-University Programming Contest", participants: 1250, time: "10:00 AM - 4:00 PM", location: "GUB Auditorium", category: "Contest" });
    expect(pub?.event.Judge).toContain("Dr. C");
    expect(pub?.event.image).not.toBe("/gucc-logo.png");
    expect(tags).toContain("events");
  });

  it("keeps non-numeric attendance as written and clears it when emptied", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const { id } = await createEvent(await ctx(pres), { title: "Executive retreat", startAt: "2026-10-12T09:00", participants: "All Executive Members" });
    expect(row(id)).toMatchObject({ participants_reported: null, participants_text: "All Executive Members" });
    await updateEvent(await ctx(pres), id, { title: "Executive retreat", startAt: "2026-10-12T09:00", participants: "" });
    expect(row(id)).toMatchObject({ participants_reported: null, participants_text: null });
  });

  it("shows speakers publicly (never the event team) and leaves imported guest rows alone", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const photographer = await w.user({ email: "ph@x.bd", positions: ["photography-secretary"] });
    const { id } = await createEvent(await ctx(pres), { title: "AI Seminar", startAt: "2026-10-15T15:00", guestsText: "Chief Guest: Prof. Chief, VC, GUB" });
    // What the legacy import stores next to the guest text.
    w.sqlite.prepare("INSERT INTO event_people (id, event_id, role, name, title, sort_order) VALUES ('ep_legacy', ?, 'CHIEF_GUEST', 'Prof. Chief', 'VC, GUB', 0)").run(id);
    await publishEvent(await ctx(pres), id);
    tags = [];
    await setEventPeople(await ctx(pres), id, [
      { role: "SPEAKER", name: "Dr. Speaker", title: "Researcher" },
      { role: "PHOTOGRAPHER", name: "Photo Sec", userId: photographer },
    ]);
    await setEventPeople(await ctx(pres), id, [
      { role: "SPEAKER", name: "Dr. Speaker", title: "Researcher" },
      { role: "PHOTOGRAPHER", name: "Photo Sec", userId: photographer },
    ]);
    expect(tags).toContain("events");
    const pub = await readEvent(w.db, "ai-seminar");
    expect(pub?.people).toEqual([{ role: "SPEAKER", name: "Dr. Speaker", title: "Researcher" }]);
    expect(pub?.event.guest).toBe("Chief Guest: Prof. Chief, VC, GUB");
    // Saving twice neither duplicates nor removes the imported guest row.
    expect(w.sqlite.prepare("SELECT role, COUNT(*) n FROM event_people WHERE event_id = ? GROUP BY role ORDER BY role").all(id))
      .toEqual([{ role: "CHIEF_GUEST", n: 1 }, { role: "PHOTOGRAPHER", n: 1 }, { role: "SPEAKER", n: 1 }]);
    await expect(setEventPeople(await ctx(pres), id, [{ role: "GUEST" as never, name: "Someone" }])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("assigned photographers add photos to the gallery, including photos already in the library", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const photographer = await w.user({ email: "ph@x.bd", positions: ["photography-secretary"] });
    const a = await createEvent(await ctx(pres), { title: "Freshers Reception", startAt: "2026-10-20T15:00" });
    const b = await createEvent(await ctx(pres), { title: "Prize Giving", startAt: "2026-10-21T15:00" });
    for (const e of [a, b]) {
      await publishEvent(await ctx(pres), e.id);
      await setEventPeople(await ctx(pres), e.id, [{ role: "PHOTOGRAPHER", name: "Photo Sec", userId: photographer }]);
    }
    const other = await createEvent(await ctx(pres), { title: "Not assigned", startAt: "2026-10-22T15:00" });

    tags = [];
    const first = await uploadMedia(await ctx(photographer), { files: { master: PNG2 }, originalFilename: "stage.png", purpose: "event", eventId: a.id });
    expect(tags).toContain("events");
    // The same photo again, for the second event: deduplicated, but still in that gallery.
    const again = await uploadMedia(await ctx(photographer), { files: { master: PNG2 }, originalFilename: "stage.png", purpose: "event", eventId: b.id });
    expect(again).toMatchObject({ id: first.id, deduplicated: true });
    expect((await readEvent(w.db, "freshers-reception"))?.gallery).toHaveLength(1);
    expect((await readEvent(w.db, "prize-giving"))?.gallery).toHaveLength(1);

    await expect(uploadMedia(await ctx(photographer), { files: { master: PNG }, originalFilename: "x.png", purpose: "event", eventId: other.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("links a Google Form for registration (and only a Google Form) and lists PDF documents", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    await expect(createEvent(await ctx(pres), { title: "Hackathon", startAt: "2026-11-05T09:00", registrationFormUrl: "https://example.com/form" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const { id } = await createEvent(await ctx(pres), { title: "Hackathon", startAt: "2026-11-05T09:00", registrationFormUrl: "https://forms.gle/AbC123", registrationFormLabel: "Apply as a team" });
    await publishEvent(await ctx(pres), id);
    const pdf = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"));
    await uploadMedia(await ctx(pres), { files: { master: pdf }, originalFilename: "rules.pdf", purpose: "event", eventId: id, visibility: "PUBLIC" });
    const pub = await readEvent(w.db, "hackathon");
    expect(pub?.event.registrationForm).toEqual({ url: "https://forms.gle/AbC123", label: "Apply as a team" });
    expect(pub?.attachments).toEqual([expect.objectContaining({ name: "rules.pdf" })]);
    expect(pub?.gallery).toEqual([]);
  });

  it("members cannot create events", async () => {
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(createEvent(await ctx(member), { title: "Party", startAt: "2026-11-01T18:00" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
