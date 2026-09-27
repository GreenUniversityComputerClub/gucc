/**
 * Importing recruitment applications from a spreadsheet (e.g. a Google Forms export): the fields
 * an application has, and a first guess at which column holds each. Shared by the browser (column
 * mapping) and the API (validation).
 */
export const IMPORT_FIELDS = [
  { key: "fullName", label: "Full name", required: true, aliases: ["name", "fullname", "yourname", "studentname", "applicantname"] },
  { key: "studentId", label: "Student ID", required: true, aliases: ["studentid", "id", "sid", "studentno", "roll"] },
  { key: "email", label: "Email", required: true, aliases: ["email", "emailaddress", "mail", "gmail"] },
  { key: "phone", label: "Mobile number", required: true, aliases: ["phone", "mobile", "mobilenumber", "phonenumber", "contact", "contactnumber", "whatsapp"] },
  { key: "position", label: "Position", required: true, aliases: ["position", "post", "role", "appliedfor", "desiredposition", "positionappliedfor"] },
  { key: "gender", label: "Gender", required: false, aliases: ["gender", "sex"] },
  { key: "semester", label: "Semester", required: false, aliases: ["semester", "currentsemester"] },
  { key: "batch", label: "Batch", required: false, aliases: ["batch", "intake"] },
  { key: "cgpa", label: "CGPA", required: false, aliases: ["cgpa", "gpa", "result"] },
  { key: "completedCredit", label: "Completed credits", required: false, aliases: ["completedcredit", "completedcredits", "credit", "credits", "creditcompleted"] },
  { key: "clubWork", label: "Club work / motivation", required: false, aliases: ["clubwork", "experience", "motivation", "whyjoin", "about", "previousexperience"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportRow = Partial<Record<ImportFieldKey, string>>;
export const MAX_APPLICATION_IMPORT = 500;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best guess of the column for each field (exact alias first, then "contains"). */
export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, number>> {
  const out: Partial<Record<ImportFieldKey, number>> = {};
  const used = new Set<number>();
  for (const pass of ["exact", "contains"] as const) {
    for (const f of IMPORT_FIELDS) {
      if (out[f.key] !== undefined) continue;
      const i = headers.findIndex((h, idx) => !used.has(idx) && (pass === "exact" ? (f.aliases as readonly string[]).includes(norm(h)) : f.aliases.some((a) => a.length > 3 && norm(h).includes(a))));
      if (i >= 0) {
        out[f.key] = i;
        used.add(i);
      }
    }
  }
  return out;
}

/** Apply a mapping to spreadsheet rows (arrays of cells). */
export function mapRows(rows: string[][], mapping: Partial<Record<ImportFieldKey, number>>): ImportRow[] {
  return rows.map((cells) => Object.fromEntries(Object.entries(mapping).filter(([, i]) => i !== undefined && i >= 0).map(([k, i]) => [k, String(cells[i as number] ?? "").trim()])) as ImportRow);
}
