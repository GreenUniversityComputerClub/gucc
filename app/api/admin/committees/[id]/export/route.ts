import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** A committee's listings as JSON or CSV in the import format. Authorized and audited by the API. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const r = await rpc<{ filename: string; body: string; contentType: string }>("executives.export", { committeeId: id, format });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status ?? 400, headers: { "Cache-Control": "no-store" } });
  return new Response(r.data.body, {
    headers: {
      "Content-Type": r.data.contentType,
      "Content-Disposition": `attachment; filename="${r.data.filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
