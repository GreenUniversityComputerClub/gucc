import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listQuizzesAdmin } from "@/lib/server/services/quizzes";
import { EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"];

export default async function QuizzesAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/quizzes");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const data = await view<Awaited<ReturnType<typeof listQuizzesAdmin>>>(
    "quizzes.list",
    { status: sp.status || undefined, q: sp.q || undefined, page },
    "/dashboard/quizzes",
  );

  return (
    <>
      <PageHeader
        title="Quiz Arena"
        description="Create live-hosted quizzes for GUCC events, orientations, and workshops. Scores and timers are enforced server-side."
        actions={
          session.caps["quizzes.create"] ? (
            <Link
              prefetch={false}
              href="/dashboard/quizzes/new"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden />New quiz
            </Link>
          ) : null
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search quiz titles or slugs"
          aria-label="Search quizzes"
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-base sm:min-w-56 md:h-9 md:text-sm"
        />
        <select
          name="status"
          aria-label="Status"
          defaultValue={sp.status ?? ""}
          className="h-10 rounded-md border bg-background px-3 text-base md:h-9 md:text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>
          ))}
        </select>
        <button className="h-10 rounded-md border px-4 text-sm hover:bg-muted md:h-9">Filter</button>
      </form>

      {data.rows.length === 0 ? (
        <EmptyState>No quizzes match yet. Create one to launch a live competition.</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.rows.map((q) => (
            <li key={String(q.id)} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Trophy className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <Link prefetch={false} href={`/dashboard/quizzes/${q.id}`} className="block truncate font-medium hover:underline">
                    {String(q.title)}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    /{String(q.slug)} · {Number(q.question_count ?? 0)} question{Number(q.question_count ?? 0) === 1 ? "" : "s"} ·{" "}
                    {Number(q.session_count ?? 0)} session{Number(q.session_count ?? 0) === 1 ? "" : "s"} ·{" "}
                    {String(q.access_mode ?? "GUEST").toLowerCase().replace("_", " ")}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-2">
                <StatusBadge status={String(q.status)} content />
                <Link prefetch={false} href={`/dashboard/quizzes/${q.id}`} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  Manage
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Pager page={data.page} hasMore={data.rows.length === 30} base="/dashboard/quizzes" params={{ status: sp.status, q: sp.q }} />
    </>
  );
}
