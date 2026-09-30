"use client";

import { BadgePill } from "@/components/chat/badge-pill";
import type { Badge } from "@/lib/server/person-badge";

import { memo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Flag, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { groupReactions, REACTIONS, type ReactionKey } from "@/lib/chat/reactions";
import { dhakaDateTime, dhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Thread } from "./actions";
import { Linkified } from "./linkify";
import { ReactionBar } from "./reaction-bar";

export type Message = Thread["messages"][number];

const LONG_PRESS_MS = 380;
const MAX = 2000;

const hoverButton = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 data-[state=open]:opacity-100";

/**
 * One message: the bubble (with what it replies to), its reactions under it, and its actions:
 * hover or focus shows React and a menu on computers; a long press opens the reactions on phones;
 * a double tap or double click gives a ❤️. System lines ("Rafi added Nusrat") are centred.
 */
export const MessageRow = memo(function MessageRow({
  m, me, joinsPrev, endsGroup, showSender, avatar, names, senderInfo, canAct, reacting, editing, highlight,
  onReacting, onReact, onReply, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onReport, onCopy, onJump,
}: {
  m: Message;
  me: string;
  joinsPrev: boolean;
  endsGroup: boolean;
  /** Group conversations: the sender's name above the first message of a run. */
  showSender: boolean;
  avatar: { name: string; url: string | null } | null;
  names: (id: string) => string;
  /** Group conversations: the sender's club badge (short position and year) and group role, next to their name. */
  senderInfo?: { badge: Badge | null; role: "OWNER" | "ADMIN" | "MEMBER" | null } | null;
  canAct: boolean;
  reacting: boolean;
  editing: string | null;
  highlight: boolean;
  onReacting: (id: string | null) => void;
  onReact: (m: Message, e: ReactionKey | null) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (m: Message) => void;
  onReport: (m: Message) => void;
  onCopy: (text: string) => void;
  onJump: (id: string) => void;
}) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burst, setBurst] = useState<ReactionKey | null>(null);

  if (m.kind === "SYSTEM") {
    return (
      <div className="my-3 flex justify-center px-6" role="note">
        <p className="max-w-md rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          {m.body} <time dateTime={m.at} className="opacity-70" title={dhakaDateTime(m.at)}>· {dhakaTime(m.at)}</time>
        </p>
      </div>
    );
  }

  const mineReaction = m.reactions.find((r) => r.u === me)?.e ?? null;
  const react = (e: ReactionKey | null) => {
    if (e) {
      setBurst(e);
      window.setTimeout(() => setBurst(null), 600);
    }
    onReact(m, e);
  };
  const toggle = (e: ReactionKey) => react(mineReaction === e ? null : e);
  const grouped = groupReactions(m.reactions);
  const who = (users: string[]) => users.map((u) => (u === me ? "You" : names(u))).join(", ");
  const interactive = canAct && !m.deleted && editing !== m.id;

  return (
    <div id={`msg-${m.id}`} className={cn("group relative flex items-end gap-2", m.mine ? "justify-end" : "justify-start", joinsPrev ? "mt-0.5" : "mt-3",
      highlight && "motion-safe:animate-pulse")}>
      {!m.mine && <span className="w-8 shrink-0">{endsGroup && avatar && <PersonAvatar name={avatar.name} url={avatar.url} size="sm" />}</span>}
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", m.mine ? "items-end" : "items-start")}>
        {showSender && !m.mine && m.sender && (
          <p className="mb-0.5 ml-3 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">{m.sender.name}</span>
            {senderInfo?.role === "OWNER" && <span className="shrink-0 text-amber-600 dark:text-amber-400">Owner</span>}
            {senderInfo?.role === "ADMIN" && <span className="shrink-0 text-primary">Admin</span>}
            {senderInfo?.badge && senderInfo.badge.tier !== "member" && <BadgePill badge={senderInfo.badge} />}
          </p>
        )}
        <div className={cn("flex items-center gap-1", m.mine && "flex-row-reverse")}>
          <div className="relative min-w-0">
            {reacting && interactive && <ReactionBar mine={mineReaction} align={m.mine ? "end" : "start"} onClose={() => onReacting(null)} onPick={(e) => { onReacting(null); toggle(e); }} />}
            <div
              tabIndex={interactive ? 0 : -1}
              aria-label={interactive ? `${m.mine ? "Your message" : `Message from ${m.sender?.name ?? "them"}`}. Press R to react.` : undefined}
              onKeyDown={(e) => { if (interactive && (e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onReacting(m.id); } }}
              onDoubleClick={() => interactive && toggle("love")}
              onPointerDown={(e) => {
                if (!interactive || e.pointerType === "mouse") return;
                press.current = setTimeout(() => {
                  navigator.vibrate?.(12);
                  onReacting(m.id);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={() => press.current && clearTimeout(press.current)}
              onPointerLeave={() => press.current && clearTimeout(press.current)}
              onPointerCancel={() => press.current && clearTimeout(press.current)}
              onContextMenu={(e) => { if (interactive && e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== "mouse") e.preventDefault(); }}
              className={cn("relative min-w-0 select-text rounded-2xl px-3 py-2 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none]",
                m.mine ? "bg-primary text-primary-foreground" : "bg-muted", m.mine ? (endsGroup ? "rounded-br-md" : "") : (endsGroup ? "rounded-bl-md" : ""))}>
              {m.replyTo && (
                <button type="button" onClick={() => onJump(m.replyTo!.id)}
                  className={cn("mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs", m.mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary/60 bg-background/60")}>
                  <span className="block font-semibold">{m.replyTo.name}</span>
                  <span className="line-clamp-2 opacity-80">{m.replyTo.body || "Message deleted"}</span>
                </button>
              )}
              {m.context && <p className={cn("mb-1 text-xs", m.mine ? "text-primary-foreground/80" : "text-muted-foreground")}>About: <Link href={m.context.href} className="underline">{m.context.title}</Link></p>}
              {editing === m.id ? null : m.deleted ? (
                <p className="italic opacity-70">Message deleted</p>
              ) : (
                <p className="whitespace-pre-wrap wrap-anywhere"><Linkified text={m.body ?? ""} className={cn("underline underline-offset-2", m.mine && "text-primary-foreground")} /></p>
              )}
              {endsGroup && editing !== m.id && (
                <p className={cn("mt-1 text-[11px]", m.mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                  <time dateTime={m.at} title={dhakaDateTime(m.at)}>{dhakaTime(m.at)}</time>
                  {m.edited && !m.deleted ? " · edited" : ""}
                  {m.reported ? " · you reported this" : ""}
                </p>
              )}
              {burst && (
                <span aria-hidden className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-2xl motion-safe:animate-out motion-safe:fade-out motion-safe:slide-out-to-top-6 motion-safe:zoom-out-150 motion-safe:duration-500">
                  {REACTIONS[burst].emoji}
                </span>
              )}
            </div>
          </div>
          {interactive && (
            <div className={cn("flex items-center", m.mine && "flex-row-reverse")}>
              <button type="button" aria-label="React" className={hoverButton} onClick={() => onReacting(reacting ? null : m.id)}><SmilePlus className="h-4 w-4" /></button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Message options" className={hoverButton}><MoreHorizontal className="h-4 w-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={m.mine ? "end" : "start"} className="w-48">
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onReply(m)}><Reply className="h-4 w-4" />Reply</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => window.setTimeout(() => onReacting(m.id), 0)}><SmilePlus className="h-4 w-4" />React</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onCopy(m.body ?? "")}><Copy className="h-4 w-4" />Copy text</DropdownMenuItem>
                  {m.editable && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onEdit(m)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>}
                  {(m.mine || (!m.mine && !m.reported)) && <DropdownMenuSeparator />}
                  {m.mine && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => onDelete(m)}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>}
                  {!m.mine && !m.reported && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => onReport(m)}><Flag className="h-4 w-4" />Report</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {editing === m.id && <EditBox initial={m.body ?? ""} onChange={onEditChange} onSave={onEditSave} onCancel={onEditCancel} />}
        {grouped.length > 0 && (
          <div className={cn("-mt-1.5 flex flex-wrap gap-1", m.mine ? "mr-2 justify-end" : "ml-2")}>
            {grouped.map((g) => {
              const mine = g.users.includes(me);
              return (
                <button key={g.e} type="button" disabled={!interactive} onClick={() => toggle(g.e)} title={`${REACTIONS[g.e].label}: ${who(g.users)}`}
                  aria-label={`${REACTIONS[g.e].label} by ${who(g.users)}${interactive ? (mine ? ". Remove yours" : ". Add yours") : ""}`} aria-pressed={mine}
                  className={cn("relative z-10 inline-flex h-6 items-center gap-1 rounded-full border bg-background px-1.5 text-xs shadow-sm transition-transform hover:scale-110 disabled:hover:scale-100 motion-safe:animate-in motion-safe:zoom-in-50",
                    mine && "border-primary/50 bg-primary/10")}>
                  <span aria-hidden className="text-sm leading-none">{REACTIONS[g.e].emoji}</span>
                  {g.count > 1 && <span className="tabular-nums text-muted-foreground">{g.count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function EditBox({ initial, onChange, onSave, onCancel }: { initial: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="mt-1 w-full min-w-64 space-y-1 rounded-2xl border bg-background p-2 shadow-sm">
      <label className="sr-only" htmlFor="edit-message">Edit message</label>
      <Textarea id="edit-message" value={v} maxLength={MAX} rows={2} autoFocus className="text-base md:text-sm"
        onChange={(e) => { setV(e.target.value); onChange(e.target.value); }}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSave(); } }} />
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!v.trim()}>Save</Button>
      </div>
    </form>
  );
}
