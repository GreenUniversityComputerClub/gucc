import { requireSignedIn, view } from "@/lib/api/session";
import type { listPolicies, listPositions, listRoles, listSettings } from "@/lib/server/services/governance";
import { ApproversEditor } from "@/components/admin/structured-editors";
import { HomeContentEditor, PartnersEditor, ServicesEditor } from "@/components/admin/content-editors";
import { describePolicy } from "@/lib/governance/approval";
import type { ApprovalPolicy } from "@/lib/governance/types";
import { ActionForm, EmptyState, Field, PageHeader, Section } from "@/components/admin/ui";
import { safeJson } from "@/lib/safe-json";
import { orgSettingAction, savePolicyAction, systemSettingAction } from "../actions";

export default async function SettingsPage() {
  // Anyone the nav shows Settings to (settings.manage) gets here; approval policies only for those who may read them.
  const session = await requireSignedIn("/dashboard/settings");
  const [{ system, org }, policies] = await Promise.all([
    view<Awaited<ReturnType<typeof listSettings>>>("settings.list", {}, "/dashboard/settings"),
    session.caps["approvals.read"] ? view<Awaited<ReturnType<typeof listPolicies>>>("policies.list", {}, "/dashboard/settings") : Promise.resolve([] as Awaited<ReturnType<typeof listPolicies>>),
  ]);
  const mayPolicies = Boolean(session.caps["approvals.policies"]);
  const [positions, roles] = mayPolicies
    ? await Promise.all([
        view<Awaited<ReturnType<typeof listPositions>>>("positions.list", {}, "/dashboard/settings"),
        view<Awaited<ReturnType<typeof listRoles>>>("roles.list", {}, "/dashboard/settings"),
      ])
    : [[], []];
  const positionOpts = positions.map((p) => ({ key: p.key, name: p.name }));
  const roleOpts = roles.map((r) => ({ key: r.key, name: r.name }));
  return (
    <>
      <PageHeader title="Settings" description="Protected settings need Moderator authority (Moderators, the President and the General Secretary) and, when another of them is appointed, their confirmation." />
      <Section title="System settings">
        {system.length === 0 && <EmptyState>No system settings yet.</EmptyState>}
        <div className="space-y-3">
          {system.map((s) => (
            <div key={s.key} className="grid gap-2 border-b pb-3 md:grid-cols-[1fr_1fr]">
              <div>
                <p className="break-all font-mono text-sm">{s.key} {s.is_protected ? <span className="text-xs text-amber-700 dark:text-amber-400">protected</span> : null}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              <ActionForm action={systemSettingAction.bind(null, s.key)} inline submitLabel="Save">
                <input type="hidden" name="expectedUpdatedAt" value={s.updated_at} />
                <input name="value" defaultValue={s.value_json} aria-label={s.key} className="h-10 w-full rounded-md border bg-background px-2 font-mono text-base sm:w-56 md:h-9 md:text-sm" />
              </ActionForm>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Approval policies" description="Who approves what. Rules reference these by name." className="mt-6">
        {policies.length === 0 && <EmptyState>No approval policies yet.</EmptyState>}
        <div className="space-y-3">
          {policies.map((p) => {
            const policy: ApprovalPolicy = { key: p.key, name: p.name, mode: p.mode as ApprovalPolicy["mode"], threshold: p.threshold, approvers: safeJson<ApprovalPolicy["approvers"]>(p.approvers_json) ?? [], allowSelfApproval: false };
            return (
              <details key={p.id} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm"><span className="font-medium">{p.name}</span> — needs {describePolicy(policy)} {p.is_protected ? <span className="text-xs text-amber-700 dark:text-amber-400">protected</span> : null}</summary>
                {mayPolicies && !p.is_protected && (
                  <div className="mt-3">
                    <ActionForm action={savePolicyAction.bind(null, p.id)}>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Field name="name" label="Name" defaultValue={p.name} required />
                        <Field name="mode" label="Mode" type="select" defaultValue={p.mode} options={[{ value: "ANY", label: "Any one group" }, { value: "ALL", label: "Every group" }, { value: "THRESHOLD", label: "N distinct approvers" }]} />
                        <Field name="threshold" label="N (threshold mode)" type="number" defaultValue={p.threshold} />
                      </div>
                      <div><p className="mb-2 text-sm font-medium">Approver groups</p><ApproversEditor name="approvers" initial={safeJson<ApprovalPolicy["approvers"]>(p.approvers_json) ?? []} positions={positionOpts} roles={roleOpts} /></div>
                      <Field name="description" label="Description" defaultValue={p.description} />
                    </ActionForm>
                  </div>
                )}
              </details>
            );
          })}
        </div>
        {mayPolicies && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">New policy</h3>
            <ActionForm action={savePolicyAction.bind(null, null)} submitLabel="Create policy" resetOnSuccess>
              <div className="grid gap-3 md:grid-cols-3">
                <Field name="name" label="Name" required />
                <Field name="mode" label="Mode" type="select" options={[{ value: "ANY", label: "Any one group" }, { value: "ALL", label: "Every group" }, { value: "THRESHOLD", label: "N distinct approvers" }]} />
                <Field name="threshold" label="N" type="number" />
              </div>
              <div><p className="mb-2 text-sm font-medium">Approver groups</p><ApproversEditor name="approvers" initial={[{ type: "position", value: "president" }]} positions={positionOpts} roles={roleOpts} /></div>
            </ActionForm>
          </div>
        )}
      </Section>

      <Section title="Site content" description="The home page messages and figures, the Services menu, partner clubs and other page content. Changes appear on the site within a few minutes." className="mt-6">
        {org.length === 0 && <EmptyState>No site content settings yet.</EmptyState>}
        <div className="space-y-3">
          {org.map((s) => (
            <details key={s.key} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">{s.description ?? s.key} <span className="ml-1 font-mono text-xs text-muted-foreground">{s.key}</span></summary>
              <div className="mt-3">
                <ActionForm action={orgSettingAction.bind(null, s.key)}>
                  <input type="hidden" name="expectedUpdatedAt" value={s.updated_at} />
                  {/* A value that isn't valid JSON (edited by hand in the database) opens as text to fix, instead of breaking the page. */}
                  {(() => {
                    const value = safeJson<never>(s.value_json);
                    if (value === null) return <Field name="value" label="Value (JSON; the stored value isn't valid, fix it here)" type="textarea" rows={12} defaultValue={s.value_json} />;
                    return s.key === "page.home" ? <HomeContentEditor initial={value} />
                      : s.key === "nav.services" ? <ServicesEditor initial={value} />
                        : s.key === "page.collaborations" ? <PartnersEditor initial={value} />
                          : <Field name="value" label="Value (JSON)" type="textarea" rows={12} defaultValue={JSON.stringify(value, null, 2)} />;
                  })()}
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
