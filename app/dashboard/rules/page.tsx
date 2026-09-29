import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { rulesView } from "@/lib/server/views/admin";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { createNotifyRuleAction, createRuleAction, ruleStatusAction } from "../actions";
import { NotifyRuleBuilder } from "./notify-builder";
import { RuleBuilder } from "./rule-builder";
import { ExplainTool } from "./explain";

const describe = (c: { field: string; operator: string; value: unknown }) =>
  `${c.field} ${c.operator.replace("_", " ")}${c.value === null || c.value === undefined ? "" : ` ${Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}`}`;

export default async function RulesPage() {
  const session = await requireAdmin("/dashboard/rules");
  const { rules: all, permissions, policies, isModerator, positions, roles, triggerEvents } = await view<Awaited<ReturnType<typeof rulesView>>>("views.rules", {}, "/dashboard/rules");
  const rules = all.filter((r) => r.trigger === "AUTHORIZE");
  const notifyRules = all.filter((r) => r.trigger.startsWith("EVENT:"));
  const eventLabel = (trigger: string) => triggerEvents.find(([k]) => `EVENT:${k}` === trigger)?.[1] ?? trigger.slice(6);
  const who = (json: string | null) => {
    try {
      const p = JSON.parse(json ?? "{}") as { targets?: Array<{ kind: string; key: string }>; message?: string };
      return {
        targets: (p.targets ?? []).map((t) => (t.kind === "position" ? positions.find((x) => x.key === t.key)?.name ?? t.key : t.kind === "role" ? `${roles.find((x) => x.key === t.key)?.name ?? t.key} role` : `anyone with ${t.key}`)).join(", "),
        message: p.message,
      };
    } catch {
      return { targets: "", message: undefined };
    }
  };
  const mayCreate = Boolean(session.caps["rules.create"]);
  const mayActivate = Boolean(session.caps["rules.activate"]);
  const mayDelete = Boolean(session.caps["rules.delete"]);

  return (
    <>
      <PageHeader
        title="Governance rules"
        description="Access rules: WHEN conditions THEN allow, deny or require approval WITH a scope. They are evaluated in a fixed order: protected rules first, then priority; an explicit deny always wins. Only protected rules can restrict Moderators. Notification rules are further down."
      />
      <div className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <Link prefetch={false} href={`/dashboard/rules/${encodeURIComponent(r.id)}`} className="hover:underline">{r.name}</Link> <StatusBadge status={r.status} /> {r.is_protected ? <span className="text-xs text-amber-700 dark:text-amber-400">protected</span> : null}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">{(r.effect ?? "").replace("_", " ").toLowerCase()}</span> <span className="font-mono text-xs">{r.permission_key}</span>
                  {r.resource_type ? <> on <span className="font-mono text-xs">{r.resource_type}</span></> : null}
                  {r.scope !== "ALL" ? <> · scope {r.scope}{r.scope_value ? `:${r.scope_value}` : ""}</> : null}
                  {r.policy_key ? <> · approvers: {policies.find((p) => p.key === r.policy_key)?.name ?? r.policy_key}</> : null}
                  <span className="text-muted-foreground"> · priority {r.priority}</span>
                </p>
                {r.conditions.length > 0 && <p className="mt-1 text-xs text-muted-foreground">when {r.conditions.map(describe).join(" and ")}</p>}
                {r.description && <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>}
              </div>
              {mayActivate && (!r.is_protected || isModerator) && (
                <div className="flex gap-2">
                  {r.status !== "ACTIVE" && <ActionForm action={ruleStatusAction.bind(null, r.id, "ACTIVE")} submitLabel="Activate" inline />}
                  {r.status === "ACTIVE" && <ActionForm action={ruleStatusAction.bind(null, r.id, "INACTIVE")} submitLabel="Deactivate" variant="outline" inline confirm="Deactivate this rule? Its effect stops immediately." />}
                  {mayDelete && r.status !== "ACTIVE" && !r.is_protected && <ActionForm action={ruleStatusAction.bind(null, r.id, "ARCHIVED")} submitLabel="Archive" variant="outline" inline confirm="Archive this rule? It disappears from this list; its history stays in the activity log." />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Section title="Notification rules" description="WHEN something happens (and optional conditions hold) THEN notify people in the app. They never change who can do what." className="mt-6">
        {notifyRules.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <ul className="space-y-2">
            {notifyRules.map((r) => {
              const w = who(r.params_json);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.name} <StatusBadge status={r.status} /></p>
                    <p className="text-muted-foreground">When {eventLabel(r.trigger).toLowerCase()}{r.conditions.length ? `, if ${r.conditions.map(describe).join(" and ")}` : ""} → notify {w.targets || "nobody"}</p>
                    {w.message && <p className="text-xs text-muted-foreground">Message: {w.message}</p>}
                  </div>
                  {mayActivate && (
                    <div className="flex gap-2">
                      {r.status !== "ACTIVE" && <ActionForm action={ruleStatusAction.bind(null, r.id, "ACTIVE")} submitLabel="Activate" inline />}
                      {r.status === "ACTIVE" && <ActionForm action={ruleStatusAction.bind(null, r.id, "INACTIVE")} submitLabel="Deactivate" variant="outline" inline />}
                      {mayDelete && r.status !== "ACTIVE" && <ActionForm action={ruleStatusAction.bind(null, r.id, "ARCHIVED")} submitLabel="Archive" variant="outline" inline confirm="Archive this notification rule?" />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {mayCreate && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">New notification rule</summary>
            <div className="mt-3"><NotifyRuleBuilder action={createNotifyRuleAction} events={triggerEvents} positions={positions} roles={roles} permissions={permissions} /></div>
          </details>
        )}
      </Section>

      <Section title="Explain a decision" description="Check what the engine would decide for any member and action, with the full reasoning." className="mt-6">
        <ExplainTool permissions={permissions} />
      </Section>

      {mayCreate && (
        <Section title="New rule" description="Rules you create start as drafts. Rules that allow something you don't hold club-wide, touch protected permissions, or apply to every permission need Moderator authority (a Moderator, the President or the General Secretary)." className="mt-6">
          <RuleBuilder action={createRuleAction} permissions={permissions} policies={policies} canProtect={isModerator} submitLabel="Create draft rule" />
        </Section>
      )}
    </>
  );
}
