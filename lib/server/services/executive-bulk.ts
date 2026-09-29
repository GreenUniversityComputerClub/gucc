/**
 * Bulk changes to a committee's listings: end, reactivate, change position, copy to
 * another committee, and sort by position rank. Each runs in two steps: a preview that
 * lists exactly what would change (and what can't, and why), then the same plan applied
 * in one D1 batch with one audit record per listing. The rules are the single-listing
 * ones: executives.assign / executives.remove on the committee, Moderators only for
 * protected positions, nobody changes their own listing, single-holder limits.
 */
import { assertStmt, batchTransition } from "../transition";
import { holdsProtectedRole } from "../../governance/engine";
import { auditManyStmt, auditStmt, type AuditEntry } from "../audit";
import { authorize, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { requireRecentAuthForPositions } from "../security";

export type BulkAction =
  | { op: "end" }
  | { op: "remove" }
  | { op: "restore" }
  | { op: "reactivate" }
  | { op: "position"; positionId: string; keepTitles?: boolean }
  | { op: "copy"; targetCommitteeId: string }
  | { op: "sort" };

export interface BulkRequest {
  committeeId: string;
  /** Listing ids; "sort" may leave it empty to sort the whole committee. */
  ids: string[];
  action: BulkAction;
}

export interface BulkItem {
  id: string;
  name: string;
  title: string;
  change: string | null;
  blocked: string | null;
}

export interface BulkPlan {
  title: string;
  items: BulkItem[];
  changes: number;
  blocked: number;
  canApply: boolean;
}

interface Row {
  id: string;
  committee_id: string;
  profile_id: string;
  position_id: string;
  position_name: string;
  position_rank: number;
  position_level: number;
  is_protected: number;
  max_holders: number | null;
  user_id: string | null;
  full_name: string;
  display_name: string | null;
  position_title: string;
  section: string;
  unit_key: string | null;
  unit_type: string | null;
  campus_label: string | null;
  display_order: number;
  end_date: string | null;
}

const MAX_IDS = 300;
/** Listings removed as mistakes can be restored for this long. */
export const RESTORE_DAYS = 30;

async function plan(ctx: Ctx, req: BulkRequest) {
  const actor = requireActor(ctx);
  const committee = await ctx.db.first<{ id: string; name: string; status: string; layout_json: string | null }>(
    "SELECT id, name, status, layout_json FROM committees WHERE id = ?1 AND deleted_at IS NULL", req.committeeId);
  if (!committee) throw new NotFoundError("Committee");
  const op = req.action?.op;
  if (!["end", "remove", "restore", "reactivate", "position", "copy", "sort"].includes(op)) throw new ValidationError("Choose a bulk action.");
  const ids = [...new Set((req.ids ?? []).filter((x) => typeof x === "string"))].slice(0, MAX_IDS + 1);
  if (ids.length > MAX_IDS) throw new ValidationError(`Select at most ${MAX_IDS} listings at a time.`);
  if (!ids.length && op !== "sort") throw new ValidationError("Select at least one listing.");
  const decision = requirePermission(ctx, op === "end" || op === "remove" ? "executives.remove" : "executives.assign", { type: "committee_member", committeeId: committee.id });
  const moderator = actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject);

  const rows = await ctx.db.all<Row>(
    `SELECT cm.id, cm.committee_id, cm.profile_id, cm.position_id, p.name AS position_name, p.rank AS position_rank, p.governance_level AS position_level, p.is_protected, p.max_holders, pr.user_id,
            pr.full_name, cm.display_name, cm.position_title, cm.section, cm.unit_key, cm.unit_type, cm.campus_label, cm.display_order, cm.end_date
     FROM committee_members cm JOIN positions p ON p.id = cm.position_id JOIN profiles pr ON pr.id = cm.profile_id
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL ORDER BY cm.section, IFNULL(cm.unit_key, ''), cm.display_order, cm.created_at`,
    committee.id);
  const cutoff = new Date(Date.now() - RESTORE_DAYS * 86_400_000).toISOString();
  const removed = op === "restore"
    ? await ctx.db.all<Row>(
      `SELECT cm.id, cm.committee_id, cm.profile_id, cm.position_id, p.name AS position_name, p.rank AS position_rank, p.governance_level AS position_level, p.is_protected, p.max_holders, pr.user_id,
              pr.full_name, cm.display_name, cm.position_title, cm.section, cm.unit_key, cm.unit_type, cm.campus_label, cm.display_order, cm.end_date
       FROM committee_members cm JOIN positions p ON p.id = cm.position_id JOIN profiles pr ON pr.id = cm.profile_id
       WHERE cm.committee_id = ?1 AND cm.deleted_at IS NOT NULL AND cm.deleted_at >= ?2`, committee.id, cutoff)
    : [];
  const pool = op === "restore" ? removed : rows;
  const selected = op === "sort" && !ids.length ? rows : pool.filter((r) => ids.includes(r.id));
  if (selected.length !== (op === "sort" && !ids.length ? rows.length : ids.length)) throw new ValidationError("Some selected listings aren't in this committee any more. Reload the page.");

  const items: BulkItem[] = [];
  const updates: Array<Record<string, string | number | null>> = [];
  const inserts: Array<Record<string, string | number | null>> = [];
  const audits: AuditEntry[] = [];
  const now = nowIso();
  let title = "";
  let target: { id: string; name: string; status: string; layout: { sections: string[]; units: Array<{ type: string; key: string; meta?: Record<string, unknown> }> } } | null = null;
  const item = (r: Row, change: string | null, blocked: string | null = null) => items.push({ id: r.id, name: r.display_name ?? r.full_name, title: r.position_title, change: blocked ? null : change, blocked });
  const guard = (r: Row): string | null => {
    if (r.user_id && r.user_id === actor.user.id) return "Your own listing: another administrator has to change it.";
    if (r.is_protected && !moderator) return `${r.position_name} is protected: only a Moderator, the President or the General Secretary can change it.`;
    return null;
  };
  // Holder limits count per unit: GUCC and an affiliated committee (e.g. CSS) each have their own President.
  const unitOf = (x: { unit_key: string | null }) => x.unit_key ?? "";
  const holders = (positionId: string, list: Row[], unit: string) => list.filter((x) => x.position_id === positionId && unitOf(x) === unit && !x.end_date).length;
  const slot = (positionId: string, unit: string) => `${positionId}|${unit}`;

  if (op === "remove") {
    title = "Remove (entered by mistake; can be restored for 30 days)";
    for (const r of selected) {
      if (guard(r)) item(r, null, guard(r));
      else {
        item(r, "Removed from this committee");
        updates.push({ id: r.id, deleted_at: now, is_active: 0 });
        audits.push({ action: "executive.remove", resourceType: "committee_member", resourceId: r.id, reason: "Bulk: removed as entered by mistake", before: { name: r.display_name ?? r.full_name, title: r.position_title }, decision });
      }
    }
  } else if (op === "restore") {
    title = "Restore removed listings";
    const counts = new Map<string, number>();
    for (const r of selected) {
      const current = counts.get(slot(r.position_id, unitOf(r))) ?? holders(r.position_id, rows, unitOf(r));
      const clash = rows.some((x) => x.profile_id === r.profile_id && x.position_id === r.position_id && (x.unit_key ?? "") === (r.unit_key ?? ""));
      if (guard(r)) item(r, null, guard(r));
      else if (clash) item(r, null, "Already listed again in this committee.");
      else if (!r.end_date && r.max_holders && current >= r.max_holders) item(r, null, `${r.position_name} already has ${current} of ${r.max_holders} allowed holder${r.max_holders === 1 ? "" : "s"}.`);
      else {
        if (!r.end_date) counts.set(slot(r.position_id, unitOf(r)), current + 1);
        item(r, "Back in this committee");
        updates.push({ id: r.id, clear_deleted: 1, is_active: committee.status === "CURRENT" && !r.end_date ? 1 : 0 });
        audits.push({ action: "executive.restore", resourceType: "committee_member", resourceId: r.id, reason: "Bulk: restore", decision });
      }
    }
  } else if (op === "end") {
    title = "End assignments (they stay in the committee's history)";
    for (const r of selected) {
      if (r.end_date) item(r, null, "Already ended.");
      else if (guard(r)) item(r, null, guard(r));
      else {
        item(r, "Ends today");
        updates.push({ id: r.id, end_date: now, is_active: 0 });
        audits.push({ action: "executive.end", resourceType: "committee_member", resourceId: r.id, reason: "Bulk: end assignments", decision });
      }
    }
  } else if (op === "reactivate") {
    title = "Reactivate ended assignments";
    const counts = new Map<string, number>();
    for (const r of selected) {
      const current = counts.get(slot(r.position_id, unitOf(r))) ?? holders(r.position_id, rows, unitOf(r));
      if (!r.end_date) item(r, null, "Already active.");
      else if (guard(r)) item(r, null, guard(r));
      else if (r.max_holders && current >= r.max_holders) item(r, null, `${r.position_name} already has ${current} of ${r.max_holders} allowed holder${r.max_holders === 1 ? "" : "s"}.`);
      else {
        counts.set(slot(r.position_id, unitOf(r)), current + 1);
        item(r, "Active again");
        updates.push({ id: r.id, end_date: null, is_active: committee.status === "CURRENT" ? 1 : 0, clear_end: 1 });
        audits.push({ action: "executive.reactivate", resourceType: "committee_member", resourceId: r.id, reason: "Bulk: reactivate", decision });
      }
    }
  } else if (op === "position") {
    const a = req.action as Extract<BulkAction, { op: "position" }>;
    const position = await ctx.db.first<{ id: string; name: string; is_protected: number; max_holders: number | null; is_active: number }>(
      "SELECT id, name, is_protected, max_holders, is_active FROM positions WHERE id = ?1 AND deleted_at IS NULL", a.positionId);
    if (!position || !position.is_active) throw new ValidationError("Choose an active position.");
    if (position.is_protected && !moderator) throw new AppError(403, "PROTECTED_RESOURCE", `${position.name} is protected. Only a Moderator, the President or the General Secretary can assign it.`);
    title = `Change position to ${position.name}`;
    const counts = new Map<string, number>();
    for (const r of selected) {
      const count = counts.get(unitOf(r)) ?? holders(position.id, rows, unitOf(r));
      const clash = rows.find((x) => x.id !== r.id && x.profile_id === r.profile_id && x.position_id === position.id && (x.unit_key ?? "") === (r.unit_key ?? ""));
      if (r.position_id === position.id) item(r, null, `Already ${position.name}.`);
      else if (guard(r)) item(r, null, guard(r));
      else if (clash) item(r, null, `Already listed as ${position.name} in this committee.`);
      else if (position.max_holders && !r.end_date && count >= position.max_holders) item(r, null, `${position.name} allows ${position.max_holders} holder${position.max_holders === 1 ? "" : "s"}.`);
      else {
        if (!r.end_date) counts.set(unitOf(r), count + 1);
        const newTitle = a.keepTitles ? r.position_title : position.name;
        item(r, `${r.position_title} → ${newTitle}`);
        updates.push({ id: r.id, position_id: position.id, position_title: newTitle });
        audits.push({ action: "executive.update", resourceType: "committee_member", resourceId: r.id, reason: "Bulk: change position", before: { position: r.position_name, title: r.position_title }, after: { position: position.name, title: newTitle }, decision });
      }
    }
  } else if (op === "copy") {
    const a = req.action as Extract<BulkAction, { op: "copy" }>;
    const t = await ctx.db.first<{ id: string; name: string; status: string; layout_json: string | null }>("SELECT id, name, status, layout_json FROM committees WHERE id = ?1 AND deleted_at IS NULL", a.targetCommitteeId);
    if (!t || t.id === committee.id) throw new ValidationError("Choose a different committee to copy to.");
    if (authorize(ctx, "executives.assign", { type: "committee_member", committeeId: t.id }).outcome !== "ALLOW") throw new AppError(403, "FORBIDDEN", `You can't manage the executives of ${t.name}.`);
    target = { id: t.id, name: t.name, status: t.status, layout: t.layout_json ? JSON.parse(t.layout_json) : { sections: ["facultyMembers", "studentExecutives"], units: [] } };
    title = `Copy to ${t.name}`;
    const existing = await ctx.db.all<{ profile_id: string; position_id: string; unit_key: string | null; end_date: string | null; section: string; display_order: number }>(
      "SELECT profile_id, position_id, unit_key, end_date, section, display_order FROM committee_members WHERE committee_id = ?1 AND deleted_at IS NULL", t.id);
    const holdersIn = new Map<string, number>();
    const orders = new Map<string, number>();
    for (const e of existing) {
      if (!e.end_date) holdersIn.set(slot(e.position_id, unitOf(e)), (holdersIn.get(slot(e.position_id, unitOf(e))) ?? 0) + 1);
      const k = `${e.section}|${e.unit_key ?? ""}`;
      orders.set(k, Math.max(orders.get(k) ?? 0, e.display_order + 1));
    }
    for (const r of selected) {
      const current = holdersIn.get(slot(r.position_id, unitOf(r))) ?? 0;
      if (existing.some((e) => e.profile_id === r.profile_id && e.position_id === r.position_id && (e.unit_key ?? "") === (r.unit_key ?? ""))) item(r, null, `Already in ${t.name}.`);
      else if (guard(r)) item(r, null, guard(r));
      else if (r.max_holders && current >= r.max_holders) item(r, null, `${r.position_name} already has ${current} of ${r.max_holders} holder${r.max_holders === 1 ? "" : "s"} in ${t.name}.`);
      else {
        holdersIn.set(slot(r.position_id, unitOf(r)), current + 1);
        const k = `${r.section}|${r.unit_key ?? ""}`;
        const order = orders.get(k) ?? 0;
        orders.set(k, order + 1);
        if (r.unit_key && !target.layout.units.some((u) => u.key === r.unit_key)) {
          target.layout.units.push({ type: r.unit_type ?? "CAMPUS", key: r.unit_key, ...(r.campus_label ? { meta: { name: r.campus_label } } : {}) });
          const sec = r.unit_type === "WING" ? "wings" : "campuses";
          if (!target.layout.sections.includes(sec)) target.layout.sections.unshift(sec);
        }
        const id = newId("cm");
        item(r, `Added to ${t.name}`);
        inserts.push({ id, source: r.id, display_order: order, is_active: t.status === "CURRENT" ? 1 : 0 });
        audits.push({ action: "executive.assign", resourceType: "committee_member", resourceId: id, reason: `Bulk: copied from ${committee.name}`, after: { committee: t.name, position: r.position_name, profileId: r.profile_id }, decision });
      }
    }
  } else {
    title = "Sort by position (hierarchy)";
    // Within each section and campus/wing: hierarchy level first (Moderator, President, General
    // Secretary, …), then display rank, then the current order.
    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(`${r.section}|${r.unit_key ?? ""}`, [...(groups.get(`${r.section}|${r.unit_key ?? ""}`) ?? []), r]);
    const wanted = new Set(selected.map((r) => r.id));
    for (const list of groups.values()) {
      if (!list.some((r) => wanted.has(r.id))) continue;
      const sorted = [...list].sort((x, y) => y.position_level - x.position_level || x.position_rank - y.position_rank || x.display_order - y.display_order);
      sorted.forEach((r, i) => {
        if (r.display_order === i) return;
        item(r, `Order ${r.display_order} → ${i}`);
        updates.push({ id: r.id, display_order: i });
      });
    }
    if (updates.length) audits.push({ action: "executive.reorder", resourceType: "committee", resourceId: committee.id, reason: "Bulk: sort by position hierarchy", after: { moved: updates.length }, decision });
  }
  const changes = items.filter((i) => i.change).length;
  return {
    committee, target, decision, updates, inserts, audits, now, rowsById: new Map(rows.map((r) => [r.id, r])),
    plan: { title, items, changes, blocked: items.filter((i) => i.blocked).length, canApply: changes > 0 } satisfies BulkPlan,
  };
}

