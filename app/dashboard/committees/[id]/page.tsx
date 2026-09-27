import Link from "next/link";
import { BulkBar } from "./bulk-bar";
import { view } from "@/lib/api/session";
import type { committeeView } from "@/lib/server/views/admin";
import { ActionForm, EmptyState, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { dhakaDate } from "@/lib/time";
import { unitLabel } from "@/lib/public/shapes";
import { deleteCommitteeAction, endAssignmentAction, invitePersonAction, moveAssignmentAction, restoreListingsAction, updateAssignmentAction, updateCommitteeAction } from "../../actions";
import { AddExecutive } from "./add-executive";
import { QuickEdit } from "./quick-edit";
import { ChangePosition, PositionOptions } from "./change-position";

type View = Awaited<ReturnType<typeof committeeView>>;
type Assignment = View["assignments"][number];

const ACCOUNT_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: "has account", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  invited: { text: "invited", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  "invite-expired": { text: "invite expired", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  none: { text: "no account", cls: "bg-muted text-muted-foreground" },
};

export default async function CommitteeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { committee: c, assignments, positions, units, flatAllowed, caps, otherCommittees, removed } = await view<View>("views.committee", { id }, `/dashboard/committees/${id}`);
  const bulk = caps.assign || caps.remove;
  const groups: Array<{ key: string; title: string; items: Assignment[] }> = [];
  const unitName = (key: string | null) => (key ? unitLabel(key, units.find((u) => u.key === key)?.name) : null);
  for (const section of ["FACULTY", "STUDENT"] as const) {
    const keys = [...new Set(assignments.filter((a) => a.section === section).map((a) => a.unit_key ?? ""))].sort();
    for (const k of keys) {
      const items = assignments.filter((a) => a.section === section && (a.unit_key ?? "") === k);
      if (items.length) groups.push({ key: `${section}:${k}`, title: `${section === "FACULTY" ? "Faculty advisors" : "Student executives"}${k ? ` · ${unitName(k)}` : ""}`, items });
    }
  }
  const active = assignments.filter((a) => !a.end_date).length;

  return (
    <>
      <PageHeader
        title={c.name}
        description={`${active} active listing${active === 1 ? "" : "s"} · public page /executives/${c.slug}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            <Link prefetch={false} href={`/executives/${c.slug}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">View public page</Link>
            {caps.import && <Link prefetch={false} href={`/dashboard/committees/import?committee=${id}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Import JSON/CSV</Link>}
            {assignments.length > 0 && (
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Export</summary>
                <div className="absolute right-0 z-20 mt-2 w-60 space-y-1 rounded-lg border bg-popover p-2 text-sm shadow-lg">
                  <a href={`/api/admin/committees/${id}/export?format=json`} className="block rounded px-2 py-1.5 hover:bg-muted">JSON (re-importable)</a>
                  <a href={`/api/admin/committees/${id}/export?format=csv`} className="block rounded px-2 py-1.5 hover:bg-muted">CSV spreadsheet (re-importable)</a>
                  <p className="px-2 pt-1 text-xs text-muted-foreground">Edit the file for the next term and import it into the new committee.</p>
                </div>
              </details>
            )}
            {caps.assign && <AddExecutive committeeId={id} positions={positions} units={units} isModerator={caps.isModerator} flatAllowed={flatAllowed} />}
          </>
        }
      />

      {c.status === "UPCOMING" && caps.edit && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/50 bg-sky-500/5 p-4 text-sm">
          <p>This committee is <strong>upcoming</strong>. When the new executives are in place, make it current: the public site switches to it and the previous committee is archived.</p>
          <ActionForm action={updateCommitteeAction.bind(null, id)} submitLabel="Make current" inline confirm={`Make ${c.name} the current committee? The current committee will be archived and its executives lose their position permissions.`}>
            <input type="hidden" name="name" value={c.name} />
            <input type="hidden" name="slug" value={c.slug} />
            <input type="hidden" name="termLabel" value={c.term_label} />
            <input type="hidden" name="academicYear" value={c.academic_year ?? ""} />
            <input type="hidden" name="startDate" value={dhakaDate(c.start_date) ?? ""} />
            <input type="hidden" name="endDate" value={dhakaDate(c.end_date) ?? ""} />
            <input type="hidden" name="description" value={c.description ?? ""} />
            <input type="hidden" name="status" value="CURRENT" />
            <input type="hidden" name="expectedUpdatedAt" value={String(c.updated_at ?? "")} />
          </ActionForm>
        </div>
      )}

      {assignments.length === 0 ? (
        <EmptyState>
          <p>No one is listed yet.</p>
          {caps.assign && <p className="mt-1">Use <strong>Add executive</strong> to add faculty advisors and student executives.</p>}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {bulk && (
            <BulkBar
              committeeId={id}
              positions={positions.map((p) => ({ id: p.id, name: p.name, isProtected: p.isProtected }))}
              committees={otherCommittees}
              canAssign={caps.assign}
              canRemove={caps.remove}
            />
          )}
          {caps.assign && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">Quick edit: titles, names and order of everyone at once</summary>
              <div className="mt-4">
                <QuickEdit committeeId={id} rows={groups.flatMap((g) => g.items.map((a) => ({ id: a.id, name: a.full_name, title: a.position_title, displayName: a.display_name ?? "", order: a.display_order, group: g.title, stamp: a.updated_at })))} />
              </div>
            </details>
          )}
          <PositionOptions options={positions.filter((p) => caps.isModerator || !p.isProtected).map((p) => ({ value: p.id, label: p.name }))}>
          {groups.map((g) => (
            <Section key={g.key} title={`${g.title} (${g.items.length})`}>
              <ul className="divide-y">
                {g.items.map((a, i) => {
                  const acc = ACCOUNT_LABEL[a.account] ?? ACCOUNT_LABEL.none;
                  return (
                    <li key={a.id} className={`flex flex-col gap-3 py-3 sm:flex-row sm:items-center ${a.end_date ? "opacity-60" : ""}`}>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {bulk && <input type="checkbox" data-bulk-id value={a.id} aria-label={`Select ${a.display_name ?? a.full_name}`} className="h-4 w-4 shrink-0" />}
                        {a.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground" aria-hidden>
                            {(a.display_name ?? a.full_name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.display_name ?? a.full_name}</p>
                          <p className="truncate text-sm">{a.position_title}{a.position_title !== a.position_name && <span className="text-xs text-muted-foreground"> · {a.position_name}</span>}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`rounded-full px-1.5 py-0.5 ${acc.cls}`}>{acc.text}</span>
                            {a.student_id && <span>{a.student_id}</span>}
                            {a.end_date && <span>ended {dhakaDate(a.end_date)}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {caps.assign && (
                          <>
                            <ActionForm action={moveAssignmentAction.bind(null, a.id, "up")} submitLabel="↑" variant="outline" inline successMessage="" />
                            <ActionForm action={moveAssignmentAction.bind(null, a.id, "down")} submitLabel="↓" variant="outline" inline successMessage="" />
                          </>
                        )}
                        {caps.editPeople && <Link prefetch={false} href={`/dashboard/people/${a.profile_id}`} className="rounded-md border px-2.5 py-1 text-sm hover:bg-muted">Profile & photo</Link>}
                        {(caps.assign || caps.remove) && (
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded-md border px-2.5 py-1 text-sm hover:bg-muted">More</summary>
                            <div className="absolute right-0 z-20 mt-2 w-[min(20rem,85vw)] space-y-3 rounded-lg border bg-popover p-3 shadow-lg">
                              {caps.assign && (
                                <ActionForm action={updateAssignmentAction.bind(null, a.id)} submitLabel="Save">
                                  <Field name="title" label="Displayed title" defaultValue={a.position_title} required />
                                  <Field name="displayOrder" label="Order" type="number" defaultValue={a.display_order} required />
                                  {a.section === "FACULTY" && <Field name="designation" label="Designation" defaultValue={a.designation} />}
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field name="startDate" label="Start" type="date" defaultValue={dhakaDate(a.start_date)} />
                                    <Field name="endDate" label="End" type="date" defaultValue={dhakaDate(a.end_date)} />
                                  </div>
                                </ActionForm>
                              )}
                              {caps.assign && <ChangePosition committeeId={id} assignmentId={a.id} current={a.position_id} />}
                              {caps.assign && a.account !== "active" && (
                                <ActionForm action={invitePersonAction.bind(null, a.profile_id)} submitLabel={a.account === "invited" ? "Resend invitation" : "Send invitation"} successMessage="Invitation sent.">
                                  <Field name="email" label="Email" type="email" defaultValue={a.email} required />
                                </ActionForm>
                              )}
                              {caps.remove && !a.end_date && <ActionForm action={endAssignmentAction.bind(null, a.id, "end")} submitLabel="End assignment" variant="outline" confirm="End this assignment today? It stays in the committee history." />}
                              {caps.remove && <ActionForm action={endAssignmentAction.bind(null, a.id, "remove")} submitLabel="Remove (added by mistake)" variant="destructive" confirm="Hide this listing? Use only for entries that should never have existed." />}
                            </div>
                          </details>
                        )}
                      </div>
                      <span className="sr-only">Position {i + 1} of {g.items.length}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
          </PositionOptions>
        </div>
      )}

      {caps.assign && removed.length > 0 && (
        <Section title={`Recently removed (${removed.length})`} description="Listings removed as mistakes in the last 30 days. Restoring puts them back exactly as they were." className="mt-6">
          <ul className="divide-y text-sm">
            {removed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="font-medium">{r.name}</span> <span className="text-muted-foreground">· {r.position_title} · removed {dhakaDate(r.deleted_at)}</span></span>
                <ActionForm action={restoreListingsAction.bind(null, id, [r.id])} submitLabel="Restore" variant="outline" inline />
              </li>
            ))}
          </ul>
          {removed.length > 1 && <div className="mt-3 border-t pt-3"><ActionForm action={restoreListingsAction.bind(null, id, removed.map((r) => r.id))} submitLabel={`Restore all ${removed.length}`} variant="outline" confirm="Restore every listing removed in the last 30 days?" /></div>}
        </Section>
      )}

      {caps.edit && c.status !== "CURRENT" && assignments.length === 0 && (
        <details className="mt-6 rounded-xl border border-destructive/40 bg-card p-5">
          <summary className="cursor-pointer font-medium text-destructive">Delete this committee</summary>
          <p className="mt-2 text-sm text-muted-foreground">For a committee created by mistake. It has no listings, so nothing else is affected.</p>
          <ActionForm action={deleteCommitteeAction.bind(null, id)} submitLabel="Delete committee" variant="destructive" redirectTo="/dashboard/committees" confirm={`Delete ${c.name}?`} className="mt-3 space-y-3">
            <Field name="reason" label="Why? (kept in the activity log)" required />
          </ActionForm>
        </details>
      )}

      {caps.edit && (
        <details className="mt-6 rounded-xl border bg-card p-5">
          <summary className="cursor-pointer font-medium">Committee details</summary>
          <div className="mt-4">
            <ActionForm action={updateCommitteeAction.bind(null, id)} submitLabel="Save committee">
              <input type="hidden" name="expectedUpdatedAt" value={String(c.updated_at ?? "")} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="name" label="Name" defaultValue={c.name} required />
                <Field name="slug" label="URL segment" defaultValue={c.slug} required />
                <Field name="termLabel" label="Term" defaultValue={c.term_label} required />
                <Field name="academicYear" label="Academic year" defaultValue={c.academic_year} />
                <Field name="startDate" label="Start date" type="date" defaultValue={dhakaDate(c.start_date)} />
                <Field name="endDate" label="End date" type="date" defaultValue={dhakaDate(c.end_date)} />
                <Field name="status" label="Status" type="select" defaultValue={c.status} options={[{ value: "UPCOMING", label: "Upcoming" }, { value: "CURRENT", label: "Current (the public site shows this one)" }, { value: "ARCHIVED", label: "Archived" }]} />
              </div>
              <Field name="description" label="Description" type="textarea" rows={2} defaultValue={c.description} />
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
