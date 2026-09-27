/**
 * Parse an executives file (JSON or CSV) into flat rows. Pure: no database, so the
 * preview, the import and the tests all read files exactly the same way.
 *
 * Accepted JSON shapes (detected automatically):
 *   1. a list of people:            [{ "name": …, "studentId": …, "position": …, "committee": "2026" }]
 *   2. one committee with people:   { "committee": "2026", "executives": [ … ] }   (also "members", "people", "data")
 *   3. GUCC's executives.json:      [{ "year": "2026", "facultyMembers": […], "studentExecutives": […],
 *                                      "campuses": { "gucc": { … } }, "wings": { "vgs": { … } } }]  (or one such object)
 * Field names are matched loosely ("Student ID", "student_id" and "studentId" are the same).
 * CSV needs a header row with the same field names.
 */

export type ImportFormat = "json" | "csv";

export interface ParsedRow {
  /** 1-based: the item number in a JSON list, or the spreadsheet row in a CSV (header = row 1). */
  row: number;
  name: string | null;
  studentId: string | null;
  position: string | null;
  committee: string | null;
  section: "STUDENT" | "FACULTY" | null;
  unit: string | null;
  unitType: "CAMPUS" | "WING" | null;
  designation: string | null;
  email: string | null;
  bio: string | null;
  photo: string | null;
  linkedin: string | null;
  github: string | null;
  facebook: string | null;
  twitter: string | null;
  website: string | null;
  displayOrder: number | null;
  startDate: string | null;
  endDate: string | null;
  crop: { x: number; y: number; scale: number } | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Problems that stop the whole file from being read. */
  errors: string[];
  /** Which shape was recognised, for the preview. */
  shape: string;
}

export const MAX_IMPORT_ROWS = 500;

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_ALIASES: Record<Exclude<keyof ParsedRow, "row" | "crop">, string[]> = {
  name: ["name", "fullname", "executivename", "personname", "membername"],
  studentId: ["studentid", "sid", "id", "studentno", "studentnumber", "roll", "rollno"],
  position: ["position", "title", "role", "post", "positiontitle"],
  committee: ["committee", "year", "term", "session", "committeeyear"],
  section: ["section", "type", "group", "kind", "persontype"],
  unit: ["unit", "campus", "wing", "branch"],
  unitType: ["unittype"],
  designation: ["designation", "facultytitle", "academicrank"],
  email: ["email", "mail", "emailaddress"],
  bio: ["bio", "about", "biography"],
  photo: ["photo", "image", "avatar", "avatarurl", "picture", "photourl", "imageurl", "portrait"],
  linkedin: ["linkedin", "linkedinurl"],
  github: ["github", "githuburl"],
  facebook: ["facebook", "facebookurl", "fb"],
  twitter: ["twitter", "x", "twitterurl"],
  website: ["website", "profileurl", "url", "portfolio", "homepage", "web"],
  displayOrder: ["order", "displayorder", "sortorder", "serial", "sl"],
  startDate: ["startdate", "start", "from", "joined"],
  endDate: ["enddate", "end", "to", "until"],
};

const LOOKUP = new Map<string, keyof typeof FIELD_ALIASES>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) for (const a of aliases) LOOKUP.set(a, field as keyof typeof FIELD_ALIASES);

const COMMITTEE_KEYS = ["facultyMembers", "studentExecutives", "campuses", "wings"];
const LIST_KEYS = ["executives", "members", "people", "data", "items", "rows"];

