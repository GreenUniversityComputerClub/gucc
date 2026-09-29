import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listPostsAdmin } from "@/lib/server/services/posts";
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { restorePostAction } from "../actions";

const dhakaDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : null);

const LABEL: Record<string, string> = { BLOG: "Blog", NEWS: "News", ANNOUNCEMENT: "Announcements" };

export default async function PostsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/posts");
  const sp = await searchParams;
  // Members (no management rights) write and follow their own blog posts only.
  const member = !session.adminAccess;
  const type = !member && sp.type && LABEL[sp.type] ? sp.type : "BLOG";
  const page = Number(sp.page ?? 1);
  const rows = await view<Awaited<ReturnType<typeof listPostsAdmin>>>("posts.list", { type, status: sp.status || undefined, q: sp.q || undefined, page }, "/dashboard/posts");
  const now = new Date().toISOString();
  return (
    <>
      <PageHeader title={member ? "My blog posts" : LABEL[type]} description={member ? "Write about what you learned, built or organised. A club reviewer reads each post before it goes live; you're notified when it's approved or needs changes." : "You see posts you can read: everything, your own, or your categories, depending on your position."} actions={session.caps["posts.create"] ? <Link prefetch={false} href={`/dashboard/posts/new?type=${type}`} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">New {type === "ANNOUNCEMENT" ? "announcement" : type === "NEWS" ? "news post" : "blog post"}</Link> : null} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="type" value={type} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles" aria-label="Search" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ""} className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">Any status</option>
          {["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState>{member ? "You haven't written anything yet. Start with “New blog post”." : "Nothing here yet."}</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                {p.status === "ARCHIVED" ? <span className="font-medium">{p.title}</span> : <Link prefetch={false} href={`/dashboard/posts/${p.id}`} className="font-medium hover:underline">{p.title}</Link>}
                <p className="text-xs text-muted-foreground">{p.author_display ?? "—"} · {p.category_name ?? "uncategorised"} · updated {dhakaDate(p.updated_at)}</p>
              </div>
              <span className="flex items-center gap-2">
                {p.status === "PUBLISHED" && p.published_at && p.published_at > now
                  ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusBadge status="SCHEDULED" />{dhakaDate(p.published_at)}</span>
                  : <StatusBadge status={p.status} content />}
                {p.status === "ARCHIVED" && <ActionForm action={restorePostAction.bind(null, p.id)} submitLabel="Restore" variant="outline" inline />}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={rows.length === 30} base="/dashboard/posts" params={{ type, status: sp.status, q: sp.q }} />
    </>
  );
}
