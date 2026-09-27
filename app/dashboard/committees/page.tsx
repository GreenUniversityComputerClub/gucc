import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { CommitteeRow } from "@/lib/server/services/committees";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { createCommitteeAction, startNextCommitteeAction } from "../actions";

export default async function CommitteesPage() {
  const session = await requireAdmin("/dashboard/committees");
  const rows = await view<CommitteeRow[]>("committees.list", {}, "/dashboard/committees");
  const current = rows.find((c) => c.status === "CURRENT");
  const upcoming = rows.filter((c) => c.status === "UPCOMING");
  const nextYear = String(Number(current?.slug ?? new Date().getFullYear()) + 1);
  const mayCreate = Boolean(session.caps["committees.create"]);

  return (
    <>
      <PageHeader
        title="Committees & executives"
        description="Each term is its own committee. Starting a new term creates a new committee; when you make it current, the previous one is archived with its history intact and the public site switches automatically."
        actions={session.caps["executives.import"] ? <Link prefetch={false} href="/dashboard/committees/import" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Import executives (JSON/CSV)</Link> : undefined}
      />

      {current && (
        <Link prefetch={false} href={`/dashboard/committees/${current.id}`} className="mb-4 block rounded-xl border-2 border-emerald-500/40 bg-card p-5 transition hover:border-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Current committee</p>
          <p className="mt-1 text-xl font-semibold">{current.name}</p>
          <p className="text-sm text-muted-foreground">{current.members} listings · shown at /executives/{current.slug}</p>
        </Link>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {rows.filter((c) => c.id !== current?.id).map((c) => (
          <li key={c.id}>
            <Link prefetch={false} href={`/dashboard/committees/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground">/executives/{c.slug} · {c.members} listings{c.start_date ? ` · from ${c.start_date.slice(0, 10)}` : ""}</span>
              </span>
              <StatusBadge status={c.status} />
            </Link>
          </li>
        ))}
      </ul>

      {mayCreate && upcoming.length === 0 && (
        <Section title="Start the next committee" description="Creates the new term as Upcoming and copies the current committee's campus/wing layout (not its people). Add the new executives, then make it Current from its page." className="mt-6">
          <ActionForm action={startNextCommitteeAction} submitLabel="Create upcoming committee" redirectTo="/dashboard/committees/{id}">
            {current && <input type="hidden" name="copyLayoutFrom" value={current.id} />}
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="name" label="Name" defaultValue={`GUCC Executive Committee ${nextYear}`} required />
              <Field name="slug" label="URL segment" defaultValue={nextYear} hint={`The public page will be /executives/${nextYear}`} required />
              <Field name="termLabel" label="Term" defaultValue={nextYear} required />
              <Field name="academicYear" label="Academic year" placeholder={`${nextYear}–${String(Number(nextYear) + 1).slice(2)}`} />
              <Field name="startDate" label="Start date" type="date" />
              <Field name="endDate" label="End date" type="date" />
            </div>
            <Field name="description" label="Description" type="textarea" rows={2} />
          </ActionForm>
        </Section>
      )}

      {mayCreate && (
        <details className="mt-6 rounded-xl border bg-card p-5">
          <summary className="cursor-pointer font-medium">Add a past committee (historical record)</summary>
          <div className="mt-4">
            <ActionForm action={createCommitteeAction} submitLabel="Create committee" redirectTo="/dashboard/committees/{id}">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="name" label="Name" placeholder="GUCC Executive Committee 2016" required />
                <Field name="slug" label="URL segment" placeholder="2016" required />
                <Field name="termLabel" label="Term" placeholder="2016" required />
                <Field name="academicYear" label="Academic year" />
                <Field name="startDate" label="Start date" type="date" />
                <Field name="endDate" label="End date" type="date" />
                <input type="hidden" name="status" value="ARCHIVED" />
              </div>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
