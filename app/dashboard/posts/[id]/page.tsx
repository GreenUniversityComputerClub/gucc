import Link from "next/link";
import { getSession, rpc, view } from "@/lib/api/session";
import type { postView } from "@/lib/server/views/admin";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { archivePostAction, publishPostAction, restoreRevisionAction, unpublishPostAction, updatePostAction } from "../../actions";
import { PostFields } from "../post-form";
import { dhakaDateTime } from "@/lib/time";
import { postEmailAction } from "../../email/actions";

const PUBLIC_PATH: Record<string, string> = { BLOG: "/blog", NEWS: "/news", ANNOUNCEMENT: "/announcements" };

export default async function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, cats, session] = await Promise.all([
    view<Awaited<ReturnType<typeof postView>>>("views.post", { id }, `/dashboard/posts/${id}`),
    rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "POST" }),
    getSession(),
  ]);
  const { post: p, revisions, pendingApprovalId, capabilities: cap, coverUrl, sentBack } = data;
  // The save button says what saving does here.
  // Published with a future date: live on the site only from then.
  const scheduledFor = p.status === "PUBLISHED" && p.published_at && p.published_at > new Date().toISOString() ? p.published_at : null;
  const saveLabel = p.status === "PENDING_APPROVAL" ? "Save (withdraws the approval request)" : p.status === "PUBLISHED" ? "Save and update the live post" : "Save new version";

  return (
    <>
      <PageHeader
        back={{ href: `/dashboard/posts?type=${p.type}`, label: { BLOG: "Blog posts", NEWS: "News", ANNOUNCEMENT: "Announcements" }[p.type as string] ?? "Posts" }}
        title={p.title}
        description={`${PUBLIC_PATH[p.type]}/${p.slug} · version ${p.current_version}`}
        actions={scheduledFor
          ? <><StatusBadge status="SCHEDULED" /><span className="text-sm text-muted-foreground">goes live {dhakaDateTime(scheduledFor)} (Dhaka time)</span></>
          : <><StatusBadge status={p.status} content />{p.status === "PUBLISHED" && <Link prefetch={false} href={`${PUBLIC_PATH[p.type]}/${p.slug}`} className="text-sm underline">View</Link>}</>}
      />
      {p.pending_revision_id && (
        <p role="status" className="mb-4 rounded-xl border border-sky-400/60 bg-sky-500/10 p-4 text-sm">
          <strong>An edit is waiting for approval.</strong> The live post shows the previous version until a reviewer approves it{pendingApprovalId ? <> (<a className="underline" href={`/dashboard/approvals/${pendingApprovalId}`}>see the request</a>)</> : null}. You can withdraw it there to make a new edit.
        </p>
      )}
      {sentBack && (
        <p role="status" className="mb-4 rounded-xl border border-amber-400/60 bg-amber-500/10 p-4 text-sm">
          <strong>Changes requested{sentBack.by ? ` by ${sentBack.by}` : ""}:</strong> {sentBack.comment ?? "No note was left."} Edit the post below, then send it for approval again.
        </p>
      )}
      <Section title="Publishing">
        <div className="flex flex-wrap items-center gap-2">
          {p.status !== "PUBLISHED" && p.status !== "PENDING_APPROVAL" && (cap.publish !== "DENY" || cap.submit) && (
            <ActionForm action={publishPostAction.bind(null, id)} submitLabel={cap.publish === "ALLOW" ? "Publish" : "Submit for approval"} inline />
          )}
          {pendingApprovalId && <Link prefetch={false} href={`/dashboard/approvals/${pendingApprovalId}`} className="text-sm underline">Waiting for approval — view request</Link>}
          {p.status === "PUBLISHED" && cap.publish === "ALLOW" && (
            <ActionForm action={unpublishPostAction.bind(null, id)} submitLabel="Unpublish" variant="outline" inline confirm="Take this post off the public site?" />
          )}
          {cap.delete && <ActionForm action={archivePostAction.bind(null, id)} submitLabel="Archive" variant="destructive" inline redirectTo="/dashboard/posts?status=ARCHIVED" confirm="Archive this post? It leaves the site; you can restore it from “Archived”." />}
        </div>
        {cap.publish !== "ALLOW" && <p className="mt-2 text-xs text-muted-foreground">{cap.publishExplanation}</p>}
      </Section>

      {session?.caps["email.campaigns"] && (p.type === "ANNOUNCEMENT" || p.type === "NEWS") && (
        <Section title="Email" className="mt-6" description="Send it to members by email too: everyone who hasn't turned off club announcements, a few at a time within the email allowance.">
          {p.email_campaign_id ? (
            <p className="text-sm">It&apos;s being emailed. <Link prefetch={false} href={`/dashboard/email/${p.email_campaign_id}`} className="font-medium text-primary underline-offset-4 hover:underline">See the progress</Link></p>
          ) : (() => {
            const live = p.status === "PUBLISHED" && !scheduledFor;
            const planned = p.email_intent_json ? (JSON.parse(p.email_intent_json) as { audience?: { kind?: string } }).audience?.kind ?? "members" : null;
            return (
              <ActionForm action={postEmailAction.bind(null, id)} submitLabel={live ? "Email it now" : "Save"} inline={!live}
                confirm={live ? "Email this to members now? It can't be unsent, but you can pause or cancel it while it's sending." : undefined}>
                {live ? <input type="hidden" name="on" value="on" /> : (
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" name="on" defaultChecked={Boolean(planned)} className="h-4 w-4" />Email it when it&apos;s published
                  </label>
                )}
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <select name="audienceKind" defaultValue={planned ?? "members"} className="h-10 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm">
                    <option value="members">All members</option>
                    <option value="executives">The current committee</option>
                  </select>
                </label>
              </ActionForm>
            );
          })()}
        </Section>
      )}

      {cap.edit ? (
        <section className="mt-8" aria-labelledby="content-h">
          <h2 id="content-h" className="mb-3 text-lg font-semibold">Content</h2>
          <ActionForm action={updatePostAction.bind(null, id)} submitLabel={saveLabel} sticky
            confirm={p.status === "PENDING_APPROVAL" ? "Saving takes it out of the approval queue (reviewers mustn't approve old text). Send it for approval again afterwards. Save now?" : undefined}>
            {/* Optimistic locking: refused if someone else saved after this page loaded. */}
            <input type="hidden" name="expectedUpdatedAt" value={String(p.updated_at ?? "")} />
            <PostFields p={p as unknown as Record<string, unknown>} type={p.type} coverUrl={coverUrl} categories={cats.ok ? cats.data : []} />
          </ActionForm>
        </section>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">You can read this post but not edit it.</p>
      )}

      <Section title="Revisions" description="Every save is kept. Restoring creates a new version from the old one." className="mt-6">
        <ul className="divide-y text-sm">
          {revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">v{r.version}{r.version === p.current_version ? " (current)" : ""} · {r.title} · {r.changed_by_name ?? "import"} · {dhakaDateTime(r.created_at)}{r.change_reason ? ` — ${r.change_reason}` : ""}</span>
              <span className="flex items-center gap-2">
                <Link prefetch={false} href={`/dashboard/posts/${id}/revisions/${r.id}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">View</Link>
                {cap.edit && r.version !== p.current_version && (
                  <ActionForm action={restoreRevisionAction.bind(null, id, r.id)} submitLabel="Restore" variant="outline" inline confirm={`Restore version ${r.version}? It becomes a new version; nothing is lost.`} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
