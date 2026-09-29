import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listEventsAdmin } from "@/lib/server/services/events";

const EVENT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED", "ARCHIVED"];
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { restoreEventAction } from "../actions";

const dhakaDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : null);

export default async function EventsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/events");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const rows = await view<Awaited<ReturnType<typeof listEventsAdmin>>>("events.list", { status: sp.status || undefined, q: sp.q || undefined, category: sp.category || undefined, page }, "/dashboard/events");
  return (
    <>
      <PageHeader title={session.adminAccess ? "Events" : "My events"}
        description={session.adminAccess ? "Drafts are private. Publishing follows the governance rules: it may go live immediately or wait for approval." : "Propose an event for the club. It stays private until a club reviewer approves it; you're notified either way."}
        actions={session.caps["events.create"] ? <Link prefetch={false} href="/dashboard/events/new" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground">{session.adminAccess ? "New event" : "Propose an event"}</Link> : null} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles" aria-label="Search" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ""} className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">Any status</option>
          {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState>{session.adminAccess ? "No events match." : "You haven't proposed an event yet."}</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                {e.status === "ARCHIVED" ? <span className="font-medium">{e.title}</span> : <Link prefetch={false} href={`/dashboard/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link>}
                <p className="text-xs text-muted-foreground">{dhakaDate(e.start_at) ?? "no date"} · {e.category_name ?? "uncategorised"}{e.capacity ? ` · ${e.registrations}/${e.capacity} registered` : e.registrations ? ` · ${e.registrations} registered` : ""}</p>
              </div>
              <span className="flex items-center gap-2">
                <StatusBadge status={e.status} content />
                {e.status === "ARCHIVED" && <ActionForm action={restoreEventAction.bind(null, e.id)} submitLabel="Restore" variant="outline" inline />}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={rows.length === 30} base="/dashboard/events" params={{ status: sp.status, q: sp.q }} />
    </>
  );
}
