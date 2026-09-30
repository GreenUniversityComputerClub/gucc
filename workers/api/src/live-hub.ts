/**
 * The live hub: one Durable Object holding the WebSocket of every open dashboard tab, so
 * messages, reactions, notifications, typing and active status reach people the moment they
 * happen, without their tabs asking the database over and over.
 *
 * Free-plan fit (SQLite-backed Durable Objects are on Workers Free):
 *   - The Hibernation API keeps sockets connected while the object sleeps; "ping" is answered by
 *     Cloudflare itself (auto-response) without waking it, so idle tabs cost no duration.
 *   - Requests are counted per UTC day (saved every 50, so eviction loses at most a few). At
 *     DAILY_CAP (80% of the free 100,000) new connections are refused with `mode: "poll"` and
 *     pages fall back to checking on a timer; the Worker stops sending events until midnight UTC.
 *   - Presence lives in memory (socket attachments). D1 is written once, when someone's last tab
 *     closes, and at most every five minutes per person.
 *
 * The Worker is the only caller of fetch(): it verifies the ticket first, so X-Live-* headers can
 * be trusted here. Browsers only ever send small JSON messages over their socket.
 */
import { verifyPass, type LiveEvent, type LiveItem, type RoomPass, type WatchPass } from "../../../lib/server/live";
import type { Env } from "./env";

/** 80% of the free plan's 100,000 Durable Object requests a day. */
export const DAILY_CAP = 80_000;
/** A connection is renewed with a fresh ticket this often, so sign-outs and suspensions take effect. */
const RENEW_MS = 35 * 60_000;
/** People one tab may follow (attachments hold at most 16 KB). */
const MAX_WATCH = 250;
/** Incoming WebSocket messages are billed at 20 per request. */
const MESSAGE_COST = 1 / 20;
/**
 * Events are kept this long (in memory only) for a page that is still opening its connection: what
 * happened between the page being made and its socket opening is replayed instead of lost.
 */
export const REPLAY_MS = 20_000;
const REPLAY_PER_PERSON = 30;

interface Attachment {
  u: string;
  /** Shares active status (and so may see others'). */
  v: 0 | 1;
  until: number;
  room?: { c: string; m: string[] } | null;
  watch?: string[];
}

const today = () => new Date().toISOString().slice(0, 10);
const tag = (userId: string) => `u:${userId}`;

