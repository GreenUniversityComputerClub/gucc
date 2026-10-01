"use client";

/**
 * Who is active right now, as the live hub reports it for the people this tab follows (the
 * conversation list, an open conversation and the new-message picker send a signed "watch"
 * list). Only people who share their active status appear, and only to people who share theirs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { onLive, setLiveWatch } from "./live-client";

const online = new Set<string>();
/** When someone we watched stopped being active (this tab saw it), so "Active 2 min ago" is right without asking the server. */
const wentAway = new Map<string, number>();
const listeners = new Set<() => void>();
let wired = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  onLive("presence", (ev) => {
    const now = Date.now();
    if (ev.all && Array.isArray(ev.on)) {
      const next = new Set((ev.on as unknown[]).map(String));
      for (const id of online) if (!next.has(id)) wentAway.set(id, now);
      online.clear();
      for (const id of next) online.add(id);
    } else if (typeof ev.u === "string") {
      if (ev.on) online.add(ev.u);
      else {
        if (online.has(ev.u)) wentAway.set(ev.u, now);
        online.delete(ev.u);
      }
    }
    listeners.forEach((l) => l());
  });
  // Signed out or connection lost for good: nobody is shown as active.
  const clear = () => {
    online.clear();
    listeners.forEach((l) => l());
  };
  onLive("bye", clear);
}

export function isOnline(userId: string | null | undefined): boolean {
  return Boolean(userId && online.has(userId));
}

/** Re-renders when anyone's active status changes. */
export function usePresence(): (userId: string | null | undefined) => boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    wire();
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  // A new function after each change, so memoised lists that use it recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (id: string | null | undefined) => isOnline(id), [tick]);
}

/** Signed lists mounted components want followed (latest last). */
const passes: string[] = [];

/** Follow these people's active status while the component is mounted (a signed list from the server). */
export function useWatch(pass: string | null | undefined) {
  useEffect(() => {
    wire();
    if (!pass) return;
    passes.push(pass);
    setLiveWatch([...passes]);
    return () => {
      const i = passes.lastIndexOf(pass);
      if (i >= 0) passes.splice(i, 1);
      setLiveWatch([...passes]);
    };
  }, [pass]);
}

/** The later of the server's "last active" and when this tab saw the person go. */
function lastActive(userId: string | null | undefined, serverIso: string | null | undefined): string | null {
  const seen = userId ? wentAway.get(userId) : undefined;
  if (!seen) return serverIso ?? null;
  const iso = new Date(seen).toISOString();
  return !serverIso || iso > serverIso ? iso : serverIso;
}

/**
 * The status line for a person ("Active now", "Active 5 min ago"…), kept current: it follows the
 * live hub and moves on each minute, so a page left open never shows a stale time.
 */
export function useActiveLabel(): (userId: string | null | undefined, lastActiveAt: string | null | undefined) => string | null {
  const online = usePresence();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return useCallback((userId, lastActiveAt) => activeLabel(online(userId), lastActive(userId, lastActiveAt), Math.max(now, Date.now())), [online, now]);
}

/** "Active now", "Active 5 min ago", "Active yesterday"… or null when unknown or hidden. */
export function activeLabel(on: boolean, lastActiveAt: string | null | undefined, now = Date.now()): string | null {
  if (on) return "Active now";
  if (!lastActiveAt) return null;
  const mins = Math.floor((now - new Date(lastActiveAt).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 0) return null;
  if (mins < 2) return "Active just now";
  if (mins < 60) return `Active ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days} days ago`;
  return null;
}
