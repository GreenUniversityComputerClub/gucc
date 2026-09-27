import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** CSV export of an event's registrations. Authorized and audited by the API. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await rpc<{ filename: string; csv: string }>("events.exportRegistrations", { id });
  if (!r.ok && r.code === "REAUTH_REQUIRED") {
    // Personal data: ask for the password first, then come back to this download.
    const back = new URL(req.headers.get("referer") ?? "/dashboard", req.url);
    const to = new URL(`/dashboard/confirm?next=${encodeURIComponent(`/api/admin/events/${id}/registrations`)}&back=${encodeURIComponent(back.origin === new URL(req.url).origin ? back.pathname + back.search : "/dashboard")}`, req.url);
    return Response.redirect(to, 303);
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status ?? 400, headers: { "Cache-Control": "no-store" } });
  return new Response(r.data.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.data.filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
