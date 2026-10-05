"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/api/use-session";
import { useLiveCounts } from "@/lib/api/live-counts";
import { iconBadge, titleKeeper } from "@/lib/notifications/title-badge";
import { LiveToaster } from "./live-toaster";

/** Keeps the live connection (or the slow polling that stands in for it) running. */
function KeepLive() {
  useLiveCounts(undefined, { poll: true });
  return null;
}

/**
 * Everything that tells a signed-in member something is waiting, on every page: the count in the
 * tab's title ("(3) Events | GUCC"), the red dot on the tab's icon and the installed app's badge,
 * and cards for what arrives. The live connection starts once the page has settled (idle, then
 * three seconds), only while the tab is visible, so it never slows the first paint.
 */
export default function Attention() {
  const session = useSession();
  const counts = useLiveCounts(session?.signedIn ? { unread: session.unread ?? 0, unreadMessages: session.unreadMessages ?? 0, openTasks: session.openTasks ?? 0 } : null);
  const [live, setLive] = useState(false);
  const keepers = useRef<{ title: ReturnType<typeof titleKeeper>; icon: ReturnType<typeof iconBadge> } | null>(null);

  useEffect(() => {
    const title = titleKeeper();
    const icon = iconBadge();
    keepers.current = { title, icon };
    return () => {
      title.stop();
      icon.stop();
      keepers.current = null;
    };
  }, []);

  useEffect(() => {
    const n = (counts?.unread ?? 0) + (counts?.unreadMessages ?? 0);
    keepers.current?.title.set(n);
    keepers.current?.icon.set(n);
  }, [counts]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const start = () => {
      timer = setTimeout(() => { if (!document.hidden) setLive(true); }, saveData ? 15_000 : 3000);
    };
    const id = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 4000 }) : (start(), 0);
    const onVisible = () => { if (!document.hidden) setLive(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      if (id && w.cancelIdleCallback) w.cancelIdleCallback(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <>
      {live && <KeepLive />}
      {session?.signedIn && session.id && <LiveToaster meId={session.id} />}
    </>
  );
}
