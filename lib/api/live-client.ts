"use client";

/**
 * The browser's live connection (one per tab) to the API Worker's live hub. Dashboard pages
 * start it; components subscribe to the events they care about. When it can't connect (live
 * updates switched off, the day's allowance used, a network that blocks WebSockets) the status
 * becomes "poll" and components fall back to checking on a timer, so nothing depends on it.
 *
 *   - A fresh two-minute ticket from /api/live/ticket for every connection (the session cookie
 *     never leaves this site); renewed every 30 minutes so a sign-out elsewhere takes effect.
 *   - "ping" every 50 s while the tab is visible (answered by Cloudflare without waking the hub);
 *     a tab hidden for 10 minutes lets go of its connection and reconnects when looked at again.
 *   - The first connection says how old the page is, and the hub replays what happened while it
 *     was opening; after any reconnect a "resync" event tells components to fetch what they missed.
 */
import { useEffect, useRef, useState } from "react";
import { API_PUBLIC_BASE_URL } from "./config";

export type LiveStatus = "off" | "connecting" | "live" | "poll";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LiveMessageEvent = { t: string; [k: string]: any };
type Handler = (ev: LiveMessageEvent) => void;

const PING_MS = 50_000;
const RENEW_MS = 30 * 60_000;
const HIDDEN_RELEASE_MS = 10 * 60_000;
const POLL_RETRY_MS = 10 * 60_000;

let ws: WebSocket | null = null;
let status: LiveStatus = "off";
let users = 0;
let attempt = 0;
let opened = 0;
let hiddenSince: number | null = null;
let room: string | null = null;
let watch: string[] = [];
const timers: { retry?: ReturnType<typeof setTimeout>; ping?: ReturnType<typeof setInterval>; renew?: ReturnType<typeof setTimeout> } = {};
const handlers = new Map<string, Set<Handler>>();
const statusHandlers = new Set<(s: LiveStatus) => void>();

const signedInHint = () => typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith("gucc_signed_in="));
const wsBase = () => API_PUBLIC_BASE_URL.replace(/^http/, "ws");

function setStatus(s: LiveStatus) {
  if (s === status) return;
  status = s;
  statusHandlers.forEach((h) => h(s));
}

function dispatch(ev: LiveMessageEvent) {
  handlers.get(ev.t)?.forEach((h) => {
    try {
      h(ev);
    } catch (e) {
      console.error("live handler failed", e);
    }
  });
}

function clearTimers() {
  clearTimeout(timers.retry);
  clearInterval(timers.ping);
  clearTimeout(timers.renew);
}

function schedule(ms: number) {
  clearTimeout(timers.retry);
  timers.retry = setTimeout(() => void connect(), ms);
}

