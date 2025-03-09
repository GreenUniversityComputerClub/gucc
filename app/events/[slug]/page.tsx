"use client";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import eventsData from "@/data/events.json";
import BackArrow from "@/components/svgIcon/BackArrow";
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
      e.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "") === slug
  );
  // Extract Chief Guest and Other Guests
  const guestText = event.guest || "";
  const chiefGuestMatch = guestText.match(/Chief Guest: ([^\n]+)/);
  const chiefGuest = chiefGuestMatch ? chiefGuestMatch[1] : null;
  const otherGuests = chiefGuestMatch
    ? guestText.replace(chiefGuestMatch[0], "").trim()
    : guestText;
  if (!event) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push("/")}
          className="mb-8 flex items-center cursor-pointer text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <BackArrow />
          Back to Events
        </button>

        {/* Event Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="relative h-96">
            <Image
              src={`/events/${event.sl}.jpg`}
              alt={event.name}
              fill
              className="w-full h-full object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8">
              <span className="inline-block px-4 py-1 rounded-full bg-indigo-600 text-white text-sm font-medium mb-4">
                {event.category}
              </span>
              <h1 className="text-4xl font-bold text-white mb-2">
                {event.name}
              </h1>
              <p className="text-gray-200 text-lg">{event.organizer}</p>
            </div>
          </div>

          {/* Event Details */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  About the Event
                </h2>
                {event.description && (
                  <p className="text-gray-600 mb-6">{event.description}</p>
                )}

                {/* Event Info */}
                <div className="space-y-4">
                  {/* Date */}
                  <div className="flex items-center">
                    <Date />
                    <span className="text-gray-600">{event.date}</span>
                  </div>

                  {/* Time */}
                  <div className="flex items-center">
                    <Time />
                    <span className="text-gray-600">{event.time}</span>
                  </div>

                  <div className="flex items-center">
                    <Location />
                    {event.location ? (
                      <span className="text-gray-600">{event.location}</span>
                    ) : (
                      <span className="text-gray-600">
                        Green University, Multi-Purpose Hall
                      </span>
                    )}
                    {/* <span className="text-gray-600">{event.location}</span> */}
                  </div>

                  {/* Participants */}
                  <div className="space-y-4 w-1/2">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">
                        Participants
                      </h4>
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full"
                            style={{
                              width: `${(event.participants / 500) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="ml-4 text-sm text-gray-600">
                          {event.participants} / {500}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Location */}
                </div>
              </div>

              {/* Guests */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">
                  Guests
                </h4>

                {/* Chief Guest */}
                {chiefGuest && (
                  <p className="text-gray-600">
                    <strong>Chief Guest:</strong> {chiefGuest}
                  </p>
                )}

                {/* Other Guests */}
                {otherGuests && (
                  <p className="text-gray-600">
                    <strong>Other Guests:</strong> {otherGuests}
                  </p>
                )}
              </div>

              {/* Ticket Information */}
              {event.ticket_info ||
                (new Date(event.date) < new Date() && (
                  <JoinEvent event={event} />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
