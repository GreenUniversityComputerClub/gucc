import { forward, readJson } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/** Moderation (lostfound.moderate, checked by the API). */
export async function PATCH(req: Request) {
  const body = await readJson(req);
  if (body.removeImage === true) return forward(req, "lostfound.removeImage", { id: body.id }, { shape: () => ({ ok: true }) });
  return forward(req, "lostfound.setStatus", { id: body.id, status: body.status, reason: typeof body.reason === "string" ? body.reason : undefined }, { shape: () => ({ ok: true }) });
}
