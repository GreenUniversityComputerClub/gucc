/**
 * Committees and executive assignments.
 *
 * History is never rewritten: a new term is a new committee; ending an
 * assignment sets end_date / is_active rather than deleting it. Making a
 * committee CURRENT archives the previous one in the same transaction, and the
 * public site follows automatically.
 */
import { assertCanEditProtected, assertNotSelf } from "../../governance/invariants";
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso } from "../db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";
import { assertStmt, batchTransition, staleAnswer, unchangedSince } from "../transition";
import { STUDENT_ID_RE, toSlug, Validator } from "../validate";

export interface CommitteeRow {
  id: string;
  slug: string;
  name: string;
  term_label: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "UPCOMING" | "CURRENT" | "ARCHIVED";
  description: string | null;
  members: number;
  /** Present where the full row is read (the committee page), for optimistic locking. */
  updated_at?: string;
}

export async function listCommittees(ctx: Ctx): Promise<CommitteeRow[]> {
  requirePermission(ctx, "committees.read");
  return ctx.db.all<CommitteeRow>(
    `SELECT c.id, c.slug, c.name, c.term_label, c.academic_year, c.start_date, c.end_date, c.status, c.description,
            (SELECT COUNT(*) FROM committee_members m WHERE m.committee_id = c.id AND m.deleted_at IS NULL) AS members
     FROM committees c WHERE c.deleted_at IS NULL ORDER BY CASE c.status WHEN 'CURRENT' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END, c.slug DESC`,
  );
}

function committeeInput(input: Record<string, unknown>) {
  const v = new Validator(input);
  const d = {
    name: v.string("name", { required: true, min: 3, max: 120, label: "Name" }),
    slug: v.string("slug", { required: true, max: 40, label: "URL segment", pattern: /^[a-z0-9-]+$/, patternMessage: "Use lowercase letters, digits and hyphens (e.g. 2027)." }),
    termLabel: v.string("termLabel", { required: true, max: 40, label: "Term" }),
    academicYear: v.string("academicYear", { max: 20, label: "Academic year" }),
    startDate: v.datetime("startDate", { label: "Start date" }),
    endDate: v.datetime("endDate", { label: "End date" }),
    status: v.oneOf("status", ["UPCOMING", "CURRENT", "ARCHIVED"] as const, { required: true, label: "Status" }),
    description: v.string("description", { max: 2000, label: "Description" }),
  };
  if (d.startDate && d.endDate) v.check(d.startDate <= d.endDate, "endDate", "End date must be after the start date.");
  // A 9-digit segment would collide with executive profile URLs (/executives/<studentId>).
  if (d.slug) v.check(!STUDENT_ID_RE.test(d.slug), "slug", "A nine-digit segment is reserved for profile pages.");
  v.done();
  return d;
}

export async function createCommittee(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "committees.create");
  const d = committeeInput(input);
  if (await ctx.db.first("SELECT id FROM committees WHERE slug = ?1", d.slug)) throw new ConflictError("A committee with that URL segment already exists.");
  const id = newId("cmt");
  const now = nowIso();
  const stmts = [];
  if (d.status === "CURRENT") {
    requirePermission(ctx, "committees.update");
    stmts.push(ctx.db.stmt("UPDATE committee_members SET is_active = 0, updated_at = ?1 WHERE committee_id IN (SELECT id FROM committees WHERE status = 'CURRENT')", now));
    stmts.push(ctx.db.stmt("UPDATE committees SET status = 'ARCHIVED', updated_at = ?1, updated_by = ?2 WHERE status = 'CURRENT' AND deleted_at IS NULL", now, actor.user.id));
  }
  stmts.push(
    ctx.db.stmt(
      `INSERT INTO committees (id, slug, name, term_label, academic_year, start_date, end_date, status, description, layout_json, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{"sections":["facultyMembers","studentExecutives"],"units":[]}', ?10, ?11, ?10, ?11)`,
      id, d.slug, d.name, d.termLabel, d.academicYear, d.startDate, d.endDate, d.status, d.description, now, actor.user.id,
    ),
    auditStmt(ctx, { action: "committee.create", resourceType: "committee", resourceId: id, after: d, decision }),
  );
  await ctx.db.batch(stmts);
  ctx.revalidate?.(["committees"]);
  return { id };
}

