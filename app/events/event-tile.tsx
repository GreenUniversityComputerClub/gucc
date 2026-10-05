import type { ClubEvent } from "@/lib/events";
import { cn } from "@/lib/utils";
import { Clock, MapPin, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { countdown, type EventPhase } from "./event-status";

const TZ = "Asia/Dhaka";

const PHASE: Record<EventPhase, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-emerald-700 text-white" },
  live: { label: "Happening now", className: "bg-red-600 text-white" },
  past: { label: "Past", className: "bg-black/60 text-white backdrop-blur" },
};

/**
 * One event: its picture with a date badge, name, time and place, and seats or registration.
 * `now` is null until the browser has read its clock (then no countdown is shown); `headingLevel`
 * fits the page it's on.
 */
export function EventTile({ event, phase, priority = false, now, headingLevel = 2 }: { event: ClubEvent; phase: EventPhase; priority?: boolean; now: number | null; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const d = new Date(event.startAt ?? `${event.date}T00:00:00+06:00`);
  const seatsLeft = event.capacity ? Math.max(0, event.capacity - (event.seatsTaken ?? 0)) : null;
  const soon = now !== null && phase === "upcoming" ? countdown(event, now) : null;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring">
      <Link href={`/events/${event.slug}`} className="relative block aspect-16/10 overflow-hidden" tabIndex={-1} aria-hidden>
        <Image src={event.image} alt="" fill sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className={event.image === "/gucc-logo.png" ? "bg-white object-contain p-6" : "object-cover transition-transform duration-500 group-hover:scale-105"} priority={priority} />
        <span className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent" />
        <span className="absolute left-3 top-3 flex flex-col items-center rounded-xl bg-background/95 px-2.5 py-1.5 text-center text-foreground shadow-md">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{d.toLocaleDateString("en-GB", { timeZone: TZ, month: "short" })}</span>
          <span className="text-xl font-bold leading-none">{d.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric" })}</span>
          <span className="text-[10px] text-muted-foreground">{d.toLocaleDateString("en-GB", { timeZone: TZ, year: "numeric" })}</span>
        </span>
        <span className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold shadow", PHASE[phase].className)}>
            {phase === "live" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white align-middle" aria-hidden />}
            {PHASE[phase].label}
          </span>
          {event.registrationOpen && <span className="rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow">Registration open</span>}
        </span>
        {event.category && <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-slate-800">{event.category}</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Heading className="line-clamp-2 text-lg font-semibold leading-snug">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
            {event.name}
          </Link>
        </Heading>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {event.time && <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" aria-hidden />{event.time}{event.endDate ? ` · until ${new Date(`${event.endDate}T00:00:00+06:00`).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" })}` : ""}</li>}
          {event.location && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden /><span className="line-clamp-1">{event.location}</span></li>}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
          {soon && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{soon}</span>}
          {seatsLeft !== null && phase !== "past" && (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", seatsLeft === 0 ? "bg-destructive/10 text-destructive" : seatsLeft <= 10 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
              {seatsLeft === 0 ? "Full: waiting list" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
            </span>
          )}
          {phase === "past" && typeof event.participants === "number" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" aria-hidden />{event.participants.toLocaleString("en-US")} took part</span>
          )}
        </div>
      </div>
    </article>
  );
}
