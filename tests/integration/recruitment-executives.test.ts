import { beforeEach, describe, expect, it } from "vitest";
import { acceptInvite } from "@/lib/server/services/auth";
import { assignExecutive, moveAssignment, startNextCommittee } from "@/lib/server/services/committees";
import { listMessages, setMessageStatus, submitContact } from "@/lib/server/services/contact";
import { runMaintenance } from "@/lib/server/services/maintenance";
import { uploadMedia } from "@/lib/server/services/media";
import { invitePerson, updatePerson } from "@/lib/server/services/people";
import { applicationsCsv, getApplication, listApplications, publicCampaign, recruitmentUploadToken, reviewApplication, saveCampaign, submitApplication } from "@/lib/server/services/recruitment";
import { buildCommittee, type CommitteeRow, type MemberRow } from "@/lib/public/shapes";
import { COMMITTEES_SQL, MEMBERS_SQL } from "@/lib/public/queries";
import { verifyToken } from "@/lib/server/signing";
import { loadActor } from "@/lib/server/authz";
import { createWorld, type TestWorld } from "../support/d1";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

async function openCampaign() {
  const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
  const { id } = await saveCampaign(await w.ctx(pres), null, {
    title: "Call for Executives 2027", closesAt: new Date(Date.now() + 7 * 86400_000).toISOString(), status: "OPEN",
    positionIds: ["pos:executive-member", "pos:sports-secretary"],
  });
  return { pres, campaignId: id };
}

