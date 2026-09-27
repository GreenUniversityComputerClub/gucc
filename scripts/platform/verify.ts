#!/usr/bin/env bun
/**
 * Migration verification.
 *
 *   bun scripts/platform/verify.ts --target local|staging|production
 *
 * Checks, against the live target database:
 *   1. row counts vs. what the transform produced (migration-report.json)
 *   2. foreign keys (PRAGMA foreign_key_check) and uniqueness invariants
 *   3. every source-map entry points at an existing row
 *   4. content equality: committees, events and contests are rebuilt with the
 *      same builders and queries the public site uses, then diffed field by
 *      field against the original JSON. A difference passes only if it is an
 *      intended change (private field removed, placeholder ID dropped, value
 *      unified after a recorded conflict, portrait newly linked).
 *   5. idempotency: a second import of the same SQL changes no row counts
 *      (local target only; run with --idempotency)
 *
 * Optional live checks: --media-url <API Worker> samples migrated images;
 * --site-url <website> requests every public page.
 *
 * Exit code 0 only when nothing unexpected was found. Writes
 * migration/reports/VERIFICATION_REPORT.md and verification-report.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCommittee, buildContest, buildEvent, mediaUrl, type CommitteeRow, type ContestRow, type ContestTeamRow, type EventRow, type MemberRow } from "../../lib/public/shapes";
import { COMMITTEES_SQL, CONTEST_IMAGES_SQL, CONTEST_TEAMS_SQL, CONTESTS_SQL, EVENTS_SQL, MEMBERS_SQL } from "../../lib/public/queries";
import { legacyEventSlug } from "../../lib/migration/transform";
import { d1ExecuteFile, d1Query, parseTarget } from "./lib/wrangler";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const target = parseTarget(argv);

type Json = Record<string, unknown>;
interface Check {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail: string, warnOnly = false) =>
  checks.push({ name, status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail });

const report = JSON.parse(readFileSync(path.join(ROOT, "migration/reports/migration-report.json"), "utf8")) as {
  runId: string;
  expectedRows: Record<string, number>;
  issues: Array<{ entity: string; key: string; kind: string; detail: Json }>;
};
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;
const q = <T = Json>(sql: string) => d1Query<T>(target, sql.replace(/\s+/g, " ").trim());

const PK: Record<string, string> = {
  role_permissions: "role_id", position_permissions: "position_id", event_media: "event_id", contest_media: "contest_id", post_tags: "post_id",
  organization_settings: "key", system_settings: "key", migration_source_map: "source",
};

function countRows() {
  const tables = Object.keys(report.expectedRows);
  const sql = `SELECT ${tables.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(", ")}`;
  return q<Record<string, number>>(sql)[0];
}

// ── 1. counts ─────────────────────────────────────────────────────────
const actual = countRows();
const countLines: string[] = [];
let countsOk = true;
for (const [t, expected] of Object.entries(report.expectedRows)) {
  const got = actual[t] ?? 0;
  // After go-live the tables grow, so by default the check is "nothing imported
  // is missing"; --strict demands exact equality (right after a fresh import).
  const exact = argv.includes("--strict") && !["positions", "migration_conflicts", "migration_source_map"].includes(t);
  const ok = exact ? got === expected : got >= expected;
  if (!ok) countsOk = false;
  countLines.push(`| ${t} | ${expected} | ${got} | ${ok ? "yes" : "**no**"} |`);
}
check(argv.includes("--strict") ? "Row counts equal the transform" : "No imported rows missing", countsOk, `${Object.keys(report.expectedRows).length} tables compared`);
void PK;

// ── 2. integrity ──────────────────────────────────────────────────────
const fk = q("PRAGMA foreign_key_check");
check("Foreign keys", fk.length === 0, fk.length ? `${fk.length} violations: ${JSON.stringify(fk.slice(0, 5))}` : "no violations");
const current = q<{ n: number }>("SELECT COUNT(*) AS n FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL")[0].n;
check("Exactly one current committee", current === 1, `${current} current`);
const dupSlugs = q("SELECT slug FROM events GROUP BY slug HAVING COUNT(*) > 1");
check("Event slugs unique", dupSlugs.length === 0, dupSlugs.length ? JSON.stringify(dupSlugs) : "unique");
const dupSid = q("SELECT student_id FROM profiles WHERE student_id IS NOT NULL GROUP BY student_id HAVING COUNT(*) > 1");
check("Student IDs unique across profiles", dupSid.length === 0, dupSid.length ? JSON.stringify(dupSid) : "unique");
const dupAssign = q(`SELECT committee_id, profile_id, position_id, IFNULL(unit_key,'') u FROM committee_members WHERE deleted_at IS NULL
  GROUP BY committee_id, profile_id, position_id, u HAVING COUNT(*) > 1`);
check("No duplicate active executive assignments", dupAssign.length === 0, dupAssign.length ? `${dupAssign.length} duplicates` : "none");
const noBanner = q<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE banner_media_id IS NULL AND deleted_at IS NULL")[0].n;
check("Every event has a banner", noBanner === 0, `${noBanner} without banner`, true);
const noTitle = q<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE (title = '' OR start_at IS NULL) AND status = 'PUBLISHED'")[0].n;
check("Published events have title and date", noTitle === 0, `${noTitle} incomplete`);

// Static media must exist on disk until moved to R2; R2 media must have a key.
const staticMedia = q<{ legacy_path: string }>("SELECT legacy_path FROM media WHERE storage = 'STATIC' AND deleted_at IS NULL");
const missingFiles = staticMedia.filter((m) => !existsSync(path.join(ROOT, "public", m.legacy_path)));
check("STATIC media files exist in public/", missingFiles.length === 0, missingFiles.length ? missingFiles.map((m) => m.legacy_path).join(", ") : `${staticMedia.length} files present`);
const r2NoKey = q<{ n: number }>("SELECT COUNT(*) AS n FROM media WHERE storage = 'R2' AND object_key IS NULL")[0].n;
check("R2 media have object keys", r2NoKey === 0, `${r2NoKey} missing`);
const orphanMedia = q<{ n: number }>(`SELECT COUNT(*) AS n FROM media m WHERE m.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.avatar_media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM committee_members c WHERE c.avatar_media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.banner_media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM event_media em WHERE em.media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM contest_media cm WHERE cm.media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM posts po WHERE po.featured_media_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM media_references r WHERE r.media_id = m.id)`)[0].n;
check("Unreferenced media (informational)", true, `${orphanMedia} media rows not referenced by any record (sponsor/partner logos are referenced from settings JSON, unused portraits are listed in the migration report)`);

// ── 3. source map ─────────────────────────────────────────────────────
const mapTables = q<{ target_table: string }>("SELECT DISTINCT target_table FROM migration_source_map").map((r) => r.target_table);
let dangling = 0;
for (const t of mapTables) {
  const key = t === "organization_settings" ? "key" : "id";
  dangling += q<{ n: number }>(`SELECT COUNT(*) AS n FROM migration_source_map s WHERE s.target_table = '${t}'
    AND NOT EXISTS (SELECT 1 FROM ${t} x WHERE x.${key} = s.target_id)`)[0].n;
}
check("Every source record maps to an existing row", dangling === 0, `${dangling} dangling of ${actual.migration_source_map ?? "?"} entries`);

// ── 4. content equality ───────────────────────────────────────────────
interface Diff {
  where: string;
  field: string;
  expected: unknown;
  actual: unknown;
  category: string;
}
const allowed: Diff[] = [];
const unexpected: Diff[] = [];

const conflictFields = new Map<string, Set<string>>();
const sharedSid = new Set<string>();
for (const i of report.issues) {
  if (i.entity !== "profiles" || i.kind !== "CONFLICT") continue;
  const field = String(i.detail.field);
  if (field === "student_id_shared") sharedSid.add(i.key.replace(/^sid:/, ""));
  const set = conflictFields.get(i.key) ?? new Set();
  set.add(field);
  conflictFields.set(i.key, set);
}

const PRIVATE = new Set(["contact", "phone", "whatsapp"]);
const PROFILE_LEVEL: Record<string, string> = { linkedin: "linkedin_url", github: "github_url", twitter: "twitter_url", facebook: "facebook_url", mail: "public_email", department: "department" };
const eqJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Whitespace trimmed, or an empty value omitted: renders identically. */
function benign(where: string, field: string, e: unknown, a: unknown): boolean {
  if (typeof e === "string" && e.trim() === "" && (a === undefined || a === null)) {
    allowed.push({ where, field, expected: e, actual: a, category: "empty value omitted" });
    return true;
  }
  if (typeof e === "string" && typeof a === "string" && e.trim() === a) {
    allowed.push({ where, field, expected: e, actual: a, category: "surrounding whitespace trimmed" });
    return true;
  }
  if (typeof e === "string" && /_?(github|linkedin|facebook|twitter)$/.test(field) && /^https?:\/\/(www\.|m\.)?[a-z0-9.-]+\.[a-z]+\/?$/i.test(e) && a === undefined) {
    allowed.push({ where, field, expected: e, actual: a, category: "placeholder link (bare domain) dropped" });
    return true;
  }
  return false;
}

