'use client'

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClubEvent } from "@/lib/events";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EventCard } from "./components";

/** Events per page: four rows of three on desktop. */
const PAGE_SIZE = 12;

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
function hrefFor(p: number, q: string, when: When) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (when !== "all") params.set("when", when);
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

export function EventsBrowser({ events }: { events: ClubEvent[] }) {
  //Adding Filtering and Search Features.
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<When>("all");
  // The server renders page 1; the address bar's page is applied after hydration.
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      setPage(pageFromUrl());
      setSearchQuery(new URLSearchParams(window.location.search).get("q") ?? "");
      setDateFilter(whenFromUrl());
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // Filter logic.
  const filteredEvents = events.filter((event) => {
    const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (dateFilter === "all") return matchesSearch;

    const eventDate = new Date(event.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);   //Normalize to start of day.

    if(dateFilter === "upcoming") return matchesSearch && eventDate >= today;
    return matchesSearch && eventDate < today;
  // Upcoming: the soonest first. All and Past: the newest first.
  }).sort((a, b) => (dateFilter === "upcoming" ? 1 : -1) * (new Date(a.date).getTime() - new Date(b.date).getTime()));

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const first = (current - 1) * PAGE_SIZE;
  const pageEvents = filteredEvents.slice(first, first + PAGE_SIZE);

  const href = (p: number) => hrefFor(p, searchQuery, dateFilter);

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
  const setFilters = (q: string, when: When) => {
    setSearchQuery(q);
    setDateFilter(when);
    setPage(1);
    window.history.replaceState(null, "", hrefFor(1, q, when));
  };

  return (
    <div className="container mt-8 mb-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          GUCC Events
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Seminars, workshops, programming contests, hackathons and cultural
          programmes hosted by the Green University Computer Club at Green
          University of Bangladesh — {events.length} events and counting.
        </p>
      </header>
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
           <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
           <Input type="search" placeholder="Search events..." aria-label="Search events" className="pl-9" value={searchQuery} onChange={(e) => setFilters(e.target.value, dateFilter)}/>
        </div>
        <div className="flex gap-2">
            <Button variant={dateFilter === "all" ? "default" : "outline"} aria-pressed={dateFilter === "all"} onClick={() => setFilters(searchQuery, "all")}>
              <FilterIcon className="mr-2 h-4 w-4" /> All
            </Button>
            <Button variant={dateFilter === "upcoming" ? "default" : "outline"} aria-pressed={dateFilter === "upcoming"} onClick={() => setFilters(searchQuery, "upcoming")}>
             Upcoming
            </Button>
            <Button variant={dateFilter === "past" ? "default" : "outline"} aria-pressed={dateFilter === "past"} onClick={() => setFilters(searchQuery, "past")}>
             Past
            </Button>
        </div>
      </div>
       {/* Event Grid */}
       <div ref={gridRef} className="grid scroll-mt-24 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pageEvents.map((event, index) =>
          (
            <EventCard key={event.slug} event={event} index={index} priority={index < 3} />
          ))}
       </div>
       {/* Empty state */}
      {filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">{dateFilter === "upcoming" && !searchQuery ? "No upcoming events announced yet. Check back soon!" : "No events found"}</p>
        {(searchQuery || dateFilter !== "all") && <Button variant="outline" className="mt-4" onClick={() => setFilters("", "all")}>Clear search and filter</Button>}
        </div>
      )}
      {pageCount > 1 && (
        <nav aria-label="Events pages" className="mt-10 flex flex-col items-center gap-3">
          <ul className="flex flex-wrap items-center justify-center gap-2">
            <li>
              <a
                href={href(Math.max(1, current - 1))}
                onClick={(e) => goTo(Math.max(1, current - 1), e)}
                aria-disabled={current === 1}
                tabIndex={current === 1 ? -1 : undefined}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3", current === 1 && "pointer-events-none opacity-50")}
              >
                <ChevronLeftIcon className="h-4 w-4" aria-hidden />
                <span>Previous</span>
              </a>
            </li>
            {pageItems(current, pageCount).map((item, i) =>
              item === "gap" ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">…</li>
              ) : (
                <li key={item}>
                  <a
                    href={href(item)}
                    onClick={(e) => goTo(item, e)}
                    aria-current={item === current ? "page" : undefined}
                    aria-label={`Page ${item}`}
                    className={cn(buttonVariants({ variant: item === current ? "default" : "outline" }), "h-10 min-w-10 px-3")}
                  >
                    {item}
                  </a>
                </li>
              ),
            )}
            <li>
              <a
                href={href(Math.min(pageCount, current + 1))}
                onClick={(e) => goTo(Math.min(pageCount, current + 1), e)}
                aria-disabled={current === pageCount}
                tabIndex={current === pageCount ? -1 : undefined}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3", current === pageCount && "pointer-events-none opacity-50")}
              >
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
