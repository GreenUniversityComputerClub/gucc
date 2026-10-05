"use client";

import { BadgePill } from "@/components/chat/badge-pill";
import type { Badge } from "@/lib/server/person-badge";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Flag, MessageCircle, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { firstLink, LinkPreviewCard } from "@/components/chat/link-preview";
import { groupReactions, REACTIONS, type ReactionKey } from "@/lib/chat/reactions";
import { dhakaDateTime, dhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Thread } from "./actions";
import { RichText } from "./rich-text";
import { MentionList } from "./mention-list";
import { useMentions, type MentionCandidate } from "./use-mentions";
import type { Mention } from "@/lib/chat/mentions";
import { ReactionBar } from "./reaction-bar";
import { MessageSheet, type SheetAction } from "./message-sheet";

export type Message = Thread["messages"][number];

const LONG_PRESS_MS = 380;
const MAX = 2000;
/** How far a message is dragged to the right (on touch screens) to reply to it. */
const SWIPE_REPLY_PX = 56;
const SWIPE_MAX_PX = 84;

const hoverButton = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 data-[state=open]:opacity-100";

/**
 * One message: the bubble (with what it replies to), a preview card for its first link, its
 * reactions under it, and its actions: hover or focus shows React and a menu on computers; on
 * phones a long press opens the reactions and a swipe to the right replies; a double tap or double
 * click gives a ❤️. System lines ("Rafi added Nusrat") are centred.
 */
