import { forward, readJson } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(req, "lostfound.setStatus", { id, status: (await readJson(req)).status }, { shape: () => ({ ok: true }) });
}

/** Report a post to the moderators. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(req, "lostfound.report", { id, reason: (await readJson(req)).report }, { shape: () => ({ ok: true }) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(req, "lostfound.delete", { id }, { shape: () => ({ success: true }) });
}
