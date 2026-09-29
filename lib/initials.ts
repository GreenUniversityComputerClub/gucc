/** Titles that aren't part of a name's initials ("Md. Monirul Islam" → "MI"). */
const TITLES = new Set(["mr", "mrs", "ms", "md", "dr", "prof", "engr"]);

/** Up to two initials for a photo placeholder: "Nadia Rahman" → "NR", "" → "?". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return letters || "?";
}
