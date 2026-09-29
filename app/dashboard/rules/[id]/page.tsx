import { view } from "@/lib/api/session";
import type { ruleView } from "@/lib/server/views/admin";
import { PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { updateRuleAction } from "../../actions";
import { RuleBuilder } from "../rule-builder";

export default async function RuleDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { rule: r, permissions, policies, editable, history } = await view<Awaited<ReturnType<typeof ruleView>>>("views.rule", { id }, `/dashboard/rules/${encodeURIComponent(id)}`);

  return (
    <>
      <PageHeader back={{ href: "/dashboard/rules", label: "Rules" }} title={r.name} description={`Version ${r.version} · last changed ${r.updated_at.slice(0, 16).replace("T", " ")}`} actions={<StatusBadge status={r.status} />} />
      {(r as { trigger?: string }).trigger && (r as { trigger?: string }).trigger !== "AUTHORIZE" ? (
        <p className="text-sm text-muted-foreground">This is a notification rule. To change it, create a new one on the Rules page and archive this one.</p>
      ) : editable ? (
        <Section title="Edit rule" description={r.is_protected && r.status === "ACTIVE" ? "Protected rules must be deactivated (confirmed by another Moderator, the President or the General Secretary) before editing." : undefined}>
          <RuleBuilder
            action={updateRuleAction.bind(null, id)}
            permissions={permissions}
            policies={policies}
            canProtect={false}
            submitLabel="Save changes"
            stamp={r.updated_at}
            initial={{
              name: r.name, description: r.description, effect: r.effect ?? "ALLOW", permission: r.permission_key, resourceType: r.resource_type, scope: r.scope, scopeValue: r.scope_value,
              priority: r.priority, policyKey: r.policy_key, isProtected: Boolean(r.is_protected), conditions: r.conditions,
            }}
          />
        </Section>
      ) : (
        <p className="text-sm text-muted-foreground">You can view this rule but not change it.</p>
      )}
      <Section title="History" className="mt-6">
        <ul className="text-sm">
          {history.map((h, i) => (
            <li key={i} className="py-1"><span className="font-mono text-xs">{h.action}</span> · {h.actor_label} · {h.created_at.slice(0, 16).replace("T", " ")}{h.reason ? ` — ${h.reason}` : ""}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
