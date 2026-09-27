import Link from "next/link";
import { rpc, view } from "@/lib/api/session";
import type { postView } from "@/lib/server/views/admin";
import { ActionForm, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { archivePostAction, publishPostAction, restoreRevisionAction, unpublishPostAction, updatePostAction } from "../../actions";
import { PostFields } from "../post-form";

const PUBLIC_PATH: Record<string, string> = { BLOG: "/blog", NEWS: "/news", ANNOUNCEMENT: "/announcements" };

export default async function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, cats] = await Promise.all([
    view<Awaited<ReturnType<typeof postView>>>("views.post", { id }, `/dashboard/posts/${id}`),
    rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "POST" }),
  ]);
  const { post: p, revisions, pendingApprovalId, capabilities: cap, coverUrl } = data;

  return (
    <>
      <PageHeader
        title={p.title}
        description={`${PUBLIC_PATH[p.type]}/${p.slug} · version ${p.current_version}`}
        actions={<><StatusBadge status={p.status} />{p.status === "PUBLISHED" && <Link prefetch={false} href={`${PUBLIC_PATH[p.type]}/${p.slug}`} className="text-sm underline">View</Link>}</>}
      />
      <Section title="Publishing">
        <div className="flex flex-wrap items-center gap-2">
          {p.status !== "PUBLISHED" && p.status !== "PENDING_APPROVAL" && (cap.publish !== "DENY" || cap.submit) && (
            <ActionForm action={publishPostAction.bind(null, id)} submitLabel={cap.publish === "ALLOW" ? "Publish" : "Submit for approval"} inline />
          )}
          {pendingApprovalId && <Link prefetch={false} href={`/dashboard/approvals/${pendingApprovalId}`} className="text-sm underline">Waiting for approval — view request</Link>}
          {p.status === "PUBLISHED" && cap.publish === "ALLOW" && (
            <ActionForm action={unpublishPostAction.bind(null, id)} submitLabel="Unpublish" variant="outline" inline confirm="Take this post off the public site?" />
          )}
          {cap.delete && <ActionForm action={archivePostAction.bind(null, id)} submitLabel="Archive" variant="destructive" inline confirm="Archive this post? It leaves the site; its revisions are kept." />}
        </div>
        {cap.publish !== "ALLOW" && <p className="mt-2 text-xs text-muted-foreground">{cap.publishExplanation}</p>}
      </Section>

      {cap.edit ? (
        <Section title="Content" className="mt-6">
          <ActionForm action={updatePostAction.bind(null, id)} submitLabel="Save new version">
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
              <span>v{r.version} · {r.title} · {r.changed_by_name ?? "import"} · {r.created_at.slice(0, 16).replace("T", " ")}{r.change_reason ? ` — ${r.change_reason}` : ""}</span>
              {cap.edit && r.version !== p.current_version && (
                <ActionForm action={restoreRevisionAction.bind(null, id, r.id)} submitLabel="Restore" variant="outline" inline confirm={`Restore version ${r.version}?`} />
              )}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