export async function updateCommittee(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const before = await ctx.db.first<CommitteeRow>("SELECT * FROM committees WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!before) throw new NotFoundError("Committee");
  const decision = requirePermission(ctx, "committees.update", { type: "committee", id, committeeId: id });
  const d = committeeInput(input);
  const clash = await ctx.db.first("SELECT id FROM committees WHERE slug = ?1 AND id <> ?2", d.slug, id);
  if (clash) throw new ConflictError("Another committee uses that URL segment.");
  const now = nowIso();
  const stmts = [...(await unchangedSince(ctx, "committees", id, input.expectedUpdatedAt))];
  if (d.status === "CURRENT" && before.status !== "CURRENT") {
    stmts.push(ctx.db.stmt("UPDATE committee_members SET is_active = 0, updated_at = ?2 WHERE committee_id IN (SELECT id FROM committees WHERE status = 'CURRENT' AND id <> ?1)", id, now));
    stmts.push(ctx.db.stmt("UPDATE committees SET status = 'ARCHIVED', updated_at = ?2, updated_by = ?3 WHERE status = 'CURRENT' AND id <> ?1 AND deleted_at IS NULL", id, now, actor.user.id));
    stmts.push(ctx.db.stmt("UPDATE committee_members SET is_active = 1, updated_at = ?2 WHERE committee_id = ?1 AND deleted_at IS NULL AND end_date IS NULL", id, now));
  }
  if (d.status !== "CURRENT" && before.status === "CURRENT") {
    stmts.push(ctx.db.stmt("UPDATE committee_members SET is_active = 0, updated_at = ?2 WHERE committee_id = ?1", id, now));
  }
  stmts.push(
    ctx.db.stmt(
      "UPDATE committees SET slug = ?2, name = ?3, term_label = ?4, academic_year = ?5, start_date = ?6, end_date = ?7, status = ?8, description = ?9, updated_at = ?10, updated_by = ?11 WHERE id = ?1",
      id, d.slug, d.name, d.termLabel, d.academicYear, d.startDate, d.endDate, d.status, d.description, now, actor.user.id,
    ),
    auditStmt(ctx, { action: "committee.update", resourceType: "committee", resourceId: id, before, after: d, decision }),
  );
  await batchTransition(ctx, stmts, () => staleAnswer(ctx, "committees", id));
  ctx.revalidate?.(["committees"]);
}

export interface AssignmentRow {
  id: string;
  committee_id: string;
  profile_id: string;
  position_id: string;
  position_key: string;
  position_name: string;
  position_title: string;
  display_name: string | null;
  designation: string | null;
  full_name: string;
  student_id: string | null;
  user_id: string | null;
  section: string;
  unit_key: string | null;
  display_order: number;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  updated_at: string;
}

export async function listAssignments(ctx: Ctx, committeeId: string): Promise<AssignmentRow[]> {
  requirePermission(ctx, "executives.read");
  return ctx.db.all<AssignmentRow>(
    `SELECT cm.id, cm.committee_id, cm.profile_id, cm.position_id, p.key AS position_key, p.name AS position_name, cm.position_title, cm.display_name, cm.designation,
            pr.full_name, pr.student_id, pr.user_id, cm.section, cm.unit_key, cm.display_order, cm.start_date, cm.end_date, cm.is_active, cm.updated_at
     FROM committee_members cm JOIN positions p ON p.id = cm.position_id JOIN profiles pr ON pr.id = cm.profile_id
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL
     ORDER BY cm.section, IFNULL(cm.unit_key, ''), cm.display_order`,
    committeeId,
  );
}

async function findOrCreateProfile(ctx: Ctx, input: { profileId?: string | null; studentId?: string | null; fullName?: string | null; personType: string; designation?: string | null }) {
  if (input.profileId) {
    const p = await ctx.db.first<{ id: string; user_id: string | null }>("SELECT id, user_id FROM profiles WHERE id = ?1 AND deleted_at IS NULL", input.profileId);
    if (!p) throw new NotFoundError("Profile");
    return { id: p.id, userId: p.user_id, stmts: [] };
  }
  if (input.studentId) {
    const p = await ctx.db.first<{ id: string; user_id: string | null }>("SELECT id, user_id FROM profiles WHERE student_id = ?1 AND deleted_at IS NULL", input.studentId);
    if (p) return { id: p.id, userId: p.user_id, stmts: [] };
  }
  if (!input.fullName) throw new AppError(400, "PERSON_REQUIRED", "Pick an existing person or enter a name for a new profile.");
  const id = newId("prf");
  const now = nowIso();
  return {
    id,
    userId: null,
    stmts: [ctx.db.stmt("INSERT INTO profiles (id, full_name, person_type, student_id, designation, created_at, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)",
      id, input.fullName, input.personType, input.studentId ?? null, input.designation ?? null, now, ctx.actor?.user.id ?? null)],
  };
}

export async function assignExecutive(ctx: Ctx, committeeId: string, input: Record<string, unknown>): Promise<{ id: string; profileId: string; hasAccount: boolean }> {
  const actor = requireActor(ctx);
  const committee = await ctx.db.first<{ id: string; status: string; name: string; layout_json: string | null }>("SELECT id, status, name, layout_json FROM committees WHERE id = ?1 AND deleted_at IS NULL", committeeId);
  if (!committee) throw new NotFoundError("Committee");
  const decision = requirePermission(ctx, "executives.assign", { type: "committee_member", committeeId });
  const v = new Validator(input);
  const d = {
    profileId: v.string("profileId", { max: 80 }),
    fullName: v.string("fullName", { max: 100, label: "Name" }),
    studentId: v.string("studentId", { max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be 9 digits." }),
    positionId: v.string("positionId", { required: true, max: 80, label: "Position" }),
    title: v.string("title", { max: 120, label: "Displayed title" }),
    section: v.oneOf("section", ["FACULTY", "STUDENT"] as const, { required: true, label: "Section" }),
    unitKey: v.string("unitKey", { max: 40, label: "Unit", pattern: /^[a-z0-9-]+$/, patternMessage: "Use lowercase letters, digits and hyphens (e.g. permanent)." }),
    unitType: v.oneOf("unitType", ["CAMPUS", "WING"] as const, { label: "Unit type" }),
    unitLabel: v.string("unitLabel", { max: 60, label: "Unit name" }),
    designation: v.string("designation", { max: 80, label: "Designation" }),
    displayOrder: v.int("displayOrder", { min: 0, max: 10000, label: "Order" }),
    startDate: v.datetime("startDate", { label: "Start date" }),
    bio: v.string("bio", { max: 1000, label: "Bio" }),
    avatarMediaId: v.string("avatarMediaId", { max: 80, label: "Photo" }),
  };
  v.done();
  const position = await ctx.db.first<{ id: string; key: string; name: string; is_protected: number; max_holders: number | null; is_active: number }>(
    "SELECT id, key, name, is_protected, max_holders, is_active FROM positions WHERE id = ?1 AND deleted_at IS NULL", d.positionId);
  if (!position || !position.is_active) throw new NotFoundError("Position");
  assertCanEditProtected(actor.subject, `The ${position.name} position`, Boolean(position.is_protected));

  const person = await findOrCreateProfile(ctx, { profileId: d.profileId, studentId: d.studentId, fullName: d.fullName, personType: d.section === "FACULTY" ? "FACULTY" : "STUDENT", designation: d.designation });
  assertNotSelf(actor.subject, person.userId, "position");
  if (position.max_holders) {
    const holders = (await ctx.db.value<number>("SELECT COUNT(*) FROM committee_members WHERE committee_id = ?1 AND position_id = ?2 AND deleted_at IS NULL AND end_date IS NULL", committeeId, position.id)) ?? 0;
    if (holders >= position.max_holders) throw new ConflictError(`${position.name} already has ${holders} of ${position.max_holders} allowed holder(s) in this committee. End the current assignment first.`);
  }
  const dup = await ctx.db.first("SELECT id FROM committee_members WHERE committee_id = ?1 AND profile_id = ?2 AND position_id = ?3 AND IFNULL(unit_key,'') = ?4 AND deleted_at IS NULL",
    committeeId, person.id, position.id, d.unitKey ?? "");
  if (dup) throw new ConflictError("This person already holds that position in this committee.");
  if (d.avatarMediaId) {
    const m = await ctx.db.first<{ media_type: string; visibility: string }>("SELECT media_type, visibility FROM media WHERE id = ?1 AND deleted_at IS NULL AND status = 'READY'", d.avatarMediaId);
    if (!m || m.media_type !== "IMAGE" || m.visibility !== "PUBLIC") throw new AppError(400, "VALIDATION", "The photo must be a public image.");
  }
  const order = d.displayOrder ?? ((await ctx.db.value<number>("SELECT COALESCE(MAX(display_order), -1) + 1 FROM committee_members WHERE committee_id = ?1 AND section = ?2 AND IFNULL(unit_key,'') = ?3", committeeId, d.section, d.unitKey ?? "")) ?? 0);
  // A new unit (campus or wing) is added to the committee's layout so the public page shows it as a tab.
  const layout = (committee.layout_json ? JSON.parse(committee.layout_json) : { sections: ["facultyMembers", "studentExecutives"], units: [] }) as { sections: string[]; units: Array<{ type: string; key: string; meta?: Record<string, unknown> }> };
  // Committees organised into campuses/wings (e.g. 2026: GUCC and CSS) list
  // everyone inside a unit; a listing without one would have nowhere to appear.
  const flatSections = layout.sections.includes("facultyMembers") || layout.sections.includes("studentExecutives");
  if (!d.unitKey && layout.units.length > 0 && !flatSections) {
    throw new ValidationError(`Choose which ${layout.units.some((u) => u.type === "WING") ? "wing" : "campus"} they belong to.`, { unitKey: "Choose a campus or wing." });
  }
  let unitType: "CAMPUS" | "WING" | null = null;
  let layoutChanged = false;
  if (d.unitKey) {
    const known = layout.units.find((u) => u.key === d.unitKey);
    unitType = (known?.type as "CAMPUS" | "WING" | undefined) ?? d.unitType ?? "CAMPUS";
    if (!known) {
      layout.units.push({ type: unitType, key: d.unitKey, ...(d.unitLabel ? { meta: { name: d.unitLabel } } : {}) });
      const section = unitType === "WING" ? "wings" : "campuses";
      if (!layout.sections.includes(section)) layout.sections.unshift(section);
      layoutChanged = true;
    }
  }
  const id = newId("cm");
  const now = nowIso();
  await batchTransition(ctx, [
    // Checked again inside the transaction: two leaders appointing a President at the same moment
    // can't both succeed (the second batch aborts here).
    ...(position.max_holders
      ? [assertStmt(ctx, "(SELECT COUNT(*) FROM committee_members WHERE committee_id = ?1 AND position_id = ?2 AND deleted_at IS NULL AND end_date IS NULL) < ?3", committeeId, position.id, position.max_holders)]
      : []),
    ...person.stmts,
    ...(d.avatarMediaId ? [ctx.db.stmt("UPDATE profiles SET avatar_media_id = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", person.id, d.avatarMediaId, now, actor.user.id)] : []),
    ...(layoutChanged ? [ctx.db.stmt("UPDATE committees SET layout_json = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", committeeId, JSON.stringify(layout), now, actor.user.id)] : []),
    ctx.db.stmt(
      `INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, unit_key, unit_type, campus_label, designation, display_order, start_date, is_active, bio, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?15, ?16)`,
      id, committeeId, person.id, position.id, d.title || position.name, d.section, d.unitKey, unitType, d.unitLabel, d.designation, order, d.startDate,
      committee.status === "CURRENT" ? 1 : 0, d.bio, now, actor.user.id,
    ),
    auditStmt(ctx, { action: "executive.assign", resourceType: "committee_member", resourceId: id, after: { committee: committee.name, position: position.key, profileId: person.id, title: d.title || position.name }, decision }),
    ...(person.userId ? notifyStmts(ctx, [person.userId], { type: "executive.assigned", title: `You were assigned as ${d.title || position.name}`, body: committee.name, link: "/dashboard" }) : []),
  ], () => new ConflictError(`${position.name} was just filled by someone else (it allows ${position.max_holders} holder${position.max_holders === 1 ? "" : "s"}). Reload to see who.`));
  ctx.revalidate?.(["committees"]);
  return { id, profileId: person.id, hasAccount: Boolean(person.userId) };
}

export async function updateAssignment(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const before = await ctx.db.first<AssignmentRow & { is_protected: number; position_name: string }>(
    `SELECT cm.*, pr.user_id, p.is_protected, p.name AS position_name FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id JOIN positions p ON p.id = cm.position_id
     WHERE cm.id = ?1 AND cm.deleted_at IS NULL`, id);
  if (!before) throw new NotFoundError("Assignment");
  const decision = requirePermission(ctx, "executives.assign", { type: "committee_member", committeeId: before.committee_id });
  assertNotSelf(actor.subject, before.user_id, "position");
  assertCanEditProtected(actor.subject, `The ${before.position_name} position`, Boolean(before.is_protected));
  const v = new Validator(input);
  const d = {
    title: v.string("title", { required: true, max: 120, label: "Displayed title" }),
    displayOrder: v.int("displayOrder", { required: true, min: 0, max: 10000, label: "Order" }),
    startDate: v.datetime("startDate", { label: "Start date" }),
    endDate: v.datetime("endDate", { label: "End date" }),
    bio: v.string("bio", { max: 1000, label: "Bio" }),
    designation: v.string("designation", { max: 80, label: "Designation" }),
  };
  v.done();
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      "UPDATE committee_members SET position_title = ?2, display_order = ?3, start_date = ?4, end_date = ?5, bio = ?6, designation = COALESCE(?9, designation), is_active = CASE WHEN ?5 IS NOT NULL AND ?5 <= ?7 THEN 0 ELSE is_active END, updated_at = ?7, updated_by = ?8 WHERE id = ?1",
      id, d.title, d.displayOrder, d.startDate, d.endDate, d.bio, now, actor.user.id, d.designation,
    ),
    auditStmt(ctx, { action: "executive.update", resourceType: "committee_member", resourceId: id, before: { title: before.position_title, order: before.display_order, endDate: before.end_date }, after: d, decision }),
  ]);
  ctx.revalidate?.(["committees"]);
}