// Legacy /public paths → where each file is served now (itself while STATIC, /media/… once in R2).
const mediaRows = q<{ id: string; storage: "R2" | "STATIC" | "EXTERNAL"; object_key: string | null; legacy_path: string | null; external_url: string | null; variants_json: string | null }>(
  "SELECT id, storage, object_key, legacy_path, external_url, variants_json FROM media WHERE deleted_at IS NULL AND legacy_path IS NOT NULL");
const servedAt = new Map(mediaRows.map((m) => [m.legacy_path!.toLowerCase(), mediaUrl(m)!]));
const nowServed = (legacy: string | undefined) => (legacy ? servedAt.get(legacy.toLowerCase()) ?? legacy : undefined);

const committees = q<CommitteeRow>(COMMITTEES_SQL);
const members = q<MemberRow>(MEMBERS_SQL);
const sourceExec = readJson<Json[]>("data/executives.json");
let execCompared = 0;

function compareMember(where: string, src: Json, got: Json | undefined) {
  if (!got) {
    unexpected.push({ where, field: "(record)", expected: src.name, actual: undefined, category: "missing" });
    return;
  }
  execCompared++;
  const sid = typeof src.studentId === "string" && /^\d{9}$/.test(src.studentId) ? src.studentId : undefined;
  const profileKey = sid ? `sid:${sid}` : undefined;
  for (const key of new Set([...Object.keys(src), ...Object.keys(got)])) {
    const e = src[key];
    const a = got[key];
    if (PRIVATE.has(key)) {
      if (a !== undefined) unexpected.push({ where, field: key, expected: "(private)", actual: "(exposed!)", category: "private field exposed" });
      else if (e !== undefined) allowed.push({ where, field: key, expected: "(private)", actual: undefined, category: "private field removed from public output" });
      continue;
    }
    if (key === "studentId") {
      if (eqJson(e, a)) continue;
      if (!sid && a === undefined) allowed.push({ where, field: key, expected: e, actual: a, category: "placeholder student ID dropped (was a broken profile link)" });
      else if (sid && a === undefined && sharedSid.has(sid)) allowed.push({ where, field: key, expected: e, actual: a, category: "shared student ID held back pending review" });
      else unexpected.push({ where, field: key, expected: e, actual: a, category: "student ID changed" });
      continue;
    }
    if (key === "avatarUrl") {
      const expectedPath = typeof e === "string" ? e : undefined;
      const legacy = expectedPath && !/^https?:/.test(expectedPath) ? `/executives/${expectedPath.replace(/^\/?(executives\/)?/, "")}` : expectedPath;
      if (expectedPath && typeof a === "string" && (a === expectedPath || a === nowServed(legacy))) {
        if (a !== expectedPath) allowed.push({ where, field: key, expected: e, actual: a, category: a.startsWith("/media/") ? "portrait now served from R2" : "avatar path normalized to the actual file" });
        continue;
      }
      if (!expectedPath && typeof a === "string") {
        allowed.push({ where, field: key, expected: e, actual: a, category: "portrait resolved (student-ID file or profile photo)" });
        continue;
      }
      if (expectedPath && /^https?:/.test(expectedPath) && a === expectedPath) continue;
      unexpected.push({ where, field: key, expected: e, actual: a, category: "avatar differs" });
      continue;
    }
    if (eqJson(e, a)) continue;
    if (benign(where, key, e, a)) continue;
    if (key in PROFILE_LEVEL) {
      const recorded = profileKey && conflictFields.get(profileKey)?.has(PROFILE_LEVEL[key]);
      const faculty = !sid;
      if (recorded || (faculty && e === undefined) || (e === undefined && a !== undefined)) {
        allowed.push({ where, field: key, expected: e, actual: a, category: "person-level value unified across years (recorded conflict or filled from another year)" });
        continue;
      }
    }
    unexpected.push({ where, field: key, expected: e, actual: a, category: "value differs" });
  }
}

