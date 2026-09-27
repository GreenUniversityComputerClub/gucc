/**
 * Position names are always written out for people ("General Secretary", never "GS"), in the
 * interface and in everything the database shows them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorld } from "../support/d1";

const ABBREVIATION = /\bGS\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mdx?)$/.test(f) ? [p] : [];
  });
}

describe("no abbreviated position names", () => {
  it("in pages and components", () => {
    const hits = [...files("app"), ...files("components")].filter((f) => ABBREVIATION.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("in anything seeded into the database", async () => {
    const w = await createWorld();
    const tables: Array<[string, string]> = [
      ["rules", "name || ' ' || COALESCE(description, '')"], ["approval_policies", "name || ' ' || COALESCE(description, '')"],
      ["roles", "name || ' ' || COALESCE(description, '')"], ["permissions", "description"], ["positions", "name || ' ' || COALESCE(aliases_json, '')"],
      ["system_settings", "COALESCE(description, '') || ' ' || value_json"], ["organization_settings", "COALESCE(description, '') || ' ' || value_json"],
    ];
    for (const [table, text] of tables) {
      const rows = w.sqlite.prepare(`SELECT ${text} AS t FROM ${table}`).all() as Array<{ t: string }>;
      expect(rows.filter((r) => ABBREVIATION.test(r.t)).map((r) => `${table}: ${r.t}`)).toEqual([]);
    }
  });
});
