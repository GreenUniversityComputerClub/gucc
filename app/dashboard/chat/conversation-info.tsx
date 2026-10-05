"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Archive, ArchiveRestore, Ban, Bell, BellOff, Flag, Loader2, Search, UserRound, X } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { ActiveStatus } from "@/components/chat/active-status";
import type { Badge } from "@/lib/server/person-badge";
import { dhakaDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { searchChatAction, type SearchHit } from "./actions";

const panel = "fixed inset-0 z-[70] flex flex-col bg-background shadow-2xl focus:outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[24rem] lg:border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right";
const row = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/** Words highlighted in a search result (plain text, no HTML). */
function Highlighted({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0 || !q) return <>{text}</>;
  const from = Math.max(0, at - 60);
  return <>{from > 0 ? "…" : ""}{text.slice(from, at)}<mark className="rounded bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

/**
 * Search in one conversation, as Messenger does: type at least two letters, results newest first;
 * choosing one scrolls the conversation to that message.
 */
export function ChatSearch({ conversationId, onPick, autoFocus = true }: { conversationId: string; onPick: (hit: SearchHit) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const r = await searchChatAction(conversationId, term).catch(() => null);
      if (mine !== seq.current) return;
      setBusy(false);
      if (!r?.ok) setError(r?.error ?? "Search didn't work. Try again.");
      else {
        setError(null);
        setHits(r.data);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, conversationId]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="relative mx-4 mb-2 block">
        <span className="sr-only">Search in this conversation</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} type="search" enterKeyHint="search" placeholder="Search in conversation"
          className="h-11 w-full rounded-full border bg-muted/50 pl-9 pr-9 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-live="polite">
        {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
        {hits && hits.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No messages match “{q.trim()}”.</p>}
        {hits && hits.length > 0 && (
          <ul className="space-y-0.5">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => onPick(h)} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                  <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{h.mine ? "You" : h.sender}</span>
                    <time dateTime={h.at} className="shrink-0">{dhakaDateTime(h.at)}</time>
                  </span>
                  <span className="mt-0.5 line-clamp-2 break-words text-sm"><Highlighted text={h.body} q={q.trim()} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!hits && !error && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type a word or two to find a message.</p>}
      </div>
    </div>
  );
}

/** A sheet (phones) or side panel (computers) with only the search, for group conversations. */
export function SearchSheet({ open, onOpenChange, conversationId, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; conversationId: string; onPick: (hit: SearchHit) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 lg:bg-black/20" />
        <DialogPrimitive.Content className={panel} aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="text-base font-semibold">Search in conversation</DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>
          <ChatSearch conversationId={conversationId} onPick={(h) => { onOpenChange(false); onPick(h); }} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface InfoPerson {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  badge: Badge;
  active: boolean;
  blocked: boolean;
}

/**
 * Messenger's "Chat info" for a direct conversation: who it is (photo, name, club badge, active
 * status), their profile, mute, search, archive, and privacy (block, report).
 */
export function ConversationInfo({ open, onOpenChange, conversationId, person, presence, muted, archived, canReport, onMute, onArchive, onBlock, onReport, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversationId: string;
  person: InfoPerson;
  presence: string | null;
  muted: boolean;
  archived: boolean;
  canReport: boolean;
  onMute: () => void;
  onArchive: () => void;
  onBlock: () => void;
  onReport: () => void;
  onPick: (hit: SearchHit) => void;
}) {
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!open) setSearching(false);
  }, [open]);
  const profile = person.handle ? `/members/${encodeURIComponent(person.handle)}` : null;
  const close = () => onOpenChange(false);
  const action = (fn: () => void) => () => { close(); window.setTimeout(fn, 120); };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 lg:bg-black/20" />
        <DialogPrimitive.Content className={panel} aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="text-base font-semibold">{searching ? "Search in conversation" : "Chat info"}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>
          {searching ? (
            <ChatSearch conversationId={conversationId} onPick={(h) => { close(); onPick(h); }} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-col items-center px-2 pb-4 pt-2 text-center">
                <PersonAvatar name={person.name} url={person.avatarUrl} size="xl" href={profile} />
                <p className="mt-3 text-lg font-semibold">{person.name}</p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                  <BadgePill badge={person.badge} />
                  {presence && <ActiveStatus label={presence} />}
                  {!person.active && <span>This account isn&apos;t active.</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 px-1 pb-4">
                {profile ? (
                  <Link prefetch={false} href={profile} onClick={close} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted/60 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <UserRound className="h-5 w-5" aria-hidden />Profile
                  </Link>
                ) : (
                  <span className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted/30 text-xs text-muted-foreground"><UserRound className="h-5 w-5" aria-hidden />No profile</span>
                )}
                <button type="button" onClick={action(onMute)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted/60 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {muted ? <Bell className="h-5 w-5" aria-hidden /> : <BellOff className="h-5 w-5" aria-hidden />}{muted ? "Unmute" : "Mute"}
                </button>
                <button type="button" onClick={() => setSearching(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted/60 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Search className="h-5 w-5" aria-hidden />Search
                </button>
              </div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversation</p>
              <button type="button" className={row} onClick={action(onArchive)}>
                {archived ? <ArchiveRestore className="h-5 w-5 shrink-0" aria-hidden /> : <Archive className="h-5 w-5 shrink-0" aria-hidden />}
                {archived ? "Move back to inbox" : "Archive conversation"}
              </button>
              <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Privacy and support</p>
              {canReport && (
                <button type="button" className={row} onClick={action(onReport)}>
                  <Flag className="h-5 w-5 shrink-0" aria-hidden />Report their latest message
                </button>
              )}
              <button type="button" className={cn(row, !person.blocked && "text-destructive")} onClick={action(onBlock)}>
                <Ban className="h-5 w-5 shrink-0" aria-hidden />{person.blocked ? `Unblock ${person.name}` : `Block ${person.name}`}
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
