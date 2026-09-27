import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { roleDetail } from "@/lib/server/views/governance";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { PersonPicker } from "@/components/admin/person-picker";
import { archiveRoleAction, copyGrantsAction, grantRoleAction, revokeRoleAction, updateRoleAction } from "../../actions";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const session = await requireAdmin(`/dashboard/roles/${raw}`);
  const data = await view<Awaited<ReturnType<typeof roleDetail>>>("views.role", { id }, `/dashboard/roles/${raw}`);
  const { role } = data;
  const moderator = session.isModerator;
  const protectedRole = Boolean(role.is_protected);
  const mayEdit = Boolean(session.caps["roles.update"]) && (!protectedRole || moderator);
  const mayGrant = Boolean(session.caps["permissions.assign"]) && (!protectedRole || moderator) && role.key !== "moderator";
  const mayAssign = Boolean(session.caps["roles.assign"]) && (!protectedRole || moderator) && !["executive", "member"].includes(role.key);
  const builtIn = ["moderator", "administrator", "executive", "member"].includes(role.key);

  return (
    <>
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        actions={<Link prefetch={false} href="/dashboard/roles" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">All roles</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Permissions" description={role.key === "moderator" ? "Moderators hold every permission, present and future." : "Tick for everything, or add a narrower grant under a permission."}>
          {role.key === "moderator" ? (
            <p className="text-sm text-muted-foreground">This role can&apos;t be narrowed; protected rules are the only limit on Moderators.</p>
          ) : (
            <PermissionMatrix kind="role" holderId={role.id} holderName={role.name} permissions={data.permissions} grants={data.grants} canEdit={mayGrant} options={data.options} />
          )}
        </Section>

        <div className="space-y-6">
          <Section title={role.key === "executive" ? "Who has it" : `Holders (${data.holders.length}${role.max_holders ? ` of ${role.max_holders}` : ""})`}>
            {role.key === "executive" ? (
              <p className="text-sm text-muted-foreground">Everyone with an active position in the current committee.</p>
            ) : role.key === "member" ? (
              <p className="text-sm text-muted-foreground">Every approved member.</p>
            ) : data.holders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one holds this role yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.holders.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(h.user_id)}`} className="font-medium hover:underline">{h.name ?? h.email}</Link>
                      <span className="block text-xs text-muted-foreground">since {date(h.granted_at)}{h.expires_at ? ` · until ${date(h.expires_at)}` : ""}{h.reason ? ` · ${h.reason}` : ""}</span>
                    </span>
                    {mayAssign && (
                      <ActionForm action={revokeRoleAction.bind(null, h.id)} submitLabel="Revoke" variant="outline" inline confirm={`Remove the ${role.name} role from ${h.name ?? h.email}?`} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mayAssign && (
              <div className="mt-4 border-t pt-4">
                <ActionForm action={grantRoleAction} submitLabel="Add holder" resetOnSuccess>
                  <input type="hidden" name="roleKey" value={role.key} />
                  <PersonPicker name="userId" label="Member" valueKind="user" required />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field name="expiresAt" label="Until (optional)" type="date" />
                    <Field name="reason" label="Reason" />
                  </div>
                </ActionForm>
              </div>
            )}
          </Section>

          {mayGrant && data.sources.length > 0 && (
            <Section title="Copy permissions" description="Add everything another role or position has. Sensitive permissions and ones you don't hold are listed instead.">
              <ActionForm action={copyGrantsAction.bind(null, `role:${role.id}`)} submitLabel="Copy">
                <Field name="source" label="From" type="select" options={data.sources} />
              </ActionForm>
            </Section>
          )}

          {mayEdit && (
            <Section title="Details">
              <ActionForm action={updateRoleAction.bind(null, role.id)}>
                <input type="hidden" name="expectedUpdatedAt" value={role.updated_at} />
                <Field name="name" label="Name" defaultValue={role.name} required />
                <Field name="description" label="What it's for" type="textarea" rows={2} defaultValue={role.description} />
                <Field name="color" label="Colour" defaultValue={role.color ?? ""} placeholder="#22c55e" hint="Shown next to the role in lists." />
              </ActionForm>
              {!builtIn && Boolean(session.caps["roles.delete"]) && (
                <div className="mt-4 border-t pt-4">
                  <ActionForm action={archiveRoleAction.bind(null, role.id)} submitLabel="Archive role" variant="destructive" redirectTo="/dashboard/roles"
                    confirm={`Archive the ${role.name} role? It must have no holders.`} />
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
