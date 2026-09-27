/** The club runs on Dhaka time (UTC+6, no daylight saving). */
const OFFSET_MS = 6 * 3600_000;

/** YYYY-MM-DD in Dhaka for a stored date or instant (for date inputs and displays). */
export function dhakaDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? value.slice(0, 10) : new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}
