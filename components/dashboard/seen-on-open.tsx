"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { seenPathAction } from "@/app/dashboard/live-actions";
import { adjustCounts, refreshCounts, useLiveCounts, type LiveCounts } from "@/lib/api/live-counts";

/**
 * Opening a dashboard page (an approval, a task, a meeting, a conversation…) clears the
 * notifications that point to it: you've seen what they were about. Waits a moment, so passing
 * through a page doesn't count, and skips the call entirely when nothing is unread. Also keeps
 * the badges live while the dashboard is open.
 */
export function SeenOnOpen({ seed }: { seed: LiveCounts }) {
  const path = usePathname();
  const params = useSearchParams();
  const counts = useLiveCounts(seed, { poll: true });
  const unread = counts?.unread ?? seed.unread;
  const query = params.toString();
  useEffect(() => {
    if (!unread || path.startsWith("/dashboard/notifications")) return;
    const full = query ? `${path}?${query}` : path;
    const timer = setTimeout(() => {
      if (document.hidden) return;
      seenPathAction(full).then((n) => {
        if (n > 0) {
          adjustCounts({ unread: -n });
          void refreshCounts();
        }
      }, () => undefined);
    }, 800);
    return () => clearTimeout(timer);
    // Once per page: unread changing on this page doesn't re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query]);
  return null;
}
