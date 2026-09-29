import Link from "next/link";
import type { myConversations } from "@/lib/server/services/messaging";
import { cn } from "@/lib/utils";

export type Conversations = Awaited<ReturnType<typeof myConversations>>;
const short = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  // "Today" in Dhaka, whatever the server's clock zone is.
  const dhakaDay = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const today = dhakaDay(new Date()) === dhakaDay(d);
  return d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", ...(today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }) });
};

/** The conversation list (left pane on large screens, the whole page on phones). */
export function ConversationList({ items, selected, meId, archived }: { items: Conversations; selected?: string; meId: string; archived?: boolean }) {
  return (
    <nav aria-label="Conversations" className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{archived ? "Archived" : "Messages"}</h2>
        <Link prefetch={false} href={archived ? "/dashboard/chat" : "/dashboard/chat?archived=1"} className="text-xs text-muted-foreground underline">{archived ? "Back" : "Archived"}</Link>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{archived ? "Nothing archived." : "No conversations yet."}</p>
      ) : (
        <ul className="divide-y overflow-y-auto">
          {items.map((c) => (
            <li key={c.id}>
              <Link prefetch={false} href={`/dashboard/chat/${c.id}`} aria-current={selected === c.id ? "page" : undefined}
                className={cn("flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60", selected === c.id && "bg-primary/10")}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-hidden>
                  {(c.other_name ?? c.other_email).split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.other_name ?? c.other_email}</span>
                    <time className="shrink-0 text-[11px] text-muted-foreground">{short(c.last_message_at)}</time>
                  </span>
                  <span className={cn("block truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
                    {c.last_sender === meId ? "You: " : ""}{c.last_deleted ? "Message deleted" : c.last_body ?? ""}
                  </span>
                </span>
                {c.unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="unread" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