/** What a bulk change would do. Changes nothing. */
export async function previewBulk(ctx: Ctx, req: BulkRequest): Promise<BulkPlan> {
  return (await plan(ctx, req)).plan;
}

/** Apply the previewed change: rows that can't change are left out, the rest change together. */
export async function applyBulk(ctx: Ctx, req: BulkRequest): Promise<{ changed: number; blocked: number; message: string }> {
  const actor = requireActor(ctx);
  // Moving people into a position, or bringing listings back, can hand out sensitive permissions.
  if (["position", "reactivate", "copy"].includes(req.action.op)) await requireRecentAuthForPositions(ctx, [req.action.op === "position" ? req.action.positionId : null], req.ids);
  const p = await plan(ctx, req);
  if (!p.plan.canApply) {
    // One listing (e.g. "Change position" on a single row): say why, there's no preview to read.
    const only = p.plan.items.length === 1 ? p.plan.items[0] : null;
    throw new AppError(400, "NOTHING_TO_CHANGE", only?.blocked ?? (p.plan.blocked ? "None of the selected listings can be changed (see the reasons in the preview)." : "Nothing to change."));
  }
  const stmts: D1StatementLike[] = [];
  if (p.updates.length) {
    stmts.push(ctx.db.stmt(
      `UPDATE committee_members SET
         position_id = COALESCE(j.position_id, committee_members.position_id), position_title = COALESCE(j.position_title, committee_members.position_title),
         display_order = COALESCE(j.display_order, committee_members.display_order), is_active = COALESCE(j.is_active, committee_members.is_active),
         end_date = CASE WHEN j.clear_end = 1 THEN NULL ELSE COALESCE(j.end_date, committee_members.end_date) END,
         deleted_at = CASE WHEN j.clear_deleted = 1 THEN NULL ELSE COALESCE(j.deleted_at, committee_members.deleted_at) END,
         updated_at = ?2, updated_by = ?3
       FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.position_id') AS position_id, json_extract(value, '$.position_title') AS position_title,
                    json_extract(value, '$.display_order') AS display_order, json_extract(value, '$.is_active') AS is_active, json_extract(value, '$.end_date') AS end_date,
                    json_extract(value, '$.clear_end') AS clear_end, json_extract(value, '$.deleted_at') AS deleted_at,
                    json_extract(value, '$.clear_deleted') AS clear_deleted FROM json_each(?1)) AS j
       WHERE committee_members.id = j.id`,
      JSON.stringify(p.updates), p.now, actor.user.id));
  }
  if (p.inserts.length && p.target) {
    stmts.push(ctx.db.stmt(
      `INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, display_name, designation, section, unit_type, unit_key, campus_label,
                                      avatar_media_id, avatar_position_x, avatar_position_y, avatar_scale, display_order, is_active, bio, created_at, created_by, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), ?2, s.profile_id, s.position_id, s.position_title, s.display_name, s.designation, s.section, s.unit_type, s.unit_key, s.campus_label,
              s.avatar_media_id, s.avatar_position_x, s.avatar_position_y, s.avatar_scale, json_extract(j.value, '$.display_order'), json_extract(j.value, '$.is_active'), s.bio, ?3, ?4, ?3, ?4
       FROM json_each(?1) AS j JOIN committee_members s ON s.id = json_extract(j.value, '$.source')`,
      JSON.stringify(p.inserts), p.target.id, p.now, actor.user.id));
    stmts.push(ctx.db.stmt("UPDATE committees SET layout_json = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", p.target.id, JSON.stringify(p.target.layout), p.now, actor.user.id));
  }
  // Positions that may gain holders: re-checked inside the transaction, so a change made by someone
  // else since the preview can't push a single-holder position (e.g. President) past its limit.
  const gaining = [...new Set([
    ...p.updates.filter((u) => u.position_id || u.clear_end || u.clear_deleted).map((u) => u.position_id ?? p.rowsById.get(String(u.id))?.position_id).filter(Boolean),
    ...p.inserts.map((i) => p.rowsById.get(String(i.source))?.position_id).filter(Boolean),
  ])];
  if (gaining.length) {
    stmts.push(assertStmt(ctx,
      `NOT EXISTS (SELECT 1 FROM committee_members cm JOIN positions ps ON ps.id = cm.position_id AND ps.max_holders IS NOT NULL
                   WHERE cm.committee_id IN (?1, ?2) AND cm.position_id IN (SELECT value FROM json_each(?3)) AND cm.deleted_at IS NULL AND cm.end_date IS NULL
                   GROUP BY cm.committee_id, cm.position_id, IFNULL(cm.unit_key, '') HAVING COUNT(*) > MAX(ps.max_holders))`,
      p.committee.id, p.target?.id ?? p.committee.id, JSON.stringify(gaining)));
  }
  stmts.push(
    auditStmt(ctx, { action: "executives.bulk", resourceType: "committee", resourceId: p.committee.id, decision: p.decision, after: { action: req.action, changed: p.plan.changes, blocked: p.plan.blocked, target: p.target?.name } }),
    ...auditManyStmt(ctx, p.audits),
  );
  await batchTransition(ctx, stmts, () => new AppError(409, "CHANGED", "Someone changed these listings a moment ago, and applying now would give a position more holders than it allows. Preview again."));
  ctx.revalidate?.(["committees"]);
  const message = `${p.plan.title}: ${p.plan.changes} listing${p.plan.changes === 1 ? "" : "s"} changed${p.plan.blocked ? `, ${p.plan.blocked} left as they were` : ""}.`;
  return { changed: p.plan.changes, blocked: p.plan.blocked, message };
}

