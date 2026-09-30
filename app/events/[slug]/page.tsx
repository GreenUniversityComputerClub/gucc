import { notFound } from "next/navigation";
import { getPublicEventDetail, getPublicEvents } from "@/lib/public/data";
import { EventDetails } from "./event-details";

export const revalidate = 3600;
export const dynamicParams = true;

/** Recent events are prerendered; older ones render on first visit and are cached. */
export async function generateStaticParams() {
  const events = await getPublicEvents();
  return [...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 60).map((e) => ({ slug: e.slug }));
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getPublicEventDetail(slug);
  if (!detail) notFound();
  // Related: same category first, then the nearest in time (from the cached list, no extra query).
  const all = await getPublicEvents();
  const at = Date.parse(detail.event.startAt ?? `${detail.event.date}T00:00:00+06:00`);
  const related = all
    .filter((e) => e.slug !== slug)
    .map((e) => ({ e, score: (e.category && e.category === detail.event.category ? 0 : 1) * 1e13 + Math.abs(Date.parse(e.startAt ?? `${e.date}T00:00:00+06:00`) - at) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((x) => x.e);
  return <EventDetails event={detail.event} fields={detail.fields} gallery={detail.gallery} people={detail.people ?? []} attachments={detail.attachments ?? []} agenda={detail.agenda ?? []} related={related} />;
}