interface Context {
  committee?: string | null;
  section?: "STUDENT" | "FACULTY" | null;
  unit?: string | null;
  unitType?: "CAMPUS" | "WING" | null;
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

function sectionOf(v: unknown): "STUDENT" | "FACULTY" | null {
  const t = text(v)?.toLowerCase();
  if (!t) return null;
  if (/faculty|advis|teacher|moderator|mentor/.test(t)) return "FACULTY";
  if (/student|executive/.test(t)) return "STUDENT";
  return null;
}

function toRow(record: Record<string, unknown>, row: number, ctx: Context): ParsedRow {
  const out: ParsedRow = {
    row, name: null, studentId: null, position: null, committee: ctx.committee ?? null, section: ctx.section ?? null, unit: ctx.unit ?? null,
    unitType: ctx.unitType ?? null, designation: null, email: null, bio: null, photo: null, linkedin: null, github: null, facebook: null,
    twitter: null, website: null, displayOrder: null, startDate: null, endDate: null, crop: null,
  };
  for (const [key, value] of Object.entries(record)) {
    const field = LOOKUP.get(norm(key));
    if (!field) continue;
    if (field === "section") {
      out.section = sectionOf(value) ?? out.section;
    } else if (field === "unitType") {
      const t = text(value)?.toUpperCase();
      out.unitType = t === "WING" ? "WING" : t === "CAMPUS" ? "CAMPUS" : out.unitType;
    } else if (field === "displayOrder") {
      const n = typeof value === "number" ? value : Number(text(value));
      out.displayOrder = Number.isInteger(n) && n >= 0 ? n : null;
    } else if (field === "email") {
      out.email = text(value)?.replace(/^mailto:+/i, "").toLowerCase() ?? null;
    } else {
      const t = text(value);
      if (t !== null || out[field] === null) out[field] = t as never;
    }
  }
  // Portrait framing as GUCC's executives.json stores it.
  const pos = record.avatarPosition as { x?: unknown; y?: unknown } | undefined;
  if (pos && typeof pos === "object" && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
    const scale = Number(record.avatarScale ?? 1);
    out.crop = { x: Number(pos.x), y: Number(pos.y), scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const looksLikeCommittee = (o: Record<string, unknown>) => COMMITTEE_KEYS.some((k) => k in o);

/** Flatten a GUCC committee object (year + faculty/student lists, campuses, wings). */
function committeeRows(o: Record<string, unknown>, base: Context, next: () => number): ParsedRow[] {
  const committee = text(o.year) ?? text(o.committee) ?? text(o.term) ?? base.committee ?? null;
  const rows: ParsedRow[] = [];
  const lists = (holder: Record<string, unknown>, ctx: Context) => {
    for (const [key, section] of [["facultyMembers", "FACULTY"], ["studentExecutives", "STUDENT"]] as const) {
      const list = holder[key];
      if (Array.isArray(list)) for (const item of list) if (isRecord(item)) rows.push(toRow(item, next(), { ...ctx, section }));
    }
  };
  lists(o, { committee });
  for (const [key, unitType] of [["campuses", "CAMPUS"], ["wings", "WING"]] as const) {
    const units = o[key];
    if (isRecord(units)) for (const [unit, holder] of Object.entries(units)) if (isRecord(holder)) lists(holder, { committee, unit, unitType });
  }
  return rows;
}

export function parseJson(textIn: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(textIn);
  } catch (e) {
    return { rows: [], errors: [`The file isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`], shape: "invalid" };
  }
  let n = 0;
  const next = () => ++n;
  const rows: ParsedRow[] = [];
  let shape = "unrecognised";
  if (Array.isArray(data)) {
    if (data.length && data.every((x) => isRecord(x) && looksLikeCommittee(x))) {
      shape = `GUCC committees (${data.length})`;
      for (const c of data as Record<string, unknown>[]) rows.push(...committeeRows(c, {}, next));
    } else {
      shape = "list of people";
      for (const item of data) {
        if (isRecord(item)) rows.push(toRow(item, next(), {}));
        else next();
      }
    }
  } else if (isRecord(data)) {
    if (looksLikeCommittee(data)) {
      shape = "GUCC committee";
      rows.push(...committeeRows(data, {}, next));
    } else {
      const key = LIST_KEYS.find((k) => Array.isArray(data[k]));
      if (key) {
        shape = `committee with a "${key}" list`;
        const committee = text(data.committee) ?? text(data.year) ?? text(data.term);
        for (const item of data[key] as unknown[]) {
          if (!isRecord(item)) next();
          else if (looksLikeCommittee(item)) rows.push(...committeeRows(item, { committee }, next));
          else rows.push(toRow(item, next(), { committee }));
        }
      } else if ("name" in data) {
        shape = "one person";
        rows.push(toRow(data, next(), {}));
      }
    }
  }
  const errors: string[] = [];
  if (!rows.length) errors.push("No executives found. Use a list of people, or GUCC's executives.json format (see the example file).");
  if (rows.length > MAX_IMPORT_ROWS) errors.push(`The file has ${rows.length} people; import at most ${MAX_IMPORT_ROWS} at a time.`);
  return { rows, errors, shape };
}

/** RFC 4180 CSV: quoted fields may contain commas, quotes ("") and line breaks. */
export function csvRecords(input: string): Array<{ cells: string[]; line: number }> {
  const out: Array<{ cells: string[]; line: number }> = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const s = input.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((x) => x.trim() !== "")) out.push({ cells, line: start });
      cells = [];
      cell = "";
      line++;
      start = line;
    } else cell += c;
  }
  cells.push(cell);
  if (cells.some((x) => x.trim() !== "")) out.push({ cells, line: start });
  return out;
}

export function parseCsv(input: string): ParseResult {
  const records = csvRecords(input);
  if (records.length < 2) return { rows: [], errors: ["The CSV needs a header row and at least one person."], shape: "invalid" };
  const header = records[0].cells.map((h) => h.trim());
  if (!header.some((h) => LOOKUP.get(norm(h)) === "name")) return { rows: [], errors: ['The CSV header needs a "name" column (see the example file).'], shape: "invalid" };
  const rows = records.slice(1).map(({ cells, line }) => toRow(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])), line, {}));
  const errors = rows.length > MAX_IMPORT_ROWS ? [`The file has ${rows.length} people; import at most ${MAX_IMPORT_ROWS} at a time.`] : [];
  return { rows, errors, shape: `CSV with ${header.length} columns` };
}

export function parseExecutivesFile(input: string, format: ImportFormat): ParseResult {
  if (!input.trim()) return { rows: [], errors: ["The file is empty."], shape: "empty" };
  return format === "csv" ? parseCsv(input) : parseJson(input);
}

/** Guess the format from a file name or the content itself. */
export function detectFormat(fileName: string | null, content: string): ImportFormat {
  if (fileName && /\.csv$/i.test(fileName)) return "csv";
  if (fileName && /\.json$/i.test(fileName)) return "json";
  return /^\s*[[{]/.test(content) ? "json" : "csv";
}
