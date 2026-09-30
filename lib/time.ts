/** The club runs on Dhaka time (UTC+6, no daylight saving). */
const OFFSET_MS = 6 * 3600_000;

/** YYYY-MM-DD in Dhaka for a stored date or instant (for date inputs and displays). */
export function dhakaDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? value.slice(0, 10) : new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}

const TZ = "Asia/Dhaka";

/** "29 Sep 2026, 15:05" in Dhaka. */
export function dhakaDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "15:05" in Dhaka. */
export function dhakaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** The Dhaka calendar day of an instant, as YYYY-MM-DD (for grouping). */
export function dhakaDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "Today", "Yesterday", or "Mon 28 Sep" (with the year when it isn't this year). */
export function dayLabel(iso: string, now = new Date()): string {
  const day = dhakaDay(iso);
  const today = dhakaDay(now.toISOString());
  if (day === today) return "Today";
  if (day === dhakaDay(new Date(now.getTime() - 86_400_000).toISOString())) return "Yesterday";
  const d = new Date(iso);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const label = dayLabel(iso, new Date(now));
  if (label === "Yesterday") return label;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

/** A stored instant as the value of a datetime-local input, in Dhaka time ("" when empty). */
export function dhakaLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? "" : new Date(t + OFFSET_MS).toISOString().slice(0, 16);
}