/**
 * Quick edit: displayed titles, names and order of many listings, saved together. Only the
 * listings that changed are sent; each change is audited with before and after.
 */
export async function quickEditListings(ctx: Ctx, committeeId: string, raw: unknown): Promise<{ changed: number; message: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "executives.assign", { type: "committee_member", committeeId });
  const list = Array.isArray(raw) ? raw.slice(0, MAX_IDS + 1) : [];
  if (list.length > MAX_IDS) throw new ValidationError(`Save at most ${MAX_IDS} listings at a time.`);
  if (!list.length) throw new ValidationError("Nothing changed.");
  const rows = await ctx.db.all<{ id: string; position_title: string; display_name: string | null; display_order: number; user_id: string | null; is_protected: number; position_name: string; updated_at: string }>(
    `SELECT cm.id, cm.position_title, cm.display_name, cm.display_order, pr.user_id, p.is_protected, p.name AS position_name, cm.updated_at FROM committee_members cm
     JOIN profiles pr ON pr.id = cm.profile_id JOIN positions p ON p.id = cm.position_id WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL`, committeeId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const moderator = actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject);
  const errors: Record<string, string> = {};
  const updates: Array<{ id: string; position_title: string; display_name: string | null; display_order: number; stamp: string }> = [];
  const audits: AuditEntry[] = [];
  for (const item of list as Array<Record<string, unknown>>) {
    const r = byId.get(String(item?.id ?? ""));
    if (!r) throw new ValidationError("Some listings aren't in this committee any more. Reload the page.");
    const title = String(item.title ?? r.position_title).trim();
    const name = item.displayName === undefined ? r.display_name : String(item.displayName ?? "").trim() || null;
    const order = item.order === undefined ? r.display_order : Number(item.order);
    if (!title || title.length > 120) errors[r.id] = "Title: 1–120 characters.";
    else if ((name ?? "").length > 120) errors[r.id] = "Displayed name: at most 120 characters.";
    else if (!Number.isInteger(order) || order < 0 || order > 999) errors[r.id] = "Order: a whole number from 0 to 999.";
    else if (r.user_id && r.user_id === actor.user.id) errors[r.id] = "Your own listing: another administrator has to change it.";
    else if (r.is_protected && !moderator) errors[r.id] = `${r.position_name} is protected: only a Moderator, the President or the General Secretary can change it.`;
    // Optimistic locking per row: someone else saved this listing after the page loaded.
    else if (typeof item.stamp === "string" && item.stamp && item.stamp !== r.updated_at) errors[r.id] = "Changed by someone else after you opened this page. Reload to see it.";
    if (errors[r.id]) continue;
    if (title === r.position_title && name === r.display_name && order === r.display_order) continue;
    updates.push({ id: r.id, position_title: title, display_name: name, display_order: order, stamp: r.updated_at });
    audits.push({ action: "executive.update", resourceType: "committee_member", resourceId: r.id, reason: "Quick edit",
      before: { title: r.position_title, name: r.display_name, order: r.display_order }, after: { title, name, order }, decision });
  }
  if (Object.keys(errors).length) throw new ValidationError("Some rows need fixing.", errors);
  if (!updates.length) return { changed: 0, message: "Nothing changed." };
  const now = nowIso();
  await batchTransition(ctx, [
    // None of these rows changed between reading them above and saving.
    assertStmt(ctx, `NOT EXISTS (SELECT 1 FROM committee_members cm JOIN json_each(?1) j ON cm.id = json_extract(j.value, '$.id') WHERE cm.updated_at <> json_extract(j.value, '$.stamp'))`, JSON.stringify(updates)),
    ctx.db.stmt(
      `UPDATE committee_members SET position_title = j.position_title, display_name = j.display_name, display_order = j.display_order, updated_at = ?2, updated_by = ?3
       FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.position_title') AS position_title, json_extract(value, '$.display_name') AS display_name,
                    json_extract(value, '$.display_order') AS display_order FROM json_each(?1)) AS j
       WHERE committee_members.id = j.id`, JSON.stringify(updates), now, actor.user.id),
    auditStmt(ctx, { action: "executives.bulk", resourceType: "committee", resourceId: committeeId, decision, after: { action: "quick-edit", changed: updates.length } }),
    ...auditManyStmt(ctx, audits),
  ], () => new AppError(409, "STALE", "Someone changed some of these listings a moment ago. Reload the page, then make your changes again."));
  ctx.revalidate?.(["committees"]);
  return { changed: updates.length, message: `Saved ${updates.length} listing${updates.length === 1 ? "" : "s"}.` };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * A committee's listings in the import format (lib/executive-import/parse.ts reads it back), as
 * JSON or CSV. With `template`, the same columns with this committee's people but no private
 * details, ready to edit for the next term.
 */
