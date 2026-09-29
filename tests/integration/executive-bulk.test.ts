import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "@/lib/server/db";
import { loadActor } from "@/lib/server/authz";
import type { Ctx } from "@/lib/server/context";
import { applyBulk, previewBulk } from "@/lib/server/services/executive-bulk";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
const add = (id: string, name: string, position: string, order: number, extra: { unit?: string; ended?: boolean } = {}) => {
  w.sqlite.prepare("INSERT INTO profiles (id, full_name) VALUES (?, ?)").run(`prf_${id}`, name);
  w.sqlite.prepare(
    "INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, unit_key, unit_type, display_order, end_date, is_active) VALUES (?, ?, ?, ?, ?, 'STUDENT', ?, ?, ?, ?, ?)",
  ).run(id, w.committeeId, `prf_${id}`, `pos:${position}`, position.replace(/-/g, " "), extra.unit ?? null, extra.unit ? "CAMPUS" : null, order, extra.ended ? "2026-01-01" : null, extra.ended ? 0 : 1);
};

beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
  add("cm_a", "Asha", "executive-member", 5);
  add("cm_b", "Bilal", "treasurer", 1);
  add("cm_c", "Chayan", "president", 9, { ended: true });
  add("cm_mod", "Dr. Mod", "moderator", 0);
});

const row = (id: string) => w.sqlite.prepare("SELECT position_id, position_title, display_order, end_date, is_active FROM committee_members WHERE id = ?").get(id) as Record<string, unknown>;

describe("bulk executive changes", () => {
  it("previews first, refuses own listings, and ends the rest in one audited step (the General Secretary may change a Moderator's listing)", async () => {
    const gsListing = (w.sqlite.prepare("SELECT cm.id FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id WHERE p.user_id = ?").get(gs) as { id: string }).id;
    const req = { committeeId: w.committeeId, ids: ["cm_a", "cm_b", "cm_mod", gsListing], action: { op: "end" as const } };
    const plan = await previewBulk(await w.ctx(gs), req);
    const byId = Object.fromEntries(plan.items.map((i) => [i.id, [Boolean(i.change), i.blocked?.split(":")[0] ?? null]]));
    expect(byId).toEqual({ cm_a: [true, null], cm_b: [true, null], cm_mod: [true, null], [gsListing]: [false, "Your own listing"] });
    expect(row("cm_a").end_date).toBeNull();
    const res = await applyBulk(await w.ctx(gs), req);
    expect(res).toMatchObject({ changed: 3, blocked: 1 });
    expect(row("cm_a")).toMatchObject({ is_active: 0 });
    expect(row("cm_a").end_date).toBeTruthy();
    expect(row("cm_mod").end_date).toBeTruthy();
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'executive.end'").get()).toEqual({ n: 3 });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'executives.bulk'").get()).toEqual({ n: 1 });
  });

  it("respects single-holder positions when reactivating or changing positions", async () => {
    add("cm_p", "Priya", "president", 2);
    let plan = await previewBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_c"], action: { op: "reactivate" } });
    expect(plan.items[0].blocked).toMatch(/already has 1 of 1/);
    const pres = w.sqlite.prepare("SELECT id FROM positions WHERE key = 'president'").get() as { id: string };
    plan = await previewBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_a"], action: { op: "position", positionId: pres.id } });
    expect(plan.items[0].blocked).toMatch(/allows 1 holder/);

    const execMember = w.sqlite.prepare("SELECT id FROM positions WHERE key = 'executive-member'").get() as { id: string };
    await applyBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: ["cm_b"], action: { op: "position", positionId: execMember.id } });
    expect(row("cm_b")).toMatchObject({ position_id: "pos:executive-member", position_title: "Executive Member" });
  });

  it("copies listings into another committee once, adding its campus tabs", async () => {
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_next', '2027', 'GUCC 2027', '2027', 'UPCOMING')").run();
    add("cm_u", "Umar", "executive-member", 3, { unit: "css" });
    const req = { committeeId: w.committeeId, ids: ["cm_a", "cm_u"], action: { op: "copy" as const, targetCommitteeId: "cmt_next" } };
    const res = await applyBulk(await w.ctx(gs), req);
    expect(res.changed).toBe(2);
    expect(w.sqlite.prepare("SELECT p.full_name, cm.is_active, cm.unit_key FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id WHERE cm.committee_id = 'cmt_next' ORDER BY p.full_name").all())
      .toEqual([{ full_name: "Asha", is_active: 0, unit_key: null }, { full_name: "Umar", is_active: 0, unit_key: "css" }]);
    const layout = JSON.parse((w.sqlite.prepare("SELECT layout_json FROM committees WHERE id = 'cmt_next'").get() as { layout_json: string }).layout_json);
    expect(layout.units).toEqual([expect.objectContaining({ key: "css" })]);
    const again = await previewBulk(await w.ctx(gs), req);
    expect(again.items.every((i) => i.blocked?.startsWith("Already in"))).toBe(true);
  });

  it("sorts a committee by position rank within each section", async () => {
    await applyBulk(await w.ctx(gs), { committeeId: w.committeeId, ids: [], action: { op: "sort" } });
    const order = w.sqlite.prepare("SELECT p.key FROM committee_members cm JOIN positions p ON p.id = cm.position_id WHERE cm.committee_id = ? ORDER BY cm.display_order").all(w.committeeId) as Array<{ key: string }>;
    expect(order.map((o) => o.key)).toEqual(["moderator", "president", "general-secretary", "treasurer", "executive-member"]);
  });

  it("needs executive rights and stays within the free plan's 50 statements", async () => {
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    await expect(previewBulk(await w.ctx(exec), { committeeId: w.committeeId, ids: ["cm_a"], action: { op: "end" } })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      add(`cm_x${i}`, `Person ${i}`, "executive-member", 20 + i);
      ids.push(`cm_x${i}`);
    }
    const db = new Db(w.db.raw);
    const ctx: Ctx = { ...(await w.ctx(gs)), db, actor: await loadActor(db, gs) };
    const res = await applyBulk(ctx, { committeeId: w.committeeId, ids, action: { op: "end" } });
    expect(res.changed).toBe(60);
    expect(db.queries + 1).toBeLessThanOrEqual(45);
  });
});
