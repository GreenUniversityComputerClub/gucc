/**
 * Sponsorship pages: the dashboard picks the default (where the navbar's Sponsors link goes);
 * every active page stays public at its own address and on /become-a-sponsor; changing the
 * default never hides or removes the others; the default is always public.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readSponsorship, readSponsorships } from "@/lib/public/read";
import {
  deleteSponsorship, duplicateSponsorship, getSponsorship, listSponsorships, moveSponsorship, saveSponsorship, setDefaultSponsorship, setSponsorshipStatus,
} from "@/lib/server/services/sponsorships";
import { GENERAL_SPONSORSHIP, generalSponsorshipSql } from "@/lib/sponsorship/general";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const content = (name: string) => JSON.stringify({ event: { name: name.toUpperCase(), fullName: name }, packages: [{ tier: "Gold Sponsor", slots: 1, price: 1, currency: "BDT", highlight: true, benefits: [] }] });

async function setup() {
  const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
  const ctx = await w.ctx(mod);
  const carnival = await saveSponsorship(ctx, null, { title: "CSE Carnival 2026", slug: "cse-carnival-2026", status: "ACTIVE", content: content("CSE Carnival 2026") });
  const hack = await saveSponsorship(ctx, null, { title: "Hackathon 2027", status: "ACTIVE", content: content("Hackathon 2027") });
  await setDefaultSponsorship(ctx, carnival.id);
  return { mod, ctx, carnival, hack };
}

describe("sponsorship pages", () => {
  it("make one the default without touching the others; all active ones stay public", async () => {
    const { ctx, carnival, hack } = await setup();
    expect(hack.slug).toBe("hackathon-2027");
    let list = await readSponsorships(w.db);
    expect(list.map((p) => [p.slug, p.isDefault])).toEqual([["cse-carnival-2026", true], ["hackathon-2027", false]]);
    expect(list[1]).toMatchObject({ packages: 1, event: { fullName: "Hackathon 2027" } });

    await setDefaultSponsorship(ctx, hack.id);
    list = await readSponsorships(w.db);
    expect(list.map((p) => [p.slug, p.isDefault])).toEqual([["hackathon-2027", true], ["cse-carnival-2026", false]]);
    // The old default is still public at its own address.
    expect(await readSponsorship(w.db, carnival.slug)).toMatchObject({ isDefault: false, content: { event: { fullName: "CSE Carnival 2026" } } });
    expect(Number((w.sqlite.prepare("SELECT COUNT(*) n FROM sponsorship_pages WHERE is_default = 1").get() as { n: number }).n)).toBe(1);
  });

  it("keep the default public: it can't be hidden or deleted until another page is the default", async () => {
    const { ctx, carnival, hack } = await setup();
    await expect(setSponsorshipStatus(ctx, carnival.id, "INACTIVE")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteSponsorship(ctx, carnival.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveSponsorship(ctx, carnival.id, { title: "CSE Carnival 2026", status: "INACTIVE", content: content("CSE Carnival 2026") })).rejects.toMatchObject({ code: "CONFLICT" });

    // A hidden page leaves the site; making it the default makes it public again.
    await setSponsorshipStatus(ctx, hack.id, "INACTIVE");
    expect((await readSponsorships(w.db)).map((p) => p.slug)).toEqual(["cse-carnival-2026"]);
    expect(await readSponsorship(w.db, hack.slug)).toBeNull();
    await setDefaultSponsorship(ctx, hack.id);
    expect(await readSponsorship(w.db, hack.slug)).toMatchObject({ isDefault: true });
    await deleteSponsorship(ctx, carnival.id);
    expect((await listSponsorships(ctx)).map((p) => p.slug)).toEqual(["hackathon-2027"]);
  });

  it("check the content and the address", async () => {
    const { ctx, hack } = await setup();
    await expect(saveSponsorship(ctx, null, { title: "Broken", content: "{ not json" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveSponsorship(ctx, null, { title: "No event", content: "{}" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveSponsorship(ctx, null, { title: "Bad list", content: JSON.stringify({ event: { name: "X" }, packages: {} }) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveSponsorship(ctx, null, { title: "Bad address", slug: "Not Valid!", content: content("X") })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(saveSponsorship(ctx, hack.id, { title: "Hackathon 2027", slug: "cse-carnival-2026", content: content("X") })).rejects.toMatchObject({ code: "CONFLICT" });
    // A new page starts hidden; same title twice gets its own address.
    const again = await saveSponsorship(ctx, null, { title: "Hackathon 2027", content: content("Hackathon 2027") });
    expect(again.slug).toBe("hackathon-2027-2");
    expect((await getSponsorship(ctx, again.id)).status).toBe("INACTIVE");
  });

  it("duplicate a page as a hidden copy with its content", async () => {
    const { ctx, carnival } = await setup();
    const copy = await duplicateSponsorship(ctx, carnival.id);
    const got = await getSponsorship(ctx, copy.id);
    expect(got).toMatchObject({ slug: "cse-carnival-2026-copy", title: "Copy of CSE Carnival 2026", status: "INACTIVE", is_default: 0 });
    expect(JSON.parse(got.content)).toMatchObject({ event: { fullName: "CSE Carnival 2026" } });
  });

  it("are managed only by people who manage settings, and refuse stale edits", async () => {
    const { ctx, hack } = await setup();
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(listSponsorships(await w.ctx(member))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setDefaultSponsorship(await w.ctx(member), hack.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveSponsorship(ctx, hack.id, { title: "Hackathon 2027", content: content("Hackathon 2027"), expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })).rejects.toMatchObject({ code: "STALE" });
  });

  it("create the general page beside the event one, with the club's partners and contacts, only once", async () => {
    const carnival = { event: { name: "CSE CARNIVAL 2026", fullName: "CSE Carnival 2026" }, contacts: [{ name: "Tanveer", role: "President" }], previousPartners: [{ name: "GitHub", logo: "/sponsors/github.png" }], achievements: [{ title: "HackTheAI 2025", description: "x" }] };
    w.sqlite.prepare("INSERT INTO organization_settings (key, value_json, is_public) VALUES ('page.sponsorship', ?, 1) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(JSON.stringify(carnival));
    w.sqlite.exec(generalSponsorshipSql());
    const page = await readSponsorship(w.db, GENERAL_SPONSORSHIP.slug);
    expect(page).toMatchObject({ title: "Partner with GUCC", isDefault: false, content: {
      event: { fullName: "GUCC Partnership Program" }, contacts: carnival.contacts, previousPartners: carnival.previousPartners, achievements: carnival.achievements,
      packages: [{ tier: "Gold Sponsor", price: 0 }, { tier: "Silver Sponsor" }, { tier: "Bronze Sponsor" }],
    } });

    // Removed by an editor: running it again doesn't bring it back.
    const mod = await w.user({ email: "mod2@x.bd", roles: ["moderator"] });
    await deleteSponsorship(await w.ctx(mod), GENERAL_SPONSORSHIP.id);
    w.sqlite.exec(generalSponsorshipSql());
    expect(await readSponsorship(w.db, GENERAL_SPONSORSHIP.slug)).toBeNull();
  });

  it("move pages up and down in the public order; the default stays first", async () => {
    const { ctx, carnival, hack } = await setup();
    const club = await saveSponsorship(ctx, null, { title: "Partner with GUCC", status: "ACTIVE", content: content("GUCC Partnership Program") });
    const order = async () => (await readSponsorships(w.db)).map((p) => p.slug);
    expect(await order()).toEqual(["cse-carnival-2026", "hackathon-2027", "partner-with-gucc"]);
    await moveSponsorship(ctx, club.id, "up");
    expect(await order()).toEqual(["cse-carnival-2026", "partner-with-gucc", "hackathon-2027"]);
    expect((await listSponsorships(ctx)).map((p) => p.slug)).toEqual(["cse-carnival-2026", "partner-with-gucc", "hackathon-2027"]);
    // Already first (after the default): nothing changes. The default itself doesn't move.
    await moveSponsorship(ctx, club.id, "up");
    expect(await order()).toEqual(["cse-carnival-2026", "partner-with-gucc", "hackathon-2027"]);
    await expect(moveSponsorship(ctx, carnival.id, "down")).rejects.toMatchObject({ code: "CONFLICT" });
    await moveSponsorship(ctx, hack.id, "up");
    expect(await order()).toEqual(["cse-carnival-2026", "hackathon-2027", "partner-with-gucc"]);
  });

  it("list what each page holds and who changed it", async () => {
    const { ctx } = await setup();
    await saveSponsorship(ctx, null, { title: "Partner with GUCC", content: JSON.stringify({
      event: { name: "GUCC PARTNERSHIP" },
      packages: [{ tier: "Gold Sponsor", price: 0 }, { tier: "Silver Sponsor", price: 40000 }, { tier: "Bronze Sponsor", price: 20000 }],
      contacts: [{ name: "A" }, { name: "B" }], previousPartners: [{ name: "GitHub", logo: "/x.png" }],
    }) });
    const row = (await listSponsorships(ctx)).find((p) => p.slug === "partner-with-gucc");
    expect(row).toMatchObject({ event_name: "GUCC PARTNERSHIP", packages: 3, contacts: 2, partners: 1, price_from: 20000, updated_by_name: "mod" });
    expect((await listSponsorships(ctx)).find((p) => p.slug === "cse-carnival-2026")).toMatchObject({ packages: 1, contacts: 0, partners: 0, price_from: 1 });
  });
});
