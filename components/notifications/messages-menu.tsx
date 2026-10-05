"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, PenSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { useLiveCounts, type LiveCounts } from "@/lib/api/live-counts";
import { useLive } from "@/lib/api/live-client";
import { recentConversationsAction, type Conversations } from "@/app/dashboard/chat/actions";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CountBadge } from "./notification-bell";

const FRESH_MS = 30_000;
const headerButton = "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-primary/10 data-[state=open]:text-primary";

/**
 * The header's Messages button, as Messenger's: a live count of unread conversations and a menu
 * with the newest ones (photo, name, the last message, unread in bold). Loaded when opened.
 */
export function MessagesMenu({ seed }: { seed: LiveCounts }) {
  const counts = useLiveCounts(seed) ?? seed;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Conversations | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedAt = useRef(0);
  const stale = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    if (rows && !stale.current && Date.now() - loadedAt.current < FRESH_MS) return;
    setFailed(false);
    void recentConversationsAction(8).then((r) => {
      if (r.ok) {
        setRows(r.data);
        loadedAt.current = Date.now();
        stale.current = false;
      } else setFailed(true);
    }).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when opened
  }, [open]);

  // A message arriving makes the list out of date; it's fetched again the next time it opens.
  useLive("msg", () => {
    stale.current = true;
  });

  const n = counts.unreadMessages;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={headerButton} aria-label={n ? `Messages, ${n} unread conversation${n === 1 ? "" : "s"}` : "Messages"}>
          <MessageCircle className="h-5 w-5" aria-hidden />
          <CountBadge n={n} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8} className="flex max-h-[min(34rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="text-lg font-bold">Messages</p>
          <DropdownMenuItem asChild className="h-9 w-9 justify-center rounded-full p-0">
            <Link prefetch={false} href="/dashboard/chat?new=1" aria-label="New message"><PenSquare className="h-4 w-4" /></Link>
          </DropdownMenuItem>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
          {!rows && !failed && (
            <ul aria-label="Loading conversations" className="space-y-1 p-1">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex animate-pulse gap-3 rounded-lg p-2">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                  <span className="flex-1 space-y-2 pt-1"><span className="block h-3 w-1/2 rounded bg-muted" /><span className="block h-3 w-3/4 rounded bg-muted" /></span>
                </li>
              ))}
            </ul>
          )}
          {failed && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load your conversations.</p>}
          {rows && rows.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="font-medium">No conversations yet</p>
              <p className="text-sm text-muted-foreground">Message any member from their profile or from Messages.</p>
            </div>
          )}
          {rows?.map((c) => {
            const unread = c.unread > 0;
            const preview = c.last_deleted ? "Message deleted" : c.last_body ?? "";
            const who = c.isGroup && c.last_sender_name ? `${c.last_sender_name.split(" ")[0]}: ` : "";
            return (
              <DropdownMenuItem key={c.id} asChild className="gap-3 rounded-lg p-2 focus:bg-muted">
                <Link prefetch={false} href={`/dashboard/chat/${c.id}`}>
                  <PersonAvatar name={c.other_name} url={c.avatarUrl} size="md" group={c.isGroup} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", unread ? "font-semibold" : "font-medium")}>{c.other_name}</span>
                    <span className={cn("block truncate text-xs", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {who}{preview}{c.last_message_at ? ` · ${relativeTime(c.last_message_at, now)}` : ""}
                    </span>
                  </span>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem asChild className="m-1.5 min-h-10 justify-center rounded-lg text-sm font-semibold text-primary focus:bg-primary/10 focus:text-primary">
          <Link prefetch={false} href="/dashboard/chat">See all in Messages</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
