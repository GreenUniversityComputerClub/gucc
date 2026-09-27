import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "@/lib/server/db";
import { loadActor } from "@/lib/server/authz";
import type { Ctx } from "@/lib/server/context";
import { applyExecutiveImport, previewExecutiveImport, type ImportRequest } from "@/lib/server/services/executive-import";
import { parseCsv } from "@/lib/executive-import/parse";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
  // An executive already on record (e.g. imported from the legacy data), with an account.
  w.sqlite.prepare("INSERT INTO users (id, email, status) VALUES ('usr_rafi', 'rafi@x.bd', 'ACTIVE')").run();
  w.sqlite.prepare("INSERT INTO profiles (id, user_id, full_name, student_id) VALUES ('prf_rafi', 'usr_rafi', 'Rafi Hasan', '221002001')").run();
});

const req = (people: unknown, extra: Partial<ImportRequest> = {}): ImportRequest => ({ text: JSON.stringify(people), format: "json", mode: "insert", ...extra });
const listings = () => w.sqlite.prepare("SELECT pr.full_name, cm.position_title, pr.student_id FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id WHERE cm.committee_id = ? AND cm.deleted_at IS NULL AND pr.full_name <> 'gs' ORDER BY cm.display_order").all(w.committeeId) as Array<{ full_name: string; position_title: string; student_id: string | null }>;

const FILE = [
  { name: "Nadia Islam", studentId: "232002184", position: "Treasurer", committee: "2026", linkedin: "https://linkedin.com/in/nadia" },
  { name: "Rafi Hasan", studentId: "221002001", position: "Joint General Secretary (Technical)", committee: "2026" },
  { name: "", studentId: "232002999", position: "Executive Member", committee: "2026" },
  { name: "Tanim Rahman", studentId: "12345", position: "Chief Wizard", committee: "2026" },
  { name: "Nadia Islam", studentId: "232002184", position: "Treasurer", committee: "2026" },
  { name: "Arif Chowdhury", position: "President", committee: "2026" },
  { name: "Mitu Akter", position: "President", committee: "2026" },
  { name: "Dr. Faculty", position: "Moderator", committee: "2026" },
];

