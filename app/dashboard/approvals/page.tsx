import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listApprovals } from "@/lib/server/services/approvals";
import type { publishersSummary } from "@/lib/server/services/access";
import { ActionForm, EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { bulkApproveAction, ruleStatusAction } from "../actions";

type Publishers = Awaited<ReturnType<typeof publishersSummary>>;
const scopeWord = (scope: string, value: string) => (scope === "ALL" ? "all" : scope === "OWN" ? "their own" : `${scope.toLowerCase()}${value ? `: ${value}` : ""}`);
const what = (k: string) => (k === "posts.publish" ? "posts" : k === "events.publish" ? "events" : "everything");

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/approvals");
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";
  const [rows, publishers] = await Promise.all([
    view<Awaited<ReturnType<typeof listApprovals>>>("approvals.list", { status, mine: sp.mine === "1" }, "/dashboard/approvals"),
    view<Publishers>("access.publishers", {}, "/dashboard/approvals"),
  ]);
  const tabs = [["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Changes requested"], ["ALL", "All"]];
  const decidable = rows.filter((r) => r.canDecide && r.status === "PENDING");
  const mayRules = Boolean(session.caps["rules.activate"]);
  const list = (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
          {r.canDecide && r.status === "PENDING" ? (
            <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.title ?? r.action}`} className="h-4 w-4" />
          ) : null}
          <div className="min-w-0 flex-1">
            <Link prefetch={false} href={`/dashboard/approvals/${r.id}`} className="font-medium hover:underline">{r.title ?? r.action}</Link>
            <p className="text-xs text-muted-foreground">
              {r.requester_name} · {r.policy.name} · {new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {r.canDecide && r.status === "PENDING" && <span className="text-xs font-medium text-primary">You can decide</span>}
            <StatusBadge status={r.status} />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="Approvals" description="Posts, events and access changes waiting for a decision. You can decide where the approval policy names you; you never approve your own requests." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => (
          <Link prefetch={false} key={k} href={`/dashboard/approvals?status=${k}${sp.mine === "1" ? "&mine=1" : ""}`} className={`rounded-full border px-3 py-1 ${status === k ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>
        ))}
        <Link prefetch={false} href={`/dashboard/approvals?status=${status}${sp.mine === "1" ? "" : "&mine=1"}`} className="rounded-full border px-3 py-1">{sp.mine === "1" ? "Everyone's" : "Only mine"}</Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState>No requests here.</EmptyState>
      ) : decidable.length > 0 ? (
        <ActionForm action={bulkApproveAction} submitLabel="Approve selected" successMessage="Done." confirm="Approve the selected requests?">
          {list}
        </ActionForm>
      ) : list}

      <Section title="Who can publish without approval" description="Everyone else's posts and events come here first." className="mt-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Positions and roles</h3>
            <ul className="space-y-1 text-sm">
              {publishers.positions.map((p, i) => <li key={`p${i}`}>{String(p.name)} <span className="text-muted-foreground">· {what(String(p.permission))} ({scopeWord(String(p.scope), String(p.scope_value))})</span></li>)}
              {publishers.roles.map((r, i) => <li key={`r${i}`}>{String(r.name)} <span className="text-muted-foreground">· {what(String(r.permission))} ({scopeWord(String(r.scope), String(r.scope_value))})</span></li>)}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Trusted authors</h3>
            {publishers.trusted.length === 0 ? <p className="text-sm text-muted-foreground">No one yet. Use &quot;Approve &amp; trust&quot; on a request, or a person&apos;s Access page.</p> : (
              <ul className="space-y-1 text-sm">
                {publishers.trusted.map((t) => (
                  <li key={String(t.id)}>
                    <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(String(t.user_id))}`} className="hover:underline">{String(t.name ?? t.email)}</Link>
                    <span className="text-muted-foreground"> · their own {what(String(t.permission))}{t.expires_at ? ` until ${String(t.expires_at).slice(0, 10)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {publishers.rules.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Club-wide switches</h3>
            <ul className="space-y-2">
              {publishers.rules.map((r) => (
                <li key={String(r.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <span className="min-w-0">
                    <span className="text-sm font-medium">{String(r.name)}</span>
                    <span className="block text-xs text-muted-foreground">{String(r.description ?? "")}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={String(r.status)} />
                    {mayRules && String(r.action_type) !== "DENY" && (
                      r.status === "ACTIVE"
                        ? <ActionForm action={ruleStatusAction.bind(null, String(r.id), "INACTIVE")} submitLabel="Switch off" variant="outline" inline />
                        : <ActionForm action={ruleStatusAction.bind(null, String(r.id), "ACTIVE")} submitLabel="Switch on" inline confirm={`${String(r.name)}?`} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
