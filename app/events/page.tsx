"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import eventsData from "@/data/events.json";
import upcomingEventsData from "@/data/upcoming-events.json";
import { CalendarIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { UpcomingEventCard } from "@/components/ui/UpcomingEventCard";

const events = eventsData;
const upcomingEvents = upcomingEventsData;

export default function EventsPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(true);
  const hasUpcomingEvents = upcomingEvents.length > 0;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const handleScroll = () => {
        setShowLeftButton(container.scrollLeft > 0);
        setShowRightButton(
          container.scrollWidth - container.clientWidth > container.scrollLeft,
        );
      };

      container.addEventListener("scroll", handleScroll);
      handleScroll(); // Initial check

      return () => {
        container.removeEventListener("scroll", handleScroll);
      };
    }
  }, []);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -300,
        behavior: "smooth",
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 300,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="container mt-8 mb-12">
      {/* Upcoming Events Section */}
      {hasUpcomingEvents && (
        <section className="mb-8 relative">
          <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
          <div className="relative">
            {showLeftButton && (
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 ml-4 hover: hover:scale-95 transition-all duration-300 rounded-full p-3 shadow-lg"
                onClick={scrollLeft}
              >
                <ArrowLeft className="h-5 w-5 text-black" />
                <span className="sr-only">Scroll Left</span>
              </Button>
            )}

            <div
              ref={scrollContainerRef}
              className="overflow-x-auto whitespace-nowrap scroll-smooth no-scrollbar py-2"
            >
              {upcomingEvents.map((event, index) => (
                <div
                  key={index}
                  className="inline-block w-80 shrink-0 mr-6 last:mr-0"
                >
                  <UpcomingEventCard event={event} index={index} />
                </div>
              ))}
            </div>

            {showRightButton && (
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 mr-4 hover: hover:scale-95 transition-all duration-300 rounded-full p-3 shadow-lg"
                onClick={scrollRight}
              >
                <ArrowRight className="h-5 w-5 text-black" />
                <span className="sr-only">Scroll Right</span>
              </Button>
            )}
          </div>
        </section>
      )}

      {/* All Events Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">All Events</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events
            .sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            )
            .map((event, index) => (
              <EventCard key={index} event={event} index={index} />
            ))}
        </div>
      </section>
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