import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Users, Video } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listMeetings } from "@/lib/server/services/work";
import { ActionForm, EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { MeetingFields } from "./meeting-fields";
import { scheduleMeetingAction } from "./actions";
import { Countdown } from "./countdown";

type SP = Promise<{ when?: string; all?: string; month?: string }>;
type Data = Awaited<ReturnType<typeof listMeetings>>;
const TZ = "Asia/Dhaka";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const RESPONSE: Record<string, string> = { YES: "Going", NO: "Not going", MAYBE: "Maybe", INVITED: "Not replied" };
const TABS = [["upcoming", "Upcoming"], ["today", "Today"], ["month", "Calendar"], ["past", "Past"]] as const;

function MonthGrid({ data }: { data: Data }) {
  const [y, mo] = data.month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // weeks start on Monday
  const today = dayKey(new Date().toISOString());
  const byDay = new Map<string, Data["rows"]>();
  for (const m of data.rows) byDay.set(dayKey(m.starts_at), [...(byDay.get(dayKey(m.starts_at)) ?? []), m]);
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => `${data.month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-sm" role="grid" aria-label={`Meetings in ${first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} role="columnheader" className="bg-muted/60 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>)}
        {cells.map((day, i) => (
          <div key={i} role="gridcell" className={cn("min-h-16 bg-card p-1 sm:min-h-24 sm:p-1.5", !day && "bg-muted/30")}>
            {day && (
              <>
                <p className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", day === today && "bg-primary font-semibold text-primary-foreground")}>{Number(day.slice(8))}</p>
                <ul className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 3).map((m) => (
                    <li key={m.id}>
                      <Link prefetch={false} href={`/dashboard/meetings/${m.id}`} title={`${time(m.starts_at)} ${m.title}`}
                        className={cn("block truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:underline", m.status === "CANCELLED" ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 text-primary")}>
                        <span className="hidden sm:inline">{time(m.starts_at)} </span>{m.title}
                      </Link>
                    </li>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 3 && <li className="px-1 text-[11px] text-muted-foreground">+{byDay.get(day)!.length - 3} more</li>}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function MeetingsPage({ searchParams }: { searchParams: SP }) {
  await requireSignedIn("/dashboard/meetings");
  const sp = await searchParams;
  const data = await view<Data>("meetings.list", { when: sp.when, all: sp.all === "1", month: sp.month }, "/dashboard/meetings");
  const q = (patch: Record<string, string>) => `/dashboard/meetings?${new URLSearchParams({ when: data.when, ...(data.all ? { all: "1" } : {}), ...(data.when === "month" ? { month: data.month } : {}), ...patch })}`;
  const shift = (n: number) => {
    const [y, m] = data.month.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <PageHeader title="Meetings" description="Meetings you're invited to: reply, join, add them to your calendar, and keep the minutes and action items in one place." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none]" aria-label="When">
          {TABS.map(([k, label]) => (
            <Link key={k} prefetch={false} href={q({ when: k, month: data.month })} aria-current={data.when === k ? "page" : undefined}
              className={cn("inline-flex min-h-9 shrink-0 items-center rounded-md px-2.5 text-sm sm:px-3", data.when === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
          ))}
        </nav>
        {data.canManage && (
          <nav className="flex gap-1" aria-label="Whose">
            <Link prefetch={false} href={`/dashboard/meetings?when=${data.when}`} aria-current={!data.all ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded-md px-3 text-sm", !data.all ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>Mine</Link>
            <Link prefetch={false} href={q({ all: "1" })} aria-current={data.all ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded-md px-3 text-sm", data.all ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>All meetings</Link>
          </nav>
        )}
        {data.canSchedule && <Link prefetch={false} href="#schedule" className="ml-auto inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Schedule a meeting</Link>}
      </div>

      {data.when === "month" ? (
        <Section title={monthLabel} actions={
          <div className="flex gap-1">
            <Link prefetch={false} href={q({ month: shift(-1) })} aria-label="Previous month" className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
            <Link prefetch={false} href={q({ month: shift(1) })} aria-label="Next month" className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted"><ChevronRight className="h-4 w-4" /></Link>
          </div>
        }>
          <MonthGrid data={data} />
        </Section>
      ) : (
        <Section title={TABS.find(([k]) => k === data.when)?.[1] ?? "Upcoming"}>
          {data.rows.length === 0 ? <EmptyState>{data.when === "past" ? "No past meetings." : data.when === "today" ? "No meetings today." : "No upcoming meetings."}</EmptyState> : (
            <ul className="space-y-2">
              {data.rows.map((m) => {
                const link = m.meet_url ?? m.join_url;
                const d = new Date(m.starts_at);
                return (
                  <li key={m.id} className={cn("flex items-stretch gap-3 rounded-xl border bg-card p-3", m.status === "CANCELLED" && "opacity-70")}>
                    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 py-1 text-primary">
                      <span className="text-[11px] font-medium uppercase">{d.toLocaleDateString("en-GB", { timeZone: TZ, month: "short" })}</span>
                      <span className="text-xl font-bold leading-none">{d.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric" })}</span>
                      <span className="text-[11px]">{d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link prefetch={false} href={`/dashboard/meetings/${m.id}`} className={cn("font-medium hover:underline", m.status === "CANCELLED" && "line-through")}>{m.title}</Link>
                        {m.status !== "SCHEDULED" && <StatusBadge status={m.status} />}
                        {m.status === "SCHEDULED" && data.when !== "past" && <Countdown starts={m.starts_at} ends={m.ends_at} />}
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{time(m.starts_at)}{m.ends_at ? `–${time(m.ends_at)}` : ""}</span>
                        {m.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{m.location}</span>}
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{m.going} going of {m.participants}</span>
                        <span>by {m.organizer}</span>
                        {m.my_response && m.status === "SCHEDULED" && <span className="font-medium text-foreground">You: {RESPONSE[m.my_response]}</span>}
                      </p>
                    </div>
                    {link && m.status === "SCHEDULED" && data.when !== "past" && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 self-center rounded-md border px-3 text-sm hover:bg-muted" aria-label={`Join ${m.title}`}>
                        <Video className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Join</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
      {data.canSchedule && (
        <Section title="Schedule a meeting" className="mt-6 scroll-mt-20" id="schedule" description="Participants are notified in their dashboard and can add it to their own calendar.">
          <ActionForm action={scheduleMeetingAction} submitLabel="Schedule" redirectTo="/dashboard/meetings/{id}">
            <MeetingFields />
          </ActionForm>
        </Section>
      )}
    </>
  );
}
