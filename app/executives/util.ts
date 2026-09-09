import executivesData from "../../data/executives.json";

export interface Executive {
  position: string
  name: string
  studentId?: string
  designation?: string
  contact?: string
  avatarUrl?: string
  avatarPosition?: { x: number, y: number }
  avatarScale?: number
  linkedin?: string;
  github?: string;
  twitter?: string | null;
  facebook?: string | null;
  mail?: string;
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

// Helper function to get executives for a specific year
export function getExecutivesByYear(year: string) {
  return executivesData.find((exec) => exec.year === year) ?? undefined;
}

// Helper function to get all available years
export function getAvailableYears(): string[] {
  return executivesData.map((exec) => exec.year);
}

// Helper function to check if a parameter is a 9-digit student ID
export function isStudentId(param: string): boolean {
  return /^\d{9}$/.test(param);
}

// Helper function to find executives by student ID across all years
export function getExecutivesByStudentId(studentId: string): ExecutiveWithYear[] {
  const executives: ExecutiveWithYear[] = [];
  
  for (const yearData of executivesData) {
    // Check student executives
    if (yearData.studentExecutives) {
      for (const executive of yearData.studentExecutives) {
        if (executive.studentId === studentId) {
          executives.push({
            ...executive,
            year: yearData.year
          } as ExecutiveWithYear);
        }
      }
    }
    
    // Check faculty members (though they typically don't have student IDs)
    if (yearData.facultyMembers) {
      for (const faculty of yearData.facultyMembers) {
        if ((faculty as any).studentId === studentId) {
          executives.push({
            ...faculty,
            year: yearData.year
          } as ExecutiveWithYear);
        }
      }
    }
    
    // Check campus-based structure if it exists
    if ('campuses' in yearData) {
      const campuses = yearData.campuses as any;
      for (const campusKey of Object.keys(campuses)) {
        const campus = campuses[campusKey];
        
        // Check student executives in campus
        if (campus.studentExecutives) {
          for (const executive of campus.studentExecutives) {
            if (executive.studentId === studentId) {
              executives.push({
                ...executive,
                year: yearData.year,
                campus: campusKey
              } as ExecutiveWithYear);
            }
          }
        }
        
        // Check faculty members in campus
        if (campus.facultyMembers) {
          for (const faculty of campus.facultyMembers) {
            if ((faculty as any).studentId === studentId) {
              executives.push({
                ...faculty,
                year: yearData.year,
                campus: campusKey
              } as ExecutiveWithYear);
            }
          }
        }
      }
    }
  }
  
  return executives;
}

// Helper function to group student executives by category
export function groupExecutivesByCategory(executives: Executive[]) {
  const moderator = executives.filter((exec) =>
    ["Moderator", "Deputy Moderator"].some((title) =>
      exec.position.includes(title),
    ),
  );
  const president = executives.filter((exec) =>
    ["President"].some((title) => exec.position.includes(title)),
  );

  const general = executives.filter((exec) =>
    ["General Secretary"].some((title) => exec.position.includes(title)),
  );

  const information = executives.filter((exec) =>
    ["Information Secretary"].some((title) => exec.position.includes(title)),
  );

  const technical = executives.filter((exec) =>
    ["Programming", "Technical", "Development"].some((title) =>
      exec.position.includes(title),
    ),
  );

  const treasurer = executives.filter((exec) =>
    ["Treasurer", "Joint Treasurer"].some((title) =>
      exec.position.includes(title),
    ),
  );

  const cultural = executives.filter((exec) =>
    [
      "Cultural",
      "Graphics",
      "Media",
      "Photography",
      "Sports",
      "Executive Member",
    ].some((title) => exec.position.includes(title)),
  );

  return {
    moderator,
    president,
    general,
    treasurer,
    information,
    technical,
    cultural,
  };
}

/* ------------------------------------------------------------------ *
 * Roster helpers — flatten the two shapes the dataset uses (flat years
 * and campus-split years) so SEO/metadata code has one thing to read.
 * ------------------------------------------------------------------ */

export interface YearRoster {
  year: string;
  facultyMembers: ExecutiveWithYear[];
  studentExecutives: ExecutiveWithYear[];
}

type RawYear = (typeof executivesData)[number];

function withYear(
  people: Executive[] | undefined,
  year: string,
  campus?: string
): ExecutiveWithYear[] {
  return (people ?? []).map((person) => ({ ...person, year, campus }));
}

/** Every faculty member and student executive of a year, campuses merged. */
export function getYearRoster(year: string): YearRoster | undefined {
  const yearData = executivesData.find((entry) => entry.year === year) as
    | RawYear
    | undefined;
  if (!yearData) return undefined;

  const faculty: ExecutiveWithYear[] = [];
  const students: ExecutiveWithYear[] = [];

  const flat = yearData as unknown as {
    facultyMembers?: Executive[];
    studentExecutives?: Executive[];
    campuses?: Record<
      string,
      { facultyMembers?: Executive[]; studentExecutives?: Executive[] }
    >;
  };

  faculty.push(...withYear(flat.facultyMembers, year));
  students.push(...withYear(flat.studentExecutives, year));

  for (const [campusKey, campus] of Object.entries(flat.campuses ?? {})) {
    faculty.push(...withYear(campus.facultyMembers, year, campusKey));
    students.push(...withYear(campus.studentExecutives, year, campusKey));
  }

  return { year, facultyMembers: faculty, studentExecutives: students };
}

/** The most recent committee year, e.g. "2026". */
export function getLatestExecutiveYear(): string {
  return getAvailableYears().sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  )[0];
}

/** Distinct student IDs across every year — one indexable profile each. */
export function getAllExecutiveStudentIds(): string[] {
  const ids = new Set<string>();
  for (const year of getAvailableYears()) {
    const roster = getYearRoster(year);
    for (const person of [
      ...(roster?.studentExecutives ?? []),
      ...(roster?.facultyMembers ?? []),
    ]) {
      if (person.studentId && isStudentId(person.studentId)) {
        ids.add(person.studentId);
      }
    }
  }
  return Array.from(ids);
}

/** Portrait for an executive, falling back to the student-ID convention. */
export function getExecutiveAvatar(
  executive: Pick<Executive, "avatarUrl" | "studentId">
): string | undefined {
  if (executive.avatarUrl) return executive.avatarUrl;
  if (executive.studentId && isStudentId(executive.studentId)) {
    return `/executives/${executive.studentId}.png`;
  }
  return undefined;
}

/** The most recent role held by a person, used for titles and schema. */
export function getPrimaryRole(
  executives: ExecutiveWithYear[]
): ExecutiveWithYear {
  return [...executives].sort(
    (a, b) => Number.parseInt(b.year) - Number.parseInt(a.year)
  )[0];
}
