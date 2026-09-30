"use client";

import { useEffect, useState } from "react";
import { useWatch } from "@/lib/api/presence";
import { directoryAction, type Directory } from "./actions";

/** Loaded once per tab and kept for five minutes: opening the picker again costs nothing. */
const FRESH_MS = 5 * 60_000;
let cache: { at: number; data: Directory } | null = null;
let loading: Promise<Directory | null> | null = null;

function load(): Promise<Directory | null> {
  if (cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.data);
  loading ??= directoryAction()
    .then((r) => {
      if (!r.ok) return null;
      cache = { at: Date.now(), data: r.data };
      return r.data;
    }, () => null)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The people I can write to (and follow their active status while the picker is open). */
export function useDirectory(enabled: boolean): { data: Directory | null; error: boolean } {
  const [data, setData] = useState<Directory | null>(cache?.data ?? null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load().then((d) => {
      if (!alive) return;
      if (d) setData(d);
      else setError(true);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  useWatch(enabled ? data?.watch : null);
  return { data, error };
}
