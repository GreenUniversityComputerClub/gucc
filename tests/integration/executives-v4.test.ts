/**
 * Executives, v4: remove-as-mistake with a 30-day restore, quick edit, export that the importer
 * reads back, deleting an empty committee, and merging or deleting duplicate people.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseExecutivesFile } from "@/lib/executive-import/parse";
import { deleteCommittee } from "@/lib/server/services/committees";
import { applyBulk, exportCommittee, previewBulk, quickEditListings } from "@/lib/server/services/executive-bulk";
import { deletePerson, mergePeople } from "@/lib/server/services/people";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
const add = (id: string, name: string, position: string, order: number, studentId: string | null = null) => {
  w.sqlite.prepare("INSERT INTO profiles (id, full_name, student_id) VALUES (?, ?, ?)").run(`prf_${id}`, name, studentId);
  w.sqlite.prepare(
    "INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, is_active) VALUES (?, ?, ?, ?, ?, 'STUDENT', ?, 1)",
  ).run(id, w.committeeId, `prf_${id}`, `pos:${position}`, position.replace(/-/g, " "), order);
};
const row = (id: string) => w.sqlite.prepare("SELECT position_title, display_name, display_order, deleted_at, is_active FROM committee_members WHERE id = ?").get(id) as Record<string, unknown>;

beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
  add("cm_a", "Asha Rahman", "executive-member", 5, "232002001");
  add("cm_b", "Bilal Hossain", "treasurer", 1, "232002002");
  add("cm_mod", "Dr. Mod", "moderator", 0);
});

describe("remove as a mistake, then restore", () => {
  it("hides the listing, lists it for 30 days, and restores it exactly", async () => {
    const plan = await previewBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a", "cm_mod"], action: { op: "remove" } });
    expect(plan.items.find((i) => i.id === "cm_mod")?.blocked).toMatch(/protected/);
    await applyBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a", "cm_mod"], action: { op: "remove" } });
    expect(row("cm_a").deleted_at).toBeTruthy();
    expect(row("cm_mod").deleted_at).toBeNull();
    await applyBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a"], action: { op: "restore" } });
    expect(row("cm_a")).toMatchObject({ deleted_at: null, is_active: 1, position_title: "executive member" });
    // Older than 30 days: no longer restorable.
    await applyBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a"], action: { op: "remove" } });
    w.sqlite.prepare("UPDATE committee_members SET deleted_at = '2020-01-01T00:00:00.000Z' WHERE id = 'cm_a'").run();
    await expect(previewBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a"], action: { op: "restore" } })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'executive.restore'").get()).toEqual({ n: 1 });
  });
});

describe("quick edit", () => {
  it("saves only changed rows together, with before and after", async () => {
    const r = await quickEditListings(await w.ctx(gs), w.committeeId, [
      { id: "cm_a", title: "Executive Member (Design)", displayName: "Asha R.", order: 2 },
      { id: "cm_b", title: "treasurer", displayName: "", order: 1 },
    ]);
    expect(r.changed).toBe(1);
    expect(row("cm_a")).toMatchObject({ position_title: "Executive Member (Design)", display_name: "Asha R.", display_order: 2 });
    await expect(quickEditListings(await w.ctx(gs), w.committeeId, [{ id: "cm_mod", title: "Chief", displayName: "", order: 0 }])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(quickEditListings(await w.ctx(gs), w.committeeId, [{ id: "cm_b", title: "", displayName: "", order: 1 }])).rejects.toMatchObject({ fields: { cm_b: expect.stringMatching(/Title/) } });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(quickEditListings(await w.ctx(member), w.committeeId, [{ id: "cm_b", title: "x", displayName: "", order: 1 }])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("export", () => {
  it("writes JSON and CSV that the importer reads back", async () => {
    for (const format of ["json", "csv"] as const) {
      const out = await exportCommittee(await w.ctx(gs), w.committeeId, format);
      const parsed = parseExecutivesFile(out.body.replace(/^﻿/, ""), format);
      expect(parsed.errors).toEqual([]);
      const asha = parsed.rows.find((r) => r.studentId === "232002001");
      expect(asha).toMatchObject({ name: "Asha Rahman", position: "executive member", committee: "2026", section: "STUDENT", displayOrder: 5 });
    }
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'executives.export'").get()).toEqual({ n: 2 });
  });
});

describe("committees", () => {
  it("deletes only an empty committee that isn't current", async () => {
    await expect(deleteCommittee(await w.ctx(gs), w.committeeId, "mistake")).rejects.toMatchObject({ code: "CURRENT_COMMITTEE" });
    w.sqlite.exec("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_x', '2027-typo', 'GUCC 2027 (typo)', '2027', 'UPCOMING')");
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section) VALUES ('cm_x', 'cmt_x', 'prf_cm_b', 'pos:treasurer', 'Treasurer', 'STUDENT')").run();
    await expect(deleteCommittee(await w.ctx(gs), "cmt_x", "created twice")).rejects.toMatchObject({ code: "NOT_EMPTY" });
    w.sqlite.exec("UPDATE committee_members SET deleted_at = '2026-09-01' WHERE id = 'cm_x'");
    await deleteCommittee(await w.ctx(gs), "cmt_x", "created twice");
    expect(w.sqlite.prepare("SELECT deleted_at IS NOT NULL AS d FROM committees WHERE id = 'cmt_x'").get()).toEqual({ d: 1 });
  });
});

describe("duplicate people", () => {
  it("merges listings and the account into the kept person", async () => {
    const acct = await w.user({ email: "asha@x.bd", roles: ["member"] });
    // The duplicate: Asha's account profile, without a student ID, listed in another committee.
    const dup = (w.sqlite.prepare("SELECT id FROM profiles WHERE user_id = ?").get(acct) as { id: string }).id;
    w.sqlite.exec("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_old', '2025', 'GUCC 2025', '2025', 'ARCHIVED')");
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section) VALUES ('cm_old', 'cmt_old', ?, 'pos:executive-member', 'Executive Member', 'STUDENT')").run(dup);
    const r = await mergePeople(await w.ctx(gs), "prf_cm_a", dup, "Same student, signed up separately");
    expect(r.message).toMatch(/1 listing/);
    expect(w.sqlite.prepare("SELECT profile_id FROM committee_members WHERE id = 'cm_old'").get()).toEqual({ profile_id: "prf_cm_a" });
    expect(w.sqlite.prepare("SELECT user_id, student_id FROM profiles WHERE id = 'prf_cm_a'").get()).toEqual({ user_id: acct, student_id: "232002001" });
    expect(w.sqlite.prepare("SELECT merged_into_id, deleted_at IS NOT NULL AS d FROM profiles WHERE id = ?").get(dup)).toEqual({ merged_into_id: "prf_cm_a", d: 1 });
    await expect(mergePeople(await w.ctx(gs), "prf_cm_a", "prf_cm_b", "x y z")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes only people with no listings, posts or account", async () => {
    w.sqlite.exec("INSERT INTO profiles (id, full_name) VALUES ('prf_typo', 'Ashaa Rahman')");
    await expect(deletePerson(await w.ctx(gs), "prf_cm_b", "typo")).rejects.toMatchObject({ code: "CONFLICT" });
    await deletePerson(await w.ctx(gs), "prf_typo", "Typo when adding");
    expect(w.sqlite.prepare("SELECT deleted_at IS NOT NULL AS d FROM profiles WHERE id = 'prf_typo'").get()).toEqual({ d: 1 });
  });
});
