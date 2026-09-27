import { JsonLd } from "@/components/seo/json-ld";
import { getPublicEvents } from "@/lib/public/data";
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  itemListSchema,
} from "@/lib/seo/schema";
import { EventsBrowser } from "./events-browser";

/**
 * Server wrapper so the index's structured data lives on the index only.
 * Declaring it in `app/events/layout.tsx` leaked the full 81-event ItemList
 * onto every event detail page, which also inherits that layout.
 */

export const revalidate = 3600;

export default async function EventsPage() {
  /** Newest first, so the list Google reads matches what the page shows. */
  const events = [...(await getPublicEvents())].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const structuredData = graph(
  breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Events", path: "/events" },
  ]),
  collectionPageSchema({
    name: "GUCC Events",
    description:
      "Seminars, workshops, programming contests, hackathons and cultural programmes hosted by the Green University Computer Club.",
    path: "/events",
    list: itemListSchema(
      "Green University Computer Club events",
      events.map((event) => ({
        name: event.name,
        path: `/events/${event.slug}`,
        image: event.image,
      }))
    ),
  })
  );

  return (
    <>
      <JsonLd id="events-schema" data={structuredData} />
      <EventsBrowser events={events} />
    </>
  );
}
