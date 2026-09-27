import { describe, expect, it } from "vitest";
import { detId, detectMode, legacyEventSlug, parseGuests, parseLooseDate, parseSchedule, sameName, transformLegacy, type LegacySources } from "@/lib/migration/transform";
import { insertSql, sqlValue } from "@/lib/migration/sql";

describe("sql rendering", () => {
  it("escapes quotes and renders types", () => {
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(true)).toBe("1");
    expect(sqlValue({ a: "x'y" })).toBe(`'{"a":"x''y"}'`);
    expect(sqlValue(Number.NaN)).toBe("NULL");
  });
  it("refresh mode never overwrites human edits", () => {
    const s = insertSql("events", { id: "e1", title: "T", created_at: "now" }, { mode: "refresh" });
    expect(s).toContain("DO UPDATE SET title = excluded.title");
    expect(s).toContain("WHERE events.updated_by IS NULL");
    expect(s).not.toContain("created_at = excluded");
  });
  it("rejects unsafe identifiers", () => {
    expect(() => insertSql("events; DROP TABLE x", { id: "1" })).toThrow();
  });
});

describe("parsers", () => {
  it("keeps event URLs identical to the old slug function", () => {
    expect(legacyEventSlug("CSE Fresher's Orientation Spring 2025")).toBe("cse-freshers-orientation-spring-2025");
    expect(legacyEventSlug("GUCC Inauguration & Farewell Ceremony 2025")).toBe("gucc-inauguration--farewell-ceremony-2025");
  });
  it("parses schedules in Dhaka time and keeps unparseable ones date-only", () => {
    expect(parseSchedule("2022-01-06", null, "7:00 PM - 9:00 PM Online")).toEqual({ startAt: "2022-01-06T19:00:00+06:00", endAt: "2022-01-06T21:00:00+06:00" });
    expect(parseSchedule("2022-01-06", "2022-01-08", "Full day")).toEqual({ startAt: "2022-01-06", endAt: "2022-01-08" });
    expect(parseSchedule("2024-03-01", null, "10 AM")).toEqual({ startAt: "2024-03-01T10:00:00+06:00", endAt: null });
  });
  it("detects event mode", () => {
    expect(detectMode("Online (Zoom)", null)).toBe("ONLINE");
    expect(detectMode("Room 402, Green University", null)).toBe("OFFLINE");
    expect(detectMode("Auditorium + Facebook Live", null)).toBe("HYBRID");
    expect(detectMode(null, null)).toBeNull();
  });
  it("structures guest text", () => {
    const g = parseGuests("Chief Guest: Prof. Dr. A, Chairman, CSE\n\nSpecial Guest: Dr. B, Dean");
    expect(g).toEqual([
      { role: "CHIEF_GUEST", name: "Prof. Dr. A", title: "Chairman, CSE" },
      { role: "SPECIAL_GUEST", name: "Dr. B", title: "Dean" },
    ]);
  });
  it("parses loose contest dates", () => {
    expect(parseLooseDate("Jun 4, 2022")).toBe("2022-06-04");
    expect(parseLooseDate("2022")).toBe("2022");
    expect(parseLooseDate("sometime")).toBeNull();
  });
  it("matches spelling variants but not different people", () => {
    expect(sameName("Md. Rajibul Palas", "Rajibul Palas")).toBe(true);
    expect(sameName("Arnob Mirza", "Mirza Saifullah Zaman Arnob")).toBe(true);
    expect(sameName("S.M EMON", "S.M. Emon")).toBe(true);
    expect(sameName("Md. Arafat Hossen", "Arafat Hossain Rana")).toBe(true);
    expect(sameName("Abdullah Al Mashuk", "S.M. Emon")).toBe(false);
    expect(sameName("Md. Khaled", "Gulzar Hossain")).toBe(false);
  });
  it("derives stable ids", () => {
    expect(detId("event", "a")).toBe(detId("event", "a"));
    expect(detId("event", "a")).not.toBe(detId("profile", "a"));
  });
});

function fixture(): LegacySources {
  return {
    executives: [
      { year: "2016", facultyMembers: [{ position: "Moderator", name: "Dr. X", designation: "Lecturer" }],
        studentExecutives: [{ position: "President", name: "Alice", studentId: "151002009", contact: "01700000000" }] },
      { year: "2018", facultyMembers: [{ position: "Moderator", name: "Dr. X", designation: "Senior Lecturer" }],
        studentExecutives: [
          { position: "President", name: "Bob", studentId: "151002009", contact: "01800000000" },
          { position: "Vice President (Activity)", name: "Carol", studentId: "201902xxx" },
          { position: "Chief Vibes Officer", name: "Dan", studentId: "181002001" },
        ] },
    ],
    events: [
      { sl: 1, name: "Same Name", date: "2022-01-06", participants: 50 },
      { sl: 1, name: "Same Name", date: "2022-02-06", participants: "All Executive Members" },
    ],
    contests: { contests: [{ id: 1, type: "IUPC", timestamp: "Jun 4, 2022", title: "T", teams: [], contestLink: "#", images: [] }] },
    forms: [{ slug: "f", title: "F", url: "https://x" }],
    hacktheai: [{ "Team Name": "T", "Full Name": "P", Email: "P@x.com", "Contact Number": 1 }],
    sponsors: {}, predefined: {}, featuredCollaborations: [], partners: [], lostFoundConfig: {}, blogPosts: [], avatarManifest: [],
    mediaFiles: [{ path: "/events/1.jpg", size: 1, sha256: "a", mime: "image/jpeg" }],
  };
}

