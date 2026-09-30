import Link from "next/link";
import { rpc, view } from "@/lib/api/session";
import type { postView } from "@/lib/server/views/admin";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { archivePostAction, publishPostAction, restoreRevisionAction, unpublishPostAction, updatePostAction } from "../../actions";
import { PostFields } from "../post-form";
import { dhakaDateTime } from "@/lib/time";

const PUBLIC_PATH: Record<string, string> = { BLOG: "/blog", NEWS: "/news", ANNOUNCEMENT: "/announcements" };

export default async function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, cats] = await Promise.all([
    view<Awaited<ReturnType<typeof postView>>>("views.post", { id }, `/dashboard/posts/${id}`),
    rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "POST" }),
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

      {cap.edit ? (
        <Section title="Content" className="mt-6">
          <ActionForm action={updatePostAction.bind(null, id)} submitLabel={saveLabel}
            confirm={p.status === "PENDING_APPROVAL" ? "Saving takes it out of the approval queue (reviewers mustn't approve old text). Send it for approval again afterwards. Save now?" : undefined}>
            {/* Optimistic locking: refused if someone else saved after this page loaded. */}
            <input type="hidden" name="expectedUpdatedAt" value={String(p.updated_at ?? "")} />
            <PostFields p={p as unknown as Record<string, unknown>} type={p.type} coverUrl={coverUrl} categories={cats.ok ? cats.data : []} />
          </ActionForm>
        </Section>
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
