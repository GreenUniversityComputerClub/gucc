"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { reloadWith, showFlash } from "./flash";

/** How long an in-place update may take before the page reloads instead. */
const FALLBACK_MS = 8000;

/**
 * After a save: the message shows at once and the page updates in place (a fresh server render
 * without reloading, so scroll position, open panels and the rest of the page stay). Next.js has
 * been seen to drop such an update now and then in production builds; if it hasn't finished
 * within a few seconds, the page reloads as it always used to, so nothing is ever left stale.
 */
export function useSoftRefresh() {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiting = useRef<{ url: string | null } | null>(null);

  const done = useCallback(() => {
    waiting.current = null;
    clearTimeout(timer.current);
  }, []);
  // The refresh finished (the transition ended) or the new page is showing.
  useEffect(() => {
    if (waiting.current && !waiting.current.url && !pending) done();
  }, [pending, done]);
  useEffect(() => {
    if (waiting.current?.url && path === waiting.current.url.split(/[?#]/)[0]) done();
  }, [path, done]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback((message?: string, url?: string) => {
    if (message) showFlash(message);
    waiting.current = { url: url ?? null };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (waiting.current) reloadWith(undefined, url);
    }, FALLBACK_MS);
    start(() => {
      if (url) router.push(url);
      else router.refresh();
    });
  }, [router]);
}
