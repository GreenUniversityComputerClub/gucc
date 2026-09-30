import { getPublicEventDetail } from "@/lib/public/data";
import { icsFile, icsName } from "@/lib/ics";
import { absoluteUrl } from "@/lib/seo/site";

export const revalidate = 3600;

/** A public event as a calendar file (cached like the event page). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getPublicEventDetail(slug);
  if (!detail) return new Response("Not found.", { status: 404 });
  const e = detail.event;
  const body = icsFile([{
    uid: `${e.slug}@gucc`, title: e.name, start: e.startAt ?? `${e.date}T00:00:00+06:00`,
    end: e.endAt ?? (e.endDate ? `${e.endDate}T23:59:00+06:00` : null), location: e.location, url: absoluteUrl(`/events/${e.slug}`),
    description: (e.description ?? "").replace(/\\n/g, "\n").slice(0, 1500), cancelled: e.status === "CANCELLED",
  }], "GUCC events");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${icsName(e.name)}"` } });
}
