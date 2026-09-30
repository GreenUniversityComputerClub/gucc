/**
 * The Worker's side of the live hub: opening a browser's connection (after checking its ticket
 * and origin), handing a request's events to the hub, and the small client services use.
 *
 * When the hub says it has used today's allowance, this isolate stops calling it until midnight
 * UTC, so the fallback costs nothing either.
 */
import { verifyPass, type HubClient, type HubStats, type LiveItem, type Ticket } from "../../../lib/server/live";
import type { Env } from "./env";
import { allowedOrigins } from "./http";

let pausedUntil = 0;
const nextUtcMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

function stub(env: Env): DurableObjectStub | null {
  if (!env.LIVE || Date.now() < pausedUntil) return null;
  return env.LIVE.get(env.LIVE.idFromName("hub"));
}

async function call(env: Env, path: string, body: unknown): Promise<Response | null> {
  const s = stub(env);
  if (!s) return null;
  const res = await s.fetch(`https://hub${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 503) pausedUntil = nextUtcMidnight();
  return res;
}

const poll = (status: number, error: string) =>
  new Response(JSON.stringify({ ok: false, mode: "poll", error }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** GET /v1/live?t=<ticket> with a WebSocket upgrade, from the website's pages only. */
export async function handleLiveConnect(env: Env, req: Request): Promise<Response> {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return poll(426, "Expected a WebSocket.");
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(env.FRONTEND_ORIGIN).includes(origin.replace(/\/+$/, ""))) return poll(403, "Live updates are only for the GUCC website.");
  const url = new URL(req.url);
  const ticket = await verifyPass<Ticket>(env, url.searchParams.get("t"), "live");
  if (!ticket) return poll(401, "Your live ticket expired.");
  const s = stub(env);
  if (!s) return poll(503, "Live updates are resting; pages check for news on a timer.");
  const headers = new Headers(req.headers);
  headers.set("x-live-user", ticket.u);
  headers.set("x-live-visible", String(ticket.v));
  // How long ago the page was made (ms), so the hub can replay what it missed while opening.
  const age = Number(url.searchParams.get("a"));
  headers.set("x-live-age", Number.isFinite(age) && age > 0 ? String(Math.min(Math.round(age), 60_000)) : "0");
  const res = await s.fetch("https://hub/connect", { headers });
  if (res.status === 503) pausedUntil = nextUtcMidnight();
  return res;
}

/** Push a request's events to the open tabs they're for. Never throws. */
export async function emitLive(env: Env, items: LiveItem[]): Promise<void> {
  if (!items.length) return;
  try {
    // Large fan-outs (a broadcast to every member) go in slices so one call stays small.
    for (let i = 0; i < items.length; i += 50) await call(env, "/emit", { items: items.slice(i, i + 50) });
  } catch (e) {
    console.error("live emit failed", e instanceof Error ? e.message : e);
  }
}

export function hubClient(env: Env): HubClient | undefined {
  if (!env.LIVE) return undefined;
  return {
    async online(ids) {
      const res = await call(env, "/online", { ids });
      if (!res?.ok) return new Set();
      const body = (await res.json()) as { online?: string[] };
      return new Set(body.online ?? []);
    },
    async stats() {
      const s = stub(env);
      if (!s) return env.LIVE ? { connections: 0, people: 0, requestsToday: 0, cap: 0, paused: true } : null;
      const res = await s.fetch("https://hub/stats");
      if (!res.ok) return null;
      return (await res.json()) as HubStats;
    },
  };
}
