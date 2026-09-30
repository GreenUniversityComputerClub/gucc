// Article typography (headings, lists, quotes, code) shared with the blog.
import "@/app/blog/[slug]/blog.css";
import { view } from "@/lib/api/session";
import type { getRevision } from "@/lib/server/services/posts";
import { ActionForm, PageHeader, Section } from "@/components/admin/ui";
import { renderMarkdown } from "@/lib/markdown";
import { dhakaDateTime } from "@/lib/time";
import { restoreRevisionAction } from "../../../../actions";

/** Read an earlier version of a post exactly as it would appear, then restore it if wanted. */
export default async function RevisionPage({ params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await params;
  const path = `/dashboard/posts/${id}/revisions/${revisionId}`;
  const r = await view<Awaited<ReturnType<typeof getRevision>>>("posts.revision", { postId: id, revisionId }, path);
  const current = r.version === r.current_version;
  return (
    <>
      <PageHeader
        back={{ href: `/dashboard/posts/${id}`, label: "Back to the post" }}
        title={`Version ${r.version}${current ? " (current)" : ""}`}
        description={`Saved ${dhakaDateTime(r.created_at)} (Dhaka time) by ${r.changed_by_name ?? "the import"}${r.change_reason ? ` · “${r.change_reason}”` : ""}`}
        actions={current ? undefined : (
          <ActionForm action={restoreRevisionAction.bind(null, id, r.id)} submitLabel="Restore this version" inline redirectTo={`/dashboard/posts/${id}`}
            confirm={`Restore version ${r.version}? It becomes a new version; nothing is lost.`} />
        )}
      />
      <Section title={r.title}>
        {r.excerpt && <p className="mb-4 text-sm text-muted-foreground">{r.excerpt}</p>}
        {r.body_markdown?.trim()
          ? <div className="article-reading-container"><div className="prose"><div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.body_markdown) }} /></div></div>
          : <p className="text-sm text-muted-foreground">This version has no text.</p>}
      </Section>
    </>
  );
}
