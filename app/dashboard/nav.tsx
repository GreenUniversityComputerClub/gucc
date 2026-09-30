"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveCounts, type LiveCounts } from "@/lib/api/live-counts";
import { useCloseAbove, useExclusiveOverlay } from "@/lib/overlay";

type Item = { href: string; label: string; badge?: number };
type Group = { label: string; items: Item[] };

/** Whether `href` is this page; `loose` ignores the query (a post's own page has no ?type=). */
type IsActive = (href: string, loose?: boolean) => boolean;

function useIsActive(): IsActive {
  const path = usePathname();
  const params = useSearchParams();
  return (href, loose) => {
    const [p, q] = href.split("?");
    if (p === "/dashboard") return path === "/dashboard";
    if (path !== p && !path.startsWith(`${p}/`)) return false;
    if (!q || loose) return true;
    const want = new URLSearchParams(q);
    return [...want.entries()].every(([k, v]) => params.get(k) === v);
  };
}

/**
 * The most specific item for this page (e.g. "Access simulator" rather than "Who can do what").
 * A detail page under a list that the nav splits by a filter (/dashboard/posts/<id>) lights up
 * the first of those items, so the reader still sees where they are.
 */
function activeItem(groups: Group[], isActive: IsActive): Item | undefined {
  const items = groups.flatMap((g) => g.items);
  const bySpecificity = (a: Item, b: Item) => b.href.length - a.href.length;
  return items.filter((i) => isActive(i.href)).sort(bySpecificity)[0] ?? items.find((i) => i.href.includes("?") && isActive(i.href, true));
}

/** The live numbers replace the ones rendered with the page for these items. */
const LIVE: Record<string, keyof LiveCounts> = { "/dashboard/notifications": "unread", "/dashboard/chat": "unreadMessages", "/dashboard/tasks": "openTasks" };

function useLiveGroups(groups: Group[], seed: LiveCounts): Group[] {
  const counts = useLiveCounts(seed) ?? seed;
  return useMemo(() => groups.map((g) => ({ ...g, items: g.items.map((i) => (LIVE[i.href] ? { ...i, badge: counts[LIVE[i.href]!] || undefined } : i)) })), [groups, counts]);
}

const Badge = ({ n }: { n?: number }) =>
  n ? <span className="rounded-full bg-rose-500 px-1.5 text-xs text-white" aria-label={`${n} unread`}>{n > 99 ? "99+" : n}</span> : null;

function NavLink({ item, active, onNavigate, className }: { item: Item; active: boolean; onNavigate?: () => void; className?: string }) {
  return (
    <Link
      href={item.href}
      // Admin pages are dynamic (each render calls the API); prefetching all of
      // them on every page view would waste the Worker's free daily requests.
      prefetch={false}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
        className,
      )}
    >
      <span className="min-w-0 truncate">{item.label}</span>
      <Badge n={item.badge} />
    </Link>
  );
}

const WEBSITE: Group = {
  label: "Website",
  items: [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
    { href: "/blog", label: "Blog" },
    { href: "/executives", label: "Executives" },
    { href: "/sponsors", label: "Sponsors" },
    { href: "/contact", label: "Contact us" },
  ],
};

/** Desktop: the grouped sidebar. */
export function AdminNav({ groups: rendered, counts: seed }: { groups: Group[]; counts: LiveCounts }) {
  const groups = useLiveGroups(rendered, seed);
  const isActive = useIsActive();
  const current = activeItem(groups, isActive);
  return (
    <nav aria-label="Admin sections" className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          <ul className="space-y-0.5">{g.items.map((i) => <li key={i.href}><NavLink item={i} active={i === current} className="min-h-9 py-2" /></li>)}</ul>
        </div>
      ))}
    </nav>
  );
}

/** Where the phone menu's list was scrolled to, kept across openings (and page changes). */
let savedScroll = 0;

/**
 * Phones and tablets: a bar that stays under the site header with the current page and a Menu
 * button. The menu opens every section, grouped, with large touch targets and a quick filter.
 */
export function AdminNavMobile({ groups: rendered, who, counts: seed }: { groups: Group[]; who: string; counts: LiveCounts }) {
  const groups = useLiveGroups(rendered, seed);
  const isActive = useIsActive();
  const path = usePathname();
  // One menu at a time: opening this closes the site menu and the assistant.
  const [open, setOpen] = useExclusiveOverlay("dashboard-menu");
  const close = useCallback(() => setOpen(false), [setOpen]);
  useCloseAbove(1024, open, close);
  const [filter, setFilter] = useState("");
  const current = activeItem(groups, isActive);
  const unread = groups.flatMap((g) => g.items).reduce((n, i) => n + (i.badge ?? 0), 0);

  // A page change (including Back) closes the menu.
  useEffect(() => close(), [path, close]);

  // Reopening shows the list where you left it; if the page you're on isn't in view there, it
  // scrolls to it (centred), so the current section is always visible without scrolling again.
  const listRef = useRef<HTMLElement | null>(null);
  const setList = useCallback((el: HTMLElement | null) => {
    if (listRef.current && !el) savedScroll = listRef.current.scrollTop;
    listRef.current = el;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = savedScroll;
      const active = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const box = el.getBoundingClientRect();
      const at = active.getBoundingClientRect();
      if (at.top < box.top || at.bottom > box.bottom) active.scrollIntoView({ block: "center" });
    });
  }, []);
  const rememberScroll = () => { if (listRef.current) savedScroll = listRef.current.scrollTop; };
  useEffect(() => {
    if (!open) setFilter("");
  }, [open]);

  // The site header shows no menu of its own on the dashboard, so the website's pages are here.
  const all = useMemo(() => [...groups, WEBSITE], [groups]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  }, [all, filter]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">{current?.label ?? "Dashboard"}</p>
        <DialogPrimitive.Trigger asChild>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={unread ? `Dashboard menu, ${unread} new` : "Dashboard menu"}>
            <Menu className="h-4 w-4" aria-hidden />
            Menu
            <Badge n={unread} />
          </button>
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 lg:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,88vw)] flex-col border-r bg-background shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left-full data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left-full lg:hidden"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-bold">GUCC Dashboard</DialogPrimitive.Title>
              <p className="truncate text-xs text-muted-foreground">{who}</p>
            </div>
            <DialogPrimitive.Close className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close menu">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="border-b px-4 py-2">
            <label className="relative block">
              <span className="sr-only">Find a section</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a section…" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
            </label>
          </div>
          <nav ref={setList} onScroll={rememberScroll} aria-label="Admin sections" className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
            {shown.length === 0 && <p className="px-3 text-sm text-muted-foreground">Nothing matches “{filter}”.</p>}
            {shown.map((g) => (
              <div key={g.label}>
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                <ul className="space-y-0.5">
                  {g.items.map((i) => <li key={i.href}><NavLink item={i} active={i === current} onNavigate={() => setOpen(false)} className="min-h-11 py-2.5" /></li>)}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link prefetch={false} href="/" className="inline-flex min-h-10 items-center gap-2 text-sm hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden /> View site
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
