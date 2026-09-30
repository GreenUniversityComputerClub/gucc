/**
 * Executive types and pure helpers. Safe for client components: no data and
 * no server imports live here (the data comes from D1 via ./util).
 */

export interface Executive {
  position: string;
  name: string;
  studentId?: string;
  designation?: string;
  department?: string;
  campus?: string;
  avatarUrl?: string;
  /** The profile photo with its background removed (transparent), for the list's cards. */
  cutoutUrl?: string;
  avatarPosition?: { x: number; y: number };
  avatarScale?: number;
  linkedin?: string;
  github?: string;
  twitter?: string | null;
  facebook?: string | null;
  mail?: string;
  /** Their member page (/members/<handle>), when they made it public. */
  profileHandle?: string;
}

export interface ExecutiveYear {
  year: string;
  facultyMembers: Executive[];
  studentExecutives: Executive[];
}

export interface ExecutiveWithYear extends Executive {
  year: string;
  campus?: string;
}

export interface YearRoster {
  year: string;
  facultyMembers: ExecutiveWithYear[];
  studentExecutives: ExecutiveWithYear[];
}

export function isStudentId(param: string): boolean {
  return /^\d{9}$/.test(param);
}

/** Portrait URL exactly as the database has it: an R2 object (or, for one legacy file, its site path). */
export function getExecutiveAvatar(executive: Partial<Pick<Executive, "avatarUrl" | "studentId" | "name">>): string | undefined {
  return executive.avatarUrl || undefined;
}

export function getPrimaryRole(executives: ExecutiveWithYear[]): ExecutiveWithYear {
  return [...executives].sort((a, b) => Number.parseInt(b.year) - Number.parseInt(a.year))[0];
}

export function groupExecutivesByCategory(executives: Executive[]) {
  const has = (exec: Executive, titles: string[]) => titles.some((t) => exec.position.includes(t));
  return {
    moderator: executives.filter((e) => has(e, ["Moderator", "Deputy Moderator"])),
    president: executives.filter((e) => has(e, ["President"])),
    general: executives.filter((e) => has(e, ["General Secretary"])),
    treasurer: executives.filter((e) => has(e, ["Treasurer", "Joint Treasurer"])),
    information: executives.filter((e) => has(e, ["Information Secretary"])),
    technical: executives.filter((e) => has(e, ["Programming", "Technical", "Development"])),
    cultural: executives.filter((e) => has(e, ["Cultural", "Graphics", "Media", "Photography", "Sports", "Executive Member"])),
  };
}
