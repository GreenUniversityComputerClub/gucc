/**
 * First line of defence, before any D1 or R2 work: per-IP fixed-window counters kept in the
 * Worker instance's memory. They cost nothing (no storage, no subrequests), stop a single
 * source hammering an endpoint from burning the free D1 and R2 allowances, and answer 429 at
 * once. They are per instance, so they complement — never replace — the D1-backed limits.
 */
const windows = new Map<string, { start: number; count: number }>();
const MAX_KEYS = 5000;

export function allow(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size >= MAX_KEYS) {
      // Drop the oldest entries (Map keeps insertion order).
      let drop = Math.ceil(MAX_KEYS / 10);
      for (const k of windows.keys()) {
        windows.delete(k);
        if (--drop <= 0) break;
      }
    }
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= limit;
}

/** Per-minute limits for the routes browsers call directly. */
/** `live`: a tab reconnects every half hour, or after a dropped connection with growing waits. */
export const EDGE_LIMITS = { media: 300, health: 30, upload: 30, live: 20 } as const;

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

export const tooMany = () =>
  new Response(JSON.stringify({ ok: false, error: "Too many requests. Please wait a minute.", code: "RATE_LIMITED" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60", "Cache-Control": "no-store" },
  });

/** For tests. */
export function resetGuard() {
  windows.clear();
}
