import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import { mediaHref } from "@/lib/api/config";
import { ActionForm, EmptyState, Field, PageHeader, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { lostFoundImageAction, lostFoundStatusAction } from "../actions";

type Posts = Array<Record<string, unknown>>;
const day = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function LostFoundModeration({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/lost-found");
  const sp = await searchParams;
  const status = ["pending", "active", "resolved", "rejected"].includes(sp.status ?? "") ? sp.status! : "pending";
  const posts = await view<Posts>("lostfound.list", { status, q: sp.q }, "/dashboard/lost-found");
  return (
    <>
      <PageHeader title="Lost & found" description="Review posts before they go public, and keep the board tidy. Posts archive themselves after a while (settings: lostfound.config)."
        actions={<Link href="/lost-found" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Open the public page</Link>} />
      <nav aria-label="Status" className="mb-3 flex flex-wrap gap-2 text-sm">
        {[["pending", "Waiting for review"], ["active", "Live"], ["resolved", "Resolved"], ["rejected", "Changes requested"]].map(([k, label]) => (
          <Link key={k} prefetch={false} href={`/dashboard/lost-found?status=${k}`} className={cn("rounded-full border px-3 py-1", status === k && "bg-primary text-primary-foreground")}>{label}</Link>
        ))}
      </nav>
      <form className="mb-4 flex gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles and descriptions" aria-label="Search" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Search</button>
      </form>
      {posts.length === 0 ? <EmptyState>{status === "pending" ? "Nothing waiting. Everything is reviewed." : "No posts here."}</EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {posts.map((p) => {
            const img = p.image_url ? (String(p.image_url).startsWith("/media/") ? mediaHref(String(p.image_url)) : String(p.image_url)) : null;
            return (
              <li key={String(p.id)} className="flex flex-col rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{String(p.title)}</p>
                    <p className="text-xs text-muted-foreground">{String(p.type) === "lost" ? "Lost" : "Found"} · {String(p.category)} · {String(p.location)} · {day(p.occurred_at)}</p>
                  </div>
                  <StatusBadge status={String(p.status).toUpperCase()} />
                </div>
                <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{String(p.description)}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img && <img src={img} alt="" className="mt-3 h-40 w-full rounded-lg object-cover" loading="lazy" />}
                {p.reject_reason ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Asked to change: {String(p.reject_reason)}</p> : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {status !== "active" && <ActionForm action={lostFoundStatusAction.bind(null, String(p.id), "active")} submitLabel="Approve" inline />}
                  {status === "pending" && (
                    <ActionForm action={lostFoundStatusAction.bind(null, String(p.id), "rejected")} submitLabel="Ask for changes" variant="outline" inline>
                      <Field name="reason" label="What should change?" required />
                    </ActionForm>
                  )}
                  {status === "active" && <ActionForm action={lostFoundStatusAction.bind(null, String(p.id), "resolved")} submitLabel="Mark resolved" variant="outline" inline />}
                  {img && <ActionForm action={lostFoundImageAction.bind(null, String(p.id))} submitLabel="Remove photo" variant="outline" inline confirm="Remove this photo? The author is told why." />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