describe("legacy transform", () => {
  const opts = { runId: "r1", mode: "insert-missing" as const, now: "2026-01-01T00:00:00.000Z" };

  it("is deterministic", () => {
    const a = transformLegacy(fixture(), opts);
    const b = transformLegacy(fixture(), { ...opts, runId: "r2" });
    const strip = (s: string[]) => s.filter((x) => !x.includes("migration_")).join("\n");
    expect(strip(a.statements)).toBe(strip(b.statements));
  });

  it("uses upserts only", () => {
    const r = transformLegacy(fixture(), opts);
    expect(r.statements.every((s) => /ON CONFLICT\(.+\) DO (NOTHING|UPDATE)/.test(s))).toBe(true);
  });

  it("separates different people sharing a student ID and reports it", () => {
    const r = transformLegacy(fixture(), opts);
    const shared = r.issues.find((i) => i.detail.field === "student_id_shared");
    expect(shared?.key).toBe("sid:151002009");
    expect(r.counts.profiles.migrated).toBe(5); // Dr. X, Alice, Bob, Carol, Dan
  });

  it("reports faculty designation changes and masks private conflicts", () => {
    const r = transformLegacy(fixture(), opts);
    const des = r.issues.find((i) => i.key === "faculty:dr x" && i.detail.field === "designation");
    expect(des?.detail.chosen).toBe("Senior Lecturer");
    expect(JSON.stringify(r.issues)).not.toContain("01700000000");
    expect(JSON.stringify(r.issues)).not.toContain("01800000000");
  });

  it("creates positions for unknown titles instead of guessing", () => {
    const r = transformLegacy(fixture(), opts);
    expect(r.positionMappings.find((m) => m.title === "Chief Vibes Officer")?.positionKey).toBe("legacy-chief-vibes-officer");
    expect(r.positionMappings.find((m) => m.title === "Vice President (Activity)")?.positionKey).toBe("vice-president-activities");
  });

  it("resolves slug collisions and shared legacy ids without losing either event", () => {
    const r = transformLegacy(fixture(), opts);
    expect(r.counts.events.migrated).toBe(2);
    expect(r.issues.filter((i) => i.entity === "events" && i.kind === "CONFLICT")).toHaveLength(2);
    const sql = r.statements.join("\n");
    expect(sql).toContain("'same-name-2'");
    expect(sql).toContain("'All Executive Members'");
  });

  it("accounts for every source record", () => {
    const r = transformLegacy(fixture(), opts);
    for (const [entity, c] of Object.entries(r.counts)) {
      if (entity === "categories" || entity === "positions") continue;
      expect(c.migrated + c.merged + c.skipped + c.failed, entity).toBe(c.source);
    }
  });
});

import { Validator } from "@/lib/server/validate";
describe("form datetimes", () => {
  it("interprets zone-less input as Dhaka time", () => {
    const v = new Validator({ a: "2026-10-01T19:00", b: "2026-10-01", c: "2026-10-01T13:00:00Z" });
    expect(v.datetime("a")).toBe("2026-10-01T13:00:00.000Z");
    expect(v.datetime("b")).toBe("2026-10-01");
    expect(v.datetime("c")).toBe("2026-10-01T13:00:00.000Z");
  });
});

import { buildEvent } from "@/lib/public/shapes";
describe("public event dates", () => {
  const row = (start_at: string) => ({ id: "e", legacy_sl: 1, slug: "s", title: "T", description: null, category_name: null, organizer: null, venue: null, start_at, end_at: null,
    time_text: null, participants_reported: null, participants_text: null, external_link: null, guests_text: null, judges_text: null, status: "PUBLISHED", registration_enabled: 0,
    registration_opens_at: null, registration_closes_at: null, banner_storage: null, banner_object_key: null, banner_legacy_path: null, banner_external_url: null, banner_variants_json: null });
  it("uses the Dhaka calendar date", () => {
    expect(buildEvent(row("2026-10-01T20:30:00.000Z")).date).toBe("2026-10-02");
    expect(buildEvent(row("2022-01-06T19:00:00+06:00")).date).toBe("2022-01-06");
    expect(buildEvent(row("2022-01-06")).date).toBe("2022-01-06");
  });
});