describe("executive JSON import", () => {
  it("previews every kind of row before changing anything", async () => {
    const plan = await previewExecutiveImport(await w.ctx(gs), req(FILE));
    const byRow = (n: number) => plan.rows.find((r) => r.row === n)!;
    expect(byRow(1)).toMatchObject({ action: "create", person: { kind: "new" }, position: { name: "Treasurer" } });
    expect(byRow(2)).toMatchObject({ action: "assign", person: { kind: "existing", profileId: "prf_rafi", via: "student ID" }, position: { name: "Joint General Secretary (Technical)" } });
    expect(byRow(3).issues.map((i) => i.code)).toContain("MISSING_NAME");
    expect(byRow(4).issues.map((i) => i.code)).toEqual(expect.arrayContaining(["INVALID_ID", "UNKNOWN_POSITION"]));
    expect(byRow(5)).toMatchObject({ action: "skip" });
    expect(byRow(5).issues[0].code).toBe("DUPLICATE_ROW");
    expect(byRow(6).action).toBe("create");
    expect(byRow(7).issues.map((i) => i.code)).toContain("MAX_HOLDERS");
    expect(byRow(8).issues.map((i) => i.code)).toContain("PROTECTED_POSITION");
    expect(plan.unknownPositions).toEqual([expect.objectContaining({ title: "Chief Wizard", rows: [4] })]);
    expect(plan.canImport).toBe(false);
    expect(listings()).toEqual([]);
  });

  it("imports once the admin resolves or skips problem rows, verifies, audits and notifies", async () => {
    const execMember = w.sqlite.prepare("SELECT id FROM positions WHERE key = 'executive-member'").get() as { id: string };
    const resolutions = { positions: { "chief wizard": execMember.id }, rows: { "3": { skip: true }, "7": { skip: true }, "8": { skip: true } } };
    const ctx = await w.ctx(gs);
    const plan = await previewExecutiveImport(ctx, req(FILE, { resolutions }));
    expect(plan.canImport).toBe(true);
    expect(plan.summary).toMatchObject({ create: 3, assign: 1, skip: 4, blocked: 0 });

    const result = await applyExecutiveImport(await w.ctx(gs), { ...req(FILE, { resolutions }), planHash: plan.planHash });
    expect(result).toMatchObject({ created: { people: 3, listings: 4 }, updated: { listings: 0 }, verify: { ok: true } });
    expect(listings().map((l) => l.full_name)).toEqual(["Nadia Islam", "Rafi Hasan", "Tanim Rahman", "Arif Chowdhury"]);
    // "Tanim Rahman" keeps the file's title; the invalid ID was dropped, not stored.
    expect(listings().find((l) => l.full_name === "Tanim Rahman")).toMatchObject({ position_title: "Chief Wizard", student_id: null });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM profiles WHERE full_name = 'Rafi Hasan'").get()).toEqual({ n: 1 });
    expect(w.sqlite.prepare("SELECT action, json_extract(after_json, '$.created.listings') AS n FROM audit_logs WHERE action = 'executives.import'").get()).toEqual({ action: "executives.import", n: 4 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'executive.assign'").get()).toEqual({ n: 4 });
    expect(w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = 'usr_rafi'").get()).toEqual({ title: "You were added as Joint General Secretary (Technical)" });

    // Importing the same file again changes nothing.
    const again = await previewExecutiveImport(await w.ctx(gs), req(FILE, { resolutions }));
    expect(again.summary).toMatchObject({ create: 0, assign: 0, unchanged: 4 });
    expect(again.canImport).toBe(false);
  });

  it("updates existing listings only in the update modes, never blanking values", async () => {
    const base = [{ name: "Rafi Hasan", studentId: "221002001", position: "Treasurer", committee: "2026", bio: "First bio" }];
    let plan = await previewExecutiveImport(await w.ctx(gs), req(base));
    await applyExecutiveImport(await w.ctx(gs), { ...req(base), planHash: plan.planHash });

    const changed = [
      { name: "Rafi Hasan", studentId: "221002001", position: "Treasurer", committee: "2026", bio: "New bio", github: "https://github.com/rafi" },
      { name: "Someone New", studentId: "232002555", position: "Executive Member", committee: "2026" },
    ];
    plan = await previewExecutiveImport(await w.ctx(gs), req(changed));
    expect(plan.rows.map((r) => r.action)).toEqual(["unchanged", "create"]);
    expect(plan.rows[0].issues.map((i) => i.code)).toContain("MODE_KEEP");

    plan = await previewExecutiveImport(await w.ctx(gs), req(changed, { mode: "update" }));
    expect(plan.rows.map((r) => r.action)).toEqual(["update", "skip"]);
    expect(plan.rows[0].changes).toEqual(expect.arrayContaining(["bio", "GitHub"]));
    const result = await applyExecutiveImport(await w.ctx(gs), { ...req(changed, { mode: "update" }), planHash: plan.planHash });
    expect(result).toMatchObject({ created: { people: 0, listings: 0 }, updated: { listings: 1, people: 1 } });
    expect(w.sqlite.prepare("SELECT cm.bio, pr.github_url, pr.student_id FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id WHERE pr.id = 'prf_rafi'").get())
      .toEqual({ bio: "New bio", github_url: "https://github.com/rafi", student_id: "221002001" });

    // A file without a bio keeps the stored one.
    const noBio = [{ name: "Rafi Hasan", studentId: "221002001", position: "Treasurer", committee: "2026" }];
    plan = await previewExecutiveImport(await w.ctx(gs), req(noBio, { mode: "upsert" }));
    expect(plan.rows[0].action).toBe("unchanged");
  });

  it("refuses when the data changed after the preview, and without permission", async () => {
    const file = [{ name: "Nadia Islam", studentId: "232002184", position: "President", committee: "2026" }];
    const plan = await previewExecutiveImport(await w.ctx(gs), req(file));
    const other = await w.user({ email: "other@x.bd", positions: ["president"] });
    w.sqlite.prepare("UPDATE committee_members SET position_id = 'pos:president' WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ?)").run(other);
    await expect(applyExecutiveImport(await w.ctx(gs), { ...req(file), planHash: plan.planHash })).rejects.toMatchObject({ code: "PLAN_CHANGED" });

    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    await expect(previewExecutiveImport(await w.ctx(exec), req(file))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(previewExecutiveImport(await w.ctx(member), req(file))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads GUCC's executives.json format, including campuses, portraits and faculty", async () => {
    w.sqlite.prepare("UPDATE committees SET layout_json = ? WHERE id = ?").run(JSON.stringify({ sections: ["campuses"], units: [{ type: "CAMPUS", key: "gucc" }, { type: "CAMPUS", key: "css" }] }), w.committeeId);
    const legacy = [{
      year: "2026",
      campuses: {
        gucc: {
          facultyMembers: [{ position: "Deputy Moderator", name: "Dr. Advisor" }],
          studentExecutives: [{ position: "Treasurer", name: "Nadia Islam", studentId: "232002184", avatarPosition: { x: -10, y: -15 }, avatarScale: 1, mail: "mailto::nadia@x.bd" }],
        },
        css: { studentExecutives: [{ position: "Executive Member", name: "Sajid Khan", studentId: "232002777" }] },
      },
    }];
    const plan = await previewExecutiveImport(await w.ctx(gs), req(legacy));
    expect(plan.shape).toContain("GUCC committees");
    expect(plan.rows.map((r) => [r.name, r.section, r.unit, r.action])).toEqual([
      ["Dr. Advisor", "FACULTY", "gucc", "create"],
      ["Nadia Islam", "STUDENT", "gucc", "create"],
      ["Sajid Khan", "STUDENT", "css", "create"],
    ]);
    const result = await applyExecutiveImport(await w.ctx(gs), { ...req(legacy), planHash: plan.planHash });
    expect(result.verify.ok).toBe(true);
    expect(w.sqlite.prepare("SELECT unit_key, avatar_position_x, avatar_position_y FROM committee_members WHERE position_title = 'Treasurer'").get()).toEqual({ unit_key: "gucc", avatar_position_x: -10, avatar_position_y: -15 });

    // A campus-only committee needs a campus for everyone.
    const flat = [{ name: "No Campus", studentId: "232002888", position: "Executive Member", committee: "2026" }];
    const p2 = await previewExecutiveImport(await w.ctx(gs), req(flat));
    expect(p2.rows[0].issues.map((i) => i.code)).toContain("MISSING_UNIT");
  });

  it("reads CSV with quoted commas and line breaks", () => {
    const csv = 'Name,Student ID,Position,Committee,Bio\n"Islam, Nadia",232002184,Treasurer,2026,"Loves\nC++"\nRafi Hasan,221002001,Executive Member,2026,\n';
    const { rows, errors } = parseCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.row, r.name, r.studentId, r.position, r.bio])).toEqual([
      [2, "Islam, Nadia", "232002184", "Treasurer", "Loves C++"],
      [4, "Rafi Hasan", "221002001", "Executive Member", null],
    ]);
  });

  it("imports 150 people within the free plan's 50 D1 statements", async () => {
    const big = Array.from({ length: 150 }, (_, i) => ({ name: `Member ${i}`, studentId: String(232100000 + i), position: "Executive Member", committee: "2026" }));
    const plan = await previewExecutiveImport(await w.ctx(gs), req(big));
    const db = new Db(w.db.raw);
    const ctx: Ctx = { ...(await w.ctx(gs)), db, actor: await loadActor(db, gs) };
    const result = await applyExecutiveImport(ctx, { ...req(big), planHash: plan.planHash });
    expect(result).toMatchObject({ created: { listings: 150 }, verify: { ok: true } });
    expect(db.queries + 1).toBeLessThanOrEqual(45);
  });
});
