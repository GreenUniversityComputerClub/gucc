import eventsData from "@/data/events.json";

/** Shape of one entry in `data/events.json`. Optional keys are not on every row. */
export interface ClubEvent {
  sl: number;
  name: string;
  date: string;
  endDate?: string;
  time?: string;
  location?: string;
  participants?: number;
  guest?: string;
  Judge?: string;
  year?: number;
  organizer?: string;
  category?: string;
  link?: string;
  description?: string;
}

/**
 * URL slug for an event. Kept in one place so the route, the metadata and the
 * sitemap can never drift apart.
 */
export function eventSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
}

export function getAllEvents(): ClubEvent[] {
  return eventsData as unknown as ClubEvent[];
}

export function getEventBySlug(slug: string): ClubEvent | undefined {
  return getAllEvents().find((event) => eventSlug(event.name) === slug);
}

/** Cover image path for an event card / social preview. */
export function eventImage(event: ClubEvent): string {
  return `/events/${event.sl}.jpg`;
}
