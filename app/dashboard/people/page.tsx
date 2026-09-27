import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listPeople } from "@/lib/server/services/people";
import { ActionForm, EmptyState, Field, PageHeader, Pager, Section } from "@/components/admin/ui";
import { mediaHref } from "@/lib/api/config";
import { createPersonAction } from "../actions";

const FILTERS: Array<[string, string]> = [["", "Everyone"], ["executives", "Current executives"], ["faculty", "Faculty"], ["accounts", "With account"], ["no-account", "No account"], ["invited", "Invited"]];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/people");
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const { rows, hasMore } = await view<Awaited<ReturnType<typeof listPeople>>>("people.list", { q: sp.q, filter: sp.filter, page }, "/dashboard/people");
  return (
    <>
      <PageHeader title="Profiles" description="Everyone who appears on the site: executives past and present, faculty advisors and members. Edit photos, bios and links here; committee pages update automatically." />
      <form className="mb-3 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, student ID or email" aria-label="Search" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm sm:min-w-56" />
        {sp.filter && <input type="hidden" name="filter" value={sp.filter} />}
        <button className="h-9 rounded-md border px-4 text-sm">Search</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label]) => (
          <Link prefetch={false} key={k} href={`/dashboard/people?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(k ? { filter: k } : {}) })}`} className={`rounded-full border px-3 py-1 ${(sp.filter ?? "") === k ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState>No one matches.</EmptyState> : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const photo = p.avatar_key ? mediaHref(`/media/${p.avatar_key}`) : p.avatar_legacy ?? null;
            return (
              <li key={p.id} className="min-w-0">
                <Link prefetch={false} href={`/dashboard/people/${p.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/40">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-full border object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground" aria-hidden>{p.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[p.roles_held, p.student_id, p.email ?? (p.invite_pending ? "invited" : p.user_id ? "account" : "no account")].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} hasMore={hasMore} base="/dashboard/people" params={{ q: sp.q, filter: sp.filter }} />

      <Section title="Add a person" description="For faculty advisors, guests or executives you'll assign later. To add someone to a committee directly, use Add executive on the committee page." className="mt-6">
        <ActionForm action={createPersonAction} submitLabel="Create profile" redirectTo="/dashboard/people/{id}">
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="fullName" label="Full name" required />
            <Field name="personType" label="Type" type="select" defaultValue="STUDENT" options={[{ value: "STUDENT", label: "Student" }, { value: "FACULTY", label: "Faculty" }, { value: "ALUMNI", label: "Alumni" }, { value: "EXTERNAL", label: "Guest / external" }]} />
            <Field name="studentId" label="Student ID" placeholder="9 digits" />
          </div>
        </ActionForm>
      </Section>
    </>
  );
}
