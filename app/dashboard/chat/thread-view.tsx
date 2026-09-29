"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Archive, ArchiveRestore, Ban, Bell, BellOff, Copy, Flag, Loader2, MoreHorizontal, MoreVertical, Pencil, RotateCw, Send, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { dayLabel, dhakaDateTime, dhakaDay, dhakaTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { blockAction, chatStateAction, deleteChatAction, editChatAction, loadThreadAction, pulseAction, sendChatAction, type Thread } from "./actions";
import { Linkified } from "./linkify";
import { ReportDialog } from "./report-dialog";

type Message = Thread["messages"][number];
type Pending = { clientId: string; body: string; at: string; failed?: string };

/** Messages by id, oldest first (a message present in both keeps the newer copy). */
const merge = (a: Message[], b: Message[]) => [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort((x, y) => x.at.localeCompare(y.at));

/** Consecutive messages from one person within five minutes read as one group. */
const GROUP_MS = 5 * 60_000;
const MAX = 2000;
const QUIET_MS = 30_000;
const ACTIVE_MS = 5000;
const newClientId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
const draftKey = (id: string) => `gucc-chat-draft:${id}`;
const readDraft = (id: string) => { try { return sessionStorage.getItem(draftKey(id)) ?? ""; } catch { return ""; } };
const writeDraft = (id: string, v: string) => { try { if (v) sessionStorage.setItem(draftKey(id), v); else sessionStorage.removeItem(draftKey(id)); } catch { /* private mode */ } };

const iconButton = "inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * One conversation. New messages arrive by a cheap "anything new?" check while the tab is
 * visible (every 5 seconds after activity, slowing to 30 when quiet, paused when hidden); the
 * thread is fetched only when something changed. Sending shows the message at once and stores
 * it exactly once, even after a double Enter or a dropped connection.
 */
export function ThreadView({ conversationId, initial, canSend, restrictedUntil }: { conversationId: string; initial: Thread; canSend: boolean; restrictedUntil?: string | null }) {
  const [t, setT] = useState<Thread>(initial);
  const [older, setOlder] = useState<Message[]>([]);
  const [moreOlder, setMoreOlder] = useState(initial.more);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [reporting, setReporting] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const delay = useRef(ACTIVE_MS);
  const sig = useRef(initial.sig);
  const latest = useRef(t);
  latest.current = t;
  // Where "New messages" starts: fixed for this visit.
  const readUpTo = useRef(initial.readUpTo);

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

  // The "anything new?" loop. A failure (dropped connection) keeps it going with a hint.
  useEffect(() => {
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
            delay.current = grew ? ACTIVE_MS : Math.min(QUIET_MS, delay.current + ACTIVE_MS);
          } else {
            delay.current = Math.min(QUIET_MS, delay.current + ACTIVE_MS);
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
    timer = setTimeout(tick, delay.current);
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
  }, [conversationId, refresh, toLogin]);

  const messages = useMemo(() => merge(older, t.messages), [older, t.messages]);
  const other = t.person;

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
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current && newBelow) setNewBelow(0);
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
    const r = await sendChatAction(conversationId, p.body, p.clientId).catch(() => null);
    if (!r?.ok) {
      const error = r && !r.ok ? r.error : "Not sent: check your connection.";
      setPending((list) => list.map((x) => (x.clientId === p.clientId ? { ...x, failed: error } : x)));
      return;
    }
    delay.current = ACTIVE_MS;
    await refresh().catch(() => undefined);
    setPending((list) => list.filter((x) => x.clientId !== p.clientId));
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (text.length > MAX) return say(`Keep messages under ${MAX.toLocaleString()} characters.`, true);
    const p: Pending = { clientId: newClientId(), body: text, at: new Date().toISOString() };
    setBody("");
    setPending((list) => [...list, p]);
    nearBottom.current = true;
    composer.current?.focus();
    void deliver(p);
  }

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const r: { ok: boolean; error?: string; message?: string } = await fn().catch(() => ({ ok: false, error: "Something went wrong. Check your connection and try again." }));
    if (!r.ok) say(r.error ?? "Something went wrong.", true);
    else if (r.message) say(r.message);
    await refresh().catch(() => undefined);
  };

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

  async function removeMessage(m: Message) {
    const ok = await confirm({ title: "Delete this message?", description: "It will show as “Message deleted” for both of you. This can't be undone.", confirmLabel: "Delete", destructive: true });
    if (ok) await act(() => deleteChatAction(m.id));
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => say("Copied."), () => say("Couldn't copy.", true));
  }

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const theirLatest = [...messages].reverse().find((m) => !m.mine && !m.deleted && !m.reported);
  const restricted = restrictedUntil && restrictedUntil > new Date().toISOString() ? restrictedUntil : null;
  const composerOpen = canSend && !restricted && other?.active && !other.blocked && !other.blockedMe;

  return (
    <div className="relative flex h-[calc(100dvh-9.5rem)] min-h-88 flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100dvh-8rem)]">
      {confirmDialog}
      <ReportDialog messageId={reporting} personName={other?.name ?? "This person"} open={Boolean(reporting)} onOpenChange={(o) => !o && setReporting(null)}
        onDone={({ message }) => { say(message); void refresh().catch(() => undefined); }} />

      <header className="flex items-center justify-between gap-2 border-b px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link prefetch={false} href="/dashboard/chat" className={cn(iconButton, "lg:hidden")} aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></Link>
          <PersonAvatar name={other?.name} url={other?.avatarUrl} size="md" href={other?.handle ? `/members/${other.handle}` : null} />
          <div className="min-w-0">
            <p className="truncate font-medium">{other?.handle ? <Link prefetch={false} href={`/members/${other.handle}`} className="hover:underline">{other.name}</Link> : other?.name ?? "Conversation"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {!other ? "" : !other.active ? "This account isn't active." : other.blocked ? "Blocked" : t.muted ? "Muted" : t.archived ? "Archived" : "Member"}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={iconButton} aria-label="Conversation options"><MoreVertical className="h-5 w-5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => act(() => chatStateAction(conversationId, { muted: !t.muted }))}>
              {t.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{t.muted ? "Unmute notifications" : "Mute notifications"}
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => act(() => chatStateAction(conversationId, { archived: !t.archived }))}>
              {t.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{t.archived ? "Move back to inbox" : "Archive conversation"}
            </DropdownMenuItem>
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
      </header>

      {offline && (
        <p role="status" className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> Reconnecting… New messages will appear when the connection is back.
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
            <PersonAvatar name={other?.name} url={other?.avatarUrl} size="lg" />
            <p>This is the start of your conversation with {other?.name ?? "this member"}. Say hello.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dhakaDay(prev.at) !== dhakaDay(m.at);
          const firstNew = !m.mine && readUpTo.current !== null && m.at > readUpTo.current && (!prev || prev.mine || prev.at <= readUpTo.current);
          const joinsPrev = !newDay && prev && prev.mine === m.mine && new Date(m.at).getTime() - new Date(prev.at).getTime() < GROUP_MS;
          const endsGroup = !next || next.mine !== m.mine || dhakaDay(next.at) !== dhakaDay(m.at) || new Date(next.at).getTime() - new Date(m.at).getTime() >= GROUP_MS;
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
              <div className={cn("group flex items-end gap-2", m.mine ? "justify-end" : "justify-start", joinsPrev ? "mt-0.5" : "mt-3")}>
                {!m.mine && (
                  <span className="w-8 shrink-0">{endsGroup && <PersonAvatar name={other?.name} url={other?.avatarUrl} size="sm" />}</span>
                )}
                <div className={cn("flex max-w-[85%] items-center gap-1 sm:max-w-[70%]", m.mine && "flex-row-reverse")}>
                  <div className={cn("min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm", m.mine ? "bg-primary text-primary-foreground" : "bg-muted", m.mine ? (endsGroup ? "rounded-br-md" : "") : (endsGroup ? "rounded-bl-md" : ""))}>
                    {m.context && <p className={cn("mb-1 text-xs", m.mine ? "text-primary-foreground/80" : "text-muted-foreground")}>About: <Link href={m.context.href} className="underline">{m.context.title}</Link></p>}
                    {editing?.id === m.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); const b = editing.body.trim(); if (!b) return; setEditing(null); void act(() => editChatAction(m.id, b)); }} className="space-y-1">
                        <label className="sr-only" htmlFor={`edit-${m.id}`}>Edit message</label>
                        <Textarea id={`edit-${m.id}`} value={editing.body} onChange={(e) => setEditing({ id: m.id, body: e.target.value })} rows={2} maxLength={MAX} className="min-w-56 text-foreground" autoFocus
                          onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                        <div className="flex justify-end gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" size="sm" variant="secondary">Save</Button></div>
                      </form>
                    ) : m.deleted ? (
                      <p className="italic opacity-70">Message deleted</p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words"><Linkified text={m.body ?? ""} className={cn("break-all underline underline-offset-2", m.mine && "text-primary-foreground")} /></p>
                    )}
                    {endsGroup && (
                      <p className={cn("mt-1 text-[11px]", m.mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                        <time dateTime={m.at} title={dhakaDateTime(m.at)}>{dhakaTime(m.at)}</time>
                        {m.edited && !m.deleted ? " · edited" : ""}
                        {m.reported ? " · you reported this" : ""}
                      </p>
                    )}
                  </div>
                  {!m.deleted && editing?.id !== m.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Message options"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={m.mine ? "end" : "start"} className="w-48">
                        <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => copy(m.body ?? "")}><Copy className="h-4 w-4" />Copy text</DropdownMenuItem>
                        {m.editable && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setEditing({ id: m.id, body: m.body ?? "" })}><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>}
                        {m.mine && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => removeMessage(m)}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem>}
                        {!m.mine && !m.reported && <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => setReporting(m.id)}><Flag className="h-4 w-4" />Report</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
        {pending.map((p) => (
          <div key={p.clientId} className="mt-1 flex justify-end">
            <div className={cn("max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm sm:max-w-[70%]", p.failed ? "border border-destructive/60 bg-destructive/10" : "bg-primary/70 text-primary-foreground")}>
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
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
        {lastMine && pending.length === 0 && t.seenAt && t.seenAt >= lastMine.at && <p className="mt-1 text-right text-[11px] text-muted-foreground">Seen</p>}
      </div>

      {newBelow > 0 && (
        <button type="button" onClick={() => scrollToEnd(true)} className="absolute bottom-24 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-md hover:bg-muted">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />{newBelow} new message{newBelow === 1 ? "" : "s"}
        </button>
      )}

      {toast && (
        <p role={toast.error ? "alert" : "status"} className={cn("absolute inset-x-3 top-16 z-10 mx-auto max-w-md rounded-lg border px-3 py-2 text-center text-sm shadow-md", toast.error ? "border-destructive/50 bg-background text-destructive" : "bg-background")}>
          {toast.text}
        </p>
      )}

      <form onSubmit={send} className="border-t bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {composerOpen ? (
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="chat-body">Message to {other?.name}</label>
            <div className="relative flex-1">
              <Textarea ref={composer} id="chat-body" value={body} rows={1} maxLength={MAX} placeholder="Write a message" enterKeyHint="send"
                onChange={(e) => {
                  setBody(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                }}
                className="max-h-40 min-h-11 resize-none pr-12 text-base md:text-sm" />
              {body.length > MAX - 200 && <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-muted-foreground" aria-live="polite">{MAX - body.length}</span>}
            </div>
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!body.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1.5 text-sm text-muted-foreground">
            <p>
              {!canSend ? "Messaging opens once your membership is approved."
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