for (const src of sourceExec) {
  const year = String(src.year);
  const row = committees.find((c) => c.slug === year);
  if (!row) {
    unexpected.push({ where: year, field: "(committee)", expected: year, actual: undefined, category: "missing" });
    continue;
  }
  const got = buildCommittee(row, members) as Json;
  const srcKeys = Object.keys(src);
  const gotKeys = Object.keys(got);
  if (!eqJson(srcKeys, gotKeys)) unexpected.push({ where: year, field: "(section order)", expected: srcKeys, actual: gotKeys, category: "structure" });
  const lists = (obj: Json, prefix: string): Array<[string, Json[]]> => {
    const out: Array<[string, Json[]]> = [];
    for (const s of ["facultyMembers", "studentExecutives"]) if (Array.isArray(obj[s])) out.push([`${prefix}${s}`, obj[s] as Json[]]);
    for (const g of ["campuses", "wings"]) {
      for (const [k, unit] of Object.entries((obj[g] as Record<string, Json>) ?? {})) {
        for (const [mk, mv] of Object.entries(unit)) {
          if (mk !== "facultyMembers" && mk !== "studentExecutives" && !eqJson(mv, (((got[g] as Record<string, Json>) ?? {})[k] ?? {})[mk])) {
            unexpected.push({ where: `${year}/${g}.${k}`, field: mk, expected: mv, actual: undefined, category: "unit metadata" });
          }
        }
        out.push(...lists(unit, `${g}.${k}.`));
      }
    }
    return out;
  };
  const gotLists = new Map(lists(got, ""));
  for (const [key, list] of lists(src, "")) {
    const other = gotLists.get(key) ?? [];
    if (other.length !== list.length) unexpected.push({ where: `${year}/${key}`, field: "(length)", expected: list.length, actual: other.length, category: "structure" });
    list.forEach((m, i) => compareMember(`${year}/${key}[${i}] ${String(m.name)}`, m, other[i]));
  }
}
check("Committees rebuilt from D1 match executives.json", unexpected.filter((d) => !d.where.startsWith("event") && !d.where.startsWith("contest")).length === 0,
  `${execCompared} listings compared across ${sourceExec.length} committees`);

