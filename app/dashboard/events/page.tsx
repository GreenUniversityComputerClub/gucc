import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listEventsAdmin } from "@/lib/server/services/events";

const EVENT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED", "ARCHIVED"];
import { EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";

export default async function EventsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/events");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const rows = await view<Awaited<ReturnType<typeof listEventsAdmin>>>("events.list", { status: sp.status || undefined, q: sp.q || undefined, category: sp.category || undefined, page }, "/dashboard/events");
  return (
    <>
      <PageHeader title="Events" description="Drafts are private. Publishing follows the governance rules: it may go live immediately or wait for approval." actions={session.caps["events.create"] ? <Link prefetch={false} href="/dashboard/events/new" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">New event</Link> : null} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles" aria-label="Search" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm sm:min-w-56" />
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Any status</option>
          {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState>No events match.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link prefetch={false} href={`/dashboard/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                <p className="text-xs text-muted-foreground">{e.start_at?.slice(0, 10) ?? "no date"} · {e.category_name ?? "uncategorised"}{e.capacity ? ` · ${e.registrations}/${e.capacity} registered` : e.registrations ? ` · ${e.registrations} registered` : ""}</p>
              </div>
              <StatusBadge status={e.status} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={rows.length === 30} base="/dashboard/events" params={{ status: sp.status, q: sp.q }} />
    </>
  );
}
