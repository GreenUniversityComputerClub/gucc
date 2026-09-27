import Link from "next/link";
import { ShieldAlert, Users } from "lucide-react";
import { requireAdmin, view } from "@/lib/api/session";
import type { rolesOverview } from "@/lib/server/views/governance";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { createRoleAction, grantRoleAction } from "../actions";

export default async function RolesPage() {
  const session = await requireAdmin("/dashboard/roles");
  const roles = await view<Awaited<ReturnType<typeof rolesOverview>>>("views.roles", {}, "/dashboard/roles");
  const mayAssign = Boolean(session.caps["roles.assign"]);
  const mayCreate = Boolean(session.caps["roles.create"]);
  const grantable = roles.filter((r) => !["executive", "member"].includes(r.key));

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Roles are granted to accounts; positions come from the current committee. Moderators, the President and the General Secretary manage roles. Nobody can change their own access or hand out more than they hold, the Moderator role stays with Moderators, and sensitive permissions granted by anyone else wait for a Moderator's approval."
        actions={<Link prefetch={false} href="/dashboard/access" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Who can do what</Link>}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <li key={r.id}>
            <Link prefetch={false} href={`/dashboard/roles/${encodeURIComponent(r.id)}`}
              className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-2 font-semibold">
                <span className="h-3 w-3 shrink-0 rounded-full border" style={{ background: r.color ?? "transparent" }} aria-hidden />
                {r.name}
                {r.is_protected ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">protected</span> : null}
              </span>
              {r.description && <span className="line-clamp-2 text-sm text-muted-foreground">{r.description}</span>}
              <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />
                  {r.key === "executive" ? "Every current executive" : `${r.holders}${r.max_holders ? ` of ${r.max_holders}` : ""} holder${r.holders === 1 ? "" : "s"}`}
                </span>
                <span>{r.key === "moderator" ? "Every permission" : `${r.permissions} permission${r.permissions === 1 ? "" : "s"}`}</span>
                {r.sensitive > 0 && r.key !== "moderator" && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />{r.sensitive} sensitive</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {mayAssign && (
        <Section title="Give someone a role" description="The account must be an active member. Leave the end date empty for no end." className="mt-6">
          <ActionForm action={grantRoleAction} submitLabel="Grant role" resetOnSuccess>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2"><PersonPicker name="userId" label="Member" valueKind="user" required /></div>
              <Field name="roleKey" label="Role" type="select" options={grantable.map((r) => ({ value: r.key, label: r.name }))} className="md:col-span-2" />
              <Field name="expiresAt" label="Until (optional)" type="date" />
              <Field name="reason" label="Reason" />
            </div>
          </ActionForm>
        </Section>
      )}

      {mayCreate && (
        <Section title="Create a role" description="Start empty or copy another role's or position's permissions on the next page." className="mt-6">
          <ActionForm action={createRoleAction} submitLabel="Create role" redirectTo="/dashboard/roles/{id}" resetOnSuccess>
            <div className="grid gap-3 md:grid-cols-3">
              <Field name="name" label="Name" required placeholder="e.g. Web Team" />
              <Field name="description" label="What it's for" className="md:col-span-2" />
            </div>
          </ActionForm>
        </Section>
      )}
    </>
  );
}
