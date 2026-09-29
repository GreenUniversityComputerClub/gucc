import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { positionDetail } from "@/lib/server/views/governance";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { GOVERNANCE_LEVELS, levelLabel } from "@/lib/governance/levels";
import { archivePositionAction, copyGrantsAction, savePositionAction } from "../../actions";

const CATEGORIES = ["FACULTY", "LEADERSHIP", "SECRETARIAT", "COORDINATOR", "EXECUTIVE", "OTHER"].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }));
type Detail = Awaited<ReturnType<typeof positionDetail>>;

export default async function PositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const session = await requireAdmin(`/dashboard/positions/${raw}`);
  const d = await view<Detail>("views.position", { id }, `/dashboard/positions/${raw}`);
  const p = d.position;
  const moderator = session.isModerator;
  const editable = !p.is_protected || moderator;
  const mayUpdate = Boolean(session.caps["positions.update"]) && editable;
  const mayGrant = Boolean(session.caps["positions.permissions"]) && editable;
  const mayArchive = Boolean(session.caps["positions.delete"]) && editable;
  const gucc = d.holders.filter((h) => h.governing);
  const affiliated = d.holders.filter((h) => !h.governing);
  const levels = GOVERNANCE_LEVELS.filter((l) => moderator || l.value < 90 || l.value === p.governance_level).map((l) => ({ value: String(l.value), label: l.label }));

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/positions", label: "Positions" }}
        title={p.name}
        description={`${levelLabel(p.governance_level)}${p.is_protected ? " · protected" : ""}${p.aliases.length ? ` · also appears as ${p.aliases.join(", ")}` : ""}`}
        actions={<Link prefetch={false} href="/dashboard/positions" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">All positions</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {p.description && (
            <Section title="Responsibilities"><p className="whitespace-pre-line text-sm">{p.description}</p></Section>
          )}
          <Section title="Access" description={p.key === "moderator" ? undefined : "What everyone holding this position can do, on top of the baseline every executive has."}>
            {p.key === "moderator" ? (
              <p className="text-sm text-muted-foreground">Moderator authority comes from the protected Moderator role (every permission).</p>
            ) : (
              <PermissionMatrix kind="position" holderId={p.id} holderName={p.name} permissions={d.permissions} grants={d.grants} canEdit={mayGrant} options={d.options} />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={`Current holders (${gucc.length}${p.max_holders ? ` of ${p.max_holders}` : ""})`}>
            {gucc.length === 0 ? <p className="text-sm text-muted-foreground">No one in GUCC&apos;s current committee.</p> : (
              <ul className="space-y-1 text-sm">
                {gucc.map((h) => (
                  <li key={h.profile_id}>
                    <Link prefetch={false} href={`/dashboard/people/${encodeURIComponent(h.profile_id)}`} className="font-medium hover:underline">{h.name}</Link>
                    {h.title !== p.name && <span className="text-muted-foreground"> · {h.title}</span>}
                    {!h.user_id && <span className="text-xs text-muted-foreground"> · no account yet</span>}
                  </li>
                ))}
              </ul>
            )}
            {affiliated.length > 0 && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Also used by {affiliated.length} {affiliated.length === 1 ? "person" : "people"} in {[...new Set(affiliated.map((h) => (h.unit_key ?? "").toUpperCase()))].join(", ")}, a separate committee: they don&apos;t get this position&apos;s access.
              </p>
            )}
          </Section>

          {mayGrant && p.key !== "moderator" && (
            <Section title="Copy access" description="Add everything another role or position has. Sensitive permissions and ones you don't hold are listed instead.">
              <ActionForm action={copyGrantsAction.bind(null, `position:${p.id}`)} submitLabel="Copy">
                <Field name="source" label="From" type="select" options={d.sources} />
              </ActionForm>
            </Section>
          )}

          {mayUpdate && (
            <Section title="Details">
              <ActionForm action={savePositionAction.bind(null, p.id)}>
                <input type="hidden" name="expectedUpdatedAt" value={p.updated_at} />
                <Field name="name" label="Name" defaultValue={p.name} required />
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Field name="governanceLevel" label="Level" type="select" defaultValue={String(p.governance_level)} options={levels} />
                  <Field name="parentId" label="Reports to" type="select" defaultValue={p.parent_id ?? ""} options={[{ value: "", label: "No one (top level)" }, ...d.parents.map((x) => ({ value: x.id, label: x.name }))]} />
                  <Field name="maxHolders" label="Holders per committee" type="number" defaultValue={p.max_holders} placeholder="No limit" />
                  <Field name="isActive" label="Can be assigned" type="checkbox" defaultValue={Boolean(p.is_active)} />
                </div>
                <Field name="aliases" label="Other titles it appears under" type="textarea" rows={2} defaultValue={p.aliases.join("\n")} hint="One per line. Used when importing executives." />
                <Field name="description" label="Responsibilities" type="textarea" rows={3} defaultValue={p.description} />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field name="category" label="Category" type="select" defaultValue={p.category} options={CATEGORIES} />
                    <Field name="rank" label="Display order (lower first)" type="number" defaultValue={p.rank} />
                  </div>
                </details>
              </ActionForm>
              {mayArchive && (
                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Archiving keeps past committees&apos; history. Only possible when no current executive holds it.</p>
                  <ActionForm action={archivePositionAction.bind(null, p.id)} submitLabel="Archive" variant="destructive" inline redirectTo="/dashboard/positions" confirm={`Archive ${p.name}?`} />
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
