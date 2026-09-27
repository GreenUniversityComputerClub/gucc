import type { PositionDef } from "./catalog";

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PositionMatch {
  key: string;
  via: "name" | "alias" | "pattern";
}

/**
 * Map a legacy position title onto a catalog position. Exact name first, then
 * listed aliases, then numbered-variant patterns ("Executive Member-3").
 * Returns undefined for titles with no safe match; the migration creates a
 * new position for those and lists them for review instead of guessing.
 */
export function resolvePosition(title: string, positions: Array<Pick<PositionDef, "key" | "name" | "aliases" | "aliasPattern">>): PositionMatch | undefined {
  const t = normalizeTitle(title);
  for (const p of positions) if (normalizeTitle(p.name) === t) return { key: p.key, via: "name" };
  for (const p of positions) if ((p.aliases ?? []).some((a) => normalizeTitle(a) === t)) return { key: p.key, via: "alias" };
  for (const p of positions) {
    if (p.aliasPattern && new RegExp(p.aliasPattern, "i").test(title.replace(/[–—]/g, "-").trim())) return { key: p.key, via: "pattern" };
  }
  return undefined;
}
