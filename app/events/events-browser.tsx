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
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past">("all");
  // The server renders page 1; the address bar's page is applied after hydration.
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setPage(pageFromUrl());
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
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const first = (current - 1) * PAGE_SIZE;
  const pageEvents = filteredEvents.slice(first, first + PAGE_SIZE);

  const hrefFor = (p: number) => (p === 1 ? "/events" : `/events?page=${p}`);

  /** Go to a page: the address bar follows (Back works), and the list scrolls into view. */
  const goTo = (p: number, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) return; // new tab/window
    e?.preventDefault();
    if (p === current) return;
    setPage(p);
    window.history.pushState(null, "", hrefFor(p));
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** A new search or filter starts again from page 1. */
  const resetPage = () => {
    if (current === 1 && page === 1) return;
    setPage(1);
    window.history.replaceState(null, "", "/events");
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
           <Input placeholder="Search events..." aria-label="Search events" className="pl-9" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}/>
        </div>
        <div className="flex gap-2">
            <Button variant={dateFilter === "all" ? "default" : "outline"} onClick={() => { setDateFilter("all"); resetPage(); }}>
              <FilterIcon className="mr-2 h-4 w-4" /> All
            </Button>
            <Button variant={dateFilter === "upcoming" ? "default" : "outline"} onClick={() => { setDateFilter("upcoming"); resetPage(); }}>
             Upcoming
            </Button>
            <Button variant={dateFilter === "past" ? "default" : "outline"} onClick={() => { setDateFilter("past"); resetPage(); }}>
             Past
            </Button>
        </div>
      </div>
       {/* Event Grid */}
       <div ref={gridRef} className="grid scroll-mt-24 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pageEvents.map((event, index) =>
          (
            <EventCard key={event.slug} event={event} index={index} />
          ))}
       </div>
       {/* Empty state */}
      {filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">No events found</p>
        </div>
      )}
      {pageCount > 1 && (
        <nav aria-label="Events pages" className="mt-10 flex flex-col items-center gap-3">
          <ul className="flex flex-wrap items-center justify-center gap-2">
            <li>
              <a
                href={hrefFor(Math.max(1, current - 1))}
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
                    href={hrefFor(item)}
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
                href={hrefFor(Math.min(pageCount, current + 1))}
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
