import Link from "next/link";
import { view } from "@/lib/api/session";
import type { listMessages } from "@/lib/server/services/contact";
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { messageStatusAction } from "../actions";
import { CONTACT_TOPICS } from "@/lib/contact/topics";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const { rows, hasMore, unread } = await view<Awaited<ReturnType<typeof listMessages>>>("messages.list", { status: sp.status, page }, "/dashboard/messages");
  const tabs: Array<[string, string]> = [["", `Inbox${unread ? ` (${unread} new)` : ""}`], ["NEW", "New"], ["READ", "Handled"], ["ARCHIVED", "Archived"]];
  const reply = (m: { email: string; name: string; message: string; created_at: string }) => {
    const quoted = m.message.split("\n").slice(0, 20).map((l) => `> ${l}`).join("\n");
    return `mailto:${m.email}?subject=${encodeURIComponent("Re: your message to GUCC")}&body=${encodeURIComponent(`Hi ${m.name},\n\n\n\nOn ${new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })} you wrote:\n${quoted}`)}`;
  };
  return (
    <>
      <PageHeader title="Contact inbox" description="Messages sent through the website's contact form. Every message is kept here, even when email delivery isn't set up. Reply opens your own email app with the message quoted; then mark it handled so the others know." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, label]) => <Link prefetch={false} key={k || "inbox"} href={`/dashboard/messages${k ? `?status=${k}` : ""}`} aria-current={(sp.status ?? "") === k ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-full border px-3 ${(sp.status ?? "") === k ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState>{sp.status === "NEW" || (!sp.status && !unread) ? "Nothing new. Messages from the contact form arrive here." : "No messages here."}</EmptyState> : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className={`rounded-xl border bg-card p-4 ${m.status === "NEW" ? "border-primary/40" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.name} <StatusBadge status={m.status === "NEW" ? "NEW" : m.status === "READ" ? "HANDLED" : m.status} />
                    {m.topic && CONTACT_TOPICS[m.topic] && <span className="ml-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{CONTACT_TOPICS[m.topic]}</span>}</p>
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to GUCC")}`} className="text-sm underline">{m.email}</a>
                </div>
                <time className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{m.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                <a href={reply(m)} className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Reply</a>
                {m.status !== "READ" && <ActionForm action={messageStatusAction.bind(null, m.id, "READ")} submitLabel="Mark handled" variant="outline" inline />}
                {m.status === "READ" && <ActionForm action={messageStatusAction.bind(null, m.id, "NEW")} submitLabel="Mark as new" variant="ghost" inline />}
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
