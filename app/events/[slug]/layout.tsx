import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { eventSlug, getAllEvents, getEventBySlug } from "@/lib/events";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, eventSchema, graph } from "@/lib/seo/schema";

export async function generateStaticParams() {
  return getAllEvents().map((event) => ({ slug: eventSlug(event.name) }));
}

/** First sentence or two of the event write-up, cleaned up for a meta tag. */
function summarize(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const plain = text
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .trim();
  return plain.length > 300 ? `${plain.slice(0, 297).trimEnd()}…` : plain || fallback;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = getEventBySlug(slug);

  if (!event) {
    return buildMetadata({
      title: "Event not found",
      description: "This GUCC event could not be found.",
      path: `/events/${slug}`,
      noIndex: true,
    });
  }

  const readableDate = new Date(event.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const venue = event.location || "Green University of Bangladesh";

  return buildMetadata({
    title: event.name,
    description: summarize(
      event.description,
      `${event.name} — ${event.category ?? "event"} organised by the Green University Computer Club on ${readableDate} at ${venue}.`
    ),
    path: `/events/${slug}`,
    type: "article",
    publishedTime: new Date(event.date).toISOString(),
    keywords: [
      event.name,
      `${event.name} GUCC`,
      event.category ?? "GUCC event",
      "GUCC events",
      "Green University Computer Club",
      "Green University of Bangladesh",
    ],
    image: `/events/${event.sl}.jpg`,
  });
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getEventBySlug(slug);

  return (
    <>
      {event && (
        <JsonLd
          id={`event-${slug}-schema`}
          data={graph(
            breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Events", path: "/events" },
              { name: event.name, path: `/events/${slug}` },
            ]),
            eventSchema({
              name: event.name,
              path: `/events/${slug}`,
              description: summarize(event.description, event.name),
              startDate: new Date(event.date).toISOString(),
              endDate: event.endDate
                ? new Date(event.endDate).toISOString()
                : undefined,
              location: event.location,
              image: `/events/${event.sl}.jpg`,
              organizer: event.organizer,
              attendees: event.participants,
            })
          )}
        />
      )}
      {children}
    </>
  );
}
