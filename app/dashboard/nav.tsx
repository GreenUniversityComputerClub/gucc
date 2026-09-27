"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; badge?: number };

/**
 * Desktop: grouped sidebar. Phones/tablets: one horizontally scrollable row,
 * sticky under the site header, with the active item scrolled into view.
 */
export function AdminNav({ groups }: { groups: Array<{ label: string; items: Item[] }> }) {
  const path = usePathname();
  const params = useSearchParams();
  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/dashboard") return path === "/dashboard";
    if (!path.startsWith(p)) return false;
    if (!q) return true;
    const want = new URLSearchParams(q);
    return [...want.entries()].every(([k, v]) => params.get(k) === v);
  };
  const link = (i: Item, compact: boolean) => (
    <Link
      key={i.href}
      href={i.href}
      // Admin pages are dynamic (each render calls the API); prefetching all of
      // them on every page view would waste the Worker's free daily requests.
      prefetch={false}
      aria-current={isActive(i.href) ? "page" : undefined}
      ref={(el) => {
        if (compact && el && isActive(i.href)) el.scrollIntoView({ block: "nearest", inline: "center" });
      }}
      className={cn(
        "flex min-h-9 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive(i.href) ? "bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {i.label}
      {i.badge ? <span className="rounded-full bg-rose-500 px-1.5 text-xs text-white" aria-label={`${i.badge} unread`}>{i.badge > 99 ? "99+" : i.badge}</span> : null}
    </Link>
  );
  return (
    <>
      <nav aria-label="Admin sections" className="sticky top-16 z-30 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">{groups.flatMap((g) => g.items).map((i) => link(i, true))}</div>
      </nav>
      <nav aria-label="Admin sections" className="hidden space-y-4 lg:block">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
            <ul className="space-y-0.5">{g.items.map((i) => <li key={i.href}>{link(i, false)}</li>)}</ul>
          </div>
        ))}
      </nav>
    </>
  );
}
