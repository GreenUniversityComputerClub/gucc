/**
 * Calendar files (.ics, RFC 5545) and "Add to Google Calendar" links for meetings and events.
 * Times are stored in UTC and written in UTC ("Z"), so every calendar shows them in its own zone.
 * Pure functions: no service, no storage.
 */

export interface CalendarItem {
  uid: string;
  title: string;
  start: string;
  end?: string | null;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  cancelled?: boolean;
  /** Changes each time the item changes, so calendars update their copy. */
  updatedAt?: string | null;
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Text values escape backslashes, semicolons, commas and newlines. */
const text = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const endOf = (item: CalendarItem) => item.end ?? new Date(new Date(item.start).getTime() + 3600_000).toISOString();

export function icsFile(items: CalendarItem[], name = "GUCC"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Green University Computer Club//GUCC//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(name)}`,
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.uid}`,
      `DTSTAMP:${stamp(item.updatedAt ?? new Date().toISOString())}`,
      `DTSTART:${stamp(item.start)}`,
      `DTEND:${stamp(endOf(item))}`,
      `SUMMARY:${text(item.title)}`,
      ...(item.description ? [`DESCRIPTION:${text(item.description)}`] : []),
      ...(item.location ? [`LOCATION:${text(item.location)}`] : []),
      ...(item.url ? [`URL:${item.url}`] : []),
      `STATUS:${item.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** "Add to Google Calendar": opens a pre-filled event in the person's own calendar. */
export function googleCalendarUrl(item: CalendarItem): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: `${stamp(item.start)}/${stamp(endOf(item))}`,
    ...(item.description || item.url ? { details: [item.description, item.url].filter(Boolean).join("\n\n").slice(0, 1500) } : {}),
    ...(item.location ? { location: item.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** A file name from a title: "tech-fest-2026.ics". */
export const icsName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"}.ics`;
