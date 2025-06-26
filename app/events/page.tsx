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

  // Determine event status
  const eventDate = new Date(event.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isUpcoming = eventDate >= today;
  const isPast = eventDate < today;

  return (
    <Card className="group overflow-hidden flex flex-col h-full transition-all duration-300 hover:shadow-lg border-border/50 hover:border-border">
      {/* Image Container with Overlay */}
      <div className="relative h-52 w-full overflow-hidden">
        <Link href={`/events/${slug}`} className="block h-full">
          <Image
            src={`/events/${event.sl}.jpg`}
            alt={event.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={index < 6}
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Event Status Badge */}
          <div className="absolute top-3 left-3">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              isUpcoming 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
            }`}>
              {isUpcoming ? 'Upcoming' : 'Past'}
            </span>
          </div>
        </Link>
      </div>

      {/* Card Content */}
      <CardHeader className="pb-3">
        <CardTitle className="line-clamp-2 text-lg group-hover:text-primary transition-colors duration-200">
          <Link href={`/events/${slug}`} className="hover:underline">
            {event.name}
          </Link>
        </CardTitle>
        <div className="flex items-center text-sm text-muted-foreground">
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <CardDescription className="text-sm">
            {new Date(event.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            {event.time && (
              <span className="ml-2 inline-flex items-center">
                <span className="w-1 h-1 bg-muted-foreground rounded-full mr-2" />
                {event.time}
              </span>
            )}
          </CardDescription>
        </div>
      </CardHeader>

      {/* Card Content with Guests */}
      <CardContent className="pt-0 flex-grow flex flex-col justify-between">
        {event.guest && (
          <div className="mt-2">
            <div className="flex items-center text-sm font-medium text-card-foreground mb-2">
              <UserIcon className="mr-2 h-4 w-4 text-primary" />
              <span>Featured Guests</span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {event.guest}
            </p>
          </div>
        )}
        
        {/* View Details Link */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <Link 
            href={`/events/${slug}`}
            className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 group/link"
          >
            View Details
            <svg 
              className="ml-1 h-4 w-4 transition-transform duration-200 group-hover/link:translate-x-1" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
