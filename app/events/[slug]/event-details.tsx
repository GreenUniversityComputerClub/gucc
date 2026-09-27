"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ClubEvent } from "@/lib/events";
import DateIcon from "@/components/svgIcon/Date";
import Time from "@/components/svgIcon/Time";
import Location from "@/components/svgIcon/Location";
import { EventRegistration } from "./registration";
import { User, ArrowLeft, Building2, Mic } from "lucide-react";

type Person = { role: "SPEAKER"; name: string; title: string | null };

export function EventDetails({ event, fields, gallery = [], people = [], attachments = [] }: {
  event: ClubEvent;
  fields: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>;
  gallery?: Array<{ url: string; thumb: string; alt: string | null }>;
  people?: Person[];
  attachments?: Array<{ url: string; name: string }>;
}) {
  const router = useRouter();

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
  const speakers = people.filter((p) => p.role === "SPEAKER");
  const participants = event.participants;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10">
      <div className="max-w-5xl w-full px-6">
        {/* Back Button */}
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/events"))}
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
          <div className="relative h-[220px] sm:h-[320px] md:h-[450px] rounded-3xl overflow-hidden shadow-lg">
            <Image
              src={event.image}
              alt={event.name}
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
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

            {speakers.length > 0 && (
              <div className="bg-card rounded-2xl shadow-sm border p-6">
                <div className="flex items-center mb-4 border-b border-border pb-2">
                  <Mic className="h-6 w-6 mr-2 text-primary" />
                  <h3 className="text-2xl font-semibold text-card-foreground">Speakers</h3>
                </div>
                <ul className="space-y-3">
                  {speakers.map((p, i) => (
                    <li key={i} className="flex flex-col">
                      <span className="text-card-foreground font-semibold">{p.name}</span>
                      {p.title && <span className="text-muted-foreground">{p.title}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                <span className="text-lg text-muted-foreground">{event.location}</span>
              </div>
              {/* As on the original page; text attendance ("All Executive Members") shows as is, unknown as a dash. */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Participants
                </h4>
                <div className="flex items-center">
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: typeof participants === "number" && participants > 0 ? "100%" : undefined }}
                    />
                  </div>
                  <span className="ml-4 text-sm text-muted-foreground">
                    {typeof participants === "number" ? `${participants} / ${participants + 50}` : participants || "—"}
                  </span>
                </div>
              </div>
              {event.registrationForm && (
                <a
                  href={event.registrationForm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {event.registrationForm.label || "Register on Google Forms"}
                </a>
              )}
              {attachments.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Documents</h4>
                  <ul className="space-y-1 text-sm">
                    {attachments.map((a) => (
                      <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{a.name}</a></li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Facebook Post Link */}
              {event.link && (
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {/facebook\.com|fb\.me/i.test(event.link) ? "View Facebook Post" : "More details"}
                </a>
              )}
            </div>
          </div>
        </div>

        {gallery.length > 0 && (
          <section className="mt-12" aria-labelledby="gallery-heading">
            <h2 id="gallery-heading" className="mb-4 text-2xl font-bold">Photos</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((g, i) => (
                <li key={g.url}>
                  <a href={g.url} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.thumb} alt={g.alt ?? `${event.name} photo ${i + 1}`} loading="lazy" className="aspect-4/3 w-full object-cover transition-transform hover:scale-105" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Join Event Section */}
        <div className="mt-12 flex justify-center">
          {event.registrationOpen && <EventRegistration slug={event.slug} fields={fields} />}
        </div>
      </div>
    </div>
  );
}
