"use client";
import eventsData from "@/data/events.json";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UpcomingEventCard } from "@/components/ui/upcoming-event-card";
import { EventCard } from "@/components/ui/event-card";
import { ArrowLeft, ArrowRight } from "lucide-react";

const allEvents = eventsData;

export default function EventsPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(false);

  const upcomingEvents = allEvents.filter((event) => event.isUpcoming);
  const pastEvents = allEvents.filter((event) => !event.isUpcoming);
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
                  <UpcomingEventCard
                    event={{
                      ...event,
                      endDate: event.endDate || "",
                      category: event.category || "",
                    }}
                    index={index}
                  />
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
        <h2 className="text-2xl font-semibold mb-4">Recent Events</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pastEvents
            .sort(
              (a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime(),
            )
            .map((event, index) => (
              <EventCard key={index} event={event} index={index} />
            ))}
        </div>
      </section>
    </div>
  );
}