describe("recruitment", () => {
  it("public campaign → private uploads → application → review → CSV", async () => {
    const { pres, campaignId } = await openCampaign();
    const pub = await publicCampaign(await w.ctx(null));
    expect(pub.open?.positions.map((p) => p.name)).toEqual(expect.arrayContaining(["Executive Member", "Sports Secretary"]));

    const anon = await w.ctx(null, { ipHash: "applicant-ip" });
    const { token } = await recruitmentUploadToken(anon, { campaignId });
    const session = (await verifyToken<{ s: string; exp: number }>("test-auth-secret-0123456789abcdef", token))!.s;
    const up = (files: Record<string, Uint8Array>, name: string) => uploadMedia(anon, { files, originalFilename: name, purpose: "recruitment", uploadSession: session });
    const cv = await up({ master: PDF }, "cv.pdf");
    const photo = await up({ master: PNG }, "me.png");
    const idCard = await up({ master: PNG }, "id.png");
    expect(cv.url).toBeNull(); // private: no public URL
    expect(w.privateBucket.objects.size).toBe(3);
    expect(w.bucket.objects.size).toBe(0);

    const form = { campaignId, fullName: "Rahim Uddin", studentId: "232002184", email: "rahim@student.green.ac.bd", phone: "01712345678", gender: "Male", semester: "4th", batch: "232", cgpa: "3.71", completedCredit: "70", positionId: "pos:sports-secretary", cvMediaId: cv.id, photoMediaId: photo.id, idCardMediaId: idCard.id, uploadToken: token };
    const { id } = await submitApplication(anon, form);
    expect(w.emails.some((e) => e.to === "rahim@student.green.ac.bd")).toBe(true);
    await expect(submitApplication(anon, form)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(submitApplication(anon, { ...form, studentId: "232002185", email: "other@x.bd" })).rejects.toMatchObject({ code: "VALIDATION" }); // files already used
    await expect(submitApplication(anon, { ...form, studentId: "12", email: "bad" })).rejects.toMatchObject({ code: "VALIDATION" });

    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(listApplications(await w.ctx(member), { campaignId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await listApplications(await w.ctx(pres), { campaignId });
    expect(list.rows).toHaveLength(1);
    const detail = await getApplication(await w.ctx(pres), id);
    expect(detail.documents.cv).toMatch(/\?exp=\d+&sig=/);
    expect(detail.application.ip_hash).toBeUndefined();
    await reviewApplication(await w.ctx(pres), id, { status: "SHORTLISTED", note: "Strong", notify: true });
    expect(w.emails.filter((e) => e.to === "rahim@student.green.ac.bd")).toHaveLength(2);
    const { csv } = await applicationsCsv(await w.ctx(pres), campaignId);
    expect(csv).toContain("Rahim Uddin");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('recruitment.view','recruitment.export','recruitment.review')").get()).toEqual({ n: 3 });
  });

  it("closed campaigns refuse tokens and applications; abandoned uploads are cleaned up", async () => {
    const { pres, campaignId } = await openCampaign();
    const anon = await w.ctx(null, { ipHash: "ip2" });
    const { token } = await recruitmentUploadToken(anon, { campaignId });
    const session = (await verifyToken<{ s: string; exp: number }>("test-auth-secret-0123456789abcdef", token))!.s;
    const orphan = await uploadMedia(anon, { files: { master: PDF }, originalFilename: "cv.pdf", purpose: "recruitment", uploadSession: session });
    await saveCampaign(await w.ctx(pres), campaignId, { title: "Call for Executives 2027", closesAt: new Date(Date.now() + 86400_000).toISOString(), status: "CLOSED", positionIds: ["pos:executive-member"] });
    await expect(recruitmentUploadToken(anon, { campaignId })).rejects.toMatchObject({ code: "RECRUITMENT_CLOSED" });
    w.sqlite.prepare("UPDATE media SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(orphan.id);
    const report = await runMaintenance(await w.ctx(null));
    expect(report.orphanUploads).toBe(1);
    expect(w.privateBucket.objects.size).toBe(0);
  });
});

describe("contact inbox", () => {
  it("stores every message, emails the club, and only inbox readers see it", async () => {
    await submitContact(await w.ctx(null, { ipHash: "c1" }), { name: "Visitor", email: "v@x.com", message: "Hello, I'd like to sponsor an event." });
    expect(w.emails.some((e) => e.subject.includes("Visitor"))).toBe(false); // CONTACT_EMAIL not configured in tests
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(listMessages(await w.ctx(member), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    const { rows, unread } = await listMessages(await w.ctx(gs), {});
    expect(rows).toHaveLength(1);
    expect(unread).toBe(1);
    await setMessageStatus(await w.ctx(gs), rows[0].id, "READ");
    expect((await listMessages(await w.ctx(gs), {})).unread).toBe(0);
    // Honeypot and validation.
    await submitContact(await w.ctx(null, { ipHash: "c2" }), { name: "Bot", email: "b@x.com", message: "spam spam spam", website: "http://spam" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM contact_messages").get()).toEqual({ n: 1 });
    await expect(submitContact(await w.ctx(null, { ipHash: "c3" }), { name: "", email: "x", message: "hi" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("maintenance", () => {
  it("purges expired sessions and tokens and moves events along", async () => {
    const u = await w.user({ email: "u@x.bd" });
    w.sqlite.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('s_old', ?, '2020-01-01', '2020-02-01'), ('s_live', ?, '2026-01-01', '2999-01-01')").run(u, u);
    w.sqlite.prepare("INSERT INTO events (id, slug, title, start_at, end_at, status) VALUES ('ev1', 'past', 'Past', '2020-01-01T10:00:00.000Z', '2020-01-01T12:00:00.000Z', 'PUBLISHED')").run();
    const r = await runMaintenance(await w.ctx(null));
    expect(r.sessions).toBe(1);
    expect(r.eventsCompleted).toBe(1);
    expect(w.sqlite.prepare("SELECT status FROM events WHERE id = 'ev1'").get()).toEqual({ status: "COMPLETED" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 1 });
  });
});

describe("executives", () => {
  it("a new campus unit appears on the public committee page (was silently dropped)", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "Karim Ahmed", studentId: "231002001", positionId: "pos:executive-member", section: "STUDENT", unitKey: "permanent", unitLabel: "Permanent Campus" });
    const c = w.sqlite.prepare(COMMITTEES_SQL).all() as unknown as CommitteeRow[];
    const m = w.sqlite.prepare(MEMBERS_SQL).all() as unknown as MemberRow[];
    const built = buildCommittee(c.find((x) => x.id === w.committeeId)!, m);
    const campuses = built.campuses as Record<string, { studentExecutives: Array<{ name: string }> }>;
    expect(campuses.permanent.studentExecutives.map((e) => e.name)).toContain("Karim Ahmed");
    // Members without a unit are still listed at the top level.
    expect((built.studentExecutives as Array<{ name: string }>).map((e) => e.name)).toContain("pres");
  });

  it("campus-only committees (like 2026: GUCC + CSS) require a unit, and nobody is ever dropped", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare(`UPDATE committees SET layout_json = '{"sections":["campuses"],"units":[{"type":"CAMPUS","key":"gucc"},{"type":"CAMPUS","key":"css"}]}' WHERE id = ?`).run(w.committeeId);
    await expect(assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "No Unit", positionId: "pos:executive-member", section: "STUDENT" })).rejects.toMatchObject({ code: "VALIDATION" });
    await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "CSS Member", positionId: "pos:executive-member", section: "STUDENT", unitKey: "css" });
    const c = w.sqlite.prepare(COMMITTEES_SQL).all() as unknown as CommitteeRow[];
    const m = w.sqlite.prepare(MEMBERS_SQL).all() as unknown as MemberRow[];
    const built = buildCommittee(c.find((x) => x.id === w.committeeId)!, m);
    const campuses = built.campuses as Record<string, { studentExecutives: Array<{ name: string }> }>;
    expect(Object.keys(campuses)).toEqual(["gucc", "css"]);
    expect(campuses.css.studentExecutives.map((e) => e.name)).toContain("CSS Member");
    // The seeded President has no unit: still listed (flat section) rather than dropped.
    expect((built.studentExecutives as Array<{ name: string }>).map((e) => e.name)).toContain("pres");
  });

  it("reorders within a group", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const a = await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "A Person", positionId: "pos:executive-member", section: "STUDENT", title: "Executive Member - 1" });
    const b = await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "B Person", positionId: "pos:executive-member", section: "STUDENT", title: "Executive Member - 2" });
    await moveAssignment(await w.ctx(pres), b.id, "up");
    const order = (id: string) => (w.sqlite.prepare("SELECT display_order FROM committee_members WHERE id = ?").get(id) as { display_order: number }).display_order;
    expect(order(b.id)).toBeLessThan(order(a.id));
  });

  it("invites a new executive; accepting activates the account with the position's permissions", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const added = await assignExecutive(await w.ctx(pres), w.committeeId, { fullName: "Nadia Islam", studentId: "232002999", positionId: "pos:sports-secretary", section: "STUDENT" });
    expect(added.hasAccount).toBe(false);
    await invitePerson(await w.ctx(pres), added.profileId, "nadia@green.edu.bd");
    const mail = w.emails.find((e) => e.to === "nadia@green.edu.bd")!;
    const token = mail.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    const session = await acceptInvite(await w.ctx(null, { ipHash: "n1" }), { token, password: "Sports-Secretary-2027" });
    expect(session.status).toBe("ACTIVE");
    const actor = await loadActor(w.db, session.userId);
    expect(actor!.subject.positions.map((p) => p.key)).toContain("sports-secretary");
    await expect(acceptInvite(await w.ctx(null, { ipHash: "n2" }), { token, password: "Sports-Secretary-2027" })).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("profile edits are limited: a Moderator's profile only by Moderator authority (the President has it)", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator", "member"] });
    const modProfile = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(mod) as { id: string }).id;
    await updatePerson(await w.ctx(pres), modProfile, { fullName: "Changed" });
    expect(w.sqlite.prepare("SELECT full_name FROM profiles WHERE id = ?").get(modProfile)).toEqual({ full_name: "Changed" });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    const mp = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(member) as { id: string }).id;
    await updatePerson(await w.ctx(pres), mp, { fullName: "Member Name", bio: "Hello", linkedin: "https://linkedin.com/in/x" });
    await expect(updatePerson(await w.ctx(member), mp, { fullName: "Self edit via admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("starting the next term copies the layout, not the people", async () => {
    const pres = await w.user({ email: "pres@x.bd", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare(`UPDATE committees SET layout_json = '{"sections":["campuses","facultyMembers","studentExecutives"],"units":[{"type":"CAMPUS","key":"city"}]}' WHERE id = ?`).run(w.committeeId);
    const { id } = await startNextCommittee(await w.ctx(pres), { name: "GUCC Executive Committee 2027", slug: "2027", termLabel: "2027", copyLayoutFrom: w.committeeId });
    const row = w.sqlite.prepare("SELECT status, layout_json FROM committees WHERE id = ?").get(id) as { status: string; layout_json: string };
    expect(row.status).toBe("UPCOMING");
    expect(JSON.parse(row.layout_json).units[0].key).toBe("city");
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM committee_members WHERE committee_id = ?").get(id)).toEqual({ n: 0 });
  });
});
