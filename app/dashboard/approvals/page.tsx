import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listApprovals } from "@/lib/server/services/approvals";
import type { publishersSummary } from "@/lib/server/services/access";
import { ActionForm, EmptyState, Pager, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { bulkApproveAction, ruleStatusAction } from "../actions";
import { PersonAvatar } from "@/components/person-avatar";
import { dhakaDateTime, relativeTime } from "@/lib/time";

type Publishers = Awaited<ReturnType<typeof publishersSummary>>;
const scopeWord = (scope: string, value: string) => (scope === "ALL" ? "all" : scope === "OWN" ? "their own" : `${scope.toLowerCase()}${value ? `: ${value}` : ""}`);
const what = (k: string) => (k === "posts.publish" ? "posts" : k === "events.publish" ? "events" : "everything");

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Everyone can follow their own requests here; reviewers see the rest.
  const session = await requireSignedIn("/dashboard/approvals");
  const reads = Boolean(session.caps["approvals.read"]);
  // Anyone who publishes club-wide also reviews members' posts or events (the "permission" approvers).
  const reviews = reads || Boolean(session.wideCaps?.["posts.publish"] || session.wideCaps?.["events.publish"]);
  const sp = await searchParams;
  const mine = sp.mine === "1" || !reviews;
  // Reviewers start with what's waiting for them.
  const forMe = reviews && !mine && (sp.view ?? (sp.status ? "" : "forme")) === "forme";
  const status = forMe ? "PENDING" : sp.status ?? "PENDING";
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, publishers] = await Promise.all([
    view<Awaited<ReturnType<typeof listApprovals>>>("approvals.list", { status, mine, page, forMe }, "/dashboard/approvals"),
    reads && !mine ? view<Publishers>("access.publishers", {}, "/dashboard/approvals") : Promise.resolve(null),
  ]);
  const tabs: Array<[string, string, boolean]> = reviews
    ? [["/dashboard/approvals?view=forme", "Waiting for me", forMe], ["/dashboard/approvals?status=PENDING&view=all", "All pending", !forMe && !mine && status === "PENDING"],
      ["/dashboard/approvals?status=APPROVED&view=all", "Approved", !mine && status === "APPROVED"], ["/dashboard/approvals?status=REJECTED&view=all", "Sent back", !mine && status === "REJECTED"],
      ["/dashboard/approvals?mine=1&status=ALL", "My requests", mine]]
    : [["/dashboard/approvals?mine=1&status=PENDING", "Waiting", status === "PENDING"], ["/dashboard/approvals?mine=1&status=APPROVED", "Approved", status === "APPROVED"],
      ["/dashboard/approvals?mine=1&status=REJECTED", "Sent back", status === "REJECTED"], ["/dashboard/approvals?mine=1&status=ALL", "All", status === "ALL"]];
  // Access changes are decided one at a time from their own page, never in bulk.
  const bulkable = (r: (typeof rows)[number]) => r.canDecide && r.status === "PENDING" && r.resource_type !== "governance";
  const decidable = rows.filter(bulkable);
  const mayRules = Boolean(session.caps["rules.activate"]);
  const KIND: Record<string, string> = { post: "Post", event: "Event", governance: "Access change" };
  const list = (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((r) => {
        const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000);
        return (
          <li key={r.id} className="flex items-start gap-3 p-3 sm:p-4">
            {bulkable(r) ? (
              <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.title ?? r.action}`} className="mt-3 h-5 w-5 shrink-0" />
            ) : null}
            <PersonAvatar name={r.requester_name} url={r.requester_avatar} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{KIND[r.resource_type] ?? "Request"}</span>
                {r.status === "PENDING" && days >= 2 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300">waiting {days} days</span>}
                {r.canDecide && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">You can decide</span>}
              </p>
              <Link prefetch={false} href={`/dashboard/approvals/${r.id}`} className="mt-1 block font-medium hover:underline">{r.title ?? r.action}</Link>
              <p className="text-xs text-muted-foreground">
                {r.requester_name} · <time dateTime={r.created_at} title={dhakaDateTime(r.created_at)}>{relativeTime(r.created_at)}</time> · needs {r.policyText}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader title="Approvals" description={reviews ? "Posts, events and access changes waiting for a decision, oldest first. You can decide where the approval policy names you; you never approve your own requests." : "Your posts and events waiting for review, and what reviewers decided."} />
      {sp.done === "1" && <p role="status" className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">All caught up: nothing else is waiting for you.</p>}
      <nav aria-label="Show" className="mb-4 flex flex-wrap gap-2 text-sm">
        {tabs.map(([href, label, on]) => (
          <Link prefetch={false} key={label} href={href} aria-current={on ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-4 ${on ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState>{forMe ? "Nothing is waiting for you. New requests appear here and in your notifications." : mine ? "You have no requests here." : "No requests here."}</EmptyState>
      ) : decidable.length > 1 ? (
        <ActionForm action={bulkApproveAction} submitLabel="Approve selected" successMessage="Done." confirm="Approve the selected requests? Each is checked and recorded separately.">
          {list}
        </ActionForm>
      ) : list}
      <Pager page={page} hasMore={rows.length === 50} base="/dashboard/approvals" params={{ status: sp.status, mine: sp.mine, view: sp.view }} />

      {publishers && (
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
      )}
    </>
  );
}