/** End (keep in history) or remove (soft-delete a mistaken entry) an assignment. */
export async function endAssignment(ctx: Ctx, id: string, mode: "end" | "remove", reason: string | null): Promise<void> {
  const actor = requireActor(ctx);
  const before = await ctx.db.first<{ committee_id: string; user_id: string | null; is_protected: number; position_name: string; position_title: string }>(
    `SELECT cm.committee_id, pr.user_id, p.is_protected, p.name AS position_name, cm.position_title FROM committee_members cm
     JOIN profiles pr ON pr.id = cm.profile_id JOIN positions p ON p.id = cm.position_id WHERE cm.id = ?1 AND cm.deleted_at IS NULL`, id);
  if (!before) throw new NotFoundError("Assignment");
  const decision = requirePermission(ctx, "executives.remove", { type: "committee_member", committeeId: before.committee_id });
  assertNotSelf(actor.subject, before.user_id, "position");
  assertCanEditProtected(actor.subject, `The ${before.position_name} position`, Boolean(before.is_protected));
  const now = nowIso();
  await ctx.db.batch([
    mode === "end"
      ? ctx.db.stmt("UPDATE committee_members SET end_date = ?2, is_active = 0, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id)
      : ctx.db.stmt("UPDATE committee_members SET deleted_at = ?2, is_active = 0, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: mode === "end" ? "executive.end" : "executive.remove", resourceType: "committee_member", resourceId: id, reason, before, decision }),
  ]);
  ctx.revalidate?.(["committees"]);
}

export async function searchProfiles(ctx: Ctx, q: string) {
  requirePermission(ctx, "executives.read");
  const like = `%${q.replace(/[%_]/g, "").slice(0, 50)}%`;
  return ctx.db.all<{ id: string; full_name: string; student_id: string | null; person_type: string; user_id: string | null }>(
    "SELECT id, full_name, student_id, person_type, user_id FROM profiles WHERE deleted_at IS NULL AND (full_name LIKE ?1 OR student_id LIKE ?1) ORDER BY full_name LIMIT 20",
    like,
  );
}

export const slugForCommittee = (term: string) => toSlug(term);

/**
 * Move a listing one place up or down within its section and unit. Orders are
 * renumbered 0..n inside that group so gaps and duplicates from imports never
 * make a move a no-op.
 */
export async function moveAssignment(ctx: Ctx, id: string, direction: "up" | "down"): Promise<void> {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ committee_id: string; section: string; unit_key: string | null }>(
    "SELECT committee_id, section, unit_key FROM committee_members WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Assignment");
  const decision = requirePermission(ctx, "executives.assign", { type: "committee_member", committeeId: row.committee_id });
  const group = await ctx.db.all<{ id: string }>(
    "SELECT id FROM committee_members WHERE committee_id = ?1 AND section = ?2 AND IFNULL(unit_key,'') = ?3 AND deleted_at IS NULL ORDER BY display_order, created_at",
    row.committee_id, row.section, row.unit_key ?? "");
  const i = group.findIndex((g) => g.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= group.length) return;
  [group[i], group[j]] = [group[j], group[i]];
  const now = nowIso();
  await ctx.db.batch([
    // One statement for the whole group: each id takes its position in the list as its order.
    ctx.db.stmt(
      `UPDATE committee_members SET display_order = (SELECT CAST(j.key AS INTEGER) FROM json_each(?1) AS j WHERE j.value = committee_members.id), updated_at = ?2, updated_by = ?3
       WHERE id IN (SELECT value FROM json_each(?1)) AND display_order <> (SELECT CAST(j.key AS INTEGER) FROM json_each(?1) AS j WHERE j.value = committee_members.id)`,
      JSON.stringify(group.map((g) => g.id)), now, actor.user.id,
    ),
    auditStmt(ctx, { action: "executive.reorder", resourceType: "committee_member", resourceId: id, after: { direction }, decision }),
  ]);
  ctx.revalidate?.(["committees"]);
}

/**
 * Start the next term: a new UPCOMING committee that copies the current
 * committee's campus/wing layout (not its people). Fill positions, then mark
 * it Current — that archives the previous term with its history intact.
 */
export async function startNextCommittee(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const created = await createCommittee(ctx, { ...input, status: "UPCOMING" });
  const copyFrom = typeof input.copyLayoutFrom === "string" && input.copyLayoutFrom ? input.copyLayoutFrom : null;
  if (copyFrom) {
    const src = await ctx.db.first<{ layout_json: string | null }>("SELECT layout_json FROM committees WHERE id = ?1 AND deleted_at IS NULL", copyFrom);
    if (src?.layout_json) {
      await ctx.db.run("UPDATE committees SET layout_json = ?2 WHERE id = ?1", created.id, src.layout_json);
    }
  }
  return created;
}

/** Portrait framing for one listing (the per-term crop shown on the committee page). */
export async function updateAvatarCrop(ctx: Ctx, input: { year: string; name: string; position: string; avatarPosition: { x: number; y: number }; avatarScale: number }): Promise<void> {
  const actor = requireActor(ctx);
  const committee = await ctx.db.first<{ id: string }>("SELECT id FROM committees WHERE slug = ?1 AND deleted_at IS NULL", String(input.year));
  if (!committee) throw new NotFoundError("Committee");
  const decision = requirePermission(ctx, "executives.assign", { type: "committee_member", committeeId: committee.id });
  const { x, y } = input.avatarPosition ?? { x: NaN, y: NaN };
  const scale = Number(input.avatarScale);
  if (![x, y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1000) || !Number.isFinite(scale) || scale < 0.2 || scale > 5) {
    throw new AppError(400, "VALIDATION", "Portrait position or zoom is out of range.");
  }
  const member = await ctx.db.first<{ id: string }>(
    `SELECT cm.id FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id
     WHERE cm.committee_id = ?1 AND cm.deleted_at IS NULL AND cm.position_title = ?2 AND COALESCE(cm.display_name, p.full_name) = ?3`,
    committee.id, input.position, input.name,
  );
  if (!member) throw new NotFoundError("Committee listing");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE committee_members SET avatar_position_x = ?2, avatar_position_y = ?3, avatar_scale = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?1",
      member.id, x, y, scale, nowIso(), actor.user.id),
    auditStmt(ctx, { action: "executive.avatar_crop", resourceType: "committee_member", resourceId: member.id, after: { x, y, scale }, decision }),
  ]);
  ctx.revalidate?.(["committees"]);
}

