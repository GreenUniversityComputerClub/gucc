"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Ban, Building2, CalendarDays, CalendarPlus, Check, Clock, Download, ExternalLink, FileText, MapPin, Mic, Share2, Ticket, User, Users } from "lucide-react";
import type { ClubEvent } from "@/lib/events";
import { GalleryLightbox } from "@/components/gallery-lightbox";
import { googleCalendarUrl } from "@/lib/ics";
import { absoluteUrl } from "@/lib/seo/site";
import { cn } from "@/lib/utils";
import { Linkified } from "@/app/dashboard/chat/linkify";
import { RegistrationGate } from "./registration";
import { countdown, eventPhase, type EventPhase } from "../event-status";

type Person = { role: "SPEAKER"; name: string; title: string | null };
type AgendaItem = { startsAt: string | null; endsAt: string | null; title: string; speaker: string | null; description: string | null };
const TZ = "Asia/Dhaka";
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/** Guests as typed: "Chief Guest: Name" lines and "Title: Name" lines. */
function guestsOf(text: string) {
  const lines = text.split(/\r?\n|\\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => {
    const [title, ...rest] = l.split(": ");
    return rest.length ? { title: title!.trim(), name: rest.join(": ").trim() } : { title: null, name: l };
  });
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => {
      const url = window.location.href;
      if (navigator.share) {
        try { await navigator.share({ title, url }); return; } catch { /* fall back to copying */ }
      }
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* nothing to do */ }
    }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
      {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}{copied ? "Link copied" : "Share"}
    </button>
  );
}

const PHASE: Record<EventPhase, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-emerald-600 text-white" },
  live: { label: "Happening now", className: "bg-red-600 text-white" },
  past: { label: "This event has ended", className: "bg-muted text-muted-foreground" },
};

/**
 * An event page: the banner and key facts first, then what it's about, the programme, speakers
 * and guests, photos, and registration. The side panel (a bar at the bottom on phones) keeps the
 * date, place, seats, "add to calendar" and "register" in reach while reading.
 */
