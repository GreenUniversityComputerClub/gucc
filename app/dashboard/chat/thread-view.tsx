"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, BellOff, Bell, Archive, Ban, Flag, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { blockAction, chatStateAction, deleteChatAction, editChatAction, loadThreadAction, reportChatAction, sendChatAction, type Thread } from "./actions";

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * One conversation. New messages arrive by polling while the tab is visible: every 5 seconds
 * after activity, slowing to 30 seconds when things are quiet, and not at all when hidden.
 */
export function ThreadView({ conversationId, initial, canSend }: { conversationId: string; initial: Thread; canSend: boolean }) {
  const [t, setT] = useState<Thread>(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const delay = useRef(5000);
  const lastCount = useRef(initial.messages.length);

  const refresh = useCallback(async () => {
    const r = await loadThreadAction(conversationId);
    if (r.ok) {
      const grew = r.data.messages.length !== lastCount.current || r.data.messages.at(-1)?.id !== t.messages.at(-1)?.id;
      lastCount.current = r.data.messages.length;
      delay.current = grew ? 5000 : Math.min(30_000, delay.current + 5000);
      setT(r.data);
    }
  }, [conversationId, t.messages]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await refresh();
      timer = setTimeout(tick, delay.current);
    };
    timer = setTimeout(tick, delay.current);
    const onVisible = () => { if (!document.hidden) { delay.current = 5000; refresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [t.messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const r = await sendChatAction(conversationId, text);
      if (!r.ok) return setError(r.error);
      setBody("");
      delay.current = 5000;
      await refresh();
    });
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    await refresh();
  });

  const other = t.person;
  const lastMine = [...t.messages].reverse().find((m) => m.mine);

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col rounded-xl border bg-card lg:h-[calc(100vh-8rem)]">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard/chat" className="rounded-md p-1.5 hover:bg-muted lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0">
            <p className="truncate font-medium">{other?.name ?? "Conversation"}</p>
            {other && !other.active && <p className="text-xs text-muted-foreground">This account isn&apos;t active.</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => act(() => chatStateAction(conversationId, { muted: !t.muted }))} className="rounded-md p-2 hover:bg-muted" aria-label={t.muted ? "Unmute" : "Mute"} title={t.muted ? "Unmute" : "Mute"}>
            {t.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => act(() => chatStateAction(conversationId, { archived: true }))} className="rounded-md p-2 hover:bg-muted" aria-label="Archive" title="Archive">
            <Archive className="h-4 w-4" />
          </button>
          {other && (
            <button type="button" onClick={() => { if (other.blocked || window.confirm(`Block ${other.name}? They won't be able to message you.`)) act(() => blockAction(other.id, !other.blocked)); }}
              className={cn("rounded-md p-2 hover:bg-muted", other.blocked && "text-destructive")} aria-label={other.blocked ? "Unblock" : "Block"} title={other.blocked ? "Unblock" : "Block"}>
              <Ban className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4" aria-live="polite">
        {t.messages.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        {t.messages.map((m) => (
          <div key={m.id} className={cn("group flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]", m.mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {m.context && <p className={cn("mb-1 text-xs", m.mine ? "text-primary-foreground/80" : "text-muted-foreground")}>About: <Link href={m.context.href} className="underline">{m.context.title}</Link></p>}
              {editing?.id === m.id ? (
                <form onSubmit={(e) => { e.preventDefault(); const b = editing.body; setEditing(null); act(() => editChatAction(m.id, b)); }} className="space-y-1">
                  <Textarea value={editing.body} onChange={(e) => setEditing({ id: m.id, body: e.target.value })} rows={2} maxLength={2000} className="text-foreground" autoFocus />
                  <div className="flex justify-end gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" size="sm" variant="secondary">Save</Button></div>
                </form>
              ) : (
                <p className={cn("whitespace-pre-wrap break-words", m.deleted && "italic opacity-70")}>{m.deleted ? "Message deleted" : m.body}</p>
              )}
              <p className={cn("mt-1 flex items-center gap-2 text-[11px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                <time dateTime={m.at}>{time(m.at)}</time>{m.edited && !m.deleted ? " · edited" : ""}
                {!m.deleted && (
                  <span className="hidden gap-1 group-hover:inline-flex group-focus-within:inline-flex">
                    {m.editable && <button type="button" onClick={() => setEditing({ id: m.id, body: m.body ?? "" })} aria-label="Edit message"><Pencil className="h-3 w-3" /></button>}
                    {m.mine && <button type="button" onClick={() => { if (window.confirm("Delete this message?")) act(() => deleteChatAction(m.id)); }} aria-label="Delete message"><Trash2 className="h-3 w-3" /></button>}
                    {!m.mine && <button type="button" onClick={() => { const reason = window.prompt("What's wrong with this message? A moderator will see only this message."); if (reason) act(() => reportChatAction(m.id, reason)); }} aria-label="Report message"><Flag className="h-3 w-3" /></button>}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
        {lastMine && t.seenAt && t.seenAt >= lastMine.at && <p className="text-right text-[11px] text-muted-foreground">Seen</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t p-2">
        {error && <p role="alert" className="mb-1 px-1 text-xs text-destructive">{error}</p>}
        {canSend && other?.active && !other.blocked && !other.blockedMe ? (
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="chat-body">Message</label>
            <Textarea id="chat-body" value={body} onChange={(e) => setBody(e.target.value)} rows={1} maxLength={2000} placeholder="Write a message"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
              className="max-h-40 min-h-10 flex-1 resize-none" />
            <Button type="submit" size="icon" disabled={pending || !body.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </div>
        ) : (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {!canSend ? "Messaging opens once your membership is approved." : other?.blocked ? "You've blocked this person." : other?.blockedMe ? "This person isn't accepting messages from you." : "You can't reply to this conversation."}
          </p>
        )}
      </form>
    </div>
  );
}
