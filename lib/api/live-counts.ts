"use client";

import { useEffect, useState } from "react";

/** The badges: unread notifications, unread conversations, open tasks. */
export interface LiveCounts {
  unread: number;
  unreadMessages: number;
  openTasks: number;
}

let current: LiveCounts | null = null;
const listeners = new Set<(c: LiveCounts) => void>();
let inflight: Promise<void> | null = null;

const signedInHint = () => typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith("gucc_signed_in="));
const same = (a: LiveCounts | null, b: LiveCounts) => a?.unread === b.unread && a.unreadMessages === b.unreadMessages && a.openTasks === b.openTasks;

function publish(c: LiveCounts) {
  if (same(current, c)) return;
  current = c;
  listeners.forEach((l) => l(c));
}

/** Ask the server now. Shared by every caller: at most one request at a time. */
export function refreshCounts(): Promise<void> {
  if (!signedInHint()) return Promise.resolve();
  inflight ??= fetch("/api/session/counts", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<LiveCounts> & { signedIn?: boolean }>) : null))
    .then((b) => {
      if (b?.signedIn) publish({ unread: Number(b.unread) || 0, unreadMessages: Number(b.unreadMessages) || 0, openTasks: Number(b.openTasks) || 0 });
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Change the numbers at once (e.g. after marking notifications read), before the server confirms. */
export function adjustCounts(delta: Partial<LiveCounts>) {
  if (!current) return;
  publish({
    unread: Math.max(0, current.unread + (delta.unread ?? 0)),
    unreadMessages: Math.max(0, current.unreadMessages + (delta.unreadMessages ?? 0)),
    openTasks: Math.max(0, current.openTasks + (delta.openTasks ?? 0)),
  });
}

const POLL_MS = 120_000;
let pollers = 0;
let stopPolling: (() => void) | null = null;

/** While any page asks for it: every 2 minutes, and whenever the tab comes back into view. */
function startPolling() {
  pollers++;
  if (pollers > 1) return;
  const onVisible = () => {
    if (!document.hidden) void refreshCounts();
  };
  const timer = setInterval(() => {
    if (!document.hidden) void refreshCounts();
  }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  stopPolling = () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function stop() {
  pollers = Math.max(0, pollers - 1);
  if (pollers === 0) {
    stopPolling?.();
    stopPolling = null;
  }
}

/**
 * The live badges. `seed` is what the server rendered (newer data from a page load replaces what
 * the store had); `poll` keeps them current while the page is open (the dashboard). Without
 * `poll` they still refresh when the tab comes back into view.
 */
export function useLiveCounts(seed?: LiveCounts | null, opts: { poll?: boolean } = {}): LiveCounts | null {
  const [c, setC] = useState<LiveCounts | null>(current ?? seed ?? null);
  const seedKey = seed ? `${seed.unread}|${seed.unreadMessages}|${seed.openTasks}` : "";
  useEffect(() => {
    if (seed) publish(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the seed's numbers are the dependency
  }, [seedKey]);
  useEffect(() => {
    const l = (v: LiveCounts) => setC(v);
    listeners.add(l);
    if (current) setC(current);
    if (opts.poll) startPolling();
    const onVisible = () => {
      if (!document.hidden) void refreshCounts();
    };
    if (!opts.poll) document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(l);
      if (opts.poll) stop();
      else document.removeEventListener("visibilitychange", onVisible);
    };
  }, [opts.poll]);
  return c;
}
