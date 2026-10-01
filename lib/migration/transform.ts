/**
 * Legacy data → D1 transform.
 *
 * Pure: takes the parsed legacy sources plus a media inventory and returns
 * ordered SQL statements, a source map and a migration report. The CLI in
 * scripts/platform/migrate.ts does the file reading and executes the SQL.
 *
 * Guarantees
 *  - Deterministic ids derived from stable source keys, so running the import
 *    twice creates nothing new.
 *  - Nothing is silently dropped: every source record is migrated, merged into
 *    another with a DUPLICATE entry, or reported as SKIPPED/FAILED with a reason.
 *  - Conflicting values are never silently chosen: the chosen value, the
 *    alternatives and the reason are recorded as a CONFLICT.
 *  - Private values (phone numbers, participant emails) never appear in the
 *    report; conflicts on them are reported with the values masked.
 */
import { createHash } from "node:crypto";
import { CURRENT_POSITIONS } from "../governance/catalog";
import { resolvePosition, slugify } from "../governance/positions";
import { insertSql, type InsertOptions, type SqlValue } from "./sql";
import { generalSponsorshipSql } from "../sponsorship/general";

// ───────────────────────────── inputs ─────────────────────────────

export interface MediaFile {
  /** Public URL path, e.g. /events/12.jpg */
  path: string;
  size: number;
  sha256: string;
  width?: number;
  height?: number;
  mime: string;
}

type Json = Record<string, unknown>;

export interface LegacySources {
  executives: Json[];
  events: Json[];
  contests: { contests: Json[] };
  forms: Json[];
  hacktheai: Json[];
  sponsors: unknown;
  predefined: unknown;
  featuredCollaborations: unknown[];
  /** Partner clubs shown on the home and collaborations pages. */
  partners: unknown[];
  lostFoundConfig: Json;
  blogPosts: Json[];
  /** Portrait file names the live site's static manifest knows about. */
  avatarManifest: string[];
  mediaFiles: MediaFile[];
}

export interface TransformOptions {
  runId: string;
  mode: "insert-missing" | "refresh";
  now: string;
}

// ───────────────────────────── outputs ─────────────────────────────

export type IssueKind = "CONFLICT" | "DUPLICATE" | "SKIPPED" | "FAILED" | "NOTE";

export interface Issue {
  entity: string;
  key: string;
  kind: IssueKind;
  detail: Record<string, unknown>;
  resolution: string;
}

export interface EntityCount {
  source: number;
  migrated: number;
  merged: number;
  skipped: number;
  failed: number;
  duplicates: number;
  conflicts: number;
}

export interface SourceMapEntry {
  source: string;
  sourceKey: string;
  targetTable: string;
  targetId: string;
  checksum: string;
}

export interface TransformResult {
  statements: string[];
  counts: Record<string, EntityCount>;
  /** Rows expected in each target table after import (for verification). */
  expectedRows: Record<string, number>;
  issues: Issue[];
  sourceMap: SourceMapEntry[];
  positionMappings: Array<{ title: string; positionKey: string; via: string; occurrences: number }>;
}

// ───────────────────────────── helpers ─────────────────────────────

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function detId(namespace: string, key: string): string {
  return `${namespace}_${sha256(`${namespace}|${key}`).slice(0, 24)}`;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Json;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const str = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normName = (s: string) => s.normalize("NFKC").replace(/[.\s]+/g, " ").trim().toLowerCase();
const isStudentId = (v: unknown) => typeof v === "string" && /^\d{9}$/.test(v.trim());

/** Same algorithm as lib/events.ts eventSlug(): public URLs must not change. */
export function legacyEventSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
}

