"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, MessageCircle, WifiOff, X } from "lucide-react";
import { useLive, useLiveStatus } from "@/lib/api/live-client";
import { useLiveCounts } from "@/lib/api/live-counts";
import { cn } from "@/lib/utils";

interface Toast {
  key: string;
  kind: "ntf" | "msg";
  title: string;
  body: string | null;
  href: string;
}

const MAX = 3;
const SHOW_MS = 6000;
/** Browser notifications are opt-in (Notifications page); this remembers the choice per device. */
export const DESKTOP_KEY = "gucc-desktop-notifications";

const desktopOn = () => {
  try {
    return typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem(DESKTOP_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * What arrives while you're elsewhere in the dashboard: a small card for a new notification or a
 * message from someone whose conversation isn't open, the unread count in the tab title, a
 * system notification when the tab is in the background (if you allowed it), and a quiet notice
 * when the connection drops. Nothing here asks the server for anything.
 */
export function LiveToaster({ meId }: { meId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offline, setOffline] = useState(false);
  const path = usePathname();
  const status = useLiveStatus();
  const counts = useLiveCounts();
  const baseTitle = useRef<string | null>(null);

  const push = useCallback((t: Toast) => {
    if (document.hidden && desktopOn()) {
      try {
        const n = new Notification(t.title, { body: t.body ?? undefined, tag: t.key, icon: "/android-chrome-192x192.png" });
        n.onclick = () => {
          window.focus();
          window.location.assign(t.href);
        };
      } catch {
        // Some browsers only allow this from a service worker.
      }
    }
    setToasts((list) => [t, ...list.filter((x) => x.key !== t.key)].slice(0, MAX));
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.key !== t.key)), SHOW_MS);
  }, []);

  useLive("ntf", (ev) => {
    const n = ev.n as { id: string; type: string; title: string; body: string | null; link: string | null };
    // Messages have their own card (below); a page you're on doesn't need announcing.
    if (!n || n.type === "message.received" || (n.link && path === n.link.split("?")[0])) return;
    push({ key: n.id, kind: "ntf", title: n.title, body: n.body, href: n.link ? `/dashboard/notifications/open/${n.id}?to=${encodeURIComponent(n.link)}` : "/dashboard/notifications" });
  });

  useLive("msg", (ev) => {
    const m = ev.m as { id: string; sender: string; senderName: string; body: string; kind: string };
    // Our own messages (sent from another tab) arrive too.
    if (!m || m.kind === "SYSTEM" || ev.from === meId || path === `/dashboard/chat/${ev.c}`) return;
    push({ key: m.id, kind: "msg", title: ev.group ? `${m.senderName} in ${ev.group}` : m.senderName, body: m.body.slice(0, 140), href: `/dashboard/chat/${ev.c}` });
  });

  // "(3) Messages · GUCC": the tab shows how much is waiting.
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const n = (counts?.unread ?? 0) + (counts?.unreadMessages ?? 0);
    document.title = n > 0 ? `(${n > 99 ? "99+" : n}) ${base}` : base;
  }, [counts, path]);

  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  // In an open conversation (full screen on phones) the message box is at the bottom and the
  // conversation shows its own connection line: cards come from the top there.
  const inThread = /^\/dashboard\/chat\/[^/]+/.test(path);
  return (
    <>
      {offline && !inThread && (
        <p role="status" className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-black pt-[max(0.375rem,env(safe-area-inset-top))]">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> You&apos;re offline. Changes will be sent when the connection is back.
        </p>
      )}
      <div aria-live="polite" className={cn("pointer-events-none fixed inset-x-3 z-[65] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:w-96",
        inThread ? "top-[max(0.75rem,env(safe-area-inset-top))] lg:top-auto lg:bottom-4" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]")}>
        {toasts.map((t) => (
          <div key={t.key} className={cn("pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", inThread ? "motion-safe:slide-in-from-top-3 lg:motion-safe:slide-in-from-bottom-3" : "motion-safe:slide-in-from-bottom-3")}>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
              {t.kind === "msg" ? <MessageCircle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </span>
            <Link prefetch={false} href={t.href} className="min-w-0 flex-1 focus-visible:outline-none" onClick={() => setToasts((l) => l.filter((x) => x.key !== t.key))}>
              <p className="truncate text-sm font-semibold">{t.title}</p>
              {t.body && <p className="line-clamp-2 break-words text-sm text-muted-foreground">{t.body}</p>}
            </Link>
            <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.key !== t.key))} aria-label="Dismiss"
              className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">{status === "live" ? "" : status === "connecting" ? "Reconnecting to live updates" : ""}</span>
    </>
  );
}
