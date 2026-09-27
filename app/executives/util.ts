import "server-only";
import { getCommittees, getCurrentCommitteeSlug } from "@/lib/public/data";
import type { PublicCommittee } from "@/lib/public/shapes";
import { isStudentId, type Executive, type ExecutiveWithYear, type YearRoster } from "./shared";

/*
 * Executive data, read from D1 (committees + committee_members + profiles).
 * The functions keep the names and shapes the pages were written against —
 * they used to read data/executives.json — so the UI is unchanged. They are
 * async now because the source is the database.
 */

export * from "./shared";

type Units = Record<string, { facultyMembers?: Executive[]; studentExecutives?: Executive[] }>;

export async function getExecutivesByYear(year: string): Promise<PublicCommittee | undefined> {
  return (await getCommittees()).find((c) => c.year === year);
}

export async function getAvailableYears(): Promise<string[]> {
  return (await getCommittees()).map((c) => c.year);
}

function rosterOf(c: PublicCommittee): YearRoster {
  const faculty: ExecutiveWithYear[] = [];
  const students: ExecutiveWithYear[] = [];
  const add = (list: Executive[] | undefined, into: ExecutiveWithYear[], campus?: string) =>
    (list ?? []).forEach((p) => into.push({ ...p, year: c.year, campus: p.campus ?? campus }));
  add(c.facultyMembers as Executive[], faculty);
  add(c.studentExecutives as Executive[], students);
  for (const [key, unit] of Object.entries((c.campuses as Units) ?? {})) {
    add(unit.facultyMembers, faculty, key);
    add(unit.studentExecutives, students, key);
  }
  for (const [key, unit] of Object.entries((c.wings as Units) ?? {})) {
    add(unit.facultyMembers, faculty, key.toUpperCase());
    add(unit.studentExecutives, students, key.toUpperCase());
  }
  return { year: c.year, facultyMembers: faculty, studentExecutives: students };
}

/** Every faculty member and student executive of a year, campuses merged. */
export async function getYearRoster(year: string): Promise<YearRoster | undefined> {
  const c = await getExecutivesByYear(year);
  return c ? rosterOf(c) : undefined;
}

/**
 * Every role held, grouped by student ID, built in one pass over the
 * committees. Callers that need many profiles (sitemap, section header) use
 * this instead of looking people up one at a time.
 */
export async function getRolesByStudentId(): Promise<Map<string, ExecutiveWithYear[]>> {
  const index = new Map<string, ExecutiveWithYear[]>();
  for (const c of await getCommittees()) {
    const r = rosterOf(c);
    for (const p of [...r.studentExecutives, ...r.facultyMembers]) {
      if (!p.studentId || !isStudentId(p.studentId)) continue;
      const list = index.get(p.studentId) ?? [];
      list.push(p);
      index.set(p.studentId, list);
    }
  }
  return index;
}

/** All roles a person (by student ID) has held, across every committee. */
export async function getExecutivesByStudentId(studentId: string): Promise<ExecutiveWithYear[]> {
  if (!isStudentId(studentId)) return [];
  return (await getRolesByStudentId()).get(studentId) ?? [];
}

/** The current committee's URL segment (the CURRENT committee, else the newest). */
export async function getLatestExecutiveYear(): Promise<string> {
  const current = await getCurrentCommitteeSlug();
  if (current) return current;
  const years = await getAvailableYears();
  return [...years].sort((a, b) => Number.parseInt(b) - Number.parseInt(a))[0];
}

/** Distinct student IDs across every year — one indexable profile each. */
export async function getAllExecutiveStudentIds(): Promise<string[]> {
  return [...(await getRolesByStudentId()).keys()];
}
