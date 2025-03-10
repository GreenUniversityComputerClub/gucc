"use client";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import eventsData from "@/data/events.json";
import Date from "@/components/svgIcon/Date";
import Time from "@/components/svgIcon/Time";
import Location from "@/components/svgIcon/Location";
import JoinEvent from "@/components/JoinEvent";

const events = eventsData;

export default function EventDetailsPage() {
  const { slug } = useParams();
  const router = useRouter();

  const event = events.find(
    (e) =>
      e.name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "") === slug
  );

  if (!event) {
    return notFound();
  }

  const guestText = event.guest || "";
  const chiefGuestMatch = guestText.match(/Chief Guest: ([^\n]+)/);
  const chiefGuest = chiefGuestMatch ? chiefGuestMatch[1] : null;
  const otherGuests = guestText
    .split("\n")
    .filter((guest) => guest && !guest.includes("Chief Guest:"))
    .map((guest) => {
      const [title, ...nameParts] = guest.split(": ");
      return { title: title.trim(), name: nameParts.join(": ").trim() };
    });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10">
      <div className="max-w-5xl w-full px-6">
        {/* Hero Section */}
        <div className="relative h-[450px] rounded-3xl overflow-hidden shadow-md mb-10">
          <Image
            src={`/events/${event.sl}.jpg`}
            alt={event.name}
            fill
            className="w-full h-full object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-0 left-0 p-8 w-full">
            <span className="inline-block px-4 py-1 rounded-full bg-primary text-white text-sm font-medium mb-4">
              {event.category}
            </span>
            <h1 className="text-5xl font-bold text-white mb-2">{event.name}</h1>
            <p className="text-gray-200 text-xl font-medium">{event.organizer}</p>
          </div>
        </div>

        {/* Event Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Details */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">About the Event</h2>
              {event.description && (
                <p className="text-muted-foreground leading-relaxed">{event.description}</p>
              )}
            </div>

            {/* Guests Section */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h3 className="text-2xl font-semibold text-gray-900 mb-4 border-b pb-2">
                Honorable Guests
              </h3>
              <div className="space-y-6">
                {chiefGuest && (
                  <div className="p-4 bg-gray-100 rounded-lg">
                    <h4 className="text-lg font-semibold text-primary mb-1">Chief Guest</h4>
                    <p className="text-gray-700 font-medium">{chiefGuest}</p>
                  </div>
                )}
                {otherGuests.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">Other Guests</h4>
                    <ul className="space-y-2">
                      {otherGuests.map((guest, index) => (
                        <li key={index} className="flex flex-col">
                          <span className="text-gray-900 font-semibold">{guest.title}</span>
                          <span className="text-gray-700">{guest.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Event Info Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-center">
                <Date className="mr-3 text-primary" />
                <span className="text-lg text-gray-700">{event.date}</span>
              </div>
              <div className="flex items-center">
                <Time className="mr-3 text-primary" />
                <span className="text-lg text-gray-700">{event.time}</span>
              </div>
              <div className="flex items-center">
                <Location className="mr-3 text-primary" />
                <span className="text-lg text-gray-700">
                  {event.location || "Green University, Multi-Purpose Hall"}
                </span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Participants</h4>
                <div className="flex items-center">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${(event.participants / 500) * 100}%` }}
                    />
                  </div>
                  <span className="ml-4 text-sm text-gray-700">{event.participants} / 500</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Join Event Section */}
        <div className="mt-12 flex justify-center">
          {event.ticket_info ||
            (new Date(event.date) < new Date() && <JoinEvent event={event} />)}
        </div>
      </div>
    </div>
  );
}