const HONORIFICS = new Set(["md", "mohammad", "mohammed", "muhammad", "mst", "mrs", "mr", "ms", "dr", "sk"]);
function nameTokens(name: string): string[] {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

/** Same person? Token overlap, subset, or matching distinctive first name. */
export function sameName(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return normName(a) === normName(b);
  const A = new Set(ta);
  const B = new Set(tb);
  const inter = [...A].filter((t) => B.has(t)).length;
  const union = new Set([...A, ...B]).size;
  if (inter / union >= 0.5) return true;
  if (inter > 0 && (inter === A.size || inter === B.size)) return true;
  return ta[0] === tb[0] && ta[0].length >= 4;
}

function clusterNames(items: Array<{ name: string; year: string }>): Array<{ items: Array<{ name: string; year: string }>; firstYear: string }> {
  const clusters: Array<{ items: Array<{ name: string; year: string }>; firstYear: string }> = [];
  for (const item of items) {
    const home = clusters.find((c) => c.items.some((i) => sameName(i.name, item.name)));
    if (home) {
      home.items.push(item);
      if (Number(item.year) < Number(home.firstYear)) home.firstYear = item.year;
    } else clusters.push({ items: [item], firstYear: item.year });
  }
  return clusters;
}

const PRIVATE_FIELDS = new Set(["phone", "contact", "whatsapp", "email"]);

// ───────────────────────────── transform ─────────────────────────────

export function transformLegacy(src: LegacySources, opts: TransformOptions): TransformResult {
  const statements: Map<string, string[]> = new Map();
  const issues: Issue[] = [];
  const sourceMap: SourceMapEntry[] = [];
  const counts: Record<string, EntityCount> = {};
  const expected: Record<string, Set<string>> = {};

  const count = (entity: string): EntityCount =>
    (counts[entity] ??= { source: 0, migrated: 0, merged: 0, skipped: 0, failed: 0, duplicates: 0, conflicts: 0 });
  const issue = (i: Issue) => {
    issues.push(i);
    const c = count(i.entity);
    if (i.kind === "CONFLICT") c.conflicts++;
    if (i.kind === "DUPLICATE") c.duplicates++;
  };
  const emit = (table: string, row: Record<string, SqlValue>, o: InsertOptions = {}) => {
    const list = statements.get(table) ?? [];
    list.push(insertSql(table, row, o));
    statements.set(table, list);
    const key = (o.conflict ?? ["id"]).map((c) => String(row[c])).join("|");
    (expected[table] ??= new Set()).add(key);
  };
  const topMode = (): InsertOptions["mode"] => (opts.mode === "refresh" ? "refresh" : "nothing");
  const mapSource = (source: string, sourceKey: string, targetTable: string, targetId: string, record: unknown) =>
    sourceMap.push({ source, sourceKey, targetTable, targetId, checksum: sha256(canonicalJson(record)).slice(0, 32) });

  // ── media inventory ──────────────────────────────────────────────
  const mediaByPath = new Map<string, MediaFile>();
  for (const f of src.mediaFiles) mediaByPath.set(f.path.toLowerCase(), f);
  const mediaRefs = new Map<string, number>();
  const mediaIdForPath = (p: string): string => detId("media", p.toLowerCase());
  const referencedMedia = (p: string | null | undefined): string | null => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) {
      const id = detId("media", p);
      if (!mediaRefs.has(id)) {
        emit("media", { id, storage: "EXTERNAL", external_url: p, media_type: "IMAGE", visibility: "PUBLIC", status: "READY", created_at: opts.now, updated_at: opts.now }, { mode: "nothing" });
        issue({ entity: "media", key: p, kind: "NOTE", detail: { url: p }, resolution: "External image kept as an EXTERNAL media reference; not copied to R2. Review whether to import it." });
      }
      mediaRefs.set(id, (mediaRefs.get(id) ?? 0) + 1);
      return id;
    }
    const file = mediaByPath.get(p.toLowerCase());
    if (!file) return null;
    const id = mediaIdForPath(file.path);
    mediaRefs.set(id, (mediaRefs.get(id) ?? 0) + 1);
    return id;
  };

  count("media").source = src.mediaFiles.length;
  for (const f of src.mediaFiles) {
    const id = mediaIdForPath(f.path);
    emit("media", {
      id, storage: "STATIC", legacy_path: f.path, original_filename: f.path.split("/").pop() ?? null, mime_type: f.mime,
      media_type: f.mime.startsWith("image/") ? "IMAGE" : f.mime === "application/pdf" ? "DOCUMENT" : "OTHER",
      size_bytes: f.size, width: f.width ?? null, height: f.height ?? null, source_checksum: f.sha256, visibility: "PUBLIC", status: "READY",
      created_at: opts.now, updated_at: opts.now,
    }, { mode: "nothing" });
    mapSource("public/", f.path, "media", id, { path: f.path, sha256: f.sha256 });
    count("media").migrated++;
  }
  // Same bytes stored under several names: keep every path working, report for cleanup.
  const bySum = new Map<string, string[]>();
  for (const f of src.mediaFiles) bySum.set(f.sha256, [...(bySum.get(f.sha256) ?? []), f.path]);
  for (const [sum, paths] of bySum) {
    if (paths.length > 1) {
      issue({ entity: "media", key: sum.slice(0, 16), kind: "DUPLICATE", detail: { paths }, resolution: "Identical files. All paths kept so existing references work; R2 migration stores the bytes once." });
    }
  }

  // ── positions: catalog + auto-created for unmapped titles ─────────
  const positionMappings = new Map<string, { title: string; positionKey: string; via: string; occurrences: number }>();
  const createdPositions = new Map<string, string>();
  const positionFor = (title: string, section: "FACULTY" | "STUDENT"): string => {
    const cached = positionMappings.get(title);
    if (cached) {
      cached.occurrences++;
      return cached.positionKey;
    }
    const match = resolvePosition(title, CURRENT_POSITIONS);
    let key: string;
    let via: string;
    if (match) {
      key = match.key;
      via = match.via;
    } else {
      key = `legacy-${slugify(title)}`;
      via = "created";
      if (!createdPositions.has(key)) {
        createdPositions.set(key, title);
        emit("positions", {
          id: `pos:${key}`, key, name: title, description: "Created by the legacy migration for a title with no catalog match. Review and merge if appropriate.",
          category: section === "FACULTY" ? "FACULTY" : "OTHER", rank: 500, display_order: 500, is_active: 1, is_protected: 0,
          aliases_json: { aliases: [title], pattern: null }, created_at: opts.now, updated_at: opts.now,
        }, { mode: "nothing" });
        issue({ entity: "positions", key, kind: "NOTE", detail: { title }, resolution: "No catalog position matched this legacy title; created a new position with no permissions." });
      }
    }
    positionMappings.set(title, { title, positionKey: key, via, occurrences: 1 });
    return key;
  };

  // ── executives → profiles, committees, committee_members ──────────
  interface ProfileAcc {
    id: string;
    identity: string;
    identityKind: "student_id" | "faculty_name" | "name_only";
    years: string[];
    values: Map<string, Array<{ year: string; value: string }>>;
    personType: "STUDENT" | "FACULTY";
    avatarMediaId: string | null;
    avatarPosition: { x: number; y: number } | null;
    avatarScale: number | null;
    raw: Json[];
  }
  const profiles = new Map<string, ProfileAcc>();
  const committeeYears = src.executives.map((c) => String(c.year));
  const latestYear = [...committeeYears].sort((a, b) => Number(b) - Number(a))[0];
  const manifest = new Set(src.avatarManifest.map((f) => f.toLowerCase()));
  const avatarsShownNewly = new Set<string>();

  const resolveAvatar = (m: Json): string | null => {
    const url = str(m.avatarUrl);
    const tryFile = (file: string) => {
      const cleaned = file.replace(/^\/?(executives\/)?/, "");
      const found = mediaByPath.get(`/executives/${cleaned}`.toLowerCase());
      if (found && !manifest.has(cleaned.toLowerCase())) avatarsShownNewly.add(found.path);
      return found ? found.path : null;
    };
    if (url) {
      if (/^https?:\/\//i.test(url)) return url;
      const f = tryFile(url);
      if (f) return f;
    }
    const sid = str(m.studentId);
    if (sid) {
      const f = tryFile(`${sid}.png`);
      if (f) return f;
    }
    if (m.name === "Ahmed Iqbal Pritom") return tryFile("iqbal.cse.png");
    return null;
  };

  // Pre-pass: the same student ID sometimes appears for different people
  // (later committee lists were copied from earlier ones with IDs misaligned).
  // Cluster each ID's names; the largest cluster (earliest on ties) owns the ID.
  const sidAppearances = new Map<string, Array<{ name: string; year: string }>>();
  const eachMember = (fn: (m: Json, year: string) => void) => {
    for (const c of src.executives) {
      const year = String(c.year);
      const lists: Json[][] = [(c.facultyMembers as Json[]) ?? [], (c.studentExecutives as Json[]) ?? []];
      for (const group of ["campuses", "wings"]) {
        for (const unit of Object.values((c[group] as Record<string, Json>) ?? {})) {
          lists.push((unit.facultyMembers as Json[]) ?? [], (unit.studentExecutives as Json[]) ?? []);
        }
      }
      for (const list of lists) for (const m of list) fn(m, year);
    }
  };
  eachMember((m, year) => {
    const sid = str(m.studentId);
    const name = str(m.name);
    if (sid && name && isStudentId(sid)) sidAppearances.set(sid, [...(sidAppearances.get(sid) ?? []), { name, year }]);
  });
  const sidOwner = new Map<string, Set<string>>();
  const sidClusterOf = new Map<string, string>();
  for (const [sid, apps] of sidAppearances) {
    const clusters = clusterNames(apps);
    if (clusters.length <= 1) continue;
    clusters.sort((a, b) => b.items.length - a.items.length || Number(a.firstYear) - Number(b.firstYear));
    sidOwner.set(sid, new Set(clusters[0].items.map((i) => normName(i.name))));
    for (const cl of clusters) for (const i of cl.items) sidClusterOf.set(`${sid}|${normName(i.name)}`, slugify(cl.items[0].name));
    issue({
      entity: "profiles", key: `sid:${sid}`, kind: "CONFLICT",
      detail: { field: "student_id_shared", owner: `${clusters[0].items[0].name} (${[...new Set(clusters[0].items.map((i) => i.year))].join(", ")})`,
        others: clusters.slice(1).map((cl) => `${cl.items[0].name} (${[...new Set(cl.items.map((i) => i.year))].join(", ")})`) },
      resolution: "One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.",
    });
  }

  const exec = count("executive_assignments");
  const committeesCount = count("committees");
  committeesCount.source = src.executives.length;

  src.executives.forEach((c, committeeIndex) => {
    const year = String(c.year);
    const committeeId = detId("committee", year);
    const sections: string[] = Object.keys(c).filter((k) => k !== "year");
    const units: Array<{ type: "CAMPUS" | "WING"; key: string; meta: Json }> = [];
    for (const [group, type] of [["campuses", "CAMPUS"], ["wings", "WING"]] as const) {
      for (const [key, unit] of Object.entries((c[group] as Record<string, Json>) ?? {})) {
        const meta: Json = {};
        for (const [k, v] of Object.entries(unit)) if (k !== "facultyMembers" && k !== "studentExecutives") meta[k] = v;
        units.push({ type, key, meta });
      }
    }
    const status = year === latestYear ? "CURRENT" : "ARCHIVED";
    emit("committees", {
      id: committeeId, slug: year, name: `GUCC Executive Committee ${year}`, term_label: year, academic_year: year, status,
      layout_json: { sections, units }, created_at: opts.now, updated_at: opts.now,
    }, { mode: topMode(), preserve: ["status"] });
    mapSource("data/executives.json", `year:${year}`, "committees", committeeId, { year, sections, units });
    committeesCount.migrated++;
    void committeeIndex;

    const seenAssignments = new Set<string>();
    const handleList = (list: Json[] | undefined, section: "FACULTY" | "STUDENT", unit: { type: "CAMPUS" | "WING"; key: string } | null) => {
      (list ?? []).forEach((m, index) => {
        exec.source++;
        const name = str(m.name);
        const title = str(m.position);
        const where = `${year}${unit ? `/${unit.key}` : ""}/${section}[${index}]`;
        if (!name || !title) {
          exec.failed++;
          issue({ entity: "executive_assignments", key: where, kind: "FAILED", detail: { hasName: Boolean(name), hasPosition: Boolean(title) }, resolution: "Record lacks a name or position; not imported." });
          return;
        }
        const sidRaw = str(m.studentId);
        let identity: string;
        let identityKind: ProfileAcc["identityKind"];
        if (sidRaw && isStudentId(sidRaw)) {
          const owner = sidOwner.get(sidRaw);
          if (!owner || owner.has(normName(name))) {
            identity = `sid:${sidRaw}`;
            identityKind = "student_id";
          } else {
            // Same student ID listed for a different person: keep them apart.
            identity = `sidshared:${sidRaw}:${sidClusterOf.get(`${sidRaw}|${normName(name)}`)}`;
            identityKind = "name_only";
          }
        } else if (section === "FACULTY") {
          identity = `faculty:${normName(name)}`;
          identityKind = "faculty_name";
        } else {
          identity = `name:${normName(name)}`;
          identityKind = "name_only";
        }
        const profileId = detId("profile", identity);
        let acc = profiles.get(identity);
        if (!acc) {
          acc = { id: profileId, identity, identityKind, years: [], values: new Map(), personType: section === "FACULTY" ? "FACULTY" : "STUDENT", avatarMediaId: null, avatarPosition: null, avatarScale: null, raw: [] };
          profiles.set(identity, acc);
        }
        acc.years.push(year);
        acc.raw.push(m);
        const record = (field: string, value: unknown) => {
          let v = str(value);
          // "https://github.com/" and friends are placeholders, not links.
          if (v && /_url$/.test(field) && /^https?:\/\/(www\.|m\.)?[a-z0-9.-]+\.[a-z]+\/?$/i.test(v)) v = null;
          if (!v) return;
          const list = acc!.values.get(field) ?? [];
          list.push({ year, value: v });
          acc!.values.set(field, list);
        };
        record("full_name", name);
        record("student_id_raw", sidRaw);
        for (const [field, key] of [["designation", "designation"], ["department", "department"], ["public_email", "mail"], ["linkedin_url", "linkedin"],
          ["github_url", "github"], ["twitter_url", "twitter"], ["facebook_url", "facebook"], ["phone", "contact"], ["phone", "phone"], ["whatsapp", "whatsapp"]] as const) {
          record(field, m[key]);
        }

        const avatarPath = resolveAvatar(m);
        const avatarMediaId = referencedMedia(avatarPath);
        if (avatarMediaId) acc.avatarMediaId = avatarMediaId; // later years win: executives list in chronological order
        const pos = m.avatarPosition as { x?: number; y?: number } | undefined;
        if (pos && typeof pos.x === "number" && typeof pos.y === "number") acc.avatarPosition = { x: pos.x, y: pos.y };
        if (num(m.avatarScale) !== null) acc.avatarScale = num(m.avatarScale);

        const positionKey = positionFor(title, section);
        const assignmentKey = `${year}|${unit?.key ?? ""}|${identity}|${positionKey}`;
        if (seenAssignments.has(assignmentKey)) {
          exec.merged++;
          issue({ entity: "executive_assignments", key: where, kind: "DUPLICATE", detail: { year, unit: unit?.key ?? null, name, title },
            resolution: "Same person listed twice for the same position in one committee unit; kept the first listing." });
          return;
        }
        seenAssignments.add(assignmentKey);
        const cmId = detId("cm", `${year}|${unit?.key ?? ""}|${section}|${identity}|${title}`);
        emit("committee_members", {
          id: cmId, committee_id: committeeId, profile_id: profileId, position_id: `pos:${positionKey}`, position_title: title, section,
          display_name: name, designation: str(m.designation),
          unit_type: unit?.type ?? null, unit_key: unit?.key ?? null, campus_label: str(m.campus), display_order: index,
          is_active: status === "CURRENT" ? 1 : 0,
          avatar_media_id: avatarMediaId, avatar_position_x: pos?.x ?? null, avatar_position_y: pos?.y ?? null, avatar_scale: num(m.avatarScale),
          legacy_json: m, created_at: opts.now, updated_at: opts.now,
        }, { mode: topMode() });
        mapSource("data/executives.json", where, "committee_members", cmId, m);
        exec.migrated++;
      });
    };
    for (const s of sections) {
      if (s === "facultyMembers") handleList(c.facultyMembers as Json[], "FACULTY", null);
      else if (s === "studentExecutives") handleList(c.studentExecutives as Json[], "STUDENT", null);
    }
    for (const u of units) {
      const group = u.type === "CAMPUS" ? "campuses" : "wings";
      const unit = (c[group] as Record<string, Json>)[u.key];
      handleList(unit.facultyMembers as Json[], "FACULTY", u);
      handleList(unit.studentExecutives as Json[], "STUDENT", u);
    }
  });

  // Profiles: pick the most recent value per field and report disagreements.
  const prof = count("profiles");
  prof.source = profiles.size;
  for (const acc of profiles.values()) {
    const pick = (field: string): string | null => {
      const list = acc.values.get(field);
      if (!list || list.length === 0) return null;
      const distinct = [...new Set(list.map((v) => v.value))];
      const chosen = list[list.length - 1].value;
      if (distinct.length > 1) {
        const masked = PRIVATE_FIELDS.has(field);
        issue({
          entity: "profiles", key: acc.identity, kind: "CONFLICT",
          detail: { field, chosen: masked ? "(private, masked)" : chosen, alternatives: masked ? `${distinct.length - 1} other value(s), masked` : distinct.filter((v) => v !== chosen),
            years: list.map((v) => v.year) },
          resolution: "Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.",
        });
      }
      return chosen;
    };
    const fullName = pick("full_name")!;
    const sid = acc.identityKind === "student_id" ? acc.identity.slice(4) : null;
    if (acc.identityKind === "name_only") {
      issue({ entity: "profiles", key: acc.identity, kind: "NOTE", detail: { name: fullName, years: acc.years, studentIdGiven: acc.values.get("student_id_raw")?.map((v) => v.value) ?? [] },
        resolution: "No valid student ID; records merged by exact name. Review if two different people share this name." });
    }
    const whatsapp = pick("whatsapp");
    emit("profiles", {
      id: acc.id, full_name: fullName, slug: sid ?? slugify(fullName), person_type: acc.personType, student_id: sid,
      department: pick("department"), designation: pick("designation"), avatar_media_id: acc.avatarMediaId,
      avatar_position_x: acc.avatarPosition?.x ?? null, avatar_position_y: acc.avatarPosition?.y ?? null, avatar_scale: acc.avatarScale,
      phone: pick("phone"), public_email: pick("public_email"), linkedin_url: pick("linkedin_url"), github_url: pick("github_url"),
      twitter_url: pick("twitter_url"), facebook_url: pick("facebook_url"),
      legacy_json: { identity: acc.identity, identityKind: acc.identityKind, years: acc.years, whatsapp, studentIdRaw: acc.values.get("student_id_raw")?.map((v) => v.value) ?? [] },
      created_at: opts.now, updated_at: opts.now,
    }, { mode: topMode() });
    mapSource("data/executives.json", acc.identity, "profiles", acc.id, acc.raw);
    prof.migrated++;
  }
  for (const p of avatarsShownNewly) {
    issue({ entity: "media", key: p, kind: "NOTE", detail: { path: p }, resolution: "Portrait exists in public/executives but was missing from the static avatar manifest, so the old site never showed it. It is now linked." });
  }

  // ── categories and tags ───────────────────────────────────────────
  const categoryId = (kind: "POST" | "EVENT", name: string | null): string | null => {
    if (!name) return null;
    const slug = slugify(name);
    const id = detId("category", `${kind}:${slug}`);
    if (!expected.categories?.has(id)) {
      emit("categories", { id, kind, slug, name, created_at: opts.now }, { mode: "nothing" });
      count("categories").migrated++;
    }
    return id;
  };
  const tagId = (name: string): string => {
    const slug = slugify(name);
    const id = detId("tag", slug);
    if (!expected.tags?.has(id)) emit("tags", { id, slug, name, created_at: opts.now }, { mode: "nothing" });
    return id;
  };

  // ── events ─────────────────────────────────────────────────────────
  const ev = count("events");
  ev.source = src.events.length;
  const usedSlugs = new Map<string, string>();
  const slCounts = new Map<number, number>();
  for (const e of src.events) slCounts.set(Number(e.sl), (slCounts.get(Number(e.sl)) ?? 0) + 1);
  for (const [sl, n] of slCounts) {
    if (n > 1) {
      issue({ entity: "events", key: `sl:${sl}`, kind: "CONFLICT", detail: { sl, events: src.events.filter((e) => Number(e.sl) === sl).map((e) => e.name) },
        resolution: `Legacy id ${sl} is used by ${n} events, so they shared one cover image (/events/${sl}.jpg). Both imported as separate events; both still point at that image. Upload a correct cover for one of them.` });
    }
  }
  src.events.forEach((e, index) => {
    const name = str(e.name);
    const sl = num(e.sl);
    if (!name) {
      ev.failed++;
      issue({ entity: "events", key: `index:${index}`, kind: "FAILED", detail: { sl }, resolution: "Event without a name cannot get a URL; not imported." });
      return;
    }
    const id = detId("event", `sl:${sl}|name:${name}`);
    let slug = legacyEventSlug(name);
    if (usedSlugs.has(slug)) {
      const original = slug;
      let n = 2;
      while (usedSlugs.has(`${original}-${n}`)) n++;
      slug = `${original}-${n}`;
      issue({ entity: "events", key: original, kind: "CONFLICT", detail: { slug: original, keptBy: usedSlugs.get(original), renamed: name, newSlug: slug },
        resolution: `Two events share the URL /events/${original}. The first keeps it (as before, the second was unreachable); the second now lives at /events/${slug}.` });
    }
    usedSlugs.set(slug, name);
    const date = str(e.date);
    const time = str(e.time);
    const { startAt, endAt } = parseSchedule(date, str(e.endDate), time);
    const location = str(e.location);
    const bannerPath = sl !== null ? `/events/${sl}.jpg` : null;
    const bannerId = referencedMedia(bannerPath);
    if (bannerPath && !bannerId) {
      issue({ entity: "events", key: slug, kind: "NOTE", detail: { expected: bannerPath }, resolution: "Cover image file not found; event imported without a banner." });
    }
    emit("events", {
      id, legacy_sl: sl, slug, title: name, description: str(e.description), category_id: categoryId("EVENT", str(e.category)), organizer: str(e.organizer),
      venue: location, mode: detectMode(location, time), start_at: startAt, end_at: endAt, time_text: time, participants_reported: num(e.participants),
      participants_text: num(e.participants) === null ? str(e.participants) : null,
      external_link: str(e.link), guests_text: str(e.guest), judges_text: str(e.Judge), banner_media_id: bannerId, status: "PUBLISHED",
      published_at: startAt, legacy_json: e, created_at: opts.now, updated_at: opts.now,
    }, { mode: topMode() });
    if (bannerId) emit("event_media", { event_id: id, media_id: bannerId, kind: "BANNER", sort_order: 0 }, { conflict: ["event_id", "media_id", "kind"] });
    parseGuests(str(e.guest)).forEach((g, i) =>
      emit("event_people", { id: detId("event_person", `${id}|guest|${i}`), event_id: id, role: g.role, name: g.name, title: g.title, sort_order: i }),
    );
    parseJudges(str(e.Judge)).forEach((j, i) =>
      emit("event_people", { id: detId("event_person", `${id}|judge|${i}`), event_id: id, role: "JUDGE", name: j, sort_order: 100 + i }),
    );
    mapSource("data/events.json", `sl:${sl}|name:${name}`, "events", id, e);
    ev.migrated++;
  });

  // ── contests ───────────────────────────────────────────────────────
  const co = count("contests");
  co.source = src.contests.contests.length;
  for (const c of src.contests.contests) {
    const legacyId = num(c.id);
    const title = str(c.title);
    if (legacyId === null || !title) {
      co.failed++;
      issue({ entity: "contests", key: String(c.id), kind: "FAILED", detail: { hasId: legacyId !== null, hasTitle: Boolean(title) }, resolution: "Contest without id or title; not imported." });
      continue;
    }
    const id = detId("contest", String(legacyId));
    const link = (v: unknown) => {
      const s = str(v);
      return s && s !== "#" ? s : null;
    };
    emit("contests", {
      id, legacy_id: legacyId, type: str(c.type) ?? "OTHER", title, held_on_text: str(c.timestamp), held_on: parseLooseDate(str(c.timestamp)), host: str(c.authors), platform: str(c.platform),
      contest_link: link(c.contestLink), problemset_link: link(c.problemsetLink), standings_link: link(c.standingsLink), editorial_link: link(c.editorialLink),
      practice_link: link(c.practiceLink), status: "PUBLISHED", legacy_json: c, created_at: opts.now, updated_at: opts.now,
    }, { mode: topMode() });
    ((c.teams as Json[]) ?? []).forEach((t, i) =>
      emit("contest_teams", {
        id: detId("contest_team", `${legacyId}|${i}|${String(t.name)}`), contest_id: id, name: str(t.name) ?? "Unnamed team", rank: num(t.rank), solved: num(t.solved),
        achievement: str(t.achievement), members_json: (t.members as unknown[]) ?? [], sort_order: i,
      }),
    );
    ((c.images as string[]) ?? []).forEach((img, i) => {
      const mediaId = referencedMedia(img);
      if (mediaId) emit("contest_media", { contest_id: id, media_id: mediaId, sort_order: i }, { conflict: ["contest_id", "media_id"] });
      else issue({ entity: "contests", key: String(legacyId), kind: "NOTE", detail: { image: img }, resolution: "Referenced image not found in public/; reference dropped." });
    });
    mapSource("data/contests.json", `id:${legacyId}`, "contests", id, c);
    co.migrated++;
  }

  // ── blog posts ─────────────────────────────────────────────────────
  const po = count("posts");
  po.source = src.blogPosts.length;
  for (const p of src.blogPosts) {
    const slug = str(p.slug)!;
    const id = detId("post", `BLOG:${slug}`);
    const cover = (p.coverImage as Json | undefined)?.url as string | undefined;
    const author = (p.author as Json) ?? {};
    const canonical = str(p.url);
    emit("posts", {
      id, type: "BLOG", slug, title: str(p.title) ?? slug, subtitle: str(p.subtitle), excerpt: str(p.brief), body_markdown: null,
      author_name: str(author.name), author_url: str(author.github) ?? str(author.url), category_id: categoryId("POST", str(p.category)),
      featured_media_id: referencedMedia(cover), canonical_url: canonical, status: "PUBLISHED", published_at: str(p.publishedAt),
      read_time_minutes: num(p.readTimeInMinutes), views: num(p.views) ?? 0, source: canonical?.includes("substack.com") ? "SUBSTACK" : "LEGACY",
      source_id: str(p.id), legacy_json: p, created_at: opts.now, updated_at: opts.now,
    }, { mode: topMode() });
    emit("post_revisions", { id: detId("post_rev", `${id}|1`), post_id: id, version: 1, title: str(p.title) ?? slug, excerpt: str(p.brief), body_markdown: null,
      snapshot_json: p, change_reason: "Imported from legacy source", created_at: opts.now });
    for (const t of (p.tags as string[]) ?? []) emit("post_tags", { post_id: id, tag_id: tagId(t) }, { conflict: ["post_id", "tag_id"] });
    mapSource("migration/sources/legacy-blog-posts.json", slug, "posts", id, p);
    po.migrated++;
    if (!str(p.body)) {
      issue({ entity: "posts", key: slug, kind: "NOTE", detail: { canonical }, resolution: "Article body lives at its canonical URL and is fetched there at render time, as before." });
    }
  }

  // ── external forms ─────────────────────────────────────────────────
  const fo = count("external_forms");
  fo.source = src.forms.length;
  const formSlugs = new Set<string>();
  for (const f of src.forms) {
    const slug = str(f.slug);
    if (!slug || !str(f.url)) {
      fo.failed++;
      issue({ entity: "external_forms", key: String(slug), kind: "FAILED", detail: { slug }, resolution: "Form without slug or URL; not imported." });
      continue;
    }
    if (formSlugs.has(slug)) {
      fo.merged++;
      issue({ entity: "external_forms", key: slug, kind: "DUPLICATE", detail: { slug }, resolution: "Duplicate slug; the first entry wins, as it did on the old site." });
      continue;
    }
    formSlugs.add(slug);
    const id = detId("form", slug);
    emit("external_forms", { id, slug, title: str(f.title) ?? slug, url: str(f.url), status: "ACTIVE", created_at: opts.now, updated_at: opts.now }, { mode: topMode() });
    mapSource("data/forms.json", slug, "external_forms", id, f);
    fo.migrated++;
  }

  // ── certificates (HackTheAI) ───────────────────────────────────────
  const programId = "certprog_hacktheai-2025";
  emit("certificate_programs", { id: programId, key: "hacktheai-2025", name: "HackTheAI 2025", created_at: opts.now });
  const cr = count("certificate_recipients");
  src.hacktheai.forEach((team, teamIndex) => {
    const teamName = str(team["Team Name"]);
    const institution = str(team["University/Institute Name"]);
    const members: Json[] = [];
    for (const suffix of ["", "__1", "__2"]) {
      if (suffix === "__2" && team["Do you have a 3rd member?"] !== "Yes") {
        if (str(team["Full Name__2"])) {
          issue({ entity: "certificate_recipients", key: `${teamName}#3`, kind: "SKIPPED", detail: { team: teamName },
            resolution: 'Third member listed but "Do you have a 3rd member?" is not "Yes"; skipped to match the old certificate lookup.' });
          cr.skipped++;
          cr.source++;
        }
        continue;
      }
      const fullName = str(team[`Full Name${suffix}`]);
      if (!fullName) continue;
      members.push({ fullName, gender: str(team[`Gender${suffix}`]), email: str(team[`Email${suffix}`]), phone: str(team[`Contact Number${suffix}`]) });
    }
    members.forEach((m, i) => {
      cr.source++;
      const id = detId("certrec", `${teamIndex}|${teamName}|${i}`);
      emit("certificate_recipients", { id, program_id: programId, team_name: teamName, institution, full_name: m.fullName as string, gender: m.gender as string | null,
        email: (m.email as string | null)?.toLowerCase() ?? null, phone: m.phone as string | null, member_index: i, created_at: opts.now });
      mapSource("data/hacktheaiteam.json", `${teamIndex}:${i}`, "certificate_recipients", id, { team: teamName, member: i });
      cr.migrated++;
    });
  });

  // ── organization settings (page content that editors change) ───────
  const settings: Array<[string, unknown, string, boolean]> = [
    ["page.sponsorship", src.sponsors, "CSE Carnival sponsorship page content (was data/sponsors.json).", true],
    ["chatbot.knowledge", src.predefined, "Chatbot knowledge base and FAQ (was data/predefined.json).", true],
    ["page.collaborations", { partners: src.partners }, "Partner clubs on the home page and /collaborations (was hard-coded in two components).", true],
    ["legacy.featured_collaborations", src.featuredCollaborations,
      "Was data/collaborations.ts featuredCollaborations. Not referenced by any page, and its /collaborations/*.png images do not exist. Kept for review.", false],
    ["lostfound.config", src.lostFoundConfig, "Lost & found categories, locations, contact methods and allowed university email domains (was lib/lost-found/config.ts).", true],
  ];
  const os = count("organization_settings");
  for (const [key, value, description, isPublic] of settings) {
    os.source++;
    emit("organization_settings", { key, value_json: JSON.stringify(value), is_public: isPublic ? 1 : 0, description, updated_at: opts.now },
      { conflict: ["key"], mode: topMode() });
    mapSource("settings", key, "organization_settings", key, value);
    os.migrated++;
  }

  // The sponsorship page in the dashboard's list of sponsorship pages (0015 copies it on databases
  // that already had the setting; here for those imported after the migrations ran). Only when
  // there's no sponsorship page at all, so it never brings back one an editor removed.
  statements.set("sponsorship_pages", [
    `INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json)
     SELECT 'spn_cse_carnival_2026', 'cse-carnival-2026', COALESCE(json_extract(value_json, '$.event.fullName'), 'CSE Carnival 2026'),
            'Sponsor the CSE Carnival: IUPC, CTF, ICT Olympiad and Math Olympiad, with workshops, industry sessions and awards.', 'ACTIVE', 1, 0, value_json
     FROM organization_settings WHERE key = 'page.sponsorship' AND json_valid(value_json)
       AND NOT EXISTS (SELECT 1 FROM sponsorship_pages)
     ON CONFLICT(id) DO NOTHING;`,
    // The general "Partner with GUCC" page, unless it exists (or existed: a removed one stays removed).
    generalSponsorshipSql(),
  ]);

  // ── unreferenced media & summary notes ─────────────────────────────
  for (const f of src.mediaFiles) {
    const id = mediaIdForPath(f.path);
    if (!mediaRefs.has(id) && f.path.startsWith("/executives/")) {
      issue({ entity: "media", key: f.path, kind: "NOTE", detail: { path: f.path }, resolution: "Portrait not referenced by any committee record. Kept (never auto-deleted); review whether it belongs to someone." });
    }
  }

  // ── bookkeeping rows ───────────────────────────────────────────────
  for (const s of sourceMap) {
    emit("migration_source_map", { source: s.source, source_key: s.sourceKey, target_table: s.targetTable, target_id: s.targetId, checksum: s.checksum, run_id: opts.runId, updated_at: opts.now },
      { conflict: ["source", "source_key", "target_table"], mode: "update" });
  }
  for (const i of issues) {
    if (i.kind === "NOTE") continue;
    emit("migration_conflicts", { id: detId("conflict", `${i.entity}|${i.key}|${i.kind}|${String(i.detail.field ?? "")}`), run_id: opts.runId, entity: i.entity, entity_key: i.key,
      kind: i.kind, detail_json: JSON.stringify(i.detail), resolution: i.resolution }, { mode: "update", preserve: ["reviewed_at", "reviewed_by"] });
  }

  const ORDER = ["media", "positions", "profiles", "committees", "committee_members", "categories", "tags", "events", "event_media", "event_people",
    "contests", "contest_teams", "contest_media", "posts", "post_revisions", "post_tags", "external_forms", "certificate_programs", "certificate_recipients",
    "organization_settings", "sponsorship_pages", "migration_source_map", "migration_conflicts"];
  const ordered: string[] = [];
  for (const t of ORDER) ordered.push(...(statements.get(t) ?? []));
  for (const t of statements.keys()) if (!ORDER.includes(t)) throw new Error(`Table ${t} missing from import order`);

  const expectedRows: Record<string, number> = {};
  for (const [t, keys] of Object.entries(expected)) expectedRows[t] = keys.size;
  count("positions").migrated = createdPositions.size;

  return {
    statements: ordered,
    counts,
    expectedRows,
    issues,
    sourceMap,
    positionMappings: [...positionMappings.values()].sort((a, b) => a.positionKey.localeCompare(b.positionKey) || a.title.localeCompare(b.title)),
  };
}

