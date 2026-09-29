"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; badge?: number };
type Group = { label: string; items: Item[] };

function useIsActive() {
  const path = usePathname();
  const params = useSearchParams();
  return (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/dashboard") return path === "/dashboard";
    if (!path.startsWith(p!)) return false;
    if (!q) return true;
    const want = new URLSearchParams(q);
    return [...want.entries()].every(([k, v]) => params.get(k) === v);
  };
}

/** The most specific item for this page (e.g. "Access simulator" rather than "Who can do what"). */
function activeItem(groups: Group[], isActive: (href: string) => boolean): Item | undefined {
  return groups.flatMap((g) => g.items).filter((i) => isActive(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
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

/** Desktop: the grouped sidebar. */
export function AdminNav({ groups }: { groups: Group[] }) {
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

/**
 * Phones and tablets: a bar that stays under the site header with the current page and a Menu
 * button. The menu opens every section, grouped, with large touch targets and a quick filter.
 */
export function AdminNavMobile({ groups, who }: { groups: Group[]; who: string }) {
  const isActive = useIsActive();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const current = activeItem(groups, isActive);
  const unread = groups.flatMap((g) => g.items).reduce((n, i) => n + (i.badge ?? 0), 0);

  // A page change (including Back) closes the menu.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) setFilter("");
  }, [open]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  }, [groups, filter]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">{current?.label ?? "Dashboard"}</p>
        <DialogPrimitive.Trigger asChild>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={unread ? `Dashboard menu, ${unread} unread` : "Dashboard menu"}>
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
          <nav aria-label="Admin sections" className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
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
