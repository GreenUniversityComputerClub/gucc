import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { ApprovalView } from "@/lib/server/services/approvals";
import { describePolicy } from "@/lib/governance/approval";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { approveAndTrustAction, cancelApprovalAction, decideAction } from "../../actions";

/** A governance request in plain words. */
function describeChange(p: Record<string, unknown>): string {
  const grant = p.grant as { permission?: string; scope?: string; scopeValue?: string } | undefined;
  const scope = grant && grant.scope && grant.scope !== "ALL" ? ` (${grant.scope.toLowerCase()}${grant.scopeValue ? `: ${grant.scopeValue}` : ""})` : "";
  switch (p.kind) {
    case "role.grant": return `Give the "${String(p.roleKey).replace(/-/g, " ")}" role to a member${p.reason ? ` — ${String(p.reason)}` : ""}.`;
    case "role.revoke": return `Remove a role from a member${p.reason ? ` — ${String(p.reason)}` : ""}.`;
    case "role.permission": return `Add ${grant?.permission}${scope} to a role.`;
    case "position.permission": return `Add ${grant?.permission}${scope} to a position.`;
    case "direct.grant": return `Grant ${grant?.permission}${scope} directly to a member${p.expiresAt ? ` until ${String(p.expiresAt).slice(0, 10)}` : ""}${p.reason ? ` — ${String(p.reason)}` : ""}.`;
    case "rule.status": return `Set a protected rule to ${String(p.status).toLowerCase()}.`;
    case "setting.system": return `Change the protected setting ${String(p.key)}.`;
    default: return "A governance change.";
  }
}

const RESOURCE_LINK: Record<string, (id: string) => string> = {
  post: (id) => `/dashboard/posts/${id}`,
  event: (id) => `/dashboard/events/${id}`,
};

export default async function ApprovalDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin("/dashboard/approvals");
  const { id } = await params;
  const r = await view<ApprovalView>("approvals.get", { id }, `/dashboard/approvals/${id}`);
  const link = RESOURCE_LINK[r.resource_type]?.(r.resource_id);
  const payload = r.payload_json ? JSON.parse(r.payload_json) : null;

  return (
    <>
      <PageHeader title={r.title ?? r.action} description={`Requested by ${r.requester_name ?? "unknown"} on ${new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}`} actions={<StatusBadge status={r.status} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="What is being approved">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Action</dt><dd className="font-mono text-xs">{r.action}</dd>
            <dt className="text-muted-foreground">Resource</dt>
            <dd>{link ? <Link prefetch={false} href={link} className="underline">{r.resource_type} → open</Link> : `${r.resource_type} ${r.resource_id}`}</dd>
            <dt className="text-muted-foreground">Policy</dt><dd>{r.policy.name}: needs {describePolicy(r.policy)}</dd>
          </dl>
          {payload && r.resource_type === "governance" && (
            <p className="mt-3 rounded-md bg-muted p-3 text-sm">{describeChange(payload)}</p>
          )}
          {payload?.userId && r.resource_type === "governance" && (
            <p className="mt-2 text-sm"><Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(String(payload.userId))}`} className="underline">See this person&apos;s current access</Link></p>
          )}
        </Section>
        <Section title="Decisions so far">
          {r.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has decided yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {r.steps.map((s) => (
                <li key={s.actor_id}>
                  <StatusBadge status={s.decision === "APPROVE" ? "APPROVED" : "REJECTED"} /> {s.actor_name}
                  {s.comment && <span className="text-muted-foreground"> — “{s.comment}”</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      {r.status === "PENDING" && (
        <Section title="Your decision" className="mt-6">
          {r.canDecide ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ActionForm action={decideAction.bind(null, r.id, "APPROVE")} submitLabel="Approve" successMessage="Recorded.">
                <Field name="comment" label="Comment (optional)" type="textarea" rows={2} />
              </ActionForm>
              <ActionForm action={decideAction.bind(null, r.id, "REJECT")} submitLabel="Request changes" variant="destructive" successMessage="Recorded.">
                <Field name="comment" label="What needs to change?" type="textarea" rows={2} required />
              </ActionForm>
              {(r.resource_type === "post" || r.resource_type === "event") && session.caps["permissions.assign"] && r.requested_by !== session.user.id && (
                <div className="md:col-span-2 rounded-lg border border-dashed p-3">
                  <ActionForm action={approveAndTrustAction.bind(null, r.id, r.requested_by, r.resource_type === "post" ? "posts" : "events")}
                    submitLabel="Approve & trust this author" variant="outline" successMessage="Recorded."
                    confirm={`Approve, and let ${r.requester_name ?? "this author"} publish their own ${r.resource_type}s without approval from now on?`}>
                    <p className="text-sm text-muted-foreground">Approves this and lets {r.requester_name ?? "the author"} publish their own {r.resource_type}s directly next time. You can remove it on their Access page.</p>
                  </ActionForm>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{r.whyNot}</p>
          )}
          {r.requested_by === session.user.id && (
            <div className="mt-4">
              <ActionForm action={cancelApprovalAction.bind(null, r.id)} submitLabel="Withdraw request" variant="outline" confirm="Withdraw this request?" />
            </div>
          )}
        </Section>
      )}
    </>
  );
}
