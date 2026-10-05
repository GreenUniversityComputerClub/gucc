import Link from "next/link";
import { requireSignedIn, rpc, view } from "@/lib/api/session";
import type { myNotifications } from "@/lib/server/services/community";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { normalizeNotifications } from "@/lib/api/contracts";
import { broadcastAction } from "../actions";
import { NotificationList, type NotificationRow } from "./list";

type SP = Promise<{ tab?: string; before?: string }>;

export default async function NotificationsAdmin({ searchParams }: { searchParams: SP }) {
  const session = await requireSignedIn("/dashboard/notifications");
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "unread";
  const { rows, unread, next } = normalizeNotifications(await view<Awaited<ReturnType<typeof myNotifications>>>(
    "notifications.list", { limit: 30, unread: tab === "unread", before: sp.before }, "/dashboard/notifications"));
  const audiences = session.caps["notifications.send"]
    ? await rpc<{ members: number; executives: number }>("notifications.audiences", {}).then((r) => (r.ok ? r.data : { members: 0, executives: 0 }))
    : null;
  const tabLink = (t: "unread" | "all", label: string) => (
    <Link href={t === "all" ? "/dashboard/notifications?tab=all" : "/dashboard/notifications"} aria-current={tab === t ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your membership, approvals, events and messages. Notifications you look at, or whose page you open, are marked read by themselves." />
      <Section title="Yours" actions={<nav className="flex gap-1" aria-label="Show">{tabLink("unread", `Unread${unread ? ` (${unread})` : ""}`)}{tabLink("all", "All")}</nav>}>
        <NotificationList key={`${tab}:${sp.before ?? ""}`} rows={rows as NotificationRow[]} emptyText={tab === "unread" ? "You're all caught up." : "Nothing yet."}
          live={sp.before ? undefined : { unreadOnly: tab === "unread" }} />
        {(sp.before || next) && (
          <div className="mt-3 flex gap-3 text-sm">
            {sp.before && <Link href={tab === "all" ? "/dashboard/notifications?tab=all" : "/dashboard/notifications"} className="underline">Newest</Link>}
            {next && <Link href={`/dashboard/notifications?${new URLSearchParams({ ...(tab === "all" ? { tab: "all" } : {}), before: next })}`} className="underline">Older</Link>}
          </div>
        )}
      </Section>
      {session.caps["notifications.send"] && audiences && (
        <Section id="send" title="Send an announcement" description="Appears at once in each person's notifications, with your name and photo. You don't get a copy." className="mt-6">
          <ActionForm action={broadcastAction} submitLabel="Send" resetOnSuccess
            confirm={`Send this announcement now? All active members: ${audiences.members} people; current executives: ${audiences.executives} people. It can't be unsent.`}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field name="title" label="Title" required className="md:col-span-2" />
              <Field name="audience" label="To" type="select" options={[{ value: "members", label: `All active members (${audiences.members})` }, { value: "executives", label: `Current executives (${audiences.executives})` }]} />
            </div>
            <Field name="body" label="Message" type="textarea" rows={3} required />
            <Field name="link" label="Link (optional)" placeholder="/events/…" hint="A page on this site, starting with / (for example /events/workshop-2026)." />
            {session.caps["email.campaigns"] && (
              <Field name="email" label="Also email it" type="checkbox"
                hint="To everyone in the audience who didn't opt out of club announcements, a few at a time within the email allowance (progress in Email). Each email has an unsubscribe link." />
            )}
          </ActionForm>
        </Section>
      )}
    </>
  );
}
