"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellOff, Ban, Search, Users } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { useLive } from "@/lib/api/live-client";
import { useLiveCounts } from "@/lib/api/live-counts";
import { usePresence, useWatch } from "@/lib/api/presence";
import { dhakaDay, dhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { loadConversationsAction, type Conversations } from "./actions";

export type { Conversations };

const short = (iso: string | null) => {
  if (!iso) return "";
  if (dhakaDay(iso) === dhakaDay(new Date().toISOString())) return dhakaTime(iso);
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
};

const TYPING_MS = 6000;
type Filter = "all" | "unread" | "groups";

/**
 * The conversation list (left pane on large screens, the whole page on phones): a row of the
 * people active now, then each conversation with its photo (a green dot while the person is
 * active), name and club badge, the last message ("typing…" while someone writes) and time.
 * Unread conversations stand out (tinted, bold, with how many messages wait; grey when muted).
 * New messages move a conversation to the top the moment they arrive; search and the filters
 * work instantly, without asking the server.
 */
export function ConversationList({ items: initial, selected, meId, archived, watch, header }: {
  items: Conversations;
  selected?: string;
  meId: string;
  archived?: boolean;
  watch?: string | null;
  header?: React.ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typing, setTyping] = useState<Record<string, number>>({});
  const online = usePresence();
  useWatch(watch);
  useEffect(() => setItems(initial), [initial]);

  // Changes we can't apply in place (a new conversation, a rename, a read elsewhere): reload the list, once.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      loadConversationsAction(Boolean(archived)).then((r) => r.ok && setItems(r.data), () => undefined);
    }, 600);
  }, [archived]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useLive("msg", (ev) => {
    const m = ev.m as { id: string; sender: string; senderName: string; body: string; at: string; kind: string };
    setItems((list) => {
      const i = list.findIndex((c) => c.id === ev.c);
      if (i < 0 || archived) {
        reload();
        return list;
      }
      const c = list[i]!;
      // An older event arriving late (a replay) never replaces a newer preview.
      if (c.last_message_at && m.at < c.last_message_at) return list;
      const next = {
        ...c, last_message_at: m.at, last_body: m.body, last_sender: m.sender, last_sender_name: m.senderName, last_kind: m.kind, last_deleted: null,
        unread: m.sender !== meId && ev.c !== selected ? 1 : c.unread,
        unreadCount: m.sender !== meId && ev.c !== selected && m.kind !== "SYSTEM" ? (c.unreadCount ?? 0) + 1 : m.sender === meId ? 0 : c.unreadCount,
      };
      return [next, ...list.slice(0, i), ...list.slice(i + 1)];
    });
    setTyping((t) => (t[ev.c] ? { ...t, [ev.c]: 0 } : t));
  });
  useLive("typing", (ev) => {
    if (ev.u === meId) return;
    setTyping((t) => ({ ...t, [ev.c]: Date.now() + TYPING_MS }));
    window.setTimeout(() => setTyping((t) => (t[ev.c] && t[ev.c]! <= Date.now() ? { ...t, [ev.c]: 0 } : t)), TYPING_MS + 50);
  });
  useLive("conv", reload);
  useLive("sync", reload);
  useLive("resync", reload);
  useLive("del", reload);
  // Without a live connection: a change in the unread badge means a message arrived somewhere.
  const counts = useLiveCounts();
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!counts) return;
    if (lastUnread.current !== null && lastUnread.current !== counts.unreadMessages) reload();
    lastUnread.current = counts.unreadMessages;
  }, [counts, reload]);

  // The open conversation is read.
  useEffect(() => {
    if (selected) setItems((list) => list.map((c) => (c.id === selected && c.unread ? { ...c, unread: 0, unreadCount: 0 } : c)));
  }, [selected]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((c) => (filter !== "unread" || c.unread) && (filter !== "groups" || c.isGroup)
      && (!needle || c.other_name.toLowerCase().includes(needle) || (c.last_body ?? "").toLowerCase().includes(needle) || (c.badge?.short ?? "").toLowerCase().includes(needle) || (c.badge?.label ?? "").toLowerCase().includes(needle)));
  }, [items, q, filter]);
  const unreadCount = items.filter((c) => c.unread).length;
  const groups = items.filter((c) => c.isGroup).length;
  // People I talk with who are active right now (most recent conversation first).
  const activeNow = useMemo(() => items.filter((c) => !c.isGroup && c.other_id && !c.blocked && online(c.other_id)), [items, online]);

  return (
    <nav aria-label="Conversations" className="flex h-full min-h-0 flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{archived ? "Archived" : "Chats"}</h2>
        <div className="flex items-center gap-1">
          {header}
          <Link prefetch={false} href={archived ? "/dashboard/chat" : "/dashboard/chat?archived=1"} className="inline-flex min-h-10 items-center rounded-md px-2 text-xs text-muted-foreground underline-offset-2 hover:underline">
            {archived ? "Back to inbox" : "Archived"}
          </Link>
        </div>
      </div>
      {items.length > 0 && (
        <div className="space-y-2 border-b px-3 py-2">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, groups or messages" type="search" enterKeyHint="search"
              className="h-10 w-full rounded-full border bg-background pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
          </label>
          {!archived && (
            <div className="flex gap-1.5" role="group" aria-label="Show">
              {([["all", "All"], ["unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`], ...(groups ? [["groups", `Groups (${groups})`]] : [])] as Array<[Filter, string]>).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
                  className={cn("min-h-9 rounded-full border px-3 text-xs transition-colors", filter === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {!archived && activeNow.length > 0 && !q.trim() && (
        <section aria-label="Active now" className="border-b px-3 pb-2 pt-2.5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Active now <span className="font-normal normal-case tracking-normal">({activeNow.length})</span>
          </h3>
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {activeNow.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link prefetch={false} href={`/dashboard/chat/${c.id}`} title={c.other_name} aria-label={`${c.other_name}, active now`}
                  className={cn("flex w-16 flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected === c.id && "bg-primary/10")}>
                  <PersonAvatar name={c.other_name} url={c.avatarUrl} size="md" className="h-12 w-12" online />
                  <span className="w-full truncate text-center text-[11px] leading-tight">{c.other_name.split(" ")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" aria-hidden />
          <p>{archived ? "Nothing archived." : "No conversations yet. Start one with “New”."}</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No conversation matches.</p>
      ) : (
        <ul className="flex-1 divide-y overflow-y-auto overscroll-contain">
          {shown.map((c) => {
            const isTyping = (typing[c.id] ?? 0) > Date.now();
            const unread = Boolean(c.unread);
            const waiting = c.unreadCount ?? 0;
            const preview = isTyping ? "typing…"
              : c.last_kind === "SYSTEM" ? c.last_body ?? ""
                : `${c.last_sender === meId ? "You: " : c.isGroup && c.last_sender_name ? `${c.last_sender_name.split(" ")[0]}: ` : ""}${c.last_deleted ? "Message deleted" : c.last_body ?? ""}`;
            return (
              <li key={c.id}>
                <Link prefetch={false} href={`/dashboard/chat/${c.id}`} aria-current={selected === c.id ? "page" : undefined}
                  aria-label={unread ? `${c.other_name}, ${waiting > 1 ? `${waiting} unread messages` : "unread"}` : undefined}
                  className={cn("relative flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    unread && !c.muted && "bg-primary/[0.07] hover:bg-primary/[0.12]",
                    selected === c.id && "bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary")}>
                  <PersonAvatar name={c.other_name} url={c.avatarUrl} size="md" group={c.isGroup} online={c.isGroup ? undefined : online(c.other_id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("flex min-w-0 items-center gap-1.5 text-sm", unread ? "font-bold text-foreground" : "font-medium text-foreground/90")}>
                        <span className="truncate">{c.other_name}</span>
                        {!c.isGroup && c.badge && c.badge.tier !== "member" && <BadgePill badge={c.badge} />}
                        {c.isGroup && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">· {c.memberCount}</span>}
                        {c.muted ? <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="muted" /> : null}
                        {c.blocked ? <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="blocked" /> : null}
                      </span>
                      <time dateTime={c.last_message_at ?? undefined} className={cn("shrink-0 text-[11px]", unread && !c.muted ? "font-semibold text-primary" : "text-muted-foreground")}>{short(c.last_message_at)}</time>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("block min-w-0 flex-1 truncate text-xs", isTyping ? "italic text-primary" : unread ? "font-semibold text-foreground" : "text-muted-foreground", c.last_kind === "SYSTEM" && !isTyping && "italic")}>
                        {preview}
                      </span>
                      {unread ? (
                        waiting > 0 ? (
                          <span className={cn("inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums", c.muted ? "bg-muted-foreground/25 text-foreground" : "bg-primary text-primary-foreground")} aria-hidden>
                            {waiting > 99 ? "99+" : waiting}
                          </span>
                        ) : <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", c.muted ? "bg-muted-foreground/50" : "bg-primary")} aria-hidden />
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