// Events
const events = q<EventRow>(EVENTS_SQL).map((r) => buildEvent(r));
const sourceEvents = readJson<Json[]>("data/events.json");
const used = new Set<string>();
let eventsCompared = 0;
const eventUnexpectedBefore = unexpected.length;
for (const src of sourceEvents) {
  let slug = legacyEventSlug(String(src.name));
  if (used.has(slug)) {
    let n = 2;
    while (used.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  used.add(slug);
  const got = events.find((e) => e.slug === slug) as unknown as Json | undefined;
  const where = `event ${slug}`;
  if (!got) {
    unexpected.push({ where, field: "(record)", expected: src.name, actual: undefined, category: "missing" });
    continue;
  }
  eventsCompared++;
  for (const key of Object.keys(src)) {
    const e = src[key];
    const a = key === "name" ? got.name : got[key];
    if (eqJson(e, a)) continue;
    if (benign(where, key, e, a)) continue;
    if (key === "endDate" && e === src.date && a === undefined) {
      allowed.push({ where, field: key, expected: e, actual: a, category: "end date equal to start date omitted" });
      continue;
    }
    unexpected.push({ where, field: key, expected: e, actual: a, category: "value differs" });
  }
  const legacyCover = `/events/${String(src.sl)}.jpg`;
  const image = String(got.image);
  if (image !== legacyCover && image.startsWith("/media/")) {
    const expectedNow = nowServed(legacyCover);
    const sameObject = expectedNow && image.replace(/\/(thumb|sm|md|lg|master)\.webp$/, "") === expectedNow.replace(/\/(thumb|sm|md|lg|master)\.webp$/, "");
    if (sameObject) allowed.push({ where, field: "image", expected: legacyCover, actual: image, category: "event cover now served from R2" });
    else unexpected.push({ where, field: "image", expected: expectedNow, actual: image, category: "banner" });
  } else if (image !== legacyCover) unexpected.push({ where, field: "image", expected: `/events/${String(src.sl)}.jpg`, actual: got.image, category: "banner" });
}
check("Events rebuilt from D1 match events.json", unexpected.length === eventUnexpectedBefore, `${eventsCompared} of ${sourceEvents.length} events compared`);

// Contests
const contestRows = q<ContestRow>(CONTESTS_SQL);
const teams = q<ContestTeamRow>(CONTEST_TEAMS_SQL);
const images = q<Json>(CONTEST_IMAGES_SQL);
const sourceContests = readJson<{ contests: Json[] }>("data/contests.json").contests;
const contestUnexpectedBefore = unexpected.length;
for (const src of sourceContests) {
  const row = contestRows.find((c) => c.legacy_id === src.id);
  const where = `contest ${String(src.id)}`;
  if (!row) {
    unexpected.push({ where, field: "(record)", expected: src.title, actual: undefined, category: "missing" });
    continue;
  }
  const imgs = images.filter((i) => i.contest_id === row.id).map((i) => mediaUrl(i as never) as string);
  const got = buildContest(row, teams, imgs) as unknown as Json;
  for (const key of Object.keys(src)) {
    const e = src[key];
    const a = got[key];
    if (eqJson(e, a)) continue;
    if (benign(where, key, e, a)) continue;
    if (key === "images" && Array.isArray(e) && Array.isArray(a) && e.length === a.length && e.every((img, i) => a[i] === nowServed(String(img)))) {
      allowed.push({ where, field: key, expected: e, actual: a, category: "contest image now served from R2" });
      continue;
    }
    if (key === "teams") {
      const norm = (list: Json[]) => list.map((t) => ({ name: t.name, members: t.members, rank: t.rank ?? null, achievement: t.achievement ?? "", ...(t.solved !== undefined ? { solved: t.solved } : {}) }));
      if (eqJson(norm(e as Json[]), norm(a as Json[]))) continue;
    }
    unexpected.push({ where, field: key, expected: e, actual: a, category: "value differs" });
  }
}
check("Contests rebuilt from D1 match contests.json", unexpected.length === contestUnexpectedBefore, `${sourceContests.length} contests compared`);

// Forms, certificates, settings
const forms = q<{ slug: string; title: string; url: string }>("SELECT slug, title, url FROM external_forms WHERE deleted_at IS NULL ORDER BY slug");
const srcForms = readJson<Array<{ slug: string; title: string; url: string }>>("data/forms.json");
const formsOk = srcForms.every((f) => forms.some((g) => g.slug === f.slug && g.title === f.title && g.url === f.url));
check("Forms match forms.json", formsOk && forms.length === srcForms.length, `${forms.length} of ${srcForms.length}`);
const settings = q<{ key: string; value_json: string }>("SELECT key, value_json FROM organization_settings");
const setting = (k: string) => JSON.parse(settings.find((s) => s.key === k)?.value_json ?? "null");
check("Sponsorship page content matches sponsors.json", eqJson(setting("page.sponsorship"), readJson("data/sponsors.json")), "deep-equal");
check("Chatbot knowledge matches predefined.json", eqJson(setting("chatbot.knowledge"), readJson("data/predefined.json")), "deep-equal");
check("Partner clubs match the hard-coded list", eqJson(setting("page.collaborations")?.partners, readJson<{ partners: unknown[] }>("migration/sources/legacy-collaborators.json").partners), "deep-equal");
const recipients = q<{ n: number }>("SELECT COUNT(*) AS n FROM certificate_recipients")[0].n;
check("Certificate recipients imported", recipients === report.expectedRows.certificate_recipients, `${recipients}`);
const exposedPhones = q<{ n: number }>("SELECT COUNT(*) AS n FROM committee_members WHERE position_title LIKE '%@%'")[0].n;
check("No private data in public columns", exposedPhones === 0, "public builders select no private columns; verified above per record");

// ── 4b. live checks (optional) ────────────────────────────────────────
// --media-url: the API Worker (serves /media/*); --site-url: the website (serves the pages).
const argUrl = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1]?.replace(/\/+$/, "") : undefined);
const mediaBase = argUrl("--media-url");
const siteBase = argUrl("--site-url");
if (mediaBase) {
  const r2 = mediaRows.filter((m) => m.storage === "R2");
  const sample = r2.filter((_, i) => i % Math.max(1, Math.floor(r2.length / 25)) === 0).slice(0, 25);
  const bad: string[] = [];
  for (const m of sample) {
    const res = await fetch(`${mediaBase}${mediaUrl(m)}`);
    if (res.status !== 200 || !(res.headers.get("content-type") ?? "").startsWith("image/")) bad.push(`${mediaUrl(m)} → ${res.status}`);
  }
  check("Migrated media served from R2", bad.length === 0, bad.length ? bad.slice(0, 5).join(", ") : `${sample.length} sampled objects returned images`);
}
if (siteBase) {
  const bad: string[] = [];
  const pages = ["/", "/executives", ...committees.map((c) => `/executives/${c.slug}`), "/events", "/contests", "/blog", "/sponsors", "/sitemap.xml"];
  for (const p of pages) {
    const res = await fetch(`${siteBase}${p}`);
    if (res.status !== 200) bad.push(`${p} → ${res.status}`);
  }
  check("Public pages respond", bad.length === 0, bad.length ? bad.join(", ") : `${pages.length} pages returned 200`);
}

