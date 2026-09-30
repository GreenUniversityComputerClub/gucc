'use client'

import { buttonVariants } from "@/components/ui/button";
import type { ClubEvent } from "@/lib/events";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeftIcon, ChevronRightIcon, SearchIcon, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { countdown, eventPhase, eventStart, type EventPhase } from "./event-status";
import { EventTile } from "./event-tile";

/** Events per page: four rows of three on desktop. */
const PAGE_SIZE = 12;
const TZ = "Asia/Dhaka";

/** `?page=N` from the address bar (1 when missing or not a number). */
function pageFromUrl(): number {
  const n = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

type When = "all" | "upcoming" | "past";
const whenFromUrl = (): When => {
  const w = new URLSearchParams(window.location.search).get("when");
  return w === "upcoming" || w === "past" ? w : "all";
};

/** The address for a page, search and filter, so a filtered list can be shared or bookmarked. */
function hrefFor(p: number, q: string, when: When, category = "") {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (when !== "all") params.set("when", when);
  if (category) params.set("category", category);
  if (p > 1) params.set("page", String(p));
  const s = params.toString();
  return s ? `/events?${s}` : "/events";
}

/** 1 … 4 5 6 … 9: the first, last and neighbours of the current page. */
function pageItems(current: number, total: number): Array<number | "gap"> {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * The events page: the next event up front, search, category and time filters, and numbered
 * pages of 12. Everything is in the page for search engines; filtering happens in the browser and
 * the address keeps it, so a filtered list can be shared.
 */
export function EventsBrowser({ events }: { events: ClubEvent[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<When>("all");
  const [category, setCategory] = useState("");
  // The server renders page 1; the address bar's page is applied after hydration.
  const [page, setPage] = useState(1);
  // The clock is read after hydration, so the server's page and the browser's first render match.
  const [now, setNow] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const sp = new URLSearchParams(window.location.search);
      setPage(pageFromUrl());
      setSearchQuery(sp.get("q") ?? "");
      setDateFilter(whenFromUrl());
      setCategory(sp.get("category") ?? "");
    };
    sync();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("popstate", sync);
    return () => {
      clearInterval(t);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // Before the clock is read (server render and hydration), the stored status decides.
  const phaseOf = (e: ClubEvent): EventPhase => (now === null ? (e.status === "ONGOING" ? "live" : e.status === "PUBLISHED" ? "upcoming" : "past") : eventPhase(e, now));
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) if (e.category) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [events]);

  const words = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredEvents = events.filter((event) => {
    const hay = `${event.name} ${event.category ?? ""} ${event.location ?? ""} ${event.guest ?? ""} ${event.year ?? ""}`.toLowerCase();
    if (words.length && !words.every((w) => hay.includes(w))) return false;
    if (category && event.category !== category) return false;
    if (dateFilter === "all") return true;
    const phase = phaseOf(event);
    return dateFilter === "upcoming" ? phase !== "past" : phase === "past";
  // Upcoming: the soonest first. All and Past: the newest first.
  }).sort((a, b) => (dateFilter === "upcoming" ? 1 : -1) * (eventStart(a) - eventStart(b)));

  const next = now === null ? null : [...events].filter((e) => eventPhase(e, now) !== "past").sort((a, b) => eventStart(a) - eventStart(b))[0] ?? null;

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const first = (current - 1) * PAGE_SIZE;
  const pageEvents = filteredEvents.slice(first, first + PAGE_SIZE);

  const href = (p: number) => hrefFor(p, searchQuery, dateFilter, category);

  /** Go to a page: the address bar follows (Back works), and the list scrolls into view. */
  const goTo = (p: number, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab/window
    e?.preventDefault();
    if (p === current) return;
    setPage(p);
    window.history.pushState(null, "", href(p));
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** A new search or filter starts again from page 1; the address bar keeps it (shareable). */
  const setFilters = (q: string, when: When, cat = category) => {
    setSearchQuery(q);
    setDateFilter(when);
    setCategory(cat);
    setPage(1);
    window.history.replaceState(null, "", hrefFor(1, q, when, cat));
  };

  const filtered = Boolean(searchQuery || dateFilter !== "all" || category);

  return (
    <div className="container mt-8 mb-12">
      <header className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />{events.length} events and counting
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">GUCC Events</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground md:text-lg">
            Seminars, workshops, programming contests, hackathons and cultural programmes hosted by the Green University Computer Club at Green
            University of Bangladesh.
          </p>
        </div>
        {next && (
          <Link href={`/events/${next.slug}`} className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-linear-to-br from-primary/10 to-transparent p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <span className="text-[10px] font-semibold uppercase">{new Date(next.startAt ?? `${next.date}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: TZ, month: "short" })}</span>
              <span className="text-xl font-bold leading-none">{new Date(next.startAt ?? `${next.date}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric" })}</span>
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden />{eventPhase(next, now!) === "live" ? "Happening now" : `Next up · ${countdown(next, now!) ?? ""}`}</span>
              <span className="line-clamp-2 font-semibold group-hover:underline">{next.name}</span>
              {next.registrationOpen && <span className="text-xs text-muted-foreground">Registration is open</span>}
            </span>
          </Link>
        )}
      </header>

      <div className="sticky top-16 z-10 -mx-4 mb-6 space-y-3 bg-background/95 px-4 py-3 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" placeholder="Search by name, guest, place or year" aria-label="Search events" value={searchQuery} onChange={(e) => setFilters(e.target.value, dateFilter)}
              className="h-11 w-full rounded-full border bg-background pl-9 pr-4 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
          </label>
          <div className="flex gap-1 rounded-full border bg-muted/50 p-1" role="group" aria-label="When">
            {(["all", "upcoming", "past"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={dateFilter === w} onClick={() => setFilters(searchQuery, w)}
                className={cn("min-h-9 flex-1 rounded-full px-4 text-sm font-medium transition-colors sm:flex-none", dateFilter === w ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {w === "all" ? "All" : w === "upcoming" ? "Upcoming" : "Past"}
              </button>
            ))}
          </div>
        </div>
        {categories.length > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Category">
            {categories.map(([c, n]) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setFilters(searchQuery, dateFilter, category === c ? "" : c)}
                className={cn("min-h-8 shrink-0 rounded-full border px-3 text-xs transition-colors", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {c} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered && filteredEvents.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} found
          <button type="button" onClick={() => setFilters("", "all", "")} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 underline-offset-2 hover:underline"><X className="h-3.5 w-3.5" aria-hidden />Clear</button>
        </p>
      )}

      <div ref={gridRef} className="grid scroll-mt-40 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pageEvents.map((event, index) => <EventTile key={event.slug} event={event} phase={phaseOf(event)} priority={index < 3} now={now} />)}
      </div>

      {filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <SearchIcon className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
          <p className="text-lg text-muted-foreground">{dateFilter === "upcoming" && !searchQuery && !category ? "No upcoming events announced yet. Check back soon!" : "No events found"}</p>
          {filtered && <button type="button" className={cn(buttonVariants({ variant: "outline" }), "mt-4")} onClick={() => setFilters("", "all", "")}>Clear search and filter</button>}
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Events pages" className="mt-10 flex flex-col items-center gap-3">
          <ul className="flex flex-wrap items-center justify-center gap-2">
            <li>
              <a href={href(Math.max(1, current - 1))} onClick={(e) => goTo(Math.max(1, current - 1), e)} aria-disabled={current === 1} tabIndex={current === 1 ? -1 : undefined}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3", current === 1 && "pointer-events-none opacity-50")}>
                <ChevronLeftIcon className="h-4 w-4" aria-hidden />
                <span>Previous</span>
              </a>
            </li>
            {pageItems(current, pageCount).map((item, i) =>
              item === "gap" ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">…</li>
              ) : (
                <li key={item}>
                  <a href={href(item)} onClick={(e) => goTo(item, e)} aria-current={item === current ? "page" : undefined} aria-label={`Page ${item}`}
                    className={cn(buttonVariants({ variant: item === current ? "default" : "outline" }), "h-10 min-w-10 px-3")}>
                    {item}
                  </a>
                </li>
              ),
            )}
            <li>
              <a href={href(Math.min(pageCount, current + 1))} onClick={(e) => goTo(Math.min(pageCount, current + 1), e)} aria-disabled={current === pageCount} tabIndex={current === pageCount ? -1 : undefined}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3", current === pageCount && "pointer-events-none opacity-50")}>
                <span>Next</span>
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              </a>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {first + 1}–{first + pageEvents.length} of {filteredEvents.length} events
          </p>
        </nav>
      )}
    </div>
  );
}
