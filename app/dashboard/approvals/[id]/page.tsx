// Article typography (headings, lists, quotes, code) shared with the blog.
import "@/app/blog/[slug]/blog.css";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import type { ApprovalView } from "@/lib/server/services/approvals";
import { describePolicy } from "@/lib/governance/approval";
import { renderMarkdown } from "@/lib/markdown";
import { safeJson } from "@/lib/safe-json";
import { dhakaDateTime, relativeTime } from "@/lib/time";
import { PersonAvatar } from "@/components/person-avatar";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { approveAndTrustAction, cancelApprovalAction, decideAction } from "../../actions";
import { ChangeReasons } from "./change-reasons";
import { FramedImage } from "@/components/framed-image";

/** A governance request in plain words. */
function describeChange(p: Record<string, unknown>): string {
  const grant = p.grant as { permission?: string; scope?: string; scopeValue?: string } | undefined;
  const scope = grant && grant.scope && grant.scope !== "ALL" ? ` (${grant.scope.toLowerCase()}${grant.scopeValue ? `: ${grant.scopeValue}` : ""})` : "";
  switch (p.kind) {
    case "role.grant": return `Give the "${String(p.roleKey).replace(/-/g, " ")}" role to a member${p.reason ? ` — ${String(p.reason)}` : ""}.`;
    case "role.revoke": return `Remove ${p.roleKey ? `the "${String(p.roleKey).replace(/-/g, " ")}" role` : "a role"} from ${p.person ? String(p.person) : "a member"}${p.reason ? ` — ${String(p.reason)}` : ""}.`;
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
const KIND: Record<string, string> = { post: "Post", event: "Event", governance: "Access change" };

export default async function ApprovalDetail({ params }: { params: Promise<{ id: string }> }) {
  // Anyone may open their own request; the API decides who else may see it.
  const session = await requireSignedIn("/dashboard/approvals");
  const { id } = await params;
  const r = await view<ApprovalView>("approvals.get", { id }, `/dashboard/approvals/${id}`);
  const link = RESOURCE_LINK[r.resource_type]?.(r.resource_id);
  const payload = safeJson<Record<string, unknown>>(r.payload_json);
  const preview = r.preview;
  const content = r.resource_type === "post" || r.resource_type === "event";
  const waiting = Date.now() - new Date(r.created_at).getTime();

  return (
    <div className="pb-28 lg:pb-0">
      <Link prefetch={false} href="/dashboard/approvals" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />All approvals</Link>
      <PageHeader back={{ href: "/dashboard/approvals", label: "Approvals" }} title={r.title ?? r.action} description={`${KIND[r.resource_type] ?? "Request"} · sent ${relativeTime(r.created_at)} · needs ${describePolicy(r.policy)}`} actions={<StatusBadge status={r.status} />} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {preview?.kind === "post" && (
            <Section title="The post, as it will appear" description={preview.publishedBefore ? "This post is already live; these are the changes waiting for approval." : undefined}>
              <article className="overflow-hidden rounded-xl border bg-background">
                {preview.coverUrl && (
                  <FramedImage src={preview.coverUrl} alt="" />
                )}
                <div className="space-y-2 p-4 sm:p-6">
                  <p className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{preview.type === "BLOG" ? "Blog" : preview.type === "NEWS" ? "News" : "Announcement"}</span>{preview.category && <span className="rounded-full bg-muted px-2 py-0.5">{preview.category}</span>}</p>
                  <h2 className="text-2xl font-bold leading-tight">{preview.title}</h2>
                  {preview.subtitle && <p className="text-lg text-muted-foreground">{preview.subtitle}</p>}
                  {preview.excerpt && <p className="text-sm italic text-muted-foreground">{preview.excerpt}</p>}
                  {preview.body ? (
                    <div className="article-reading-container max-h-[70vh] overflow-y-auto border-t pt-4"><div className="prose max-w-none dark:prose-invert"><div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.body) }} /></div></div>
                  ) : <p className="text-sm text-muted-foreground">No text yet.</p>}
                </div>
              </article>
            </Section>
          )}
          {preview?.kind === "event" && (
            <Section title="The event, as it will appear">
              <article className="overflow-hidden rounded-xl border bg-background">
                {preview.bannerUrl && (
                  <FramedImage src={preview.bannerUrl} alt="" />
                )}
                <div className="space-y-3 p-4 sm:p-6">
                  {preview.category && <p className="text-xs"><span className="rounded-full bg-muted px-2 py-0.5">{preview.category}</span></p>}
                  <h2 className="text-2xl font-bold leading-tight">{preview.title}</h2>
                  <ul className="space-y-1 text-sm">
                    {preview.startAt && <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />{dhakaDateTime(preview.startAt)}{preview.endAt ? ` – ${dhakaDateTime(preview.endAt)}` : ""}</li>}
                    {(preview.venue || preview.mode) && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />{[preview.venue, preview.mode === "ONLINE" ? "Online" : null].filter(Boolean).join(" · ")}</li>}
                    <li className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" aria-hidden />{preview.registrationEnabled ? `Registration on${preview.capacity ? ` · ${preview.capacity} seats` : ""}` : "No registration"}{preview.organizer ? ` · by ${preview.organizer}` : ""}</li>
                  </ul>
                  {preview.description ? (
                    <div className="article-reading-container max-h-[60vh] overflow-y-auto border-t pt-4"><div className="prose max-w-none dark:prose-invert"><div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.description) }} /></div></div>
                  ) : <p className="text-sm text-muted-foreground">No description yet.</p>}
                </div>
              </article>
            </Section>
          )}
          {r.resource_type === "governance" && (
            <Section title="What is being approved">
              {payload && <p className="rounded-md bg-muted p-3 text-sm">{describeChange(payload)}</p>}
              {Boolean(payload?.userId) && (
                <p className="mt-2 text-sm"><Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(String(payload!.userId))}`} className="underline">See this person&apos;s current access</Link></p>
              )}
            </Section>
          )}
          {!preview && content && <Section title="What is being approved"><p className="text-sm text-muted-foreground">The item is no longer available.</p></Section>}
          {link && <p className="text-sm"><Link prefetch={false} href={link} className="underline">Open the full {r.resource_type} page</Link></p>}
        </div>

        <aside className="space-y-4">
          <Section title="Requested by">
            <div className="flex items-center gap-3">
              <PersonAvatar name={r.requester_name} url={r.requester_avatar} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium">{r.requester_name ?? "Member"}</p>
                <p className="text-xs text-muted-foreground">{dhakaDateTime(r.created_at)}</p>
                {content && <p className="mt-1 text-xs text-muted-foreground">{r.requester_history.published} approved before · {r.requester_history.changesRequested} sent back</p>}
              </div>
            </div>
            {r.status === "PENDING" && waiting > 2 * 86_400_000 && <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Waiting {Math.floor(waiting / 86_400_000)} days.</p>}
          </Section>
          <Section title="Decisions so far">
            {r.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one has decided yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {r.steps.map((st) => (
                  <li key={st.actor_id} className="flex items-start gap-2">
                    <PersonAvatar name={st.actor_name} url={st.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p><span className="font-medium">{st.actor_name}</span> <StatusBadge status={st.decision === "APPROVE" ? "APPROVED" : "REJECTED"} /></p>
                      {st.comment && <p className="text-muted-foreground">“{st.comment}”</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>

      {r.status === "PENDING" && (
        <Section title="Your decision" className="mt-6" description={r.canDecide ? "Approving publishes it (or applies the change). Asking for changes sends it back to the author with your note." : undefined}>
          {r.canDecide ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border p-3">
                <ActionForm action={decideAction.bind(null, r.id, "APPROVE")} submitLabel={content ? "Approve & publish" : "Approve"} successMessage="Approved." redirectTo="/dashboard/approvals/next">
                  <Field name="comment" label="Note for the author (optional)" type="textarea" rows={2} />
                </ActionForm>
                <p className="text-xs text-muted-foreground">You&apos;ll go straight to the next request waiting for you.</p>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <ActionForm action={decideAction.bind(null, r.id, "REJECT")} submitLabel="Ask for changes" variant="destructive" successMessage="Sent back to the author." redirectTo="/dashboard/approvals/next">
                  <ChangeReasons name="comment" />
                </ActionForm>
              </div>
              {content && session.caps["permissions.assign"] && r.requested_by !== session.user.id && (
                <div className="md:col-span-2 rounded-lg border border-dashed p-3">
                  <ActionForm action={approveAndTrustAction.bind(null, r.id, r.requested_by, r.resource_type === "post" ? "posts" : "events")}
                    submitLabel="Approve & trust this author" variant="outline" successMessage="Recorded." redirectTo="/dashboard/approvals/next"
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
              <ActionForm action={cancelApprovalAction.bind(null, r.id)} submitLabel="Withdraw request" variant="outline" confirm="Withdraw this request? The item goes back to draft." />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
