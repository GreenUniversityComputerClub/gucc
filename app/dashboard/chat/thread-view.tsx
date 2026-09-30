"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Archive, ArchiveRestore, Ban, Bell, BellOff, Check, CheckCheck, Flag, Info, Loader2, MoreVertical, RotateCw, Send, Smile, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { sendLive, setLiveRoom, useLive, useLiveStatus } from "@/lib/api/live-client";
import { activeLabel, usePresence, useWatch } from "@/lib/api/presence";
import type { ReactionKey } from "@/lib/chat/reactions";
import { dayLabel, dhakaDateTime, dhakaDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { blockAction, chatStateAction, deleteChatAction, editChatAction, loadThreadAction, markReadAction, pulseAction, reactAction, sendChatAction, type Thread } from "./actions";
import { MessageRow, type Message } from "./message-row";
import { ReportDialog } from "./report-dialog";
import { GroupSettings } from "./group-settings";

type Pending = { clientId: string; body: string; at: string; failed?: string; replyTo: Message["replyTo"] };

/** Messages by id, oldest first (a message present in both keeps the newer copy). */
const merge = (a: Message[], b: Message[]) => [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort((x, y) => x.at.localeCompare(y.at));

/** Consecutive messages from one person within five minutes read as one group. */
const GROUP_MS = 5 * 60_000;
const MAX = 2000;
const QUIET_MS = 60_000;
const ACTIVE_MS = 8000;
const TYPING_SEND_MS = 3000;
const TYPING_SHOW_MS = 6000;
const QUICK_EMOJI = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😅", "😢", "😡", "👍", "🙏", "👏", "🎉", "🔥", "❤️", "✅"];
const newClientId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
const draftKey = (id: string) => `gucc-chat-draft:${id}`;
const readDraft = (id: string) => { try { return sessionStorage.getItem(draftKey(id)) ?? ""; } catch { return ""; } };
const writeDraft = (id: string, v: string) => { try { if (v) sessionStorage.setItem(draftKey(id), v); else sessionStorage.removeItem(draftKey(id)); } catch { /* private mode */ } };

const iconButton = "inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * One conversation, direct or group. With a live connection, new messages, edits, reactions,
 * "typing…", read receipts and active status arrive the moment they happen and cost no requests;
 * without one, a cheap "anything new?" check runs while the tab is visible (every 8 seconds after
 * activity, slowing to a minute when quiet). Sending shows the message at once and stores it
 * exactly once, even after a double Enter or a dropped connection.
 */
export function ThreadView({ conversationId, initial, canSend, restrictedUntil }: { conversationId: string; initial: Thread; canSend: boolean; restrictedUntil?: string | null }) {
  const [t, setT] = useState<Thread>(initial);
  const [older, setOlder] = useState<Message[]>([]);
  const [moreOlder, setMoreOlder] = useState(initial.more);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reacting, setReacting] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [reporting, setReporting] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [delivered, setDelivered] = useState<Set<string>>(() => new Set());
  const [confirm, confirmDialog] = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const delay = useRef(ACTIVE_MS);
  const sig = useRef(initial.sig);
  const latest = useRef(t);
  latest.current = t;
  const lastTyping = useRef(0);
  // Where "New messages" starts: fixed for this visit.
  const readUpTo = useRef(initial.readUpTo);
  const status = useLiveStatus();
  const online = usePresence();
  const me = t.me;
  const other = t.person;
  const group = t.group;
  useWatch(t.watch);

  // Typing goes only to the people in this conversation.
  useEffect(() => {
    setLiveRoom(t.room ?? null);
    return () => setLiveRoom(null);
  }, [t.room]);

  // The draft survives a reload or a sign-in redirect.
  useEffect(() => setBody(readDraft(conversationId)), [conversationId]);
  useEffect(() => writeDraft(conversationId, body), [conversationId, body]);

  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((cur) => (cur?.text === text ? null : cur)), error ? 7000 : 4000);
  }, []);

  const toLogin = useCallback(() => {
    window.location.assign(`/auth/login?next=${encodeURIComponent(`/dashboard/chat/${conversationId}`)}`);
  }, [conversationId]);

  /** Fetch the newest page; keep what scrolled out of it. */
  const refresh = useCallback(async () => {
    const r = await loadThreadAction(conversationId);
    if (!r.ok) {
      if (r.code === "AUTH_REQUIRED") toLogin();
      if (r.code === "NOT_FOUND") window.location.assign("/dashboard/chat");
      throw new Error(r.error);
    }
    const prev = latest.current;
    const first = r.data.messages[0]?.at ?? "";
    const pushedOut = prev.messages.filter((m) => m.at < first && !r.data.messages.some((n) => n.id === m.id));
    if (pushedOut.length) setOlder((o) => merge(o, pushedOut));
    const fresh = r.data.messages.filter((m) => !prev.messages.some((p) => p.id === m.id) && !m.mine).length;
    if (fresh && !nearBottom.current) setNewBelow((n) => n + fresh);
    sig.current = r.data.sig;
    setT(r.data);
    return fresh > 0;
  }, [conversationId, toLogin]);

  /** Read what arrived live, once the person can see it (debounced; one small write). */
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.hidden || !nearBottom.current) return;
      markReadAction(conversationId).catch(() => undefined);
    }, 900);
  }, [conversationId]);
  useEffect(() => () => clearTimeout(readTimer.current), []);

  const patch = useCallback((id: string, fn: (m: Message) => Message) => {
    setT((cur) => (cur.messages.some((m) => m.id === id) ? { ...cur, messages: cur.messages.map((m) => (m.id === id ? fn(m) : m)) } : cur));
    setOlder((o) => (o.some((m) => m.id === id) ? o.map((m) => (m.id === id ? fn(m) : m)) : o));
  }, []);

  // ── Live events for this conversation ──
  useLive("msg", (ev) => {
    if (ev.c !== conversationId) return;
    const lm = ev.m as { id: string; sender: string; senderName: string; body: string; at: string; kind: "TEXT" | "SYSTEM"; replyTo: Message["replyTo"]; clientId?: string | null };
    const mine = lm.sender === me;
    if (mine && lm.clientId) setPending((l) => l.filter((p) => p.clientId !== lm.clientId));
    const avatar = group?.members.find((x) => x.id === lm.sender)?.avatarUrl ?? (lm.sender === other?.id ? other.avatarUrl : null);
    const msg: Message = {
      id: lm.id, mine, kind: lm.kind, sender: group ? { id: lm.sender, name: lm.senderName, avatarUrl: avatar } : null, body: lm.body, deleted: false, edited: false, at: lm.at,
      editable: mine && lm.kind === "TEXT", reported: false, reactions: [], replyTo: lm.replyTo, context: null,
    };
    // A tab that just opened may get a message again (the hub replays what it missed): once only.
    const known = latest.current.messages.some((m) => m.id === msg.id);
    setT((cur) => (cur.messages.some((m) => m.id === msg.id) ? cur : { ...cur, messages: merge(cur.messages, [msg]).slice(-200) }));
    setTyping((ty) => (ty[lm.sender] ? { ...ty, [lm.sender]: 0 } : ty));
    if (!mine && !known) {
      if (nearBottom.current && !document.hidden) markRead();
      else setNewBelow((n) => n + 1);
    }
  });
  useLive("edit", (ev) => ev.c === conversationId && patch(ev.id, (m) => ({ ...m, body: ev.body, edited: true })));
  useLive("del", (ev) => ev.c === conversationId && patch(ev.id, (m) => ({ ...m, body: null, deleted: true, reactions: [] })));
  useLive("react", (ev) => {
    if (ev.c !== conversationId) return;
    patch(ev.id, (m) => ({ ...m, reactions: [...m.reactions.filter((r) => r.u !== ev.u), ...(ev.e ? [{ u: ev.u as string, e: ev.e as ReactionKey }] : [])] }));
  });
  useLive("read", (ev) => {
    if (ev.c !== conversationId || ev.u === me) return;
    setT((cur) => (cur.group
      ? { ...cur, group: { ...cur.group, members: cur.group.members.map((x) => (x.id === ev.u && ev.at > (x.lastReadAt ?? "") ? { ...x, lastReadAt: ev.at } : x)) } }
      : ev.at > (cur.seenAt ?? "") ? { ...cur, seenAt: ev.at } : cur));
  });
  useLive("dlv", (ev) => ev.c === conversationId && setDelivered((d) => new Set(d).add(ev.id)));
  useLive("typing", (ev) => {
    if (ev.c !== conversationId || ev.u === me) return;
    setTyping((ty) => ({ ...ty, [ev.u]: Date.now() + TYPING_SHOW_MS }));
    window.setTimeout(() => setTyping((ty) => ({ ...ty })), TYPING_SHOW_MS + 50);
  });
  useLive("conv", (ev) => ev.c === conversationId && void refresh().catch(() => undefined));
  useLive("resync", () => void refresh().catch(() => undefined));

  // Without a live connection: the "anything new?" loop. A failure keeps it going with a hint.
  useEffect(() => {
    if (status === "live") {
      setOffline(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        if (!document.hidden) {
          const p = await pulseAction(conversationId);
          if (!p.ok) {
            if (p.code === "AUTH_REQUIRED") return toLogin();
            throw new Error(p.error);
          }
          if (p.data.sig !== sig.current) {
            const grew = await refresh();
            delay.current = grew ? ACTIVE_MS : Math.min(QUIET_MS, delay.current * 2);
          } else {
            delay.current = Math.min(QUIET_MS, delay.current * 2);
          }
          setOffline(false);
        }
      } catch {
        setOffline(true);
        delay.current = Math.min(QUIET_MS, delay.current * 2);
      } finally {
        if (!cancelled) timer = setTimeout(tick, delay.current);
      }
    };
    timer = setTimeout(tick, status === "connecting" ? 3000 : delay.current);
    const onVisible = () => {
      if (!document.hidden && !cancelled) {
        delay.current = ACTIVE_MS;
        clearTimeout(timer);
        timer = setTimeout(tick, 200);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [conversationId, refresh, toLogin, status]);

  // Coming back to a tab with messages that arrived while it was hidden: read them.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && nearBottom.current) markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  const messages = useMemo(() => merge(older, t.messages), [older, t.messages]);

  // Each group member's badge and role, looked up once (stable, so message rows don't re-render).
  const memberInfo = useMemo(() => new Map((group?.members ?? []).map((x) => [x.id, { badge: x.badge, role: x.role }] as const)), [group]);
  const names = useCallback((id: string) => group?.members.find((x) => x.id === id)?.name ?? (id === other?.id ? other.name : "Someone"), [group, other]);

  // Stay at the bottom while you are there; otherwise leave the view alone and offer a jump.
  const scrollToEnd = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  };
  useLayoutEffect(() => {
    if (nearBottom.current) scrollToEnd();
  }, [messages.length, pending.length]);
  useLayoutEffect(() => {
    // Open at the first unread message, or the end.
    const el = scroller.current;
    const marker = el?.querySelector<HTMLElement>("[data-new-marker]");
    if (el && marker) el.scrollTop = Math.max(0, marker.offsetTop - 80);
    else scrollToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The phone keyboard opening shrinks the visible area: keep the newest message in view.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { if (nearBottom.current) scrollToEnd(); };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const was = nearBottom.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current && newBelow) setNewBelow(0);
    if (nearBottom.current && !was) markRead();
  };

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    const el = scroller.current;
    const from = el ? el.scrollHeight - el.scrollTop : 0;
    setLoadingOlder(true);
    const r = await loadThreadAction(conversationId, first.at).catch(() => null);
    setLoadingOlder(false);
    if (!r?.ok) return say(r?.error ?? "Couldn't load older messages.", true);
    setOlder((prev) => merge(r.data.messages, prev));
    setMoreOlder(r.data.more);
    // Keep the message you were reading in place.
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - from; });
  }

  async function deliver(p: Pending) {
    setPending((list) => list.map((x) => (x.clientId === p.clientId ? { ...x, failed: undefined } : x)));
    const r = await sendChatAction(conversationId, p.body, p.clientId, p.replyTo?.id).catch(() => null);
    if (!r?.ok) {
      const error = r && !r.ok ? r.error : "Not sent: check your connection.";
      setPending((list) => list.map((x) => (x.clientId === p.clientId ? { ...x, failed: error } : x)));
      return;
    }
    const sent: Message = {
      id: r.data!.id, mine: true, kind: "TEXT", sender: group ? { id: me, name: "You", avatarUrl: null } : null, body: p.body, deleted: false, edited: false, at: r.data!.at,
      editable: true, reported: false, reactions: [], replyTo: p.replyTo, context: null,
    };
    setT((cur) => (cur.messages.some((m) => m.id === sent.id) ? cur : { ...cur, messages: merge(cur.messages, [sent]) }));
    setPending((list) => list.filter((x) => x.clientId !== p.clientId));
    delay.current = ACTIVE_MS;
    // Without a live connection nobody tells us about replies: check soon.
    if (status !== "live") void refresh().catch(() => undefined);
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (text.length > MAX) return say(`Keep messages under ${MAX.toLocaleString()} characters.`, true);
    const p: Pending = { clientId: newClientId(), body: text, at: new Date().toISOString(), replyTo: replyTo ? { id: replyTo.id, name: replyTo.mine ? "You" : replyTo.sender?.name ?? other?.name ?? "Them", body: replyTo.body } : null };
    setBody("");
    setReplyTo(null);
    setEmoji(false);
    setPending((list) => [...list, p]);
    nearBottom.current = true;
    composer.current?.focus();
    if (composer.current) composer.current.style.height = "auto";
    void deliver(p);
  }

  function onType(v: string) {
    setBody(v);
    const now = Date.now();
    if (v.trim() && now - lastTyping.current > TYPING_SEND_MS) {
      lastTyping.current = now;
      sendLive({ t: "typing", c: conversationId });
    }
  }

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, reload = true) => {
    const r: { ok: boolean; error?: string; message?: string } = await fn().catch(() => ({ ok: false, error: "Something went wrong. Check your connection and try again." }));
    if (!r.ok) say(r.error ?? "Something went wrong.", true);
    else if (r.message) say(r.message);
    if (reload || !r.ok) await refresh().catch(() => undefined);
    return r.ok;
  };

  const react = useCallback(async (m: Message, e: ReactionKey | null) => {
    // Shown at once; put back if the server says no.
    const before = m.reactions;
    patch(m.id, (x) => ({ ...x, reactions: [...x.reactions.filter((r) => r.u !== me), ...(e ? [{ u: me, e }] : [])] }));
    const r = await reactAction(m.id, e).catch(() => null);
    if (!r?.ok) {
      patch(m.id, (x) => ({ ...x, reactions: before }));
      say(r && !r.ok ? r.error : "Couldn't react. Check your connection.", true);
    }
  }, [me, patch, say]);

  async function toggleBlock() {
    if (!other) return;
    if (!other.blocked) {
      const ok = await confirm({
        title: `Block ${other.name}?`,
        description: <><p>They won&apos;t be able to message you or find you in search, and you won&apos;t be able to message them.</p><p>They aren&apos;t told. You can unblock any time here or in Message settings.</p></>,
        confirmLabel: "Block", destructive: true,
      });
      if (!ok) return;
    }
    await act(() => blockAction(other.id, !other.blocked));
  }

  const removeMessage = useCallback(async (m: Message) => {
    const ok = await confirm({ title: "Delete this message?", description: "It will show as “Message deleted” for everyone. This can't be undone.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    patch(m.id, (x) => ({ ...x, deleted: true, body: null, reactions: [] }));
    await act(() => deleteChatAction(m.id), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, patch]);

  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => say("Copied."), () => say("Couldn't copy.", true));
  }, [say]);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return say("That message is further up. Load older messages to see it.");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    window.setTimeout(() => setHighlight(null), 1600);
  }, [say]);

  const startReply = useCallback((m: Message) => {
    setReplyTo(m);
    composer.current?.focus();
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    const b = editing.body.trim();
    if (!b) return;
    const id = editing.id;
    setEditing(null);
    patch(id, (x) => ({ ...x, body: b, edited: true }));
    void act(() => editChatAction(id, b), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, patch]);

  const lastMine = [...messages].reverse().find((m) => m.mine && m.kind === "TEXT");
  const theirLatest = [...messages].reverse().find((m) => !m.mine && m.kind === "TEXT" && !m.deleted && !m.reported);
  const restricted = restrictedUntil && restrictedUntil > new Date().toISOString() ? restrictedUntil : null;
  const composerOpen = canSend && !restricted && !t.left && (group ? true : other?.active && !other.blocked && !other.blockedMe);
  const typers = Object.entries(typing).filter(([, until]) => until > Date.now()).map(([u]) => names(u));
  const seenBy = group && lastMine ? group.members.filter((x) => x.id !== me && x.lastReadAt && x.lastReadAt >= lastMine.at) : [];
  const status1 = !other ? "" : !other.active ? "This account isn't active." : other.blocked ? "Blocked" : activeLabel(online(other.id), other.lastActiveAt) ?? "";
  const activeInGroup = group ? group.members.filter((x) => x.id !== me && online(x.id)).length : 0;

  return (
    <div className="relative flex h-[calc(100dvh-9.5rem)] min-h-88 flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100dvh-8rem)]">
      {confirmDialog}
      <ReportDialog messageId={reporting} personName={messages.find((m) => m.id === reporting)?.sender?.name ?? other?.name ?? "This person"} open={Boolean(reporting)} onOpenChange={(o) => !o && setReporting(null)}
        onDone={({ message }) => { say(message); void refresh().catch(() => undefined); }} />
      {group && <GroupSettings conversationId={conversationId} group={group} me={me} open={settings} onOpenChange={setSettings} onChanged={() => void refresh().catch(() => undefined)} say={say} />}

      <header className="flex items-center justify-between gap-2 border-b px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link prefetch={false} href="/dashboard/chat" className={cn(iconButton, "lg:hidden")} aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></Link>
          {group ? (
            <button type="button" onClick={() => setSettings(true)} className="flex min-w-0 items-center gap-2 rounded-md p-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <PersonAvatar name={group.name} url={group.avatarUrl} size="md" group />
              <span className="min-w-0">
                <span className="block truncate font-medium">{group.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {typers.length ? <span className="text-primary">{typers.length === 1 ? `${typers[0]!.split(" ")[0]} is typing…` : `${typers.length} people are typing…`}</span>
                    : `${group.members.length} members${activeInGroup ? ` · ${activeInGroup} active now` : ""}${t.muted ? " · muted" : ""}`}
                </span>
              </span>
            </button>
          ) : (
            <>
              <PersonAvatar name={other?.name} url={other?.avatarUrl} size="md" href={other?.handle ? `/members/${other.handle}` : null} online={other ? online(other.id) : undefined} />
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{other?.handle ? <Link prefetch={false} href={`/members/${other.handle}`} className="hover:underline">{other.name}</Link> : other?.name ?? "Conversation"}</span>
                  {other && <BadgePill badge={other.badge} />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {typers.length ? <span className="text-primary">typing…</span> : [status1, t.muted ? "muted" : null, t.archived ? "archived" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center">
          {group && <button type="button" className={iconButton} aria-label="Group details" onClick={() => setSettings(true)}><Info className="h-5 w-5" /></button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={iconButton} aria-label="Conversation options"><MoreVertical className="h-5 w-5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => act(() => chatStateAction(conversationId, { muted: !t.muted }))}>
                {t.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{t.muted ? "Unmute notifications" : "Mute notifications"}
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => act(() => chatStateAction(conversationId, { archived: !t.archived }))}>
                {t.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{t.archived ? "Move back to inbox" : "Archive conversation"}
              </DropdownMenuItem>
              {group && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setSettings(true)}><Info className="h-4 w-4" />Group details and members</DropdownMenuItem>}
              {other && (
                <>
                  <DropdownMenuSeparator />
                  {theirLatest && (
                    <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setReporting(theirLatest.id)}>
                      <Flag className="h-4 w-4" />Report their latest message
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className={cn("min-h-11 gap-2", !other.blocked && "text-destructive focus:text-destructive")} onSelect={toggleBlock}>
                    <Ban className="h-4 w-4" />{other.blocked ? `Unblock ${other.name}` : `Block ${other.name}`}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {(offline || status === "connecting") && (
        <p role="status" className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> {offline ? "Reconnecting… New messages will appear when the connection is back." : "Reconnecting to live updates…"}
        </p>
      )}

      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4" aria-live="polite" aria-relevant="additions">
        {moreOlder && messages.length > 0 && (
          <div className="mb-3 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load older messages"}</Button>
          </div>
        )}
        {messages.length === 0 && pending.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
            <PersonAvatar name={group?.name ?? other?.name} url={group?.avatarUrl ?? other?.avatarUrl} size="lg" group={Boolean(group)} />
            <p>{group ? `This is the start of “${group.name}”.` : `This is the start of your conversation with ${other?.name ?? "this member"}. Say hello.`}</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const sameSender = (a?: Message, b?: Message) => Boolean(a && b && a.kind === "TEXT" && b.kind === "TEXT" && a.mine === b.mine && (a.sender?.id ?? "") === (b.sender?.id ?? ""));
          const newDay = !prev || dhakaDay(prev.at) !== dhakaDay(m.at);
          const firstNew = !m.mine && m.kind === "TEXT" && readUpTo.current !== null && m.at > readUpTo.current && (!prev || prev.mine || prev.at <= readUpTo.current);
          const joinsPrev = !newDay && sameSender(prev, m) && new Date(m.at).getTime() - new Date(prev!.at).getTime() < GROUP_MS;
          const endsGroup = !next || !sameSender(m, next) || dhakaDay(next.at) !== dhakaDay(m.at) || new Date(next.at).getTime() - new Date(m.at).getTime() >= GROUP_MS;
          const avatar = m.mine ? null : group ? (m.sender ? { name: m.sender.name, url: m.sender.avatarUrl } : null) : { name: other?.name ?? "", url: other?.avatarUrl ?? null };
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground" role="separator">
                  <span className="h-px flex-1 bg-border" /><span>{dayLabel(m.at)}</span><span className="h-px flex-1 bg-border" />
                </div>
              )}
              {firstNew && (
                <div data-new-marker className="my-2 flex items-center gap-3 text-[11px] font-semibold text-primary" role="separator">
                  <span className="h-px flex-1 bg-primary/40" /><span>New messages</span><span className="h-px flex-1 bg-primary/40" />
                </div>
              )}
              <MessageRow m={m} me={me} joinsPrev={joinsPrev} endsGroup={endsGroup} showSender={Boolean(group) && !joinsPrev} avatar={avatar} names={names}
                senderInfo={m.sender ? memberInfo.get(m.sender.id) ?? null : null}
                canAct={Boolean(composerOpen)} reacting={reacting === m.id} editing={editing?.id ?? null} highlight={highlight === m.id}
                onReacting={setReacting} onReact={react} onReply={startReply} onEdit={(x) => setEditing({ id: x.id, body: x.body ?? "" })}
                onEditChange={(v) => setEditing((e) => (e ? { ...e, body: v } : e))} onEditSave={saveEdit} onEditCancel={() => setEditing(null)}
                onDelete={removeMessage} onReport={(x) => setReporting(x.id)} onCopy={copy} onJump={jump} />
            </Fragment>
          );
        })}
        {pending.map((p) => (
          <div key={p.clientId} className="mt-1 flex justify-end">
            <div className={cn("max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm sm:max-w-[70%]", p.failed ? "border border-destructive/60 bg-destructive/10" : "bg-primary/70 text-primary-foreground")}>
              {p.replyTo && <p className="mb-1 line-clamp-1 border-l-4 border-primary-foreground/50 pl-2 text-xs opacity-80">{p.replyTo.name}: {p.replyTo.body}</p>}
              <p className="whitespace-pre-wrap wrap-anywhere">{p.body}</p>
              {p.failed ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-destructive">
                  {p.failed}
                  <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded px-1 font-medium underline" onClick={() => deliver(p)}><RotateCw className="h-3 w-3" />Retry</button>
                  <button type="button" className="inline-flex min-h-8 items-center rounded px-1 underline" onClick={() => setPending((l) => l.filter((x) => x.clientId !== p.clientId))}>Discard</button>
                </p>
              ) : (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-primary-foreground/80"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />Sending…</p>
              )}
            </div>
          </div>
        ))}
        {lastMine && pending.length === 0 && (
          <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground" aria-live="polite">
            {!group && t.seenAt && t.seenAt >= lastMine.at ? (
              <><PersonAvatar name={other?.name} url={other?.avatarUrl} size="xs" className="h-3.5 w-3.5 text-[7px]" />Seen</>
            ) : group && seenBy.length ? (
              <span title={seenBy.map((x) => x.name).join(", ")} className="inline-flex items-center gap-1">
                <span className="flex -space-x-1.5">{seenBy.slice(0, 5).map((x) => <PersonAvatar key={x.id} name={x.name} url={x.avatarUrl} size="xs" className="h-3.5 w-3.5 text-[7px] ring-1 ring-background" />)}</span>
                Seen by {seenBy.length === group.members.length - 1 ? "everyone" : seenBy.length}
              </span>
            ) : delivered.has(lastMine.id) ? (
              <><CheckCheck className="h-3.5 w-3.5" aria-hidden />Delivered</>
            ) : (
              <><Check className="h-3.5 w-3.5" aria-hidden />Sent</>
            )}
          </p>
        )}
        {typers.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="inline-flex items-center gap-1 rounded-2xl bg-muted px-3 py-2" aria-hidden>
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce [animation-delay:240ms]" />
            </span>
            <span>{group ? `${typers.slice(0, 2).map((n) => n.split(" ")[0]).join(" and ")}${typers.length > 2 ? " and others" : ""} ${typers.length === 1 ? "is" : "are"} typing` : "typing"}</span>
          </div>
        )}
      </div>

      {newBelow > 0 && (
        <button type="button" onClick={() => { scrollToEnd(true); markRead(); }} className="absolute bottom-24 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-md hover:bg-muted">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />{newBelow} new message{newBelow === 1 ? "" : "s"}
        </button>
      )}

      {toast && (
        <p role={toast.error ? "alert" : "status"} className={cn("absolute inset-x-3 top-16 z-30 mx-auto max-w-md rounded-lg border px-3 py-2 text-center text-sm shadow-md", toast.error ? "border-destructive/50 bg-background text-destructive" : "bg-background")}>
          {toast.text}
        </p>
      )}

      <form onSubmit={send} className="border-t bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {composerOpen ? (
          <>
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-primary bg-muted/60 px-3 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary">Replying to {replyTo.mine ? "yourself" : replyTo.sender?.name ?? other?.name}</p>
                  <p className="truncate text-muted-foreground">{replyTo.body ?? "Message deleted"}</p>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
            )}
            {emoji && (
              <div className="mb-2 grid grid-cols-8 gap-1 rounded-lg border bg-popover p-2 shadow-sm sm:grid-cols-16" role="group" aria-label="Insert an emoji">
                {QUICK_EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => { const el = composer.current; const at = el?.selectionStart ?? body.length; const next = `${body.slice(0, at)}${e}${body.slice(el?.selectionEnd ?? at)}`; onType(next); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); }); }}
                    className="flex h-9 items-center justify-center rounded-md text-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Insert ${e}`}>{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <button type="button" onClick={() => setEmoji((v) => !v)} aria-pressed={emoji} aria-label="Emoji" className={cn(iconButton, "h-11 w-11 shrink-0 text-muted-foreground", emoji && "bg-muted text-foreground")}><Smile className="h-5 w-5" /></button>
              <label className="sr-only" htmlFor="chat-body">Message to {group?.name ?? other?.name}</label>
              <div className="relative flex-1">
                <Textarea ref={composer} id="chat-body" value={body} rows={1} maxLength={MAX} placeholder="Write a message" enterKeyHint="send"
                  onChange={(e) => {
                    onType(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    // Enter sends on computers; on phones the keyboard's return adds a line and the button sends.
                    const touch = typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) { e.preventDefault(); send(); }
                    if (e.key === "Escape") { setReplyTo(null); setEmoji(false); }
                    if (e.key === "ArrowUp" && !body && lastMine?.editable) { e.preventDefault(); setEditing({ id: lastMine.id, body: lastMine.body ?? "" }); }
                  }}
                  className="max-h-40 min-h-11 resize-none rounded-2xl pr-12 text-base md:text-sm" />
                {body.length > MAX - 200 && <span className="pointer-events-none absolute bottom-1.5 right-3 text-[10px] text-muted-foreground" aria-live="polite">{MAX - body.length}</span>}
              </div>
              <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full transition-transform active:scale-90" disabled={!body.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1.5 text-sm text-muted-foreground">
            <p>
              {t.left ? "You're no longer in this group."
                : !canSend ? "Messaging opens once your membership is approved."
                  : restricted ? `A moderator paused your messaging until ${dhakaDateTime(restricted)}. You can still read messages.`
                    : other?.blocked ? `You blocked ${other.name}.`
                      : other?.blockedMe ? "This person isn't accepting messages from you."
                        : "You can't reply to this conversation."}
            </p>
            {other?.blocked && <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={toggleBlock}>Unblock</Button>}
          </div>
        )}
      </form>
    </div>
  );
}
