import { NextResponse, type NextRequest } from "next/server";
import { rpc } from "@/lib/api/session";

export const dynamic = "force-dynamic";

/** "Approve & next": the oldest request you can decide now, or the queue when there are none left. */
export async function GET(req: NextRequest) {
  const r = await rpc<Array<{ id: string }>>("approvals.list", { status: "PENDING", forMe: true });
  if (!r.ok && r.code === "AUTH_REQUIRED") return NextResponse.redirect(new URL("/auth/login?next=/dashboard/approvals", req.url), 303);
  const next = r.ok ? r.data[0] : null;
  return NextResponse.redirect(new URL(next ? `/dashboard/approvals/${next.id}` : "/dashboard/approvals?done=1", req.url), { status: 303, headers: { "Cache-Control": "private, no-store" } });
}