export function EventDetails({ event, fields, gallery = [], people = [], attachments = [], agenda = [], related = [] }: {
  event: ClubEvent;
  fields: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>;
  gallery?: Array<{ url: string; thumb: string; alt: string | null }>;
  people?: Person[];
  attachments?: Array<{ url: string; name: string }>;
  agenda?: AgendaItem[];
  related?: ClubEvent[];
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const cancelled = event.status === "CANCELLED";
  const phase: EventPhase = cancelled ? "past" : now === null ? (event.status === "ONGOING" ? "live" : event.status === "PUBLISHED" ? "upcoming" : "past") : eventPhase(event, now);
  const start = event.startAt ?? `${event.date}T00:00:00+06:00`;
  const soon = now !== null && phase === "upcoming" ? countdown(event, now) : null;
  const speakers = people.filter((p) => p.role === "SPEAKER");
  const guests = event.guest ? guestsOf(event.guest) : [];
  const description = (event.description ?? "").replace(/\\n/g, "\n").trim();
  const seatsLeft = event.capacity ? Math.max(0, event.capacity - (event.seatsTaken ?? 0)) : null;
  const canRegister = !cancelled && phase !== "past" && (event.registrationOpen !== undefined || Boolean(event.registrationForm));
  const calendarItem = { uid: `${event.slug}@gucc`, title: event.name, start, end: event.endAt ?? (event.endDate ? `${event.endDate}T23:59:00+06:00` : null), location: event.location, url: absoluteUrl(`/events/${event.slug}`) };
  // A map only for a real place (not "Online (Zoom)").
  const mapUrl = event.location && !/\b(online|zoom|google meet|meet\.google|virtual|webinar|facebook live|youtube)\b/i.test(event.location)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.location}, Green University of Bangladesh`)}` : null;

  const facts = (
    <ul className="space-y-3 text-sm">
      <li className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span><span className="block font-medium">{longDate(start)}</span>{event.endDate && <span className="text-muted-foreground">until {longDate(`${event.endDate}T00:00:00+06:00`)}</span>}</span></li>
      {(event.time || event.startAt) && <li className="flex gap-3"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{event.time ?? `${hhmm(event.startAt!)}${event.endAt ? ` – ${hhmm(event.endAt)}` : ""}`} <span className="text-muted-foreground">(Dhaka time)</span></span></li>}
      {event.location && <li className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{event.location}{mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary underline">Open in Maps</a>}</span></li>}
      {event.organizer && <li className="flex gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>Organised by {event.organizer}</span></li>}
      {phase === "past" && event.participants !== undefined && <li className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{typeof event.participants === "number" ? `${event.participants.toLocaleString("en-US")} participants` : event.participants}</span></li>}
    </ul>
  );

  return (
    <div className="bg-background pb-24 md:pb-12">
      <div className="container max-w-6xl pt-6">
        <Link href="/events" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden />All events
        </Link>

        {cancelled && (
          <p role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <span><span className="font-semibold">This event was cancelled.</span> Registered participants were told in their dashboard. See <Link href="/events?when=upcoming" className="underline">upcoming events</Link>.</span>
          </p>
        )}

        {/* The banner is usually a poster full of text: shown whole (never cropped or written over),
            on a blurred copy of itself, with the title and key facts beside it (below it on phones). */}
        <header className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <a href={event.image} target="_blank" rel="noopener noreferrer" aria-label="Open the full event poster"
            className="group relative block aspect-video overflow-hidden rounded-3xl border bg-muted shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Image src={event.image} alt="" fill sizes="(max-width: 1024px) 100vw, 640px" className="scale-110 object-cover opacity-50 blur-2xl" aria-hidden />
            <Image src={event.image} alt={event.name} fill sizes="(max-width: 1024px) 100vw, 640px" className="object-contain transition-transform duration-500 group-hover:scale-[1.02]" priority />
          </a>
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", cancelled ? "bg-destructive text-white" : PHASE[phase].className)}>
                {phase === "live" && !cancelled && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-white align-middle" aria-hidden />}
                {cancelled ? "Cancelled" : PHASE[phase].label}
              </span>
              {event.category && <span className="rounded-full border px-3 py-1 text-xs font-semibold">{event.category}</span>}
              {soon && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{soon}</span>}
            </div>
            <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.5rem]">{event.name}</h1>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{longDate(start)}{event.endDate ? ` – ${longDate(`${event.endDate}T00:00:00+06:00`)}` : ""}</span></li>
              {(event.time || event.startAt) && <li className="flex items-start gap-2"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{event.time ?? `${hhmm(event.startAt!)}${event.endAt ? ` – ${hhmm(event.endAt)}` : ""}`}</span></li>}
              {event.location && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><span>{event.location}</span></li>}
            </ul>
            {canRegister && (event.registrationOpen !== undefined || event.registrationForm) && (
              <div className="mt-6 hidden flex-wrap gap-3 md:flex">
                <a href={event.registrationOpen !== undefined ? "#register" : event.registrationForm!.url}
                  {...(event.registrationOpen !== undefined ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90">
                  <Ticket className="h-4 w-4" aria-hidden />Register
                </a>
                <a href={googleCalendarUrl(calendarItem)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 font-medium hover:bg-muted">
                  <CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar
                </a>
              </div>
            )}
          </div>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            {description && (
              <section aria-labelledby="about-h">
                <h2 id="about-h" className="mb-3 text-2xl font-bold">About the event</h2>
                <div className="whitespace-pre-line text-base leading-relaxed text-muted-foreground wrap-break-word"><Linkified text={description} /></div>
              </section>
            )}

            {agenda.length > 0 && (
              <section aria-labelledby="agenda-h">
                <h2 id="agenda-h" className="mb-4 text-2xl font-bold">Programme</h2>
                <ol className="relative space-y-4 border-l-2 border-primary/30 pl-6">
                  {agenda.map((a, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-background" aria-hidden />
                      {a.startsAt && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{hhmm(a.startsAt)}{a.endsAt ? ` – ${hhmm(a.endsAt)}` : ""}</p>}
                      <p className="font-semibold">{a.title}</p>
                      {a.speaker && <p className="text-sm text-muted-foreground">{a.speaker}</p>}
                      {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {speakers.length > 0 && (
              <section aria-labelledby="speakers-h">
                <h2 id="speakers-h" className="mb-4 flex items-center gap-2 text-2xl font-bold"><Mic className="h-6 w-6 text-primary" aria-hidden />Speakers</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {speakers.map((p, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary" aria-hidden>{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>
                      <span className="min-w-0"><span className="block font-semibold">{p.name}</span>{p.title && <span className="block text-sm text-muted-foreground">{p.title}</span>}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {guests.length > 0 && (
              <section aria-labelledby="guests-h">
                <h2 id="guests-h" className="mb-4 flex items-center gap-2 text-2xl font-bold"><User className="h-6 w-6 text-primary" aria-hidden />Honorable guests</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {guests.map((g, i) => (
                    <li key={i} className={cn("rounded-xl border bg-card p-4", g.title === "Chief Guest" && "border-primary/40 bg-primary/5 sm:col-span-2")}>
                      {g.title && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{g.title}</p>}
                      <p className="font-medium">{g.name}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {gallery.length > 0 && (
              <section aria-labelledby="gallery-heading">
                <h2 id="gallery-heading" className="mb-4 text-2xl font-bold">Photos</h2>
                <GalleryLightbox images={gallery} label={event.name} />
              </section>
            )}

            {canRegister && event.registrationOpen !== undefined && (
              <section id="register" className="scroll-mt-24" aria-labelledby="register-h">
                <h2 id="register-h" className="mb-4 text-2xl font-bold">Register</h2>
                <div className="flex justify-center"><RegistrationGate event={event} fields={fields} /></div>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
              {facts}
              {seatsLeft !== null && !cancelled && phase !== "past" && (
                <div>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">Seats</span><span className="text-muted-foreground">{seatsLeft === 0 ? "Full: waiting list" : `${seatsLeft} of ${event.capacity} left`}</span></div>
                  <div className="h-2 rounded-full bg-muted" role="img" aria-label={`${event.seatsTaken ?? 0} of ${event.capacity} seats taken`}>
                    <div className={cn("h-2 rounded-full transition-all", seatsLeft === 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, Math.round(((event.seatsTaken ?? 0) / event.capacity!) * 100))}%` }} />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {canRegister && event.registrationOpen !== undefined && (
                  <a href="#register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"><Ticket className="h-4 w-4" aria-hidden />Register</a>
                )}
                {!cancelled && event.registrationForm && phase !== "past" && (
                  <a href={event.registrationForm.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700">
                    {event.registrationForm.label || "Register on Google Forms"}<ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                )}
                {!cancelled && phase !== "past" && (
                  <div className="flex gap-2">
                    <a href={googleCalendarUrl(calendarItem)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><CalendarPlus className="h-4 w-4" aria-hidden />Google</a>
                    <a href={`/events/${event.slug}/calendar.ics`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" aria-hidden />Calendar file</a>
                  </div>
                )}
                <div className="flex gap-2">
                  <ShareButton title={event.name} />
                  {event.link && (
                    <a href={event.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
                      {/facebook\.com|fb\.me/i.test(event.link) ? "Facebook post" : "More details"}<ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Documents</h3>
                  <ul className="space-y-1.5 text-sm">
                    {attachments.map((a) => (
                      <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary underline wrap-anywhere"><FileText className="h-4 w-4 shrink-0" aria-hidden />{a.name}</a></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-14" aria-labelledby="related-h">
            <h2 id="related-h" className="mb-4 text-2xl font-bold">More events</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/events/${r.slug}`} className="group flex gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md">
                    <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg"><Image src={r.image} alt="" fill sizes="96px" className="object-cover" /></span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-semibold group-hover:underline">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.startAt ?? `${r.date}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Phones: registering and the calendar stay one tap away. */}
      {canRegister && (
        <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
          {event.registrationOpen !== undefined ? (
            <a href="#register" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground"><Ticket className="h-4 w-4" aria-hidden />Register</a>
          ) : event.registrationForm ? (
            <a href={event.registrationForm.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 font-semibold text-white">Register</a>
          ) : null}
          <a href={`/events/${event.slug}/calendar.ics`} aria-label="Add to calendar" className="inline-flex min-h-11 w-12 items-center justify-center rounded-lg border"><CalendarPlus className="h-5 w-5" /></a>
        </div>
      )}
    </div>
  );
}
