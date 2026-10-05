/**
 * Certificates (round 9): issuing with the design frozen, unguessable codes, notices to members
 * and an optional email with each person's own link, revoking and correcting, the holder's
 * profile switch, and a public read that never shows an email address.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { addRecipients, importPreview, issueBatch, listBatches, myCertificates, saveDesign, setCertificateStatus, setCertificateVisibility, updateCertificate } from "@/lib/server/services/certificates";
import { readCertificate, readCertificateByStudent, readProfileCertificates } from "@/lib/public/read";
import { defaultConfig } from "@/lib/certificates/config";
import { formatCode, normalizeCode, newCertificateCode } from "@/lib/certificates/code";
import { mergeServiceLines } from "@/lib/certificates/lines";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"], name: "Gina Sultana" });
});

const row = <T>(sql: string, ...args: unknown[]) => w.sqlite.prepare(sql).get(...(args as never[])) as T;
const profileOf = (userId: string) => row<{ id: string }>("SELECT id FROM profiles WHERE user_id = ?", userId).id;
const base = (recipients: unknown[]) => ({ name: "CSE Carnival 2026", kind: "PARTICIPATION", source: "MANUAL", template: "heritage", config: defaultConfig("PARTICIPATION"), issuedOn: "2026-10-12", recipients });

describe("codes", () => {
  it("are 16 Crockford characters, shown grouped, typed loosely", () => {
    const c = newCertificateCode();
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(formatCode("7K3MQ9TBX2HDPV4E")).toBe("GUCC-7K3M-Q9TB-X2HD-PV4E");
    expect(normalizeCode("gucc-7k3m-q9tb-x2hd-pv4e")).toBe("7K3MQ9TBX2HDPV4E");
    expect(normalizeCode("GUCC 7K3M Q9TB X2HD PV4E")).toBe("7K3MQ9TBX2HDPV4E");
    expect(normalizeCode("7K3MQ9TBX2HDPV4")).toBeNull();
    expect(new Set(Array.from({ length: 500 }, newCertificateCode)).size).toBe(500);
  });

  it("committee lines merge one person's terms", () => {
    expect(mergeServiceLines([
      { key: "p1", name: "Rafi", position: "General Secretary", term: "2023–24" },
      { key: "p1", name: "Rafi", position: "General Secretary", term: "Reformed 2024" },
      { key: "p2", name: "Nusrat", position: "Treasurer", term: "2023–24" },
      { key: "p2", name: "Nusrat", position: "General Secretary", term: "Reformed 2024" },
    ]).map((l) => l.role)).toEqual(["General Secretary, 2023–24 and Reformed 2024", "Treasurer, 2023–24 and General Secretary, Reformed 2024"]);
  });
});

describe("issuing", () => {
  it("issues to members and guests, tells members, and freezes the design", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "Rafi Ahmed" });
    const ctx = await w.ctx(gs);
    const r = await issueBatch(ctx, base([
      { name: "Rafi Ahmed", email: "m@x.bd", profileId: profileOf(m), role: "Participant" },
      { name: "Guest Person", email: "guest@mail.com" },
      { name: "Rafi Ahmed", profileId: profileOf(m) },
    ]));
    expect(r).toMatchObject({ issued: 2, emailed: 0 });
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'certificate.issued'", m).n).toBe(1);
    const code = row<{ code: string }>("SELECT code FROM certificates WHERE recipient_name = 'Rafi Ahmed'").code;
    // Later changes to a design never change what was issued.
    const pub = await readCertificate(w.db, code);
    expect(pub).toMatchObject({ status: "VALID", recipientName: "Rafi Ahmed", roleLine: "Participant", name: "CSE Carnival 2026", template: "heritage" });
    expect(JSON.stringify(pub)).not.toContain("m@x.bd");
    expect((pub!.design as { heading: string }).heading).toBe("Certificate");
    expect((await listBatches(ctx)).total).toBe(1);
  });

  it("needs certificates.manage", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(issueBatch(await w.ctx(m), base([{ name: "X" }]))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(importPreview(await w.ctx(m), { kind: "members" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses bad rows and more than 300 at a time", async () => {
    const ctx = await w.ctx(gs);
    await expect(issueBatch(ctx, base([{ name: "" }]))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(issueBatch(ctx, base([{ name: "A", email: "not-an-email" }]))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(issueBatch(ctx, base(Array.from({ length: 301 }, (_, i) => ({ name: `P${i}` }))))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("emails each person their own link when asked (guests only on request)", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "Rafi Ahmed" });
    const ctx = await w.ctx(gs);
    const r = await issueBatch(ctx, { ...base([{ name: "Rafi Ahmed", email: "m@x.bd", profileId: profileOf(m) }, { name: "Guest", email: "g@mail.com" }]), email: true });
    expect(r.emailed).toBe(1);
    const rec = row<{ email: string; data_json: string }>("SELECT email, data_json FROM email_campaign_recipients");
    const code = row<{ code: string }>("SELECT code FROM certificates WHERE recipient_email = 'm@x.bd'").code;
    expect(rec).toEqual({ email: "m@x.bd", data_json: JSON.stringify({ path: `/c/${code}` }) });
    expect(ctx.campaignTick).toBe(true);
  });

  it("imports members, committees and spreadsheet rows matched by email or student ID", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"], name: "Anika", positions: ["treasurer"] });
    w.sqlite.prepare("UPDATE profiles SET student_id = '221002001', batch = '221' WHERE user_id = ?").run(a);
    const ctx = await w.ctx(gs);
    expect((await importPreview(ctx, { kind: "members", filter: "batch", value: "221" })).rows.map((r) => r.name)).toEqual(["Anika"]);
    const committee = await importPreview(ctx, { kind: "committee", committeeIds: [w.committeeId] });
    expect(committee.rows.find((r) => r.name === "Anika")?.role).toBe("treasurer, 2026");
    const matched = await importPreview(ctx, { kind: "match", rows: [{ name: "A. (form)", studentId: "221-002-001" }, { name: "Nobody", email: "n@x.bd" }] });
    expect(matched.rows).toMatchObject([{ name: "A. (form)", profileId: profileOf(a), userId: a }, { name: "Nobody", profileId: null }]);
  });
});

describe("after issuing", () => {
  it("correct, revoke and restore; the page follows", async () => {
    const ctx = await w.ctx(gs);
    await issueBatch(ctx, base([{ name: "Rafi Ahmd" }]));
    const c = row<{ id: string; code: string }>("SELECT id, code FROM certificates");
    await updateCertificate(ctx, c.id, { name: "Rafi Ahmed", role: "Volunteer" });
    await expect(setCertificateStatus(ctx, c.id, true, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await setCertificateStatus(ctx, c.id, true, "Issued by mistake");
    expect(await readCertificate(w.db, c.code)).toMatchObject({ recipientName: "Rafi Ahmed", status: "REVOKED", revokeReason: "Issued by mistake" });
    await setCertificateStatus(ctx, c.id, false);
    expect((await readCertificate(w.db, c.code))?.status).toBe("VALID");
  });

  it("the holder shows or hides it on their profile; the card only for public people", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "Rafi Ahmed" });
    w.sqlite.prepare("UPDATE profiles SET slug = 'rafi', student_id = '221002009' WHERE user_id = ?").run(m);
    const ctx = await w.ctx(gs);
    await issueBatch(ctx, { ...base([{ name: "Rafi Ahmed", profileId: profileOf(m) }]), kind: "EXECUTIVE" });
    const c = row<{ id: string; code: string }>("SELECT id, code FROM certificates");
    expect((await readCertificate(w.db, c.code))?.holder).toBeNull();
    w.sqlite.prepare("UPDATE profiles SET visibility = 'PUBLIC' WHERE user_id = ?").run(m);
    expect((await readCertificate(w.db, c.code))?.holder).toMatchObject({ name: "Rafi Ahmed", handle: "rafi" });
    expect(await readProfileCertificates(w.db, "rafi")).toHaveLength(1);
    expect(await readCertificateByStudent(w.db, "221002009")).toEqual({ code: c.code });
    const mine = await myCertificates(await w.ctx(m));
    expect(mine).toHaveLength(1);
    await setCertificateVisibility(await w.ctx(m), c.id, "PRIVATE");
    expect(await readProfileCertificates(w.db, "rafi")).toHaveLength(0);
    expect((await readCertificate(w.db, c.code))?.holder).toBeNull();
    // Someone else can't change it.
    const other = await w.user({ email: "o@x.bd", roles: ["member"] });
    await expect(setCertificateVisibility(await w.ctx(other), c.id, "PUBLIC")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adds missed people to an issue with their own codes", async () => {
    const ctx = await w.ctx(gs);
    const { id } = await issueBatch(ctx, base([{ name: "A" }]));
    expect(await addRecipients(ctx, id, [{ name: "B" }, { name: "C", email: "c@mail.com" }])).toEqual({ added: 2 });
    expect(row<{ n: number }>("SELECT recipient_count n FROM certificate_batches WHERE id = ?", id).n).toBe(3);
  });

  it("saves designs; one default", async () => {
    const ctx = await w.ctx(gs);
    const a = await saveDesign(ctx, null, { name: "Club 2026", template: "emerald", config: defaultConfig("EXECUTIVE"), isDefault: true });
    const b = await saveDesign(ctx, null, { name: "Contests", template: "circuit", config: { ...defaultConfig("ACHIEVEMENT"), logos: { left: "javascript:alert(1)", right: "gub" } }, isDefault: true });
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM certificate_designs WHERE is_default = 1").n).toBe(1);
    expect(JSON.parse(row<{ c: string }>("SELECT config_json c FROM certificate_designs WHERE id = ?", b.id).c).logos).toEqual({ left: null, right: "gub" });
    expect(a.id).not.toBe(b.id);
  });
});
