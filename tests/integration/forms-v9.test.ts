/**
 * Forms (round 9): saving with what the website learned by checking the link, addresses that
 * keep working after a rename or in another spelling, archive/restore, duplicates, the public
 * list and the sitemap. The responses sheet never reaches a public read.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { deleteForm, duplicateForm, getForm, listForms, recordInspection, saveForm, setFormArchived } from "@/lib/server/services/forms";
import { readForm, readForms, readSitemap } from "@/lib/public/read";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let mod: string;
beforeEach(async () => {
  w = await createWorld();
  mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
});

const GOOGLE = "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform?usp=sf_link";
const row = <T>(sql: string, ...args: unknown[]) => w.sqlite.prepare(sql).get(...(args as never[])) as T;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

describe("saving a form", () => {
  it("stores a short link unchecked, then what a check found", async () => {
    const c = await w.ctx(mod);
    const { id, slug } = await saveForm(c, null, { title: "CR Information Form", url: "https://forms.gle/Abc123" });
    expect(slug).toBe("cr-information-form");
    expect(row<{ embed_url: string | null; inspected_at: string | null; provider: string }>("SELECT embed_url, inspected_at, provider FROM external_forms WHERE id = ?", id))
      .toEqual({ embed_url: null, inspected_at: null, provider: "google" });

    await saveForm(c, id, { title: "CR Information Form", url: "https://forms.gle/Abc123", slug, inspected: "1", openUrl: GOOGLE, requiresSignIn: "1", questionCount: "12", accepting: "1", display: "AUTO" });
    const f = (await getForm(c, id)).form;
    expect(f.embedUrl).toBe("https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform?embedded=true");
    expect(f.openUrl).toBe("https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform");
    expect(f).toMatchObject({ requiresSignIn: true, questionCount: 12, state: "open" });
    expect(f.inspectedAt).not.toBeNull();

    // An edit without a new check keeps what was learned; a new link starts unchecked.
    await saveForm(c, id, { title: "CR Info", url: "https://forms.gle/Abc123", slug, accepting: "1" });
    expect((await getForm(c, id)).form).toMatchObject({ requiresSignIn: true, questionCount: 12, title: "CR Info" });
    await saveForm(c, id, { title: "CR Info", url: "https://forms.gle/Other9", slug, accepting: "1" });
    expect((await getForm(c, id)).form).toMatchObject({ requiresSignIn: false, questionCount: null, inspectedAt: null, embedUrl: null });
  });

  it("refuses links outside the form services, a check of another service, and closing before opening", async () => {
    const c = await w.ctx(mod);
    await expect(saveForm(c, null, { title: "X", url: "https://example.com/form" })).rejects.toMatchObject({ code: "VALIDATION", fields: { url: expect.any(String) } });
    await expect(saveForm(c, null, { title: "X", url: "https://forms.gle/Abc", inspected: "1", openUrl: "https://tally.so/r/abc" })).rejects.toMatchObject({ fields: { url: expect.any(String) } });
    await expect(saveForm(c, null, { title: "X", url: GOOGLE, opensAt: "2026-11-02T10:00", closesAt: "2026-11-01T10:00" })).rejects.toMatchObject({ fields: { closesAt: expect.any(String) } });
    await expect(saveForm(c, null, { title: "X", url: GOOGLE, slug: "dashboard" })).rejects.toMatchObject({ fields: { slug: expect.any(String) } });
  });

  it("accepts a whole Google embed code as the link", async () => {
    const c = await w.ctx(mod);
    const { id } = await saveForm(c, null, { title: "Survey", url: `<iframe src="${GOOGLE.replace("?usp=sf_link", "?embedded=true")}" width="640" height="2000">Loading…</iframe>` });
    expect(row<{ url: string; embed_url: string }>("SELECT url, embed_url FROM external_forms WHERE id = ?", id)).toEqual({
      url: "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform?embedded=true",
      embed_url: "https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEf/viewform?embedded=true",
    });
  });

  it("needs forms.manage", async () => {
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(saveForm(await w.ctx(member), null, { title: "X", url: GOOGLE })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listForms(await w.ctx(member))).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The President and the General Secretary manage forms like a Moderator.
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    await expect(saveForm(await w.ctx(gs), null, { title: "GS form", url: GOOGLE })).resolves.toMatchObject({ slug: "gs-form" });
  });
});

describe("addresses", () => {
  it("old addresses and other spellings keep leading to the form", async () => {
    const c = await w.ctx(mod);
    const { id } = await saveForm(c, null, { title: "CR", url: GOOGLE, slug: "cr-fall-2026" });
    await saveForm(c, id, { title: "CR", url: GOOGLE, slug: "cr-2026" });
    expect((await readForm(w.db, "cr-fall-2026"))?.slug).toBe("cr-2026");
    expect((await readForm(w.db, "CR-2026"))?.slug).toBe("cr-2026");
    expect((await getForm(c, id)).slugs.map((s) => s.slug)).toEqual(["cr-fall-2026"]);
  });

  it("a form saved before addresses were lowercase keeps its address when edited", async () => {
    w.sqlite.exec("INSERT INTO external_forms (id, slug, title, url) VALUES ('form_legacy', 'CR', 'CR form', 'https://forms.gle/Legacy1')");
    w.sqlite.exec("INSERT INTO external_form_slugs (slug, form_id) VALUES ('CR', 'form_legacy')");
    const c = await w.ctx(mod);
    await saveForm(c, "form_legacy", { title: "CR form (fall)", url: "https://forms.gle/Legacy1", slug: "CR" });
    expect((await readForm(w.db, "cr"))).toMatchObject({ slug: "CR", title: "CR form (fall)" });
  });

  it("an active form's address (or old address) can't be taken; an archived form's can", async () => {
    const c = await w.ctx(mod);
    const a = await saveForm(c, null, { title: "A", url: GOOGLE, slug: "join" });
    await saveForm(c, a.id, { title: "A", url: GOOGLE, slug: "join-2026" });
    await expect(saveForm(c, null, { title: "B", url: GOOGLE, slug: "join-2026" })).rejects.toMatchObject({ code: "VALIDATION", fields: { slug: expect.stringContaining("uses") } });
    await expect(saveForm(c, null, { title: "B", url: GOOGLE, slug: "join" })).rejects.toMatchObject({ fields: { slug: expect.stringContaining("used to lead") } });

    await setFormArchived(c, a.id, true);
    expect(await readForm(w.db, "join-2026")).toBeNull();
    const b = await saveForm(c, null, { title: "B", url: GOOGLE, slug: "join-2026" });
    expect((await readForm(w.db, "join-2026"))?.title).toBe("B");
    // The archived form got an address of its own, and comes back there.
    const renamed = row<{ slug: string }>("SELECT slug FROM external_forms WHERE id = ?", a.id).slug;
    expect(renamed).toMatch(/^join-2026-archived-/);
    await setFormArchived(c, a.id, false);
    expect((await readForm(w.db, renamed))?.title).toBe("A");
    expect(b.id).not.toBe(a.id);
  });

  it("deleting needs an archived form, and frees its addresses", async () => {
    const c = await w.ctx(mod);
    const { id } = await saveForm(c, null, { title: "Old", url: GOOGLE, slug: "old-form" });
    await expect(deleteForm(c, id)).rejects.toMatchObject({ code: "VALIDATION" });
    await setFormArchived(c, id, true);
    await deleteForm(c, id);
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM external_form_slugs WHERE form_id = ?", id).n).toBe(0);
    await expect(saveForm(c, null, { title: "New", url: GOOGLE, slug: "old-form" })).resolves.toMatchObject({ slug: "old-form" });
    expect((await listForms(c)).map((f) => f.title)).toEqual(["New"]);
  });

  it("duplicates for the next round: unlisted, unscheduled, under a free address", async () => {
    const c = await w.ctx(mod);
    const { id } = await saveForm(c, null, { title: "CR", url: GOOGLE, slug: "cr", listed: "1", opensAt: "2026-09-01T10:00", closesAt: "2026-09-10T10:00" });
    const one = await duplicateForm(c, id);
    const two = await duplicateForm(c, id);
    expect([one.slug, two.slug]).toEqual(["cr-copy", "cr-copy-2"]);
    expect((await getForm(c, one.id)).form).toMatchObject({ title: "CR (copy)", listed: false, opensAt: null, closesAt: null, url: GOOGLE });
  });
});

describe("public reads", () => {
  it("the list shows listed forms (open, scheduled, closed within 30 days), never the responses sheet", async () => {
    const c = await w.ctx(mod);
    await saveForm(c, null, { title: "Open", url: GOOGLE, listed: "1", responsesUrl: "https://docs.google.com/spreadsheets/d/secret" });
    await saveForm(c, null, { title: "Soon", url: GOOGLE, listed: "1", opensAt: iso(2 * DAY) });
    await saveForm(c, null, { title: "Just closed", url: GOOGLE, listed: "1", closesAt: iso(-2 * DAY) });
    await saveForm(c, null, { title: "Long closed", url: GOOGLE, listed: "1", closesAt: iso(-40 * DAY) });
    await saveForm(c, null, { title: "Unlisted", url: GOOGLE });
    await saveForm(c, null, { title: "Paused", url: GOOGLE, listed: "1", accepting: "0" });
    const list = await readForms(w.db);
    expect(list.map((f) => f.title).sort()).toEqual(["Just closed", "Open", "Paused", "Soon"]);
    expect(JSON.stringify(list)).not.toContain("spreadsheets");
    expect(JSON.stringify(await readForm(w.db, "open"))).not.toContain("spreadsheets");
    expect((await readForm(w.db, "paused"))?.accepting).toBe(false);
    // Only listed forms that take answers now go in the sitemap.
    expect((await readSitemap(w.db)).forms.map((f) => f.slug)).toEqual(["open"]);
  });

  it("a fresh check that finds the form closed stops it taking answers", async () => {
    const c = await w.ctx(mod);
    const { id } = await saveForm(c, null, { title: "Poll", url: GOOGLE });
    await recordInspection(c, id, { openUrl: GOOGLE, requiresSignIn: "0", questionCount: "3", closed: "1" });
    expect((await getForm(c, id)).form).toMatchObject({ state: "closed", accepting: false, questionCount: 3 });
  });
});