export const MessageRow = memo(function MessageRow({
  m, me, joinsPrev, endsGroup, showSender, avatar, profileHref, names, senderInfo, canAct, reacting, editing, highlight, mentionCandidates,
  onReacting, onReact, onReply, onEdit, onEditChange, onEditSave, onEditCancel, onDelete, onReport, onCopy, onJump, onShowReactions, onMessagePrivately,
}: {
  m: Message;
  me: string;
  joinsPrev: boolean;
  endsGroup: boolean;
  /** Group conversations: the sender's name above the first message of a run. */
  showSender: boolean;
  avatar: { name: string; url: string | null } | null;
  /** The sender's profile page (not for my own messages, or people without a profile). */
  profileHref?: string | null;
  names: (id: string) => string;
  /** Group conversations: the sender's club badge (short position and year) and group role, next to their name. */
  senderInfo?: { badge: Badge | null; role: "OWNER" | "ADMIN" | "MEMBER" | null } | null;
  canAct: boolean;
  reacting: boolean;
  editing: string | null;
  highlight: boolean;
  /** Who can be @mentioned while editing. */
  mentionCandidates?: MentionCandidate[];
  onReacting: (id: string | null) => void;
  onReact: (m: Message, e: ReactionKey | null) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onEditChange: (v: string, mentions: Mention[]) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (m: Message) => void;
  onReport: (m: Message) => void;
  onCopy: (text: string) => void;
  onJump: (id: string) => void;
  /** Open the list of who reacted. */
  onShowReactions: (m: Message) => void;
  /** Groups: write to the sender on their own. */
  onMessagePrivately?: (m: Message) => void;
}) {
  const router = useRouter();
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burst, setBurst] = useState<ReactionKey | null>(null);
  // Swipe to reply (touch): where the finger started, and whether this gesture is a sideways drag.
  const swipe = useRef<{ x: number; y: number; id: number; drag: boolean | null; armed: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  // Phones: the long-press sheet (reactions and every action).
  const [sheet, setSheet] = useState(false);

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
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const endSwipe = (reply: boolean) => {
    const s = swipe.current;
    swipe.current = null;
    if (reply && s?.drag && s.armed) onReply(m);
    setDx(0);
  };
  const grouped = groupReactions(m.reactions);
  const who = (users: string[]) => users.map((u) => (u === me ? "You" : names(u))).join(", ");
  const interactive = canAct && !m.deleted && editing !== m.id;
  const link = m.deleted ? null : firstLink(m.body);

  return (
    <div id={`msg-${m.id}`} className={cn("group relative flex items-end gap-2", m.mine ? "justify-end" : "justify-start", joinsPrev ? "mt-0.5" : "mt-3",
      highlight && "motion-safe:animate-pulse")}>
      {!m.mine && <span className="w-8 shrink-0">{endsGroup && avatar && <PersonAvatar name={avatar.name} url={avatar.url} size="sm" href={profileHref ?? null} />}</span>}
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", m.mine ? "items-end" : "items-start")}>
        {showSender && !m.mine && m.sender && (
          <p className="mb-0.5 ml-3 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            {profileHref
              ? <Link prefetch={false} href={profileHref} className="truncate hover:text-foreground hover:underline">{m.sender.name}</Link>
              : <span className="truncate">{m.sender.name}</span>}
            {senderInfo?.role === "OWNER" && <span className="shrink-0 text-amber-600 dark:text-amber-400">Owner</span>}
            {senderInfo?.role === "ADMIN" && <span className="shrink-0 text-primary">Admin</span>}
            {senderInfo?.badge && senderInfo.badge.tier !== "member" && <BadgePill badge={senderInfo.badge} />}
          </p>
        )}
        <div className={cn("flex items-center gap-1", m.mine && "flex-row-reverse")}>
          <div className="relative min-w-0">
            {dx > 0 && (
              <span aria-hidden className={cn("absolute -left-9 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform", dx >= SWIPE_REPLY_PX && "scale-110 bg-primary text-primary-foreground")}
                style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX) }}>
                <Reply className="h-4 w-4" />
              </span>
            )}
            {reacting && interactive && <ReactionBar mine={mineReaction} align={m.mine ? "end" : "start"} onClose={() => onReacting(null)} onPick={(e) => { onReacting(null); toggle(e); }} />}
            <div
              tabIndex={interactive ? 0 : -1}
              aria-label={interactive ? `${m.mine ? "Your message" : `Message from ${m.sender?.name ?? "them"}`}. Press R to react.` : undefined}
              onKeyDown={(e) => { if (interactive && (e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onReacting(m.id); } }}
              onDoubleClick={() => interactive && toggle("love")}
              onPointerDown={(e) => {
                if (!interactive || e.pointerType === "mouse") return;
                swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: null, armed: false };
                press.current = setTimeout(() => {
                  press.current = null;
                  swipe.current = null;
                  navigator.vibrate?.(12);
                  setSheet(true);
                }, LONG_PRESS_MS);
              }}
              onPointerMove={(e) => {
                const s = swipe.current;
                if (!s || e.pointerId !== s.id) return;
                const mx = e.clientX - s.x;
                const my = e.clientY - s.y;
                if (s.drag === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
                  cancelPress();
                  s.drag = mx > 0 && Math.abs(mx) > Math.abs(my) * 1.3;
                  if (s.drag) e.currentTarget.setPointerCapture?.(e.pointerId);
                }
                if (!s.drag) return;
                const d = Math.max(0, Math.min(SWIPE_MAX_PX, mx));
                if (d >= SWIPE_REPLY_PX && !s.armed) navigator.vibrate?.(8);
                s.armed = d >= SWIPE_REPLY_PX;
                setDx(d);
              }}
              onPointerUp={() => { cancelPress(); endSwipe(true); }}
              onPointerLeave={() => { if (!swipe.current?.drag) cancelPress(); }}
              onPointerCancel={() => { cancelPress(); endSwipe(false); }}
              onContextMenu={(e) => { if (interactive && e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== "mouse") e.preventDefault(); }}
              style={dx ? { transform: `translateX(${dx}px)` } : undefined}
              className={cn("relative min-w-0 touch-pan-y select-text rounded-2xl px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none]",
                dx ? "transition-none" : "transition-[transform,box-shadow] duration-200",
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
                <p className="whitespace-pre-wrap wrap-anywhere"><RichText text={m.body ?? ""} mentions={m.mentions} me={me} mine={m.mine} /></p>
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
            // Computers: hover or focus shows these. Phones use the long-press sheet instead (the
            // buttons stay for screen readers), so messages get the full width.
            <div className={cn("flex items-center [@media(hover:none)]:sr-only", m.mine && "flex-row-reverse")}>
              <button type="button" aria-label="React" className={hoverButton} onClick={() => onReacting(reacting ? null : m.id)}><SmilePlus className="h-4 w-4" /></button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Message options" className={hoverButton}><MoreHorizontal className="h-4 w-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={m.mine ? "end" : "start"} className="w-48">
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onReply(m)}><Reply className="h-4 w-4" />Reply</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => window.setTimeout(() => onReacting(m.id), 0)}><SmilePlus className="h-4 w-4" />React</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onCopy(m.body ?? "")}><Copy className="h-4 w-4" />Copy text</DropdownMenuItem>
                  {!m.mine && profileHref && (
                    <DropdownMenuItem asChild className="min-h-11 gap-2"><Link prefetch={false} href={profileHref}><UserRound className="h-4 w-4" />View profile</Link></DropdownMenuItem>
                  )}
                  {onMessagePrivately && !m.mine && m.sender && (
                    <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onMessagePrivately(m)}><MessageCircle className="h-4 w-4" />Message {m.sender.name.split(" ")[0]} privately</DropdownMenuItem>
                  )}
                  {m.editable && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => onEdit(m)}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>}
                  {(m.mine || (!m.mine && !m.reported)) && <DropdownMenuSeparator />}
                  {m.mine && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => onDelete(m)}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>}
                  {!m.mine && !m.reported && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => onReport(m)}><Flag className="h-4 w-4" />Report</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {link && editing !== m.id && <LinkPreviewCard url={link} mine={m.mine} />}
        {interactive && sheet && (
          <MessageSheet open={sheet} onOpenChange={setSheet} preview={m.body ?? ""} at={m.at} mine={mineReaction} onReact={toggle}
            actions={([
              { key: "reply", label: "Reply", icon: Reply, run: () => onReply(m) },
              { key: "copy", label: "Copy text", icon: Copy, run: () => onCopy(m.body ?? "") },
              m.editable ? { key: "edit", label: "Edit", icon: Pencil, run: () => onEdit(m) } : null,
              !m.mine && profileHref ? { key: "profile", label: `View ${(m.sender?.name ?? avatar?.name ?? "their").split(" ")[0]}'s profile`, icon: UserRound, run: () => router.push(profileHref) } : null,
              onMessagePrivately && !m.mine && m.sender ? { key: "dm", label: `Message ${m.sender.name.split(" ")[0]} privately`, icon: MessageCircle, run: () => onMessagePrivately(m) } : null,
              grouped.length ? { key: "who", label: "See who reacted", icon: SmilePlus, run: () => onShowReactions(m) } : null,
              !m.mine && !m.reported ? { key: "report", label: "Report", icon: Flag, danger: true, run: () => onReport(m) } : null,
              m.mine ? { key: "delete", label: "Delete", icon: Trash2, danger: true, run: () => onDelete(m) } : null,
            ] as Array<SheetAction | null>).filter((a): a is SheetAction => a !== null)} />
        )}
        {editing === m.id && <EditBox initial={m.body ?? ""} initialMentions={m.mentions ?? []} candidates={mentionCandidates ?? []} onChange={onEditChange} onSave={onEditSave} onCancel={onEditCancel} />}
        {grouped.length > 0 && (
          // One pill: the most used reactions and how many; tapping it shows who reacted.
          <div className={cn("-mt-1.5 flex", m.mine ? "mr-2 justify-end" : "ml-2")}>
            <button type="button" onClick={() => onShowReactions(m)}
              title={grouped.map((g) => `${REACTIONS[g.e].label}: ${who(g.users)}`).join("\n")}
              aria-label={`Reactions: ${grouped.map((g) => `${REACTIONS[g.e].label} ${g.count}`).join(", ")}. See who reacted`}
              className={cn("relative z-10 inline-flex h-6 items-center gap-0.5 rounded-full border bg-background pl-1 pr-1.5 text-xs shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-in motion-safe:zoom-in-50",
                grouped.some((g) => g.users.includes(me)) && "border-primary/50 bg-primary/10")}>
              <span aria-hidden className="flex text-sm leading-none">{grouped.slice(0, 3).map((g) => <span key={g.e}>{REACTIONS[g.e].emoji}</span>)}</span>
              {m.reactions.length > 1 && <span className="ml-0.5 tabular-nums text-muted-foreground">{m.reactions.length}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function EditBox({ initial, initialMentions, candidates, onChange, onSave, onCancel }: {
  initial: string;
  initialMentions: Mention[];
  candidates: MentionCandidate[];
  onChange: (v: string, mentions: Mention[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const set = (text: string) => setV(text);
  const mention = useMentions({ value: v, setValue: set, input: box, candidates, initial: initialMentions });
  // The parent saves what's typed here, with who it mentions.
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => latest.current(v, mention.mentions), [v, mention.mentions]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="relative mt-1 w-full min-w-64 space-y-1 rounded-2xl border bg-background p-2 shadow-sm">
      <MentionList id={mention.listId} matches={mention.matches} active={mention.active} onHover={mention.setActive} onChoose={mention.choose} />
      <label className="sr-only" htmlFor="edit-message">Edit message</label>
      <Textarea ref={box} id="edit-message" value={v} maxLength={MAX} rows={2} autoFocus className="text-base md:text-sm" {...mention.inputProps}
        onChange={(e) => { setV(e.target.value); mention.track(e.target.value, e.target.selectionStart); }}
        onSelect={(e) => mention.track(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (mention.onKeyDown(e)) return;
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSave(); }
        }} />
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!v.trim()}>Save</Button>
      </div>
    </form>
  );
}
