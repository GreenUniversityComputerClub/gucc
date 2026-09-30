import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsFile, icsName } from "@/lib/ics";

describe("calendar files", () => {
  it("writes UTC times, escapes text, folds long lines and ends lines with CRLF", () => {
    const ics = icsFile([{
      uid: "mtg_1@gucc", title: "Planning, part 1; room 402", start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T10:30:00.000Z",
      description: `Agenda:\n${"x".repeat(120)}`, location: "Room 402, A Building",
    }]);
    expect(ics).toContain("DTSTART:20261005T090000Z");
    expect(ics).toContain("DTEND:20261005T103000Z");
    expect(ics).toContain("SUMMARY:Planning\\, part 1\\; room 402");
    expect(ics).toContain("LOCATION:Room 402\\, A Building");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("gives an hour-long slot when there is no end, and marks cancellations", () => {
    const ics = icsFile([{ uid: "e@gucc", title: "Talk", start: "2026-10-05T09:00:00.000Z", cancelled: true }]);
    expect(ics).toContain("DTEND:20261005T100000Z");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("builds a Google Calendar link and a file name", () => {
    const url = new URL(googleCalendarUrl({ uid: "x", title: "Tech Fest", start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T12:00:00.000Z", location: "Campus" }));
    expect(url.searchParams.get("dates")).toBe("20261005T090000Z/20261005T120000Z");
    expect(url.searchParams.get("location")).toBe("Campus");
    expect(icsName("Tech Fest 2026!")).toBe("tech-fest-2026.ics");
  });
});