export class LiveHub {
  private day = today();
  private count = 0;
  private saved = 0;
  /** Each person's latest events, for replay to a tab that just connected (see REPLAY_MS). */
  private recent = new Map<string, Array<{ at: number; data: string }>>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void state.blockConcurrencyWhile(async () => {
      const u = await state.storage.get<{ day: string; count: number }>("usage");
      if (u && u.day === this.day) this.count = this.saved = u.count;
    });
  }

  /** Count requests; false once today's allowance for the hub is used. */
  private async tick(n = 1): Promise<boolean> {
    const d = today();
    if (d !== this.day) {
      this.day = d;
      this.count = this.saved = 0;
    }
    this.count += n;
    if (this.count - this.saved >= 50) {
      this.saved = this.count;
      await this.state.storage.put("usage", { day: d, count: this.count });
    }
    return this.count <= DAILY_CAP;
  }

  private att(ws: WebSocket): Attachment | null {
    try {
      return ws.deserializeAttachment() as Attachment | null;
    } catch {
      return null;
    }
  }

  private send(ws: WebSocket, data: string): boolean {
    try {
      ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  private socketsOf(userId: string, except?: WebSocket): WebSocket[] {
    return this.state.getWebSockets(tag(userId)).filter((s) => s !== except && s.readyState === 1);
  }

  /** Tell everyone following this person (and sharing their own status) that they came or went. */
  private announce(userId: string, on: boolean) {
    const data = JSON.stringify({ t: "presence", u: userId, on, at: new Date().toISOString() });
    for (const ws of this.state.getWebSockets()) {
      const a = this.att(ws);
      if (a && a.v === 1 && a.u !== userId && a.watch?.includes(userId)) this.send(ws, data);
    }
  }

  private remember(userId: string, data: string, now: number) {
    const kept = (this.recent.get(userId) ?? []).filter((e) => now - e.at < REPLAY_MS);
    kept.push({ at: now, data });
    this.recent.set(userId, kept.slice(-REPLAY_PER_PERSON));
    // Never grows without bound: people with nothing recent are dropped.
    if (this.recent.size > 2000) for (const [id, list] of this.recent) if (!list.some((e) => now - e.at < REPLAY_MS)) this.recent.delete(id);
  }

  private visibleOnline(ids: string[]): string[] {
    return ids.filter((id) => this.socketsOf(id).some((s) => this.att(s)?.v === 1));
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    if (path === "/connect") {
      if (!(await this.tick())) return json({ ok: false, mode: "poll" }, 503);
      const u = req.headers.get("x-live-user");
      if (!u || req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ ok: false }, 400);
      const v: 0 | 1 = req.headers.get("x-live-visible") === "1" ? 1 : 0;
      const first = this.socketsOf(u).length === 0;
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server, [tag(u)]);
      server.serializeAttachment({ u, v, until: Date.now() + RENEW_MS } satisfies Attachment);
      if (first && v) this.announce(u, true);
      // A page that just opened gets what happened since it was made (queued until the socket opens).
      const age = Number(req.headers.get("x-live-age"));
      if (Number.isFinite(age) && age > 0) {
        const since = Date.now() - Math.min(age, REPLAY_MS) - 1000;
        for (const e of this.recent.get(u) ?? []) if (e.at >= since) this.send(server, e.data);
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === "/emit") {
      const ok = await this.tick();
      const { items } = (await req.json()) as { items: LiveItem[] };
      if (!ok) return json({ ok: false, mode: "poll" }, 503);
      const delivered = new Set<string>();
      const now = Date.now();
      for (const { to, ev } of items ?? []) {
        const data = JSON.stringify(ev);
        const reached: string[] = [];
        for (const id of to) {
          if (ev.t !== "bye") this.remember(id, data, now);
          let any = false;
          for (const ws of this.socketsOf(id)) any = this.send(ws, data) || any;
          if (any) reached.push(id);
        }
        reached.forEach((r) => delivered.add(r));
        // Two ticks for the sender: a recipient's tab has it.
        if (ev.t === "msg" && reached.some((r) => r !== ev.from)) {
          const dlv = JSON.stringify({ t: "dlv", c: ev.c, id: ev.m.id } as const);
          for (const ws of this.socketsOf(ev.from)) this.send(ws, dlv);
        }
        // Signed out, suspended or deleted: close their tabs now.
        if (ev.t === "bye") for (const id of to) for (const ws of this.socketsOf(id)) ws.close(4003, "signed out");
      }
      return json({ ok: true, delivered: [...delivered] });
    }

    if (path === "/online") {
      await this.tick();
      const { ids } = (await req.json()) as { ids: string[] };
      return json({ ok: true, online: (ids ?? []).slice(0, 500).filter((id) => this.socketsOf(id).length > 0) });
    }

    if (path === "/stats") {
      const sockets = this.state.getWebSockets();
      const people = new Set(sockets.map((s) => this.att(s)?.u).filter(Boolean));
      return json({ ok: true, connections: sockets.length, people: people.size, requestsToday: Math.round(this.count), cap: DAILY_CAP, paused: this.count > DAILY_CAP });
    }

    return json({ ok: false }, 404);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.tick(MESSAGE_COST);
    const a = this.att(ws);
    if (!a) return ws.close(4003, "unknown");
    if (Date.now() > a.until) return ws.close(4001, "renew");
    if (typeof raw !== "string" || raw.length > 16_000) return;
    let msg: { t?: string; pass?: unknown; c?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case "join": {
        const pass = await verifyPass<RoomPass>(this.env, msg.pass, "room");
        if (!pass || pass.u !== a.u) return;
        ws.serializeAttachment({ ...a, room: { c: pass.c, m: pass.m.filter((m) => m !== a.u) } } satisfies Attachment);
        return;
      }
      case "leave":
        ws.serializeAttachment({ ...a, room: null } satisfies Attachment);
        return;
      case "typing": {
        if (!a.room || msg.c !== a.room.c) return;
        const data = JSON.stringify({ t: "typing", c: a.room.c, u: a.u });
        for (const id of a.room.m) for (const s of this.socketsOf(id)) this.send(s, data);
        return;
      }
      case "watch": {
        // Several lists at once (the conversation list, an open conversation, the people picker).
        const raw = Array.isArray((msg as { passes?: unknown }).passes) ? ((msg as { passes: unknown[] }).passes).slice(0, 4) : [msg.pass];
        const ids = new Set<string>();
        for (const token of raw) {
          const pass = await verifyPass<WatchPass>(this.env, token, "watch");
          if (pass && pass.u === a.u) for (const id of pass.ids) if (ids.size < MAX_WATCH) ids.add(id);
        }
        const watch = [...ids];
        ws.serializeAttachment({ ...a, watch } satisfies Attachment);
        // Active status is shared both ways: someone who hides theirs sees nobody's.
        this.send(ws, JSON.stringify({ t: "presence", on: a.v === 1 ? this.visibleOnline(watch) : [], all: true }));
        return;
      }
      default:
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  /** The last tab of a person closed: they're no longer active; remember when they were. */
  private async gone(ws: WebSocket) {
    const a = this.att(ws);
    if (!a || this.socketsOf(a.u, ws).length > 0) return;
    if (a.v) this.announce(a.u, false);
    const now = new Date();
    try {
      await this.env.DB.prepare("UPDATE users SET last_active_at = ?2 WHERE id = ?1 AND (last_active_at IS NULL OR last_active_at < ?3)")
        .bind(a.u, now.toISOString(), new Date(now.getTime() - 5 * 60_000).toISOString()).run();
    } catch {
      // Only a nicety ("Active 5 min ago"); never worth failing over.
    }
  }
}

/** For the Worker: a type-only view of the events, so it can inspect them without importing the hub. */
export type { LiveEvent };
