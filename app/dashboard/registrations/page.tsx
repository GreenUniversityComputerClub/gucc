import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listAllRegistrations } from "@/lib/server/services/events";
import { EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";

type Data = Awaited<ReturnType<typeof listAllRegistrations>>;
const STATUSES = ["REGISTERED", "WAITLISTED", "ATTENDED", "CANCELLED", "REJECTED"];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/registrations");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const data = await view<Data>("events.registrations", { q: sp.q, status: sp.status, eventId: sp.event, page }, "/dashboard/registrations");

  return (
    <>
      <PageHeader title="Registrations" description="Everyone who registered for an event on the site. Change a registration's status, or export an event's list, from its event page." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or student ID" aria-label="Search registrations" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="event" defaultValue={sp.event ?? ""} aria-label="Event" className="h-10 md:h-9 min-w-0 max-w-full rounded-md border bg-background px-3 text-base md:text-sm sm:max-w-72">
          <option value="">All events</option>
          {data.events.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.n})</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {data.rows.length === 0 ? <EmptyState>No registrations match.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">· {r.email}{r.student_id ? ` · ${r.student_id}` : ""}</span>
                <span className="block text-xs text-muted-foreground">
                  <Link prefetch={false} href={`/dashboard/events/${r.event_id}`} className="underline">{r.event_title}</Link> · event {when(r.start_at)} · registered {when(r.created_at)}
                </span>
              </span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={data.hasMore} base="/dashboard/registrations" params={{ q: sp.q, status: sp.status, event: sp.event }} />
    </>
  );
}
