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
  return <EventDetails event={detail.event} fields={detail.fields} gallery={detail.gallery} people={detail.people ?? []} attachments={detail.attachments ?? []} />;
}