async function connect(): Promise<void> {
  if (users === 0 || ws || typeof window === "undefined") return;
  if (!signedInHint()) return setStatus("off");
  if (typeof WebSocket === "undefined") return setStatus("poll");
  setStatus(opened ? "connecting" : status === "poll" ? "poll" : "connecting");
  let t: { signedIn?: boolean; mode?: string; ticket?: string } | null = null;
  try {
    const res = await fetch("/api/live/ticket", { cache: "no-store", credentials: "same-origin" });
    t = await res.json();
  } catch {
    t = null;
  }
  if (users === 0 || ws) return;
  if (t?.signedIn === false) return setStatus("off");
  if (!t || t.mode !== "live" || !t.ticket) {
    setStatus("poll");
    return schedule(t ? POLL_RETRY_MS : backoff());
  }
  // Only the first connection asks for a replay; later ones resync instead.
  const age = opened ? 0 : Math.round(performance.now());
  const socket = new WebSocket(`${wsBase()}/v1/live?t=${encodeURIComponent(t.ticket)}${age ? `&a=${age}` : ""}`);
  ws = socket;
  socket.onopen = () => {
    if (ws !== socket) return;
    attempt = 0;
    const again = opened > 0;
    opened++;
    setStatus("live");
    if (room) socket.send(JSON.stringify({ t: "join", pass: room }));
    if (watch.length) socket.send(JSON.stringify({ t: "watch", passes: watch }));
    timers.ping = setInterval(() => {
      if (document.hidden && hiddenSince && Date.now() - hiddenSince > HIDDEN_RELEASE_MS) return release();
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, PING_MS);
    // A fresh ticket every half hour (signed-out sessions stop getting a new one).
    timers.renew = setTimeout(() => socket.close(1000, "renew"), RENEW_MS);
    if (again) dispatch({ t: "resync" });
  };
  socket.onmessage = (m) => {
    if (typeof m.data !== "string" || m.data === "pong") return;
    try {
      const ev = JSON.parse(m.data) as LiveMessageEvent;
      if (ev && typeof ev.t === "string") dispatch(ev);
    } catch {
      // Not ours.
    }
  };
  socket.onclose = (e) => {
    if (ws !== socket) return;
    ws = null;
    clearTimers();
    if (e.code === 4003) {
      // Signed out, suspended or deleted.
      dispatch({ t: "bye" });
      return setStatus("off");
    }
    if (users === 0) return setStatus("off");
    if (document.hidden && hiddenSince && Date.now() - hiddenSince > HIDDEN_RELEASE_MS) return setStatus("poll");
    const renewing = e.code === 1000 || e.code === 4001;
    if (!renewing) attempt++;
    // After a few failed tries, pages poll while we keep trying in the background.
    setStatus(attempt >= 3 ? "poll" : "connecting");
    schedule(renewing ? 0 : backoff());
  };
}

const backoff = () => Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.7 + Math.random() * 0.6);

function release() {
  const s = ws;
  ws = null;
  clearTimers();
  setStatus("poll");
  s?.close(1000, "hidden");
}

function onVisibility() {
  if (document.hidden) {
    hiddenSince = Date.now();
    return;
  }
  hiddenSince = null;
  if (!ws && users > 0) {
    attempt = 0;
    clearTimeout(timers.retry);
    void connect();
  }
}

function onOnline() {
  if (!ws && users > 0) {
    attempt = 0;
    void connect();
  }
}

/** Keep the connection open while at least one caller needs it. Returns the release function. */
export function startLive(): () => void {
  users++;
  if (users === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    void connect();
  }
  return () => {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    const s = ws;
    ws = null;
    clearTimers();
    setStatus("off");
    s?.close(1000, "done");
  };
}

export function onLive(type: string, fn: Handler): () => void {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(fn);
  return () => void set!.delete(fn);
}

export function liveStatus(): LiveStatus {
  return status;
}

export function onLiveStatus(fn: (s: LiveStatus) => void): () => void {
  statusHandlers.add(fn);
  return () => void statusHandlers.delete(fn);
}

/** Send a small message to the hub (typing); dropped when not connected. */
export function sendLive(msg: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

/** The conversation this tab has open (typing indicators), or none. */
export function setLiveRoom(pass: string | null) {
  if (pass === room) return;
  room = pass;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(pass ? { t: "join", pass } : { t: "leave" }));
}

/** Whose active status this tab follows (signed lists from the server, up to four at once). */
export function setLiveWatch(passes: string[]) {
  const next = passes.slice(-4);
  if (next.join("|") === watch.join("|")) return;
  watch = next;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "watch", passes: next }));
}

/** Subscribe a component to one kind of event; the handler may change between renders. */
export function useLive(type: string, fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onLive(type, (ev) => ref.current(ev)), [type]);
}

export function useLiveStatus(): LiveStatus {
  const [s, setS] = useState<LiveStatus>(status);
  useEffect(() => {
    setS(status);
    return onLiveStatus(setS);
  }, []);
  return s;
}

/** Keep the live connection open while this component is mounted. */
export function useLiveConnection() {
  useEffect(() => startLive(), []);
}