/**
 * Delete a committee created by mistake. Only when it has no listings (remove or move them
 * first) and it isn't the current committee. Soft delete, audited; a Moderator can undo it in
 * the database within D1's Time Travel window.
 */
export async function deleteCommittee(ctx: Ctx, id: string, reasonRaw: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "committees.archive", { type: "committee", committeeId: id });
  const c = await ctx.db.first<{ name: string; status: string; listings: number }>(
    "SELECT name, status, (SELECT COUNT(*) FROM committee_members WHERE committee_id = c.id AND deleted_at IS NULL) AS listings FROM committees c WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!c) throw new NotFoundError("Committee");
  if (c.status === "CURRENT") throw new AppError(409, "CURRENT_COMMITTEE", "The current committee can't be deleted. Make another committee current first.");
  if (c.listings > 0) throw new AppError(409, "NOT_EMPTY", `${c.name} still has ${c.listings} listing${c.listings === 1 ? "" : "s"}. Remove or move them first (removed listings can be restored for 30 days).`);
  const reason = String(reasonRaw ?? "").trim();
  if (reason.length < 3) throw new ValidationError("Say why it's being deleted.", { reason: "At least 3 characters." });
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE committees SET deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: "committee.delete", resourceType: "committee", resourceId: id, reason, before: { name: c.name, status: c.status }, decision }),
  ]);
  ctx.revalidate?.(["committees"]);
}
