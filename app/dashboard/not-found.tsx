import Link from "next/link";

/** A dashboard item that doesn't exist (any more): archived, deleted, or a mistyped link. */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This item doesn&apos;t exist or was archived. Archived posts and events can be restored from the “Archived” filter on their lists.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
        <Link prefetch={false} href="/dashboard" className="inline-flex min-h-10 items-center rounded-md border px-4 hover:bg-muted">Dashboard</Link>
        <Link prefetch={false} href="/dashboard/posts?status=ARCHIVED" className="inline-flex min-h-10 items-center rounded-md border px-4 hover:bg-muted">Archived posts</Link>
        <Link prefetch={false} href="/dashboard/events?status=ARCHIVED" className="inline-flex min-h-10 items-center rounded-md border px-4 hover:bg-muted">Archived events</Link>
      </div>
    </div>
  );
}
