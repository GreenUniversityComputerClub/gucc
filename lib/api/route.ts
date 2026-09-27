import "server-only";
import { NextResponse } from "next/server";
import { rpc } from "./session";

/**
 * Next route handlers that forward a browser request to one API procedure as
 * the signed-in visitor. State-changing methods must come from this site
 * (CSRF defence; server actions get the same check from Next itself).
 */
export function sameOrigin(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function forward(req: Request, name: string, input: unknown, opts: { status?: number; shape?: (data: unknown) => unknown } = {}) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Cross-site request rejected.", code: "CSRF" }, { status: 403 });
  const r = await rpc(name, input);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, code: r.code, fields: r.fields }, { status: r.status ?? 400, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(opts.shape ? opts.shape(r.data) : r.data ?? { ok: true }, { status: opts.status ?? 200, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
