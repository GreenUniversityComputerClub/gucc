import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** CSV of members (members.manage). Needs a recent password; audited by the API. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const r = await rpc<{ filename: string; csv: string }>("members.exportCsv", { status });
  const self = `/api/admin/members/export${status ? `?status=${encodeURIComponent(status)}` : ""}`;
  if (!r.ok && r.code === "REAUTH_REQUIRED") {
    // Personal data: ask for the password first, then come back to this download.
    const back = new URL(req.headers.get("referer") ?? "/dashboard/members", req.url);
    const to = new URL(`/dashboard/confirm?next=${encodeURIComponent(self)}&back=${encodeURIComponent(back.origin === new URL(req.url).origin ? back.pathname + back.search : "/dashboard/members")}`, req.url);
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
