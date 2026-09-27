/**
 * Bulk executive import: UPLOAD → PARSE → VALIDATE → PREVIEW → CONFIRM → IMPORT → VERIFY.
 *
 * Stateless and two-step. The preview and the import build the same plan from the same
 * file; the import refuses unless the plan still matches what was previewed (someone may
 * have changed the committee in between), re-checks every permission, and writes in one
 * D1 batch, so it either happens completely or not at all. Statements are set-based
 * (json_each), keeping any size of import far below the free plan's 50 statements.
 *
 * People are never duplicated: a row matches an existing person by student ID, then by
 * account email, then by name (flagged for confirmation). Modes:
 *   insert  "Add new only"         new people and listings; existing records untouched
 *   update  "Update existing only" changed details of matched listings/people; adds nothing
 *   upsert  "Add and update"       both
 * Existing values are never blanked, and an existing student ID is never changed.
 */
import { holdsProtectedRole } from "../../governance/engine";
import { normalizeTitle, resolvePosition, slugify } from "../../governance/positions";
import { parseExecutivesFile, type ImportFormat, type ParsedRow } from "../../executive-import/parse";
import { auditManyStmt, auditStmt, type AuditEntry } from "../audit";
import { authorize, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { sha256Hex } from "../crypto";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ValidationError } from "../errors";
import { notifyEachStmts } from "../notifications";
import { STUDENT_ID_RE } from "../validate";

export type ImportMode = "insert" | "update" | "upsert";

export interface ImportRequest {
  text: string;
  format: ImportFormat;
  mode: ImportMode;
  defaultCommitteeId?: string | null;
  resolutions?: {
    /** normalized legacy title → position id */
    positions?: Record<string, string>;
    /** row number → "skip this row" or "this is that person" ("new" = a new person) */
    rows?: Record<string, { skip?: boolean; profileId?: string }>;
  };
}

export interface ImportIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export type RowAction = "create" | "assign" | "update" | "unchanged" | "skip" | "blocked";

export interface PlanRow {
  row: number;
  name: string | null;
  studentId: string | null;
  positionTitle: string | null;
  position: { id: string; name: string } | null;
  committee: { id: string; name: string } | null;
  section: "STUDENT" | "FACULTY";
  unit: string | null;
  person: { kind: "new" } | { kind: "existing"; profileId: string; name: string; via: string } | null;
  candidates: Array<{ profileId: string; name: string; studentId: string | null; holds: string | null }>;
  changes: string[];
  action: RowAction;
  issues: ImportIssue[];
}

export interface ImportPlan {
  fileHash: string;
  planHash: string;
  shape: string;
  format: ImportFormat;
  mode: ImportMode;
  fileErrors: string[];
  rows: PlanRow[];
  summary: { total: number; newPeople: number; create: number; assign: number; update: number; unchanged: number; skip: number; blocked: number; warnings: number; duplicates: number };
  unknownPositions: Array<{ title: string; key: string; rows: number[] }>;
  newUnits: Array<{ committee: string; unit: string }>;
  positions: Array<{ id: string; name: string }>;
  committees: Array<{ id: string; name: string; status: string }>;
  canImport: boolean;
}

export interface ImportResult {
  created: { people: number; listings: number };
  updated: { people: number; listings: number };
  unchanged: number;
  skipped: number;
  committees: Array<{ id: string; name: string }>;
  verify: { ok: boolean; listings: { expected: number; found: number }; people: { expected: number; found: number } };
}

export const MAX_IMPORT_BYTES = 600_000;

interface ProfileRow {
  id: string;
  full_name: string;
  student_id: string | null;
  user_id: string | null;
  person_type: string;
  designation: string | null;
  bio: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  avatar_media_id: string | null;
}

interface ListingRow {
  id: string;
  committee_id: string;
  profile_id: string;
  position_id: string;
  position_name: string;
  unit_key: string | null;
  position_title: string;
  display_name: string | null;
  display_order: number;
  bio: string | null;
  designation: string | null;
  start_date: string | null;
  end_date: string | null;
  avatar_media_id: string | null;
  avatar_position_x: number | null;
  avatar_position_y: number | null;
  avatar_scale: number | null;
}

interface CommitteeInfo {
  id: string;
  slug: string;
  name: string;
  term_label: string;
  academic_year: string | null;
  status: string;
  layout: { sections: string[]; units: Array<{ type: string; key: string; meta?: Record<string, unknown> }> };
}

/** What the import needs per row besides what the preview shows. */
interface Work {
  plan: PlanRow;
  src: ParsedRow;
  personKey: string;
  unitType: "CAMPUS" | "WING" | null;
  unitLabel: string | null;
  photoId: string | null;
  links: Record<"linkedin_url" | "github_url" | "facebook_url" | "twitter_url" | "website_url", string | null>;
  startDate: string | null;
  endDate: string | null;
  listing: ListingRow | null;
  profile: ProfileRow | null;
  profilePatch: Record<string, string | null>;
  listingPatch: Record<string, string | number | null>;
}

const PROFILE_COLS = "p.id, p.full_name, p.student_id, p.user_id, p.person_type, p.designation, p.bio, p.linkedin_url, p.github_url, p.facebook_url, p.twitter_url, p.website_url, p.avatar_media_id";
const lower = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const httpUrl = (v: string | null) => (v && /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v) ? v.slice(0, 300) : null);

