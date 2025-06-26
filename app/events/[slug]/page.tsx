"use client";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import eventsData from "@/data/events.json";
import DateIcon from "@/components/svgIcon/Date";
import Time from "@/components/svgIcon/Time";
import Location from "@/components/svgIcon/Location";
import JoinEvent from "@/components/JoinEvent";
import { User, ArrowLeft, Building2 } from "lucide-react";

const events = eventsData;

export default function EventDetailsPage() {
  const { slug } = useParams();
  const router = useRouter();

  const event = events.find(
    (e) =>
      e.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "") === slug,
  ) as (typeof events)[number] & {
    category: string;
    organizer?: string;
    description: string;
    location: string;
    participants: number;
    ticket_info: string;
  };

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
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 py-2 group"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
          <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors duration-200">
            Back to event page
          </span>
        </button>

        {/* Hero Section */}
        <div className="mb-10">
          <div className="mb-4">
            <span className="inline-block px-4 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium mb-2">
              {event.category}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-2 max-w-[90%]">
              {event.name}
            </h1>
            <div className="flex items-center">
              <Building2 className="h-5 w-5 mr-2 text-muted-foreground" />
              <p className="text-muted-foreground text-xl font-medium">
                {event.organizer}
              </p>
            </div>
          </div>
          <div className="relative h-[450px] rounded-3xl overflow-hidden shadow-lg">
            <Image
              src={`/events/${event.sl}.jpg`}
              alt={event.name}
              fill
              className="w-full h-full object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        </div>

        {/* Event Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Details */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl shadow-sm border p-6">
              <h2 className="text-3xl font-semibold text-card-foreground mb-4">
                About the Event
              </h2>
              {event.description && (
                <p className="text-muted-foreground leading-relaxed">
                  {event.description}
                </p>
              )}
            </div>

            {/* Guests Section */}
            <div className="bg-card rounded-2xl shadow-sm border p-6">
              <div className="flex items-center mb-4 border-b border-border pb-2">
                <User className="h-6 w-6 mr-2 text-primary" />
                <h3 className="text-2xl font-semibold text-card-foreground">
                  Honorable Guests
                </h3>
              </div>
              <div className="space-y-6">
                {chiefGuest && (
                  <div className="p-4 bg-muted/50 rounded-lg border border-border">
                    <h4 className="text-lg font-semibold text-primary mb-1">
                      Chief Guest
                    </h4>
                    <p className="text-card-foreground font-medium">{chiefGuest}</p>
                  </div>
                )}
                {otherGuests.length > 0 && (
                  <div className="p-4 bg-muted/30 rounded-lg border border-border">
                    <h4 className="text-lg font-semibold text-card-foreground mb-2">
                      Other Guests
                    </h4>
                    <ul className="space-y-2">
                      {otherGuests.map((guest, index) => (
                        <li key={index} className="flex flex-col">
                          <div className="flex flex-col">
                            <span className="text-card-foreground font-semibold">
                              {guest.title}
                            </span>
                            <span className="text-muted-foreground">{guest.name}</span>
                          </div>
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
            <div className="bg-card rounded-2xl shadow-sm border p-6 space-y-4">
              <div className="flex items-center">
                <DateIcon />
                <span className="text-lg text-muted-foreground">{event.date}</span>
              </div>
              <div className="flex items-center">
                <Time />
                <span className="text-lg text-muted-foreground">{event.time}</span>
              </div>
              <div className="flex items-center">
                <Location />
                <span className="text-lg text-muted-foreground">
                  {event.location || "Green University, Multi-Purpose Hall"}
                </span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Participants
                </h4>
                <div className="flex items-center">
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(event.participants/event.participants) * 100}%` }}
                    />
                  </div>
                  <span className="ml-4 text-sm text-muted-foreground">
                    {event.participants} / {event.participants+50}
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
