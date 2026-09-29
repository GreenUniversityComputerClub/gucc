import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listPostsAdmin } from "@/lib/server/services/posts";
import { EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";

const dhakaDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : null);

const LABEL: Record<string, string> = { BLOG: "Blog", NEWS: "News", ANNOUNCEMENT: "Announcements" };

export default async function PostsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/posts");
  const sp = await searchParams;
  const type = sp.type && LABEL[sp.type] ? sp.type : "BLOG";
  const page = Number(sp.page ?? 1);
  const rows = await view<Awaited<ReturnType<typeof listPostsAdmin>>>("posts.list", { type, status: sp.status || undefined, q: sp.q || undefined, page }, "/dashboard/posts");
  return (
    <>
      <PageHeader title={LABEL[type]} description="You see posts you can read: everything, your own, or your categories, depending on your position." actions={session.caps["posts.create"] ? <Link prefetch={false} href={`/dashboard/posts/new?type=${type}`} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">New {type === "ANNOUNCEMENT" ? "announcement" : type === "NEWS" ? "news post" : "blog post"}</Link> : null} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input type="hidden" name="type" value={type} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles" aria-label="Search" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="status" aria-label="Status" defaultValue={sp.status ?? ""} className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">Any status</option>
          {["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "REJECTED"].map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState>Nothing here yet.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link prefetch={false} href={`/dashboard/posts/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                <p className="text-xs text-muted-foreground">{p.author_display ?? "—"} · {p.category_name ?? "uncategorised"} · updated {dhakaDate(p.updated_at)}</p>
              </div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={rows.length === 30} base="/dashboard/posts" params={{ type, status: sp.status, q: sp.q }} />
    </>
  );
}
