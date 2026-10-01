/** The general "Partner with GUCC" page: migration 0016 creates it with the same content as lib/sponsorship/general.ts. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERAL_SPONSORSHIP, generalSponsorshipSql } from "@/lib/sponsorship/general";

describe("general sponsorship page", () => {
  it("is created by migration 0016 exactly as lib/sponsorship/general.ts says", () => {
    const migration = readFileSync("migrations/0016_sponsorship_pages.sql", "utf8");
    expect(migration).toContain(generalSponsorshipSql());
  });

  it("names no event and asks for a price per partner", () => {
    const text = JSON.stringify(GENERAL_SPONSORSHIP.content);
    expect(text).not.toMatch(/carnival|2026|2027/i);
    expect(GENERAL_SPONSORSHIP.content.packages.every((p) => p.price === 0 && p.period)).toBe(true);
    expect(GENERAL_SPONSORSHIP.content.packages.filter((p) => p.highlight)).toHaveLength(1);
  });
});
