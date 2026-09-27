import { AppError, toActionResult } from "../../../lib/server/errors";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** The HTTP status an error becomes (errorResponse uses the same rule). */
export function statusOf(e: unknown): number {
  if (e instanceof AppError) return e.status;
  if (e && typeof e === "object" && (e as Error).name === "GovernanceViolation") return 403;
  return /UNIQUE constraint failed|FOREIGN KEY constraint failed|transition_lost/i.test(e instanceof Error ? e.message : String(e)) ? 409 : 500;
}

/** Any thrown value → a user-safe JSON error with the right status. Internals are logged, never returned. */
export function errorResponse(e: unknown, requestId: string, headers?: HeadersInit): Response {
  const r = toActionResult(e, requestId);
  return json(r, { status: statusOf(e), headers });
}

export const notFound = () => json({ ok: false, error: "Not found.", code: "NOT_FOUND" }, { status: 404 });

/** Constant-time string comparison for secrets. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function allowedOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
