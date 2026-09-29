"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellOff, Ban, Search } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { useLiveCounts } from "@/lib/api/live-counts";
import { dhakaDay, dhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { loadConversationsAction, type Conversations } from "./actions";

export type { Conversations };

const short = (iso: string | null) => {
  if (!iso) return "";
  if (dhakaDay(iso) === dhakaDay(new Date().toISOString())) return dhakaTime(iso);
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
};

/**
 * The conversation list (left pane on large screens, the whole page on phones): photo, name,
 * last message and time, unread and muted state. Search and an "Unread" filter work instantly;
 * the list refreshes by itself when a new message arrives in another conversation.
 */
export function ConversationList({ items: initial, selected, meId, archived }: { items: Conversations; selected?: string; meId: string; archived?: boolean }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  useEffect(() => setItems(initial), [initial]);

  // A change in the unread-conversations badge means a message arrived somewhere: reload the list.
  const counts = useLiveCounts();
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!counts) return;
    if (lastUnread.current !== null && lastUnread.current !== counts.unreadMessages) {
      loadConversationsAction(Boolean(archived)).then((r) => r.ok && setItems(r.data), () => undefined);
    }
    lastUnread.current = counts.unreadMessages;
  }, [counts, archived]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((c) => (!onlyUnread || c.unread) && (!needle || c.other_name.toLowerCase().includes(needle) || (c.last_body ?? "").toLowerCase().includes(needle)));
  }, [items, q, onlyUnread]);
  const unreadCount = items.filter((c) => c.unread).length;

  return (
    <nav aria-label="Conversations" className="flex min-h-0 flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{archived ? "Archived" : "Messages"}</h2>
        <Link prefetch={false} href={archived ? "/dashboard/chat" : "/dashboard/chat?archived=1"} className="inline-flex min-h-10 items-center rounded-md px-2 text-xs text-muted-foreground underline-offset-2 hover:underline">
          {archived ? "Back to inbox" : "Archived"}
        </Link>
      </div>
      {items.length > 0 && (
        <div className="space-y-2 border-b px-3 py-2">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or messages" className="h-10 w-full rounded-md border bg-background pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
          </label>
          {!archived && (
            <div className="flex gap-1.5" role="group" aria-label="Show">
              {[[false, "All"], [true, `Unread${unreadCount ? ` (${unreadCount})` : ""}`]].map(([v, label]) => (
                <button key={String(v)} type="button" aria-pressed={onlyUnread === v} onClick={() => setOnlyUnread(v as boolean)}
                  className={cn("min-h-9 rounded-full border px-3 text-xs", onlyUnread === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{label as string}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{archived ? "Nothing archived." : "No conversations yet. Start one with “New message”."}</p>
      ) : shown.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No conversation matches.</p>
      ) : (
        <ul className="divide-y overflow-y-auto overscroll-contain">
          {shown.map((c) => (
            <li key={c.id}>
              <Link prefetch={false} href={`/dashboard/chat/${c.id}`} aria-current={selected === c.id ? "page" : undefined}
                className={cn("flex items-center gap-3 px-3 py-3 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", selected === c.id && "bg-primary/10")}>
                <PersonAvatar name={c.other_name} url={c.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("flex min-w-0 items-center gap-1 truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>
                      <span className="truncate">{c.other_name}</span>
                      {c.muted ? <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="muted" /> : null}
                      {c.blocked ? <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="blocked" /> : null}
                    </span>
                    <time dateTime={c.last_message_at ?? undefined} className="shrink-0 text-[11px] text-muted-foreground">{short(c.last_message_at)}</time>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("block min-w-0 flex-1 truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>
                      {c.last_sender === meId ? "You: " : ""}{c.last_deleted ? "Message deleted" : c.last_body ?? ""}
                    </span>
                    {c.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" role="img" aria-label="unread" /> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
