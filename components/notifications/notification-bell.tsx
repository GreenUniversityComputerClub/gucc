"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Award, Bell, BellRing, CalendarDays, CheckCheck, ClipboardCheck, KeyRound, ListChecks, Megaphone, MessageCircle, MonitorSmartphone, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { adjustCounts, useLiveCounts, type LiveCounts } from "@/lib/api/live-counts";
import { useLive } from "@/lib/api/live-client";
import { markAllSeenAction } from "@/app/dashboard/live-actions";
import type { NotificationRow } from "@/app/dashboard/notifications/list";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DESKTOP_KEY } from "./live-toaster";

/** A short list is fetched again when the menu opens after this long. */
const FRESH_MS = 30_000;

const ICONS: Array<[RegExp, LucideIcon]> = [
  [/^security\./, ShieldAlert],
  [/^(approval\.|member\.pending|member\.corrected|report\.)/, ClipboardCheck],
  [/^message\./, MessageCircle],
  [/^(task\.|meeting\.)/, ListChecks],
  [/^(role\.|permission\.)/, KeyRound],
  [/^event\./, CalendarDays],
  [/^certificate\./, Award],
  [/^broadcast/, Megaphone],
];
const iconOf = (type: string) => ICONS.find(([re]) => re.test(type))?.[1] ?? Bell;

