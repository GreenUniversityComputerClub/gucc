import type { ClubEvent } from "@/lib/events";

export type EventPhase = "upcoming" | "live" | "past";

/**
 * Where an event stands now, from its real start and end (multi-day events stay "on" until they
 * end), falling back to its date for events imported without a time. The same rule on the server
 * and in the browser, given the same clock.
 */
export function eventPhase(e: Pick<ClubEvent, "date" | "endDate" | "startAt" | "endAt" | "status">, now = Date.now()): EventPhase {
  if (e.status === "COMPLETED" || e.status === "CANCELLED") return "past";
  if (e.status === "ONGOING") return "live";
  const start = e.startAt ? Date.parse(e.startAt) : Date.parse(`${e.date}T00:00:00+06:00`);
  const end = e.endAt ? Date.parse(e.endAt)
    : e.endDate ? Date.parse(`${e.endDate}T23:59:59+06:00`)
      : e.startAt ? start + 3 * 3600_000 : Date.parse(`${e.date}T23:59:59+06:00`);
  if (Number.isNaN(start)) return "past";
  if (now < start) return "upcoming";
  return now <= end ? "live" : "past";
}

/** Time the event starts, for sorting (its date at midnight Dhaka time when there is no time). */
export const eventStart = (e: Pick<ClubEvent, "date" | "startAt">) => (e.startAt ? Date.parse(e.startAt) : Date.parse(`${e.date}T00:00:00+06:00`)) || 0;

/** "in 3 days", "in 5 h", "starting soon"… for an upcoming event. */
export function countdown(e: Pick<ClubEvent, "date" | "startAt">, now = Date.now()): string | null {
  const ms = eventStart(e) - now;
  if (ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 60) return min <= 5 ? "Starting soon" : `In ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `In ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "Tomorrow" : `In ${d} days`;
}
