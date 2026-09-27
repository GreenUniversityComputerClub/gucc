import type { PublicEvent } from "@/lib/public/shapes";

/**
 * Shape of a public event as the UI consumes it. Events live in D1; the
 * server read model (lib/public/data.ts getPublicEvents) builds these.
 * Safe to import from client components.
 */
export type ClubEvent = PublicEvent;
