'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import eventsData from "@/data/events.json";
import { CalendarIcon, FilterIcon, SearchIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const events = eventsData;

export default function EventsPage() {
  //Adding Filtering and Search Features.
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past">("all");

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

  return (
    <div className="container mt-8 mb-12">
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
           <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
           <Input placeholder="Search events..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/>
        </div>
        <div className="flex gap-2">
            <Button variant={dateFilter === "all" ? "default" : "outline"} onClick={() => setDateFilter("all")}>
              <FilterIcon className="mr-2 h-4 w-4" /> All
            </Button>
            <Button variant={dateFilter === "upcoming" ? "default" : "outline"} onClick={() => setDateFilter("upcoming")}>
             Upcoming
            </Button>
            <Button variant={dateFilter === "past" ? "default" : "outline"} onClick={() => setDateFilter("past")}>
             Past
            </Button>
        </div>
      </div>
       {/* Event Grid */}
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event, index) =>
          (
            <EventCard key={index} event={event} index={index} />
          ))}
       </div>
       {/* Empty state */}
      {filteredEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">No events found</p>
        </div>
      )}
    </div>
  );
}

export function EventCard({
  event,
  index,
}: {
  event: (typeof eventsData)[number];
  index: number;
}) {
  const slug = event.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");

  return (
    <Card className="overflow-hidden flex flex-col h-full transition-all duration-200 hover:shadow-md">
      <div className="relative h-52 w-full">
        <Link href={`/events/${slug}`}>
          <Image
            src={`/events/${event.sl}.jpg`}
            alt={event.name}
            fill
            className="object-cover"
            priority={index < 6}
          />
        </Link>
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-2">{event.name}</CardTitle>
        <div className="flex items-center text-sm text-muted-foreground">
          <CalendarIcon className="mr-1 h-4 w-4" />
          <CardDescription>
            {new Date(event.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {event.time && <span className="ml-1">• {event.time}</span>}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-grow flex flex-col justify-between">
        {event.guest && (
          <div className="mt-2">
            <div className="flex items-center text-sm font-medium">
              <UserIcon className="mr-1 h-4 w-4" />
              <span>Guests</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
              {event.guest}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}