// ───────────────────────────── parsing helpers ─────────────────────────────

const DHAKA = "+06:00";

function to24h(h: number, m: number, ampm: string | undefined): [number, number] {
  let hh = h % 12;
  if ((ampm ?? "").toLowerCase() === "pm") hh += 12;
  if (!ampm) hh = h;
  return [hh, m];
}

/**
 * "2022-01-06" + "7:00 PM - 9:00 PM Online" → start/end in Dhaka time.
 * Unparseable times keep a date-only start; the original text is kept in
 * time_text regardless, so nothing is lost when parsing fails.
 */
export function parseSchedule(date: string | null, endDate: string | null, time: string | null): { startAt: string | null; endAt: string | null } {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { startAt: date, endAt: endDate };
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  const found = time ? [...time.matchAll(re)] : [];
  const fmt = (d: string, hm: [number, number]) => `${d}T${String(hm[0]).padStart(2, "0")}:${String(hm[1]).padStart(2, "0")}:00${DHAKA}`;
  if (found.length === 0) return { startAt: date, endAt: endDate };
  const start = to24h(Number(found[0][1]), Number(found[0][2] ?? 0), found[0][3]);
  const startAt = fmt(date, start);
  let endAt: string | null = endDate;
  if (found.length > 1) {
    const end = to24h(Number(found[1][1]), Number(found[1][2] ?? 0), found[1][3]);
    endAt = fmt(endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : date, end);
  }
  return { startAt, endAt };
}

