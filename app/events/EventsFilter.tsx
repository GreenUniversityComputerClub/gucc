'use client'

import { useState } from "react"
import { SearchIcon, FilterIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EventCard, type EventType } from "./page"

export function EventsFilter({ events }: {events: EventType[]}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past">("all");

    const filteredEvents = events.filter((event: EventType) => {
        const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (dateFilter === "all") return matchesSearch;

        const eventDate = new Date(event.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return dateFilter === "upcoming" ? matchesSearch && eventDate >= today : matchesSearch && eventDate < today;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return(
      <div className="container mt-8 mb-12">
        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
               <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
               <Input placeholder="Search events..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-2">
                <Button variant={dateFilter === "all" ? "default" : "outline"} onClick={() => setDateFilter("all")} className="hover:bg-primary/90 hover:text-white cursor-pointer">
                    <FilterIcon className="mr-2 h-4 w-4" /> All
                </Button>
                <Button variant={dateFilter === "upcoming" ? "default" : "outline"} onClick={() => setDateFilter("upcoming")} className="hover:bg-primary/90 hover:text-white cursor-pointer">
                    Upcoming
                </Button>
                <Button variant={dateFilter === "past" ? "default" : "outline"} onClick={() => setDateFilter("past")} className="hover:bg-primary/90 hover:text-white cursor-pointer">
                    Past
                </Button>
            </div>
        </div>
        {/* Event Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event, index) => (
           <EventCard key={index} event={event} index={index} />
          ))}
        </div>

        {/* Empty State */}
        {filteredEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">No events found</p>
          </div>
        )}
      </div>
    );
}