import Link from "next/link";
import { view } from "@/lib/api/session";
import type { listMessages } from "@/lib/server/services/contact";
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { messageStatusAction } from "../actions";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const { rows, hasMore, unread } = await view<Awaited<ReturnType<typeof listMessages>>>("messages.list", { status: sp.status, page }, "/dashboard/messages");
  const tabs: Array<[string, string]> = [["", `Inbox${unread ? ` (${unread} new)` : ""}`], ["NEW", "New"], ["ARCHIVED", "Archived"]];
  return (
    <>
      <PageHeader title="Messages" description="Messages from the contact form. Every message is kept here even when email delivery isn't configured. Reply from your own email; the sender's address is shown." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => <Link prefetch={false} key={k || "inbox"} href={`/dashboard/messages${k ? `?status=${k}` : ""}`} className={`rounded-full border px-3 py-1 ${(sp.status ?? "") === k ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState>No messages.</EmptyState> : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className={`rounded-xl border bg-card p-4 ${m.status === "NEW" ? "border-primary/40" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.name} <StatusBadge status={m.status === "NEW" ? "PENDING" : m.status} /></p>
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to GUCC")}`} className="text-sm underline">{m.email}</a>
                </div>
                <time className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{m.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                {m.status !== "READ" && <ActionForm action={messageStatusAction.bind(null, m.id, "READ")} submitLabel="Mark handled" variant="outline" inline />}
                {m.status !== "ARCHIVED" && <ActionForm action={messageStatusAction.bind(null, m.id, "ARCHIVED")} submitLabel="Archive" variant="ghost" inline />}
                {m.status === "ARCHIVED" && <ActionForm action={messageStatusAction.bind(null, m.id, "NEW")} submitLabel="Move to inbox" variant="ghost" inline />}
                {m.handled_by_name && <span>Handled by {m.handled_by_name}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={hasMore} base="/dashboard/messages" params={{ status: sp.status }} />
    </>
  );
}
