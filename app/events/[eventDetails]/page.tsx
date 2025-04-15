"use client";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import DateIcon from "@/components/svgIcon/Date";
import Time from "@/components/svgIcon/Time";
import Location from "@/components/svgIcon/Location";
import JoinEvent from "@/components/JoinEvent";
import eventsDataRaw from "@/data/events.json";
import upcomingEventsData from "@/data/upcoming-events.json";
import UpcomingEventsTimeline from "@/components/ui/upcoming-events-timeline";
import { User, ArrowLeft, Building2 } from "lucide-react";
import { parseGuests } from "@/app/events/[eventDetails]/utils";

type Event = {
  sl: number;
  name: string;
  category?: string;
  organizer?: string;
  description?: string;
  location?: string;
  participants?: number | null;
  ticket_info?: string;
  date: string;
  time: string;
  guest?: string;
  isUpcoming?: boolean;
}
const eventsData = eventsDataRaw as Event[];
export default function EventDetailsPage() {
  const { eventDetails } = useParams();
  const router = useRouter();
  // Use only eventsData for event details
  const event = eventsData.find(
    (e) =>
      e.name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "") ===
      eventDetails,
  );

  if (!event) {
    return notFound();
  }

  // Find the timeline data for the current event based on sl number, if available
  const timelineEntry = upcomingEventsData.find((e) => e.sl === event.sl);
  const timeline = timelineEntry ? timelineEntry.timeline : null;

  const { chiefGuest, otherGuests } = parseGuests(event.guest);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10">
      <div className="max-w-5xl w-full px-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 py-2"
        >
          <ArrowLeft className="h-5 w-5 text-primary dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-100 hover:text-primary transition-colors duration-200">Back to event page</span>
        </button>

        {/* Hero Section */}
        <div className="mb-10">
          <div className="mb-4">
            <span className="inline-block px-4 py-1 rounded-full bg-primary text-white text-sm font-medium mb-2 ">
              {event.category}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-2 max-w-[90%] dark:text-gray-100">
              {event.name}
            </h1>
            <div className="flex items-center">
              <Building2 className="h-5 w-5 mr-2 text-gray-600 dark:text-gray-400" />   
              <p className="text-gray-700 text-xl font-medium dark:text-gray-100">
                {event.organizer}
              </p>
            </div>
          </div>
          <div className="relative h-[450px] rounded-3xl overflow-hidden shadow-md">
            <Image
              src={`/events/${event.sl}.jpg`}
              alt={event.name}
              fill
              className="w-full h-full object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
          </div>
        </div>

        {/* Event Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
  <div className="md:col-span-2 space-y-6">
    {/* If the event has a timeline, show it */}
    {timeline && event.isUpcoming ? (
      <UpcomingEventsTimeline timeline={timeline} />
    ) : (
      <>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6">
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            About the Event
          </h2>
          {event.description ? (
            <p className="text-muted-foreground dark:text-gray-300 leading-relaxed">
              {event.description}
            </p>
          ) : (
            <p className="text-muted-foreground dark:text-gray-400 leading-relaxed italic">
              No description available.
            </p>
          )}
        </div>
        {/* Guests Section */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6">
          <div className="flex items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
            <User className="h-6 w-6 mr-2 text-primary" />
            <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Honorable Guests
            </h3>
          </div>
          <div className="space-y-6">
            {chiefGuest && (
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <h4 className="text-lg font-semibold text-primary mb-1">
                  Chief Guest
                </h4>
                <p className="text-gray-700 dark:text-gray-100 font-medium">{chiefGuest}</p>
              </div>
            )}
            {otherGuests.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Other Guests
                </h4>
                <ul className="space-y-2">
                  {otherGuests.map((guest, index) => (
                    <li key={index} className="flex flex-col">
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">
                        {guest.title}
                      </span>
                      <span className="text-gray-700 dark:text-gray-100">{guest.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </>
    )}
  </div>
  {/* Event Info Sidebar */}
  <div className="space-y-6">
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center">
        <DateIcon />
        <span className="text-lg text-gray-700 dark:text-gray-100">{event.date}</span>
      </div>
      <div className="flex items-center">
        <Time />
        <span className="text-lg text-gray-700 dark:text-gray-100">{event.time}</span>
      </div>
      <div className="flex items-center">
        <Location />
        <span className="text-lg text-gray-700 dark:text-gray-100">
          {event.location || "Green University, Multi-Purpose Hall"}
        </span>
      </div>
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-100 mb-2">
          Participants
        </h4>
        <div className="flex items-center">
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full dark:bg-primary"
              style={{
                width: `${event.participants && event.participants > 0
                  ? (event.participants / (event.participants + 50)) * 100
                  : 0
                  }%`,
              }}
            />
          </div>
          <span className="ml-4 text-sm text-gray-700 dark:text-gray-100">
            {event.participants ?? 0} / {(event.participants ?? 0) + 50}
          </span>
        </div>
      </div>
    </div>
  </div>
</div>

        {/* Join Event Section */}
        <div className="mt-12 flex justify-center">
          {event.ticket_info ||
            (new Date(event.date) > new Date() && <JoinEvent event={event} />)}
        </div>
      </div>
    </div>
  );
}