export function detectMode(location: string | null, time: string | null): "ONLINE" | "OFFLINE" | "HYBRID" | null {
  const text = `${location ?? ""} ${time ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  const online = /online|zoom|google meet|meet\.google|facebook live|youtube|virtual|discord/.test(text);
  const offline = /campus|room|hall|auditorium|university|building|lab|venue|gub|dhaka|narayanganj|purbachal/.test(text);
  if (online && offline) return "HYBRID";
  if (online) return "ONLINE";
  return "OFFLINE";
}

export function parseGuests(text: string | null): Array<{ role: "CHIEF_GUEST" | "SPECIAL_GUEST" | "GUEST"; name: string; title: string | null }> {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      const label = idx > 0 ? line.slice(0, idx).trim() : null;
      const rest = idx > 0 ? line.slice(idx + 1).trim() : line;
      const role = /chief guest/i.test(label ?? "") ? "CHIEF_GUEST" : /special guest/i.test(label ?? "") ? "SPECIAL_GUEST" : "GUEST";
      const [name, ...titleParts] = rest.split(",");
      return { role, name: name.trim() || rest, title: titleParts.join(",").trim() || label };
    });
}

export function parseJudges(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^judges?\s*:\s*/i, "").trim())
    .filter(Boolean);
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "Jun 4, 2022" → 2022-06-04; "2022" → 2022; anything else → null (text kept separately). */
export function parseLooseDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}$/.test(text)) return text;
  return null;
}
