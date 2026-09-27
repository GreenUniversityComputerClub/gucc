import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/** Called by the API Worker (e.g. its hourly job) when data behind cached pages changed. */
export async function POST(req: Request) {
  const key = req.headers.get("x-api-key") ?? "";
  // During a key rotation the Worker may still send the previous key for a while.
  const same = (secret: string) => secret.length > 0 && key.length === secret.length && timingSafeEqual(Buffer.from(key), Buffer.from(secret));
  const ok = same(process.env.API_SHARED_SECRET ?? "") || same(process.env.API_SHARED_SECRET_PREVIOUS ?? "");
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && /^[a-z0-9:_-]{1,80}$/i.test(t)).slice(0, 20) : [];
  for (const t of tags) revalidateTag(t);
  console.log(`[revalidate] ${new Date().toISOString()} ${tags.join(",")}`);
  return Response.json({ ok: true, revalidated: tags });
}
