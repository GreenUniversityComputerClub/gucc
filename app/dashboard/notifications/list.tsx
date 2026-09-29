"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCheck, Circle, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { adjustCounts } from "@/lib/api/live-counts";
import { dhakaDateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { markAllSeenAction, markSeenAction, markUnreadAction } from "../live-actions";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  actor?: { name: string; avatarUrl: string | null } | null;
}

/** How long a row must stay mostly on screen before it counts as seen. */
const SEEN_AFTER_MS = 1200;
/** Rows seen close together are marked read in one call. */
const BATCH_MS = 600;

/**
 * Your notifications. A row that stays on screen for a moment is marked read by itself (in
 * batches, one small call), the badge updates at once and nothing reloads; rows stay where they
 * are until the next visit. "Mark unread" undoes it. Opening a notification goes to its page.
 */
export function NotificationList({ rows, emptyText }: { rows: NotificationRow[]; emptyText: string }) {
  const [read, setRead] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, Boolean(r.read_at)])));
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const queue = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const unreadCount = rows.filter((r) => !read[r.id]).length;

  // Relative times ("5 min ago") stay right while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const flush = useCallback(() => {
    flushTimer.current = null;
    const ids = [...queue.current];
    queue.current.clear();
    if (ids.length === 0) return;
    adjustCounts({ unread: -ids.length });
    markSeenAction(ids).then((ok) => {
      if (ok) return;
      // Put them back: the "Mark read" buttons reappear and the badge is corrected.
      setRead((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, false])) }));
      adjustCounts({ unread: ids.length });
      setFailed(true);
    }, () => setFailed(true));
  }, []);

  const markSeen = useCallback((id: string) => {
    setRead((r) => (r[id] ? r : { ...r, [id]: true }));
    queue.current.add(id);
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, BATCH_MS);
  }, [flush]);

  // Watch the rows that were unread when the page opened: seen once at least 60% visible for a
  // moment while the tab is in view. A row you mark unread yourself stays unread.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const timers = seenTimers.current;
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const id = el.dataset.id!;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (!timers.has(id)) {
            timers.set(id, setTimeout(() => {
              timers.delete(id);
              if (document.hidden) return;
              observer.unobserve(el);
              markSeen(id);
            }, SEEN_AFTER_MS));
          }
        } else if (timers.has(id)) {
          clearTimeout(timers.get(id));
          timers.delete(id);
        }
      }
    }, { threshold: [0, 0.6, 1] });
    list.current?.querySelectorAll<HTMLElement>('li[data-unread="1"]').forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flush();
      }
    };
  }, [markSeen, flush]);

  async function markAll() {
    const ids = rows.filter((r) => !read[r.id]).map((r) => r.id);
    setRead((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    adjustCounts({ unread: -ids.length });
    if (!(await markAllSeenAction())) {
      setRead((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, false])) }));
      adjustCounts({ unread: ids.length });
      setFailed(true);
    }
  }

  async function markUnread(id: string) {
    setRead((r) => ({ ...r, [id]: false }));
    adjustCounts({ unread: 1 });
    if (!(await markUnreadAction(id))) {
      setRead((r) => ({ ...r, [id]: true }));
      adjustCounts({ unread: -1 });
      setFailed(true);
    }
  }

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {unreadCount ? `${unreadCount} unread on this page. Items you look at are marked read.` : "All caught up on this page."}
        </p>
        {unreadCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden /> Mark all read
          </Button>
        )}
      </div>
      {failed && <p role="alert" className="mb-2 text-xs text-destructive">Couldn&apos;t save that just now. It will be tried again next time.</p>}
      <ul ref={list} className="divide-y">
        {rows.map((n) => {
          const isRead = read[n.id];
          const href = n.link ? `/dashboard/notifications/open/${n.id}?to=${encodeURIComponent(n.link)}` : null;
          return (
            <li key={n.id} data-id={n.id} data-unread={isRead ? "0" : "1"}
              className={cn("group flex items-start gap-3 py-3 pl-1 pr-1 transition-colors sm:pl-2", !isRead && "bg-primary/[0.04]")}>
              <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
                {!isRead && <Circle className="h-2 w-2 fill-primary text-primary" />}
              </span>
              {n.actor ? (
                <PersonAvatar name={n.actor.name} url={n.actor.avatarUrl} size="md" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background" aria-hidden>
                  <Image src="/android-chrome-192x192.png" alt="" width={28} height={28} className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("break-words text-sm", isRead ? "text-foreground/90" : "font-semibold")}>
                  <span className="sr-only">{isRead ? "" : "Unread: "}</span>
                  {href ? <Link prefetch={false} href={href} className="hover:underline focus-visible:underline">{n.title}</Link> : n.title}
                </p>
                {n.body && <p className="mt-0.5 line-clamp-3 break-words text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.actor && <span>{n.actor.name} · </span>}
                  <time dateTime={n.created_at} title={dhakaDateTime(n.created_at)}>{relativeTime(n.created_at, now)}</time>
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {isRead ? (
                  <button type="button" onClick={() => markUnread(n.id)} className="inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Mark unread: ${n.title}`}>
                    <MailOpen className="h-4 w-4 sm:mr-1" aria-hidden /><span className="hidden sm:inline">Mark unread</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => markSeen(n.id)} className="inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Mark read: ${n.title}`}>
                    <CheckCheck className="h-4 w-4 sm:mr-1" aria-hidden /><span className="hidden sm:inline">Mark read</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
