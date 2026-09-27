import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { myNotifications } from "@/lib/server/services/community";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { normalizeNotifications } from "@/lib/api/contracts";
import { broadcastAction, markAllReadAction, markReadAction } from "../actions";

type SP = Promise<{ tab?: string; before?: string }>;

export default async function NotificationsAdmin({ searchParams }: { searchParams: SP }) {
  const session = await requireSignedIn("/dashboard/notifications");
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "unread";
  const { rows, unread, next } = normalizeNotifications(await view<Awaited<ReturnType<typeof myNotifications>>>(
    "notifications.list", { limit: 30, unread: tab === "unread", before: sp.before }, "/dashboard/notifications"));
  const tabLink = (t: "unread" | "all", label: string) => (
    <Link href={t === "all" ? "/dashboard/notifications?tab=all" : "/dashboard/notifications"} aria-current={tab === t ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your membership, approvals, events and messages." actions={unread > 0 ? <ActionForm action={markAllReadAction} submitLabel="Mark all read" variant="outline" inline /> : null} />
      <Section title="Yours" actions={<nav className="flex gap-1" aria-label="Show">{tabLink("unread", `Unread${unread ? ` (${unread})` : ""}`)}{tabLink("all", "All")}</nav>}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{tab === "unread" ? "You're all caught up." : "Nothing yet."}</p> : (
          <ul className="divide-y text-sm">
            {rows.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className={n.read_at ? "" : "font-semibold"}>{n.link ? <Link prefetch={false} href={`/dashboard/notifications/open/${n.id}?to=${encodeURIComponent(n.link)}`} className="hover:underline">{n.title}</Link> : n.title}</p>
                  {n.body && <p className="text-muted-foreground">{n.body}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <time dateTime={n.created_at} className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</time>
                  {!n.read_at && <ActionForm action={markReadAction.bind(null, n.id)} submitLabel="Mark read" successMessage="" variant="ghost" inline />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {(sp.before || next) && (
          <div className="mt-3 flex gap-3 text-sm">
            {sp.before && <Link href={tab === "all" ? "/dashboard/notifications?tab=all" : "/dashboard/notifications"} className="underline">Newest</Link>}
            {next && <Link href={`/dashboard/notifications?${new URLSearchParams({ ...(tab === "all" ? { tab: "all" } : {}), before: next })}`} className="underline">Older</Link>}
          </div>
        )}
      </Section>
      {session.caps["notifications.send"] && (
        <Section title="Send an announcement" className="mt-6">
          <ActionForm action={broadcastAction} submitLabel="Send" confirm="Send this notification now?" resetOnSuccess>
            <div className="grid gap-3 md:grid-cols-3">
              <Field name="title" label="Title" required className="md:col-span-2" />
              <Field name="audience" label="To" type="select" options={[{ value: "members", label: "All active members" }, { value: "executives", label: "Current executives" }]} />
            </div>
            <Field name="body" label="Message" type="textarea" rows={3} required />
            <Field name="link" label="Link (optional)" placeholder="/events/…" />
          </ActionForm>
        </Section>
      )}
    </>
  );
}