/** The red count on a header button. */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span aria-hidden className={cn("absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-[1.125rem] text-white ring-2 ring-background motion-safe:animate-in motion-safe:zoom-in-50", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

const headerButton = "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-primary/10 data-[state=open]:text-primary";

function desktopState(): "on" | "off" | "blocked" | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    return Notification.permission === "granted" && localStorage.getItem(DESKTOP_KEY) === "1" ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * The header's bell, as on Facebook: a live red count, and a menu with the newest notifications
 * (who, what, when, unread dots), "Mark all as read", the unread-only view and desktop alerts.
 * The list is fetched only when the menu is opened; new ones arrive live while it's open.
 */
export function NotificationBell({ seed }: { seed: LiveCounts }) {
  const counts = useLiveCounts(seed) ?? seed;
  const unread = counts.unread;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [failed, setFailed] = useState(false);
  const [desktop, setDesktop] = useState<ReturnType<typeof desktopState>>("unsupported");
  const loadedAt = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (which: "all" | "unread") => {
    setFailed(false);
    try {
      const res = await fetch(`/api/notifications?limit=10${which === "unread" ? "&unread=1" : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rows: NotificationRow[] };
      setRows(data.rows);
      loadedAt.current = Date.now();
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    setDesktop(desktopState());
    if (!rows || Date.now() - loadedAt.current > FRESH_MS) void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when opened, not on every change
  }, [open]);

  // A new notification shows at the top straight away (if the list was loaded).
  useLive("ntf", (ev) => {
    const n = ev.n as { id: string; type: string; title: string; body: string | null; link: string | null } | undefined;
    if (!n) return;
    setRows((list) => (list ? [{ ...n, read_at: null, created_at: new Date().toISOString(), actor: null }, ...list.filter((x) => x.id !== n.id)].slice(0, 10) : list));
  });

  const switchTo = (which: "all" | "unread") => {
    setFilter(which);
    setRows(null);
    void load(which);
  };

  const markAll = async () => {
    const was = unread;
    adjustCounts({ unread: -was });
    setRows((list) => list?.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })) ?? null);
    if (!(await markAllSeenAction().catch(() => false))) adjustCounts({ unread: was });
  };

  const toggleDesktop = async () => {
    if (desktop === "on") {
      try { localStorage.removeItem(DESKTOP_KEY); } catch { /* private mode */ }
      setDesktop("off");
      return;
    }
    if (typeof Notification === "undefined") return;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      try { localStorage.setItem(DESKTOP_KEY, "1"); } catch { /* private mode */ }
    }
    setDesktop(desktopState());
  };

  const shown = filter === "unread" ? rows?.filter((r) => !r.read_at) : rows;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={headerButton} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          {unread ? <BellRing className="h-5 w-5" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
          <CountBadge n={unread} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8}
        className="flex max-h-[min(38rem,calc(100dvh-5rem))] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="text-lg font-bold">Notifications</p>
          {unread > 0 && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void markAll(); }}
              className="min-h-9 cursor-pointer gap-1.5 rounded-full px-3 text-sm font-medium text-primary focus:bg-primary/10 focus:text-primary">
              <CheckCheck className="h-4 w-4" aria-hidden />Mark all as read
            </DropdownMenuItem>
          )}
        </div>
        <div className="flex gap-1.5 px-3 pb-2" role="group" aria-label="Show">
          {(["all", "unread"] as const).map((k) => (
            <DropdownMenuItem key={k} onSelect={(e) => { e.preventDefault(); if (filter !== k) switchTo(k); }} aria-pressed={filter === k}
              className={cn("min-h-9 cursor-pointer rounded-full px-3.5 text-sm font-semibold", filter === k ? "bg-primary/10 text-primary focus:bg-primary/15 focus:text-primary" : "text-muted-foreground")}>
              {k === "all" ? "All" : "Unread"}
            </DropdownMenuItem>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
          {!shown && !failed && (
            <ul aria-label="Loading notifications" className="space-y-1 p-1">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex animate-pulse gap-3 rounded-lg p-2">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                  <span className="flex-1 space-y-2 pt-1"><span className="block h-3 w-3/4 rounded bg-muted" /><span className="block h-3 w-1/2 rounded bg-muted" /></span>
                </li>
              ))}
            </ul>
          )}
          {failed && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void load(filter); }} className="m-1 min-h-11 justify-center text-sm text-muted-foreground">
              Couldn&apos;t load. Tap to try again.
            </DropdownMenuItem>
          )}
          {shown && shown.length === 0 && (
            <div className="px-4 py-10 text-center">
              <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><CheckCheck className="h-6 w-6" aria-hidden /></span>
              <p className="font-medium">{filter === "unread" ? "No unread notifications" : "Nothing yet"}</p>
              <p className="text-sm text-muted-foreground">{filter === "unread" ? "You're all caught up." : "When something needs you, it shows here."}</p>
            </div>
          )}
          {shown?.map((r) => {
            const Icon = iconOf(r.type);
            const href = r.link ? `/dashboard/notifications/open/${r.id}?to=${encodeURIComponent(r.link)}` : `/dashboard/notifications/open/${r.id}`;
            return (
              <DropdownMenuItem key={r.id} asChild className="items-start gap-3 rounded-lg p-2 focus:bg-muted">
                <Link prefetch={false} href={href} onClick={() => { if (!r.read_at) adjustCounts({ unread: -1 }); }}>
                  <span className="relative shrink-0">
                    {r.actor ? <PersonAvatar name={r.actor.name} url={r.actor.avatarUrl} size="md" /> : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                    )}
                    {r.actor && <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover"><Icon className="h-3 w-3" aria-hidden /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("line-clamp-2 text-sm", r.read_at ? "text-muted-foreground" : "font-semibold text-foreground")}>{r.title}</span>
                    {r.body && <span className="line-clamp-2 text-xs text-muted-foreground">{r.body}</span>}
                    <span className={cn("mt-0.5 block text-xs", r.read_at ? "text-muted-foreground" : "font-semibold text-primary")}>{relativeTime(r.created_at, now)}</span>
                  </span>
                  {!r.read_at && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="flex items-center justify-between gap-2 p-1.5">
          <DropdownMenuItem asChild className="min-h-10 flex-1 justify-center rounded-lg text-sm font-semibold text-primary focus:bg-primary/10 focus:text-primary">
            <Link prefetch={false} href="/dashboard/notifications">See all notifications</Link>
          </DropdownMenuItem>
          {desktop !== "unsupported" && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void toggleDesktop(); }} disabled={desktop === "blocked"}
              title={desktop === "blocked" ? "Blocked in this browser's site settings" : "Show alerts on this device when the tab is in the background"}
              className="min-h-10 gap-1.5 rounded-lg px-3 text-xs text-muted-foreground">
              <MonitorSmartphone className="h-4 w-4" aria-hidden />Desktop alerts: {desktop === "on" ? "On" : desktop === "blocked" ? "Blocked" : "Off"}
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
