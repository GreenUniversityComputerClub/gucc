"use client";

import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import eventsData from "@/data/events.json";

const events = eventsData;

export default function EventDetailsPage({
  params,
}: {
  params: { slug: string };
}) {
  const router = useRouter();

  const event = events.find(
    (e) =>
      e.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "") === params.slug
  );

  if (!event) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push("/")}
          className="mb-8 flex items-center text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Events
        </button>

        {/* Event Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="relative h-96">
            <Image
              src={`/events/${event.image}`}
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
                <p className="text-gray-600 mb-6">{event.description}</p>

                {/* Event Info */}
                <div className="space-y-4">
                  {/* Date */}
                  <div className="flex items-center">
                    <svg
                      className="w-6 h-6 text-gray-400 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-gray-600">
                      {new Date(event.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="flex items-center">
                    <svg
                      className="w-6 h-6 text-gray-400 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-gray-600">{event.time}</span>
                  </div>

                  {/* Location */}
                  <div className="flex items-center">
                    <svg
                      className="w-6 h-6 text-gray-400 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="text-gray-600">{event.location}</span>
                  </div>
                </div>
              </div>

              {/* Ticket Information */}
              <div className="bg-gray-50 p-6 rounded-xl">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Ticket Information
                  </h3>
                  <div className="text-3xl font-bold text-indigo-600">
                    {event.price}
                  </div>
                </div>

                {/* Capacity */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    Capacity
                  </h4>
                  {/* <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${
                            (event?.registeredAttendees / event.capacity) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="ml-4 text-sm text-gray-600">
                      {event.registeredAttendees} / {event.capacity}
                    </span>
                  </div> */}
                </div>

                {/* Register Button */}
                <button className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                  Register Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