function isoDate(v: string | null): string | null | undefined {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? undefined : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

async function buildPlan(ctx: Ctx, req: ImportRequest): Promise<{ plan: ImportPlan; work: Work[]; committees: Map<string, CommitteeInfo> }> {
  const actor = requireActor(ctx);
  requirePermission(ctx, "executives.import");
  const format: ImportFormat = req.format === "csv" ? "csv" : "json";
  const mode: ImportMode = req.mode === "update" || req.mode === "upsert" ? req.mode : "insert";
  const text = typeof req.text === "string" ? req.text : "";
  if (text.length > MAX_IMPORT_BYTES) throw new ValidationError(`The file is too large (${Math.round(text.length / 1024)} KB). Import at most ${MAX_IMPORT_BYTES / 1000} KB at a time.`);
  const fileHash = await sha256Hex(new TextEncoder().encode(text));
  const parsed = parseExecutivesFile(text, format);
  const emptySummary = { total: 0, newPeople: 0, create: 0, assign: 0, update: 0, unchanged: 0, skip: 0, blocked: 0, warnings: 0, duplicates: 0 };

  const [committeeRows, positionRows] = await Promise.all([
    ctx.db.all<Omit<CommitteeInfo, "layout"> & { layout_json: string | null }>("SELECT id, slug, name, term_label, academic_year, status, layout_json FROM committees WHERE deleted_at IS NULL ORDER BY slug DESC"),
    ctx.db.all<{ id: string; key: string; name: string; category: string; is_protected: number; max_holders: number | null; aliases_json: string | null }>(
      "SELECT id, key, name, category, is_protected, max_holders, aliases_json FROM positions WHERE deleted_at IS NULL AND is_active = 1 ORDER BY rank, name"),
  ]);
  const committees = new Map<string, CommitteeInfo>(committeeRows.map((c) => [c.id, {
    id: c.id, slug: c.slug, name: c.name, term_label: c.term_label, academic_year: c.academic_year, status: c.status,
    layout: c.layout_json ? JSON.parse(c.layout_json) : { sections: ["facultyMembers", "studentExecutives"], units: [] },
  }]));
  const plan: ImportPlan = {
    fileHash, planHash: "", shape: parsed.shape, format, mode, fileErrors: parsed.errors, rows: [], summary: { ...emptySummary }, unknownPositions: [], newUnits: [],
    positions: positionRows.map((p) => ({ id: p.id, name: p.name })), committees: committeeRows.map((c) => ({ id: c.id, name: c.name, status: c.status })), canImport: false,
  };
  if (parsed.errors.length) return { plan, work: [], committees };

  // ── lookups, each one set-based query ──
  const committeeByLabel = new Map<string, CommitteeInfo>();
  for (const c of committees.values()) for (const label of [c.slug, c.term_label, c.name, c.academic_year]) if (label && !committeeByLabel.has(lower(label))) committeeByLabel.set(lower(label), c);
  const defaultCommittee = req.defaultCommitteeId ? committees.get(req.defaultCommitteeId) ?? null : null;
  if (req.defaultCommitteeId && !defaultCommittee) throw new ValidationError("The chosen default committee doesn't exist.");
  const positionDefs = positionRows.map((p) => {
    const a = p.aliases_json ? (JSON.parse(p.aliases_json) as { aliases?: string[]; pattern?: string | null }) : {};
    return { key: p.id, name: p.name, aliases: a.aliases ?? [], aliasPattern: a.pattern ?? undefined };
  });
  const positionsById = new Map(positionRows.map((p) => [p.id, p]));

  const ids = [...new Set(parsed.rows.map((r) => r.studentId?.replace(/\s+/g, "")).filter((s): s is string => Boolean(s && STUDENT_ID_RE.test(s))))];
  const emails = [...new Set(parsed.rows.map((r) => r.email).filter((e): e is string => Boolean(e)))];
  const names = [...new Set(parsed.rows.map((r) => (r.name ? lower(r.name) : null)).filter((n): n is string => Boolean(n)))];
  const chosen = [...new Set(Object.values(req.resolutions?.rows ?? {}).map((d) => d.profileId).filter((p): p is string => Boolean(p && p !== "new")))];
  const photos = [...new Set(parsed.rows.map((r) => r.photo).filter((p): p is string => Boolean(p && !/^https?:/i.test(p))).map((p) => (p.startsWith("med_") ? p : `/${p.replace(/^\/+/, "")}`)))];
  const committeeIds = [...committees.keys()];

  const [byIdRows, byEmailRows, byNameRows, chosenRows, listingRows, mediaRows] = await Promise.all([
    ids.length ? ctx.db.all<ProfileRow>(`SELECT ${PROFILE_COLS} FROM profiles p WHERE p.deleted_at IS NULL AND p.student_id IN (SELECT value FROM json_each(?1))`, JSON.stringify(ids)) : [],
    emails.length ? ctx.db.all<ProfileRow & { email: string }>(`SELECT ${PROFILE_COLS}, u.email FROM users u JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.deleted_at IS NULL AND u.email IN (SELECT value FROM json_each(?1))`, JSON.stringify(emails)) : [],
    names.length ? ctx.db.all<ProfileRow>(`SELECT ${PROFILE_COLS} FROM profiles p WHERE p.deleted_at IS NULL AND lower(p.full_name) IN (SELECT value FROM json_each(?1))`, JSON.stringify(names)) : [],
    chosen.length ? ctx.db.all<ProfileRow>(`SELECT ${PROFILE_COLS} FROM profiles p WHERE p.deleted_at IS NULL AND p.id IN (SELECT value FROM json_each(?1))`, JSON.stringify(chosen)) : [],
    ctx.db.all<ListingRow>(
      `SELECT cm.id, cm.committee_id, cm.profile_id, cm.position_id, p.name AS position_name, cm.unit_key, cm.position_title, cm.display_name, cm.display_order, cm.bio, cm.designation,
              cm.start_date, cm.end_date, cm.avatar_media_id, cm.avatar_position_x, cm.avatar_position_y, cm.avatar_scale
       FROM committee_members cm JOIN positions p ON p.id = cm.position_id WHERE cm.deleted_at IS NULL AND cm.committee_id IN (SELECT value FROM json_each(?1))`, JSON.stringify(committeeIds)),
    photos.length ? ctx.db.all<{ id: string; legacy_path: string | null }>(
      "SELECT id, legacy_path FROM media WHERE deleted_at IS NULL AND media_type = 'IMAGE' AND visibility = 'PUBLIC' AND (legacy_path IN (SELECT value FROM json_each(?1)) OR id IN (SELECT value FROM json_each(?1)))", JSON.stringify(photos)) : [],
  ]);
  const byStudentId = new Map(byIdRows.map((p) => [p.student_id!, p]));
  const byEmail = new Map(byEmailRows.map((p) => [p.email, p]));
  const byName = new Map<string, ProfileRow[]>();
  for (const p of byNameRows) byName.set(lower(p.full_name), [...(byName.get(lower(p.full_name)) ?? []), p]);
  const byProfileId = new Map([...byIdRows, ...byEmailRows, ...byNameRows, ...chosenRows].map((p) => [p.id, p]));
  const mediaByPath = new Map<string, string>();
  for (const m of mediaRows) {
    mediaByPath.set(m.id, m.id);
    if (m.legacy_path) mediaByPath.set(m.legacy_path, m.id);
  }
  // What ambiguous candidates held before, to tell same-named people apart.
  const candidateIds = [...new Set(byNameRows.map((p) => p.id))];
  const holdsRows = candidateIds.length
    ? await ctx.db.all<{ profile_id: string; holds: string }>(
        `SELECT cm.profile_id, group_concat(c.slug || ' ' || cm.position_title, '; ') AS holds FROM committee_members cm JOIN committees c ON c.id = cm.committee_id
         WHERE cm.deleted_at IS NULL AND cm.profile_id IN (SELECT value FROM json_each(?1)) GROUP BY cm.profile_id`, JSON.stringify(candidateIds))
    : [];
  const holds = new Map(holdsRows.map((h) => [h.profile_id, h.holds]));

  const canAssign = new Map<string, boolean>();
  const assignable = (committeeId: string) => {
    if (!canAssign.has(committeeId)) canAssign.set(committeeId, authorize(ctx, "executives.assign", { type: "committee_member", committeeId }).outcome === "ALLOW");
    return canAssign.get(committeeId)!;
  };
  const protectedOk = actor.subject.status === "ACTIVE" && holdsProtectedRole(actor.subject);

  const work: Work[] = [];
  const seen = new Map<string, number>();
  const unknown = new Map<string, { title: string; key: string; rows: number[] }>();
  const newUnits = new Map<string, { committee: string; unit: string }>();

  for (const src of parsed.rows) {
    const issues: ImportIssue[] = [];
    const err = (code: string, message: string) => issues.push({ level: "error", code, message });
    const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });
    const decision = req.resolutions?.rows?.[String(src.row)] ?? {};

    const name = src.name ? src.name.slice(0, 100) : null;
    if (!name) err("MISSING_NAME", "Name is missing.");
    let studentId = src.studentId?.replace(/\s+/g, "") ?? null;
    if (studentId && !STUDENT_ID_RE.test(studentId)) {
      warn("INVALID_ID", `Student ID "${src.studentId}" isn't 9 digits, so it was ignored.`);
      studentId = null;
    }

    const committee = src.committee ? committeeByLabel.get(lower(src.committee)) ?? null : defaultCommittee;
    if (!committee) {
      if (src.committee) err("UNKNOWN_COMMITTEE", `Committee "${src.committee}" doesn't exist. Create it first, then import.`);
      else err("MISSING_COMMITTEE", "No committee: add a committee column or choose a default committee.");
    } else if (!assignable(committee.id)) err("FORBIDDEN_COMMITTEE", `You can't manage the executives of ${committee.name}.`);

    let position: (typeof positionRows)[number] | null = null;
    if (!src.position) err("MISSING_POSITION", "Position is missing.");
    else {
      const key = normalizeTitle(src.position);
      const mapped = req.resolutions?.positions?.[key];
      const match = mapped ? { key: mapped } : resolvePosition(src.position, positionDefs);
      position = match ? positionsById.get(match.key) ?? null : null;
      if (!position) {
        err("UNKNOWN_POSITION", `"${src.position}" isn't a known position. Map it to one below, or create it under Positions first.`);
        const u = unknown.get(key) ?? { title: src.position, key, rows: [] };
        u.rows.push(src.row);
        unknown.set(key, u);
      } else if (position.is_protected && !protectedOk) err("PROTECTED_POSITION", `Only a Moderator can assign ${position.name}.`);
    }
    const section: "STUDENT" | "FACULTY" = src.section ?? (position?.category === "FACULTY" ? "FACULTY" : "STUDENT");

    // Campus / wing
    const unit = src.unit ? slugify(src.unit).slice(0, 40) || null : null;
    let unitType: "CAMPUS" | "WING" | null = null;
    let unitLabel: string | null = null;
    if (committee) {
      const layout = committee.layout;
      const flat = layout.units.length === 0 || layout.sections.includes("facultyMembers") || layout.sections.includes("studentExecutives");
      if (!unit && !flat) {
        const kind = layout.units.some((u) => u.type === "WING") ? "wing" : "campus";
        err("MISSING_UNIT", `${committee.name} lists everyone under a ${kind}; add a unit column (${layout.units.map((u) => u.key).join(", ")}).`);
      }
      if (unit) {
        const known = layout.units.find((u) => u.key === unit);
        unitType = (known?.type as "CAMPUS" | "WING" | undefined) ?? src.unitType ?? "CAMPUS";
        if (!known) {
          unitLabel = src.unit;
          newUnits.set(`${committee.id}|${unit}`, { committee: committee.name, unit: src.unit! });
          warn("NEW_UNIT", `Adds "${src.unit}" as a new ${unitType === "WING" ? "wing" : "campus"} of ${committee.name}.`);
        }
      }
    }

    const startDate = isoDate(src.startDate);
    const endDate = isoDate(src.endDate);
    if (startDate === undefined) err("INVALID_DATE", `Start date "${src.startDate}" isn't a date (use YYYY-MM-DD).`);
    if (endDate === undefined) err("INVALID_DATE", `End date "${src.endDate}" isn't a date (use YYYY-MM-DD).`);
    if (startDate && endDate && endDate < startDate) err("INVALID_DATE", "The end date is before the start date.");

    const links = { linkedin_url: httpUrl(src.linkedin), github_url: httpUrl(src.github), facebook_url: httpUrl(src.facebook), twitter_url: httpUrl(src.twitter), website_url: httpUrl(src.website) };
    for (const [field, raw] of [["LinkedIn", src.linkedin], ["GitHub", src.github], ["Facebook", src.facebook], ["Twitter", src.twitter], ["Website", src.website]] as const) {
      if (raw && !httpUrl(raw)) warn("INVALID_LINK", `${field} link "${raw}" isn't a web address, so it was ignored.`);
    }

    let photoId: string | null = null;
    if (src.photo) {
      if (/^https?:/i.test(src.photo)) warn("PHOTO_URL", "Photos aren't downloaded from web addresses. Upload the photo on the listing after importing.");
      else {
        photoId = mediaByPath.get(src.photo.startsWith("med_") ? src.photo : `/${src.photo.replace(/^\/+/, "")}`) ?? null;
        if (!photoId) warn("PHOTO_NOT_FOUND", `Photo "${src.photo}" isn't in the media library; upload it on the listing after importing.`);
      }
    }

    // Who is this?
    let match: { profile: ProfileRow; via: string } | null = null;
    let isNew = false;
    let candidates: ProfileRow[] = [];
    if (decision.profileId === "new") isNew = true;
    else if (decision.profileId) {
      const p = byProfileId.get(decision.profileId);
      if (p) match = { profile: p, via: "your choice" };
      else err("BAD_CHOICE", "The person chosen for this row no longer exists.");
    } else if (studentId && byStudentId.has(studentId)) match = { profile: byStudentId.get(studentId)!, via: "student ID" };
    else if (src.email && byEmail.has(src.email)) match = { profile: byEmail.get(src.email)!, via: "account email" };
    else if (name) {
      // Someone with a different student ID is a different person.
      const same = (byName.get(lower(name)) ?? []).filter((p) => !studentId || !p.student_id || p.student_id === studentId);
      candidates = same;
      if (same.length === 1) {
        match = { profile: same[0], via: "name" };
        warn("NAME_MATCH", `Matched to the existing ${same[0].full_name} by name only. Choose "New person" if it's someone else.`);
      } else if (same.length > 1) err("AMBIGUOUS_PERSON", `${same.length} people are called ${name}. Choose the right one.`);
      else isNew = true;
    }
    const matched: ProfileRow | null = match?.profile ?? null;
    const person: PlanRow["person"] = match ? { kind: "existing", profileId: match.profile.id, name: match.profile.full_name, via: match.via } : isNew ? { kind: "new" } : null;
    if (matched?.user_id && matched.user_id === actor.user.id) err("SELF", "You can't assign yourself; another administrator has to.");
    if (matched && studentId && matched.student_id && matched.student_id !== studentId) {
      warn("ID_CONFLICT", `${matched.full_name} already has student ID ${matched.student_id}; the file's ${studentId} was ignored.`);
    }
    if (isNew && studentId && byStudentId.has(studentId)) err("ID_TAKEN", `Student ID ${studentId} belongs to ${byStudentId.get(studentId)!.full_name}.`);

    // The listing, and what would change on it or on the person.
    const listing = matched && committee && position
      ? listingRows.find((l) => l.committee_id === committee.id && l.profile_id === matched.id && l.position_id === position!.id && (l.unit_key ?? "") === (unit ?? "")) ?? null
      : null;
    if (matched && committee && position) {
      const others = listingRows.filter((l) => l.committee_id === committee.id && l.profile_id === matched.id && l.position_id !== position!.id && !l.end_date);
      if (others.length) warn("ALSO_HOLDS", `Also listed as ${others.map((o) => o.position_title).join(", ")} in ${committee.name}.`);
    }
    const title = src.position ? src.position.slice(0, 120) : position?.name ?? "";
    const changes: string[] = [];
    const listingPatch: Work["listingPatch"] = {};
    const profilePatch: Work["profilePatch"] = {};
    if (listing) {
      const put = (col: string, label: string, value: string | number | null, current: string | number | null) => {
        if (value !== null && value !== current) {
          listingPatch[col] = value;
          changes.push(label);
        }
      };
      put("position_title", "displayed title", title, listing.position_title);
      put("display_order", "order", src.displayOrder, listing.display_order);
      put("bio", "bio", src.bio?.slice(0, 1000) ?? null, listing.bio);
      put("designation", "designation", src.designation?.slice(0, 80) ?? null, listing.designation);
      put("start_date", "start date", startDate ?? null, listing.start_date);
      put("end_date", "end date", endDate ?? null, listing.end_date);
      put("avatar_media_id", "photo", photoId, listing.avatar_media_id);
      if (src.crop && (src.crop.x !== listing.avatar_position_x || src.crop.y !== listing.avatar_position_y || src.crop.scale !== listing.avatar_scale)) {
        Object.assign(listingPatch, { avatar_position_x: src.crop.x, avatar_position_y: src.crop.y, avatar_scale: src.crop.scale });
        changes.push("portrait framing");
      }
    }
    if (matched) {
      const put = (col: keyof ProfileRow, label: string, value: string | null) => {
        if (value !== null && value !== matched[col]) {
          profilePatch[col] = value;
          changes.push(label);
        }
      };
      if (studentId && !matched.student_id && !byStudentId.has(studentId)) put("student_id", "student ID", studentId);
      put("linkedin_url", "LinkedIn", links.linkedin_url);
      put("github_url", "GitHub", links.github_url);
      put("facebook_url", "Facebook", links.facebook_url);
      put("twitter_url", "Twitter", links.twitter_url);
      put("website_url", "website", links.website_url);
      if (!matched.avatar_media_id && photoId) put("avatar_media_id", "profile photo", photoId);
      if (section === "FACULTY") put("designation", "faculty designation", src.designation?.slice(0, 80) ?? null);
    }

    const personKey = matched ? matched.id : studentId ? `id:${studentId}` : `name:${lower(name ?? "")}`;
    const dupKey = committee && position ? `${committee.id}|${personKey}|${position.id}|${unit ?? ""}` : null;
    let action: RowAction;
    if (decision.skip) action = "skip";
    else if (dupKey && seen.has(dupKey)) {
      action = "skip";
      warn("DUPLICATE_ROW", `Same person and position as row ${seen.get(dupKey)}; skipped.`);
    } else if (issues.some((i) => i.level === "error")) action = "blocked";
    else if (!person) action = "blocked";
    else if (person.kind === "new") action = mode === "update" ? "skip" : "create";
    else if (!listing) action = mode === "update" ? "skip" : "assign";
    else action = changes.length && mode !== "insert" ? "update" : "unchanged";
    if (dupKey && !seen.has(dupKey) && action !== "skip") seen.set(dupKey, src.row);
    if (mode === "update" && action === "skip" && !decision.skip && person && !issues.some((i) => i.code === "DUPLICATE_ROW")) {
      warn("MODE_SKIP", '"Update existing only" doesn\'t add new people or listings.');
    }
    if (mode === "insert" && action === "unchanged" && changes.length) warn("MODE_KEEP", `Not changed in "Add new only" mode: ${changes.join(", ")}.`);
    if (mode === "insert" && action === "assign" && Object.keys(profilePatch).length) warn("MODE_KEEP", `${matched!.full_name}'s existing details are kept in "Add new only" mode.`);

    const planRow: PlanRow = {
      row: src.row, name, studentId, positionTitle: src.position, position: position ? { id: position.id, name: position.name } : null,
      committee: committee ? { id: committee.id, name: committee.name } : null, section, unit, person,
      candidates: candidates.map((c) => ({ profileId: c.id, name: c.full_name, studentId: c.student_id, holds: holds.get(c.id) ?? null })),
      changes, action, issues,
    };
    work.push({ plan: planRow, src, personKey, unitType, unitLabel, photoId, links, startDate: startDate ?? null, endDate: endDate ?? null, listing, profile: matched, profilePatch, listingPatch });
  }

  // Single-holder positions (President, General Secretary …): existing holders plus new listings in this file.
  const taken = new Map<string, number>();
  for (const w of work) {
    const p = w.plan.position ? positionsById.get(w.plan.position.id) : null;
    if (!p?.max_holders || !w.plan.committee || (w.plan.action !== "create" && w.plan.action !== "assign")) continue;
    const key = `${w.plan.committee.id}|${p.id}`;
    const current = taken.get(key) ?? listingRows.filter((l) => l.committee_id === w.plan.committee!.id && l.position_id === p.id && !l.end_date).length;
    if (current >= p.max_holders) {
      w.plan.issues.push({ level: "error", code: "MAX_HOLDERS", message: `${p.name} allows ${p.max_holders} holder${p.max_holders === 1 ? "" : "s"} and ${w.plan.committee.name} already has ${current}. End the current assignment first, or skip this row.` });
      w.plan.action = "blocked";
    } else taken.set(key, current + 1);
  }

  plan.rows = work.map((w) => w.plan);
  plan.unknownPositions = [...unknown.values()];
  plan.newUnits = [...newUnits.values()];
  const count = (a: RowAction) => plan.rows.filter((r) => r.action === a).length;
  plan.summary = {
    total: plan.rows.length, create: count("create"), assign: count("assign"), update: count("update"), unchanged: count("unchanged"), skip: count("skip"), blocked: count("blocked"),
    newPeople: new Set(work.filter((w) => w.plan.action === "create").map((w) => w.personKey)).size,
    warnings: plan.rows.reduce((n, r) => n + r.issues.filter((i) => i.level === "warning").length, 0),
    duplicates: plan.rows.filter((r) => r.issues.some((i) => i.code === "DUPLICATE_ROW")).length,
  };
  plan.canImport = plan.summary.blocked === 0 && plan.summary.create + plan.summary.assign + plan.summary.update > 0;
  const actionable = work.filter((w) => ["create", "assign", "update"].includes(w.plan.action))
    .map((w) => [w.plan.row, w.plan.action, w.plan.committee?.id, w.plan.position?.id, w.personKey, w.plan.unit, w.listing?.id ?? null, Object.keys(w.profilePatch).sort(), Object.keys(w.listingPatch).sort()]);
  plan.planHash = await sha256Hex(new TextEncoder().encode(JSON.stringify([fileHash, mode, actionable])));
  return { plan, work, committees };
}