export async function exportCommittee(ctx: Ctx, committeeId: string, format: "json" | "csv"): Promise<{ filename: string; body: string; contentType: string }> {
  const decision = requirePermission(ctx, "executives.read", { type: "committee_member", committeeId });
  const c = await ctx.db.first<{ slug: string; name: string }>("SELECT slug, name FROM committees WHERE id = ?1 AND deleted_at IS NULL", committeeId);
  if (!c) throw new NotFoundError("Committee");
  const rows = await ctx.db.all<Record<string, string | number | null>>(
    `SELECT COALESCE(cm.display_name, pr.full_name) AS name, pr.student_id AS studentId, cm.position_title AS position, cm.section, cm.unit_key AS unit, cm.unit_type AS unitType,
            COALESCE(cm.designation, pr.designation) AS designation, COALESCE(cm.bio, pr.bio) AS bio, pr.linkedin_url AS linkedin, pr.github_url AS github,
            pr.facebook_url AS facebook, pr.twitter_url AS twitter, pr.website_url AS website, cm.display_order AS displayOrder, cm.start_date AS startDate, cm.end_date AS endDate
     FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL ORDER BY cm.section, IFNULL(cm.unit_key, ''), cm.display_order`, committeeId);
  await auditStmt(ctx, { action: "executives.export", resourceType: "committee", resourceId: committeeId, after: { rows: rows.length, format }, decision }).run();
  const people = rows.map((r) => ({ ...r, committee: c.slug }));
  const base = `executives-${c.slug.replace(/[^a-z0-9-]/gi, "-")}`;
  if (format === "json") return { filename: `${base}.json`, contentType: "application/json; charset=utf-8", body: `${JSON.stringify({ committee: c.slug, executives: people }, null, 2)}\n` };
  const head = ["name", "studentId", "position", "committee", "section", "unit", "unitType", "designation", "bio", "linkedin", "github", "facebook", "twitter", "website", "displayOrder", "startDate", "endDate"];
  const lines = [head.join(","), ...people.map((p) => head.map((h) => csvCell((p as Record<string, unknown>)[h])).join(","))];
  return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", body: `\ufeff${lines.join("\r\n")}\r\n` };
}
