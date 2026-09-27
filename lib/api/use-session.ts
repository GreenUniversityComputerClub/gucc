"use client";

import { useEffect, useState } from "react";

export interface ClientSession {
  signedIn: boolean;
  /** The account id (your own, for "mine" checks in the page). */
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  avatarUrl?: string | null;
  adminAccess?: boolean;
  unread?: number;
  caps?: Record<string, true>;
}

let cached: Promise<ClientSession> | null = null;
const listeners = new Set<(s: ClientSession) => void>();

/** Set with the session cookie; without it nobody is signed in and there's nothing to ask. */
const mayBeSignedIn = () => typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith("gucc_signed_in="));

function load(force = false): Promise<ClientSession> {
  if (!cached || force) {
    cached = !mayBeSignedIn() ? Promise.resolve({ signedIn: false }) : fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<ClientSession>) : { signedIn: false }))
      .catch(() => ({ signedIn: false }));
    cached.then((s) => listeners.forEach((l) => l(s)));
  }
  return cached;
}

/** Refresh after sign-in/out without a full reload. */
export function refreshSession() {
  return load(true);
}

/**
 * The signed-in user for client components on static pages. One request per
 * page load, shared by every caller. `undefined` while loading.
 */
export function useSession(): ClientSession | undefined {
  const [s, setS] = useState<ClientSession | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const l = (v: ClientSession) => alive && setS(v);
    listeners.add(l);
    load().then(l);
    return () => {
      alive = false;
      listeners.delete(l);
    };
  }, []);
  return s;
}
