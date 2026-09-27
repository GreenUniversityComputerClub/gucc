import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listMeetings } from "@/lib/server/services/work";
import { ActionForm, EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { MeetingFields } from "./meeting-fields";
import { scheduleMeetingAction } from "./actions";

type SP = Promise<{ when?: string; all?: string }>;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const RESPONSE: Record<string, string> = { YES: "Going", NO: "Not going", MAYBE: "Maybe", INVITED: "Not replied" };

export default async function MeetingsPage({ searchParams }: { searchParams: SP }) {
  await requireSignedIn("/dashboard/meetings");
  const sp = await searchParams;
  const data = await view<Awaited<ReturnType<typeof listMeetings>>>("meetings.list", { when: sp.when, all: sp.all === "1" }, "/dashboard/meetings");
  const q = (patch: Record<string, string>) => `/dashboard/meetings?${new URLSearchParams({ when: data.past ? "past" : "upcoming", ...(data.all ? { all: "1" } : {}), ...patch })}`;
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm", on ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Meetings" description="Meetings you're invited to. Google Meet links are added by the organiser." />
      <Section title={data.past ? "Past" : "Upcoming"} actions={
        <div className="flex flex-wrap gap-3">
          <nav className="flex gap-1" aria-label="When">
            {tab(q({ when: "upcoming" }), !data.past, "Upcoming")}
            {tab(q({ when: "past" }), data.past, "Past")}
          </nav>
          {data.canManage && (
            <nav className="flex gap-1" aria-label="Whose">
              {tab(`/dashboard/meetings?when=${data.past ? "past" : "upcoming"}`, !data.all, "Mine")}
              {tab(q({ all: "1" }), data.all, "All meetings")}
            </nav>
          )}
        </div>
      }>
        {data.rows.length === 0 ? <EmptyState>{data.past ? "No past meetings." : "No upcoming meetings."}</EmptyState> : (
          <ul className="divide-y">
            {data.rows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/meetings/${m.id}`} className="font-medium hover:underline">{m.title}</Link>
                  <p className="text-xs text-muted-foreground">{when(m.starts_at)}{m.location ? ` · ${m.location}` : ""} · {m.participants} invited · organised by {m.organizer}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {m.my_response && m.status === "SCHEDULED" && <span className="text-muted-foreground">{RESPONSE[m.my_response]}</span>}
                  {m.meet_url && m.status === "SCHEDULED" && !data.past && <a href={m.meet_url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-2 py-1 hover:bg-muted">Join Meet</a>}
                  <StatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {data.canSchedule && (
        <Section title="Schedule a meeting" className="mt-6 scroll-mt-20" id="schedule" description="Participants are notified in their dashboard. No calendar invitation or Meet room is created automatically.">
          <ActionForm action={scheduleMeetingAction} submitLabel="Schedule" redirectTo="/dashboard/meetings/{id}">
            <MeetingFields />
          </ActionForm>
        </Section>
      )}
    </>
  );
}