/** Step 1: read the file and show exactly what an import would do. Changes nothing. */
export async function previewExecutiveImport(ctx: Ctx, req: ImportRequest): Promise<ImportPlan> {
  return (await buildPlan(ctx, req)).plan;
}

/** Step 2: import what the preview showed, in one transaction, then verify it landed. */
export async function applyExecutiveImport(ctx: Ctx, req: ImportRequest & { planHash: string }): Promise<ImportResult> {
  const actor = requireActor(ctx);
  const { plan, work, committees } = await buildPlan(ctx, req);
  if (plan.fileErrors.length) throw new ValidationError(plan.fileErrors.join(" "));
  if (plan.planHash !== req.planHash) throw new AppError(409, "PLAN_CHANGED", "The data changed since the preview (someone else may have edited the committee). Preview again, then import.");
  if (!plan.canImport) throw new AppError(400, "NOTHING_TO_IMPORT", plan.summary.blocked ? "Fix or skip the rows with errors first." : "Nothing to import.");
  const decision = requirePermission(ctx, "executives.import");
  const now = nowIso();

  // New people (one per person, even when they hold several positions in the file).
  const newProfiles = new Map<string, Record<string, string | null>>();
  for (const w of work.filter((x) => x.plan.action === "create")) {
    if (newProfiles.has(w.personKey)) continue;
    newProfiles.set(w.personKey, {
      id: newId("prf"), full_name: w.plan.name, person_type: w.plan.section === "FACULTY" ? "FACULTY" : "STUDENT", student_id: w.plan.studentId,
      designation: w.plan.section === "FACULTY" ? w.src.designation?.slice(0, 80) ?? null : null, avatar_media_id: w.photoId, ...w.links,
    });
  }
  // Orders continue after what each section/unit already has.
  const nextOrder = new Map<string, number>();
  const orderFor = (committeeId: string, section: string, unit: string | null, given: number | null) => {
    const key = `${committeeId}|${section}|${unit ?? ""}`;
    if (!nextOrder.has(key)) nextOrder.set(key, 0);
    if (given !== null) return given;
    const n = nextOrder.get(key)!;
    nextOrder.set(key, n + 1);
    return n;
  };
  const maxOrders = await ctx.db.all<{ k: string; n: number }>(
    `SELECT committee_id || '|' || section || '|' || IFNULL(unit_key, '') AS k, MAX(display_order) + 1 AS n FROM committee_members
     WHERE deleted_at IS NULL AND committee_id IN (SELECT value FROM json_each(?1)) GROUP BY committee_id, section, unit_key`,
    JSON.stringify([...new Set(work.map((w) => w.plan.committee?.id).filter(Boolean))]));
  for (const m of maxOrders) nextOrder.set(m.k, m.n);

  const newListings: Array<Record<string, string | number | null>> = [];
  const listingUpdates: Array<Record<string, string | number | null>> = [];
  const profileUpdates = new Map<string, Record<string, string | null>>();
  const audits: AuditEntry[] = [];
  const notes: Array<{ userId: string; type: string; title: string; body: string; link: string }> = [];
  const layouts = new Map<string, CommitteeInfo["layout"]>();

  for (const w of work) {
    const { plan: r } = w;
    if (r.action === "create" || r.action === "assign") {
      const committee = committees.get(r.committee!.id)!;
      const profileId = r.action === "create" ? String(newProfiles.get(w.personKey)!.id) : w.profile!.id;
      const id = newId("cm");
      if (w.unitLabel && r.unit) {
        const layout = layouts.get(committee.id) ?? structuredClone(committee.layout);
        if (!layout.units.some((u) => u.key === r.unit)) {
          layout.units.push({ type: w.unitType ?? "CAMPUS", key: r.unit, meta: { name: w.unitLabel } });
          const sec = w.unitType === "WING" ? "wings" : "campuses";
          if (!layout.sections.includes(sec)) layout.sections.unshift(sec);
        }
        layouts.set(committee.id, layout);
      }
      newListings.push({
        id, committee_id: committee.id, profile_id: profileId, position_id: r.position!.id, position_title: (r.positionTitle ?? r.position!.name).slice(0, 120),
        display_name: w.profile && r.name && lower(r.name) !== lower(w.profile.full_name) ? r.name : null,
        designation: w.src.designation?.slice(0, 80) ?? null, section: r.section, unit_type: r.unit ? w.unitType : null, unit_key: r.unit,
        campus_label: w.unitLabel, avatar_media_id: w.photoId, avatar_position_x: w.src.crop?.x ?? null, avatar_position_y: w.src.crop?.y ?? null, avatar_scale: w.src.crop?.scale ?? null,
        display_order: orderFor(committee.id, r.section, r.unit, w.src.displayOrder), start_date: w.startDate, end_date: w.endDate,
        is_active: committee.status === "CURRENT" && !w.endDate ? 1 : 0, bio: w.src.bio?.slice(0, 1000) ?? null,
      });
      audits.push({ action: "executive.assign", resourceType: "committee_member", resourceId: id, reason: `Bulk import ${plan.fileHash.slice(0, 12)}`, after: { committee: committee.name, position: r.position!.name, profileId, title: r.positionTitle }, decision });
      if (w.profile?.user_id) notes.push({ userId: w.profile.user_id, type: "executive.assigned", title: `You were added as ${r.positionTitle ?? r.position!.name}`, body: committee.name, link: "/dashboard/profile" });
      if (r.action === "assign" && req.mode === "upsert" && Object.keys(w.profilePatch).length) profileUpdates.set(w.profile!.id, { ...(profileUpdates.get(w.profile!.id) ?? {}), ...w.profilePatch });
    } else if (r.action === "update") {
      if (Object.keys(w.listingPatch).length) {
        listingUpdates.push({ id: w.listing!.id, ...w.listingPatch });
        audits.push({ action: "executive.update", resourceType: "committee_member", resourceId: w.listing!.id, reason: `Bulk import ${plan.fileHash.slice(0, 12)}`, after: w.listingPatch, decision });
      }
      if (Object.keys(w.profilePatch).length) profileUpdates.set(w.profile!.id, { ...(profileUpdates.get(w.profile!.id) ?? {}), ...w.profilePatch });
    }
  }
  for (const [id, patch] of profileUpdates) audits.push({ action: "profile.update", resourceType: "profile", resourceId: id, reason: `Bulk import ${plan.fileHash.slice(0, 12)}`, after: patch, decision });

  const stmts: D1StatementLike[] = [];
  if (newProfiles.size) {
    stmts.push(ctx.db.stmt(
      `INSERT INTO profiles (id, full_name, person_type, student_id, designation, avatar_media_id, linkedin_url, github_url, facebook_url, twitter_url, website_url, created_at, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.full_name'), json_extract(j.value, '$.person_type'), json_extract(j.value, '$.student_id'),
              json_extract(j.value, '$.designation'), json_extract(j.value, '$.avatar_media_id'), json_extract(j.value, '$.linkedin_url'), json_extract(j.value, '$.github_url'),
              json_extract(j.value, '$.facebook_url'), json_extract(j.value, '$.twitter_url'), json_extract(j.value, '$.website_url'), ?2, ?2, ?3
       FROM json_each(?1) AS j`,
      JSON.stringify([...newProfiles.values()]), now, actor.user.id));
  }
  if (profileUpdates.size) {
    // Only provided values are written; an existing student ID is never replaced.
    stmts.push(ctx.db.stmt(
      `UPDATE profiles SET
         student_id = COALESCE(profiles.student_id, j.student_id), designation = COALESCE(j.designation, profiles.designation),
         linkedin_url = COALESCE(j.linkedin_url, profiles.linkedin_url), github_url = COALESCE(j.github_url, profiles.github_url),
         facebook_url = COALESCE(j.facebook_url, profiles.facebook_url), twitter_url = COALESCE(j.twitter_url, profiles.twitter_url),
         website_url = COALESCE(j.website_url, profiles.website_url), avatar_media_id = COALESCE(profiles.avatar_media_id, j.avatar_media_id),
         updated_at = ?2, updated_by = ?3
       FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.student_id') AS student_id, json_extract(value, '$.designation') AS designation,
                    json_extract(value, '$.linkedin_url') AS linkedin_url, json_extract(value, '$.github_url') AS github_url, json_extract(value, '$.facebook_url') AS facebook_url,
                    json_extract(value, '$.twitter_url') AS twitter_url, json_extract(value, '$.website_url') AS website_url, json_extract(value, '$.avatar_media_id') AS avatar_media_id
             FROM json_each(?1)) AS j
       WHERE profiles.id = j.id`,
      JSON.stringify([...profileUpdates].map(([id, patch]) => ({ id, ...patch }))), now, actor.user.id));
  }
  if (newListings.length) {
    stmts.push(ctx.db.stmt(
      `INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, display_name, designation, section, unit_type, unit_key, campus_label,
                                      avatar_media_id, avatar_position_x, avatar_position_y, avatar_scale, display_order, start_date, end_date, is_active, bio,
                                      created_at, created_by, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.committee_id'), json_extract(j.value, '$.profile_id'), json_extract(j.value, '$.position_id'),
              json_extract(j.value, '$.position_title'), json_extract(j.value, '$.display_name'), json_extract(j.value, '$.designation'), json_extract(j.value, '$.section'),
              json_extract(j.value, '$.unit_type'), json_extract(j.value, '$.unit_key'), json_extract(j.value, '$.campus_label'), json_extract(j.value, '$.avatar_media_id'),
              json_extract(j.value, '$.avatar_position_x'), json_extract(j.value, '$.avatar_position_y'), json_extract(j.value, '$.avatar_scale'), json_extract(j.value, '$.display_order'),
              json_extract(j.value, '$.start_date'), json_extract(j.value, '$.end_date'), json_extract(j.value, '$.is_active'), json_extract(j.value, '$.bio'), ?2, ?3, ?2, ?3
       FROM json_each(?1) AS j`,
      JSON.stringify(newListings), now, actor.user.id));
  }
  if (listingUpdates.length) {
    stmts.push(ctx.db.stmt(
      `UPDATE committee_members SET
         position_title = COALESCE(j.position_title, committee_members.position_title), display_order = COALESCE(j.display_order, committee_members.display_order),
         bio = COALESCE(j.bio, committee_members.bio), designation = COALESCE(j.designation, committee_members.designation),
         start_date = COALESCE(j.start_date, committee_members.start_date), end_date = COALESCE(j.end_date, committee_members.end_date),
         is_active = CASE WHEN j.end_date IS NOT NULL AND j.end_date <= ?2 THEN 0 ELSE committee_members.is_active END,
         avatar_media_id = COALESCE(j.avatar_media_id, committee_members.avatar_media_id), avatar_position_x = COALESCE(j.avatar_position_x, committee_members.avatar_position_x),
         avatar_position_y = COALESCE(j.avatar_position_y, committee_members.avatar_position_y), avatar_scale = COALESCE(j.avatar_scale, committee_members.avatar_scale),
         updated_at = ?2, updated_by = ?3
       FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.position_title') AS position_title, json_extract(value, '$.display_order') AS display_order,
                    json_extract(value, '$.bio') AS bio, json_extract(value, '$.designation') AS designation, json_extract(value, '$.start_date') AS start_date,
                    json_extract(value, '$.end_date') AS end_date, json_extract(value, '$.avatar_media_id') AS avatar_media_id, json_extract(value, '$.avatar_position_x') AS avatar_position_x,
                    json_extract(value, '$.avatar_position_y') AS avatar_position_y, json_extract(value, '$.avatar_scale') AS avatar_scale
             FROM json_each(?1)) AS j
       WHERE committee_members.id = j.id`,
      JSON.stringify(listingUpdates), now, actor.user.id));
  }
  for (const [id, layout] of layouts) stmts.push(ctx.db.stmt("UPDATE committees SET layout_json = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", id, JSON.stringify(layout), now, actor.user.id));
  const summary = { created: { people: newProfiles.size, listings: newListings.length }, updated: { people: profileUpdates.size, listings: listingUpdates.length }, unchanged: plan.summary.unchanged, skipped: plan.summary.skip };
  stmts.push(
    auditStmt(ctx, {
      action: "executives.import", resourceType: "import", resourceId: plan.fileHash.slice(0, 16), decision,
      after: { format: plan.format, mode: plan.mode, fileHash: plan.fileHash, shape: plan.shape, rows: plan.summary.total, ...summary, conflicts: plan.summary.duplicates, committees: [...new Set(plan.rows.map((r) => r.committee?.name).filter(Boolean))] },
    }),
    ...auditManyStmt(ctx, audits),
    ...notifyEachStmts(ctx, notes),
  );
  await ctx.db.batch(stmts);
  ctx.revalidate?.(["committees"]);

  // Verify: every listing and person the plan created is there.
  const check = await ctx.db.first<{ listings: number; people: number }>(
    `SELECT (SELECT COUNT(*) FROM committee_members WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?1))) AS listings,
            (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?2))) AS people`,
    JSON.stringify(newListings.map((l) => l.id)), JSON.stringify([...newProfiles.values()].map((p) => p.id)));
  const verify = {
    listings: { expected: newListings.length, found: check?.listings ?? 0 },
    people: { expected: newProfiles.size, found: check?.people ?? 0 },
    ok: (check?.listings ?? 0) === newListings.length && (check?.people ?? 0) === newProfiles.size,
  };
  const touched = [...new Set(work.filter((w) => ["create", "assign", "update"].includes(w.plan.action)).map((w) => w.plan.committee!.id))];
  return { ...summary, committees: touched.map((id) => ({ id, name: committees.get(id)!.name })), verify };
}
