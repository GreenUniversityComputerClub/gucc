import { view } from "@/lib/api/session";
import type { contestsView } from "@/lib/server/views/admin";
import { TeamsEditor, type TeamRow } from "@/components/admin/structured-editors";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { saveContestAction } from "../actions";

export default async function ContestsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { rows, events } = await view<Awaited<ReturnType<typeof contestsView>>>("views.contests", {}, "/dashboard/contests");
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = sp.status ?? "";
  const details = rows
    .map((r) => ({ c: r.contest as Record<string, string | null>, teams: r.teams }))
    .filter(({ c, teams }) => (!status || c.status === status) && (!q || [c.title, c.type, c.host, ...teams.map((t) => t.name), ...teams.flatMap((t) => t.members)].some((x) => x?.toLowerCase().includes(q))));

  const fields = (c?: Record<string, string | null>, teams?: TeamRow[]) => (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Field name="type" label="Type" defaultValue={c?.type ?? "IUPC"} required />
        <Field name="title" label="Title" defaultValue={c?.title} required className="md:col-span-2" />
        <Field name="heldOnText" label="Date" defaultValue={c?.held_on_text} placeholder="Jun 4, 2022" />
        <Field name="host" label="Problem setters / host" defaultValue={c?.host} hint="Shown as the contest's authors." />
        <Field name="platform" label="Platform" defaultValue={c?.platform} placeholder="toph.co, vjudge…" />
        <Field name="contestLink" label="Contest link" type="url" defaultValue={c?.contest_link} />
        <Field name="standingsLink" label="Standings link" type="url" defaultValue={c?.standings_link} />
        <Field name="problemsetLink" label="Problem set link" type="url" defaultValue={c?.problemset_link} />
        <Field name="editorialLink" label="Editorial link" type="url" defaultValue={c?.editorial_link} />
        <Field name="practiceLink" label="Practice link" type="url" defaultValue={c?.practice_link} />
        <Field name="status" label="Status" type="select" defaultValue={c?.status ?? "PUBLISHED"} options={[{ value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Draft (hidden)" }, { value: "ARCHIVED", label: "Archived (hidden)" }]} />
        <Field name="eventId" label="Event (registrations, photos)" type="select" defaultValue={c?.event_id ?? ""} options={[{ value: "", label: "Not linked" }, ...events.map((e) => ({ value: e.id, label: e.label }))]} className="md:col-span-2" />
      </div>
      <div><p className="mb-2 text-sm font-medium">Teams and results</p><TeamsEditor name="teams" initial={teams ?? []} /></div>
    </>
  );

  return (
    <>
      <PageHeader title="Contests" description="Programming contest results shown at /contests. Link a contest to its event to take registrations and show photos there." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Contest, team or participant" aria-label="Search contests" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="status" defaultValue={status} aria-label="Status" className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      <div className="space-y-3">
        {details.map(({ c, teams }) => (
          <details key={c.id} className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer"><span className="font-medium">{c.title}</span> <span className="text-xs text-muted-foreground">/contests/{c.legacy_id} · {teams.length} teams</span> {c.status !== "PUBLISHED" && <StatusBadge status={String(c.status)} />}</summary>
            <div className="mt-3">
              <ActionForm action={saveContestAction.bind(null, c.id!)}>{fields(c, teams)}</ActionForm>
            </div>
          </details>
        ))}
        {details.length === 0 && <p className="text-sm text-muted-foreground">No contests match.</p>}
      </div>
      <Section title="Add a contest" className="mt-6">
        <ActionForm action={saveContestAction.bind(null, null)} submitLabel="Add contest" resetOnSuccess>{fields()}</ActionForm>
      </Section>
    </>
  );
}