// ── 5. idempotency ────────────────────────────────────────────────────
if (argv.includes("--idempotency")) {
  if (target !== "local") {
    check("Idempotent re-import", true, "skipped: only run against local", true);
  } else {
    const before = countRows();
    const ok = d1ExecuteFile("local", path.join(ROOT, "migration/out/import-local.sql"));
    const after = countRows();
    const changed = Object.keys(before).filter((t) => before[t] !== after[t] && t !== "migration_runs");
    check("Idempotent re-import", ok && changed.length === 0, changed.length ? `changed: ${changed.join(", ")}` : "second import changed no row counts");
  }
}

// ── report ────────────────────────────────────────────────────────────
const failed = checks.filter((c) => c.status === "FAIL");
const byCategory = (list: Diff[]) => {
  const m = new Map<string, number>();
  for (const d of list) m.set(d.category, (m.get(d.category) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const md = [
  "# Migration verification report",
  "",
  `Target **${target}** · ${new Date().toISOString()} · migration run \`${report.runId}\``,
  "",
  `**Result: ${failed.length === 0 ? "PASSED" : `FAILED (${failed.length} check${failed.length === 1 ? "" : "s"})`}**`,
  "",
  "| Check | Result | Detail |",
  "| --- | --- | --- |",
  ...checks.map((c) => `| ${c.name} | ${c.status} | ${c.detail.replace(/\|/g, "\\|")} |`),
  "",
  "## Row counts",
  "",
  "| Table | Expected | Actual | OK |",
  "| --- | --- | --- | --- |",
  ...countLines,
  "",
  `## Intended differences (${allowed.length})`,
  "",
  "Rebuilt content differs from the legacy JSON only in these ways, each deliberate:",
  "",
  ...byCategory(allowed).map(([c, n]) => `- ${c}: ${n}`),
  "",
  `## Unexpected differences (${unexpected.length})`,
  "",
  ...(unexpected.length ? unexpected.slice(0, 200).map((d) => `- ${d.where} · \`${d.field}\`: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.actual)} (${d.category})`) : ["None."]),
  "",
];
writeFileSync(path.join(ROOT, "migration/reports/VERIFICATION_REPORT.md"), md.join("\n"));
writeFileSync(path.join(ROOT, "migration/reports/verification-report.json"), JSON.stringify({ target, checks, allowed: byCategory(allowed), unexpected }, null, 2));
for (const c of checks) console.log(`${c.status.padEnd(4)}  ${c.name} — ${c.detail}`);
console.log(`\nIntended differences: ${allowed.length}. Unexpected differences: ${unexpected.length}.`);
console.log(failed.length === 0 ? "VERIFICATION PASSED" : "VERIFICATION FAILED");
process.exit(failed.length === 0 ? 0 : 1);
