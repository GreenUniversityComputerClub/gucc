import { rpc } from "@/lib/api/session";
import { icsFile, icsName } from "@/lib/ics";
import type { MeetingDetail } from "@/app/dashboard/meetings/actions";

export const dynamic = "force-dynamic";

/** A meeting as a calendar file, for people who can open it (the session decides). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await rpc<MeetingDetail>("meetings.get", { id });
  if (!r.ok) return new Response(r.code === "AUTH_REQUIRED" ? "Sign in to add this meeting to your calendar." : "Not found.", { status: r.code === "AUTH_REQUIRED" ? 401 : 404, headers: { "Cache-Control": "private, no-store" } });
  const m = r.data.meeting;
  const link = m.meet_url ?? m.join_url;
  const site = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  const body = icsFile([{
    uid: `${m.id}@gucc`, title: m.title, start: m.starts_at, end: m.ends_at, location: m.location ?? link, cancelled: m.status === "CANCELLED", updatedAt: m.updated_at,
    description: [m.agenda, link ? `Join: ${link}` : null, `Details: ${site}/dashboard/meetings/${m.id}`].filter(Boolean).join("\n\n"),
  }], "GUCC meetings");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${icsName(m.title)}"`, "Cache-Control": "private, no-store" } });
}
