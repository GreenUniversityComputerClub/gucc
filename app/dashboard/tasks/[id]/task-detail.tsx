"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, CheckCircle2, CircleDot, History, Loader2, Pencil, Play, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { useLive } from "@/lib/api/live-client";
import { dhakaDateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { changeCommentAction, checklistAction, commentAction, deleteTaskAction, loadTaskAction, setTaskStatusAction, type TaskDetail } from "../live-actions";
import { useDirectory } from "../../chat/use-directory";

type Status = TaskDetail["task"]["status"];
const ACTION: Record<Status, { label: string; icon: typeof Play; primary?: boolean }> = {
  IN_PROGRESS: { label: "Start", icon: Play },
  DONE: { label: "Mark done", icon: CheckCircle2, primary: true },
  OPEN: { label: "Reopen", icon: RotateCcw },
  CANCELLED: { label: "Cancel task", icon: XCircle },
};
const ACTIVITY: Record<string, string> = {
  "task.create": "created the task", "task.update": "changed the task", "task.status": "changed the status", "task.delete": "deleted the task",
  "task.comment_delete": "deleted a comment", "task.bulk_status": "changed the status", "task.bulk_due": "changed the due date", "task.bulk_assignee": "reassigned it",
};

/**
 * A task: its status buttons (exactly the moves this person may make), checklist with progress,
 * comments with @mentions, and what happened to it. Everything saves without reloading the page,
 * and changes made by others arrive live.
 */
export function TaskDetailView({ initial, meId }: { initial: TaskDetail; meId: string }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<Array<{ id: string; name: string }>>([]);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirm, dialog] = useConfirm();
  const box = useRef<HTMLTextAreaElement>(null);
  const t = d.task;
  const { data: people } = useDirectory(mentionQ !== null);

  const reload = useCallback(async () => {
    const r = await loadTaskAction(t.id).catch(() => null);
    if (r?.ok) setD(r.data);
    else if (r && !r.ok && r.code === "NOT_FOUND") router.push("/dashboard/tasks");
  }, [t.id, router]);
  useLive("task", (ev) => (ev.id === t.id || ev.id === "*") && void reload());
  useLive("resync", () => void reload());

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string } | null>) => {
    setBusy(key);
    setError(null);
    const r = await fn().catch(() => null);
    setBusy(null);
    if (!r?.ok) setError(r?.error ?? "Couldn't save. Check your connection and try again.");
    else await reload();
    return Boolean(r?.ok);
  };

  async function status(s: Status) {
    if (s === "CANCELLED" && !(await confirm({ title: "Cancel this task?", description: "The assignee is told. You can reopen it later.", confirmLabel: "Cancel task", destructive: true }))) return;
    setD((x) => ({ ...x, task: { ...x.task, status: s } }));
    await run(`status:${s}`, () => setTaskStatusAction(t.id, s));
  }

  async function toggle(id: string, done: boolean) {
    setD((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, done_at: done ? new Date().toISOString() : null } : i)) }));
    await run(`item:${id}`, () => checklistAction(t.id, { toggle: id, done }));
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    if (await run("add", () => checklistAction(t.id, { add: text }))) setNewItem("");
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    const used = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
    if (await run("comment", () => commentAction(t.id, body, used))) {
      setComment("");
      setMentions([]);
    }
  }

  // "@" opens a list of people to mention (filtered as you type).
  const matches = useMemo(() => {
    if (mentionQ === null || !people) return [];
    const q = mentionQ.toLowerCase();
    return people.people.filter((p) => p.full_name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQ, people]);
  function onCommentChange(v: string) {
    setComment(v);
    const el = box.current;
    const upto = v.slice(0, el?.selectionStart ?? v.length);
    const m = upto.match(/(?:^|\s)@([^\s@]{0,30})$/);
    setMentionQ(m ? m[1]! : null);
  }
  function pickMention(p: { user_id: string; full_name: string }) {
    const el = box.current;
    const at = el?.selectionStart ?? comment.length;
    const before = comment.slice(0, at).replace(/@([^\s@]{0,30})$/, `@${p.full_name} `);
    setComment(before + comment.slice(at));
    setMentions((list) => [...list.filter((x) => x.id !== p.user_id), { id: p.user_id, name: p.full_name }]);
    setMentionQ(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }

  const done = d.items.filter((i) => i.done_at).length;
  const late = t.due_at && t.due_at < new Date().toISOString() && (t.status === "OPEN" || t.status === "IN_PROGRESS");
  const canWork = d.role.canEdit || d.role.assignee;

  return (
    <div className="space-y-6">
      {dialog}
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Status">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={t.status} />
          {t.priority === "HIGH" && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">High priority</span>}
          {t.due_at && (
            <span className={cn("inline-flex items-center gap-1.5", late ? "font-semibold text-destructive" : "text-muted-foreground")}>
              <CalendarClock className="h-4 w-4" aria-hidden />{late ? "Overdue · " : "Due "}{dhakaDateTime(t.due_at)}
            </span>
          )}
          {t.labels.map((l) => <span key={l} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{l}</span>)}
        </div>
        {t.details ? <p className="mt-3 whitespace-pre-wrap text-sm">{t.details}</p> : <p className="mt-3 text-sm text-muted-foreground">No details.</p>}
        {(t.event_title || t.meeting_title) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t.event_title && <>Event: {t.event_title}</>}{t.event_title && t.meeting_title && " · "}
            {t.meeting_title && <>From the meeting <a className="underline" href={`/dashboard/meetings/${t.meeting_id}`}>{t.meeting_title}</a></>}
          </p>
        )}
        {d.transitions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {d.transitions.map((s) => {
              const a = ACTION[s];
              return (
                <Button key={s} type="button" variant={a.primary ? "default" : s === "CANCELLED" ? "ghost" : "outline"} className={cn("min-h-10 gap-1.5", s === "CANCELLED" && "text-destructive")}
                  disabled={Boolean(busy)} onClick={() => void status(s)}>
                  {busy === `status:${s}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <a.icon className="h-4 w-4" aria-hidden />}{a.label}
                </Button>
              );
            })}
            {d.role.canEdit && (
              <Button type="button" variant="ghost" className="ml-auto min-h-10 gap-1.5 text-muted-foreground" disabled={Boolean(busy)}
                onClick={async () => { if (await confirm({ title: "Delete this task?", description: "It disappears for everyone. The activity log keeps a record.", confirmLabel: "Delete", destructive: true })) { const r = await deleteTaskAction(t.id); if (r.ok) router.push("/dashboard/tasks"); else setError(r.error); } }}>
                <Trash2 className="h-4 w-4" aria-hidden />Delete
              </Button>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="checklist-h">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="checklist-h" className="font-semibold">Checklist</h2>
          {d.items.length > 0 && <span className="text-sm text-muted-foreground">{done} of {d.items.length}</span>}
        </div>
        {d.items.length > 0 && (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={d.items.length} aria-valuenow={done} aria-label="Checklist progress">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(done / d.items.length) * 100}%` }} />
          </div>
        )}
        <ul className="space-y-1">
          {d.items.map((i) => (
            <li key={i.id} className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/50">
              <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={Boolean(i.done_at)} disabled={!canWork || busy === `item:${i.id}`} onChange={(e) => void toggle(i.id, e.target.checked)} className="h-5 w-5 rounded accent-primary" />
                <span className={cn("text-sm", i.done_at && "text-muted-foreground line-through")}>{i.text}</span>
              </label>
              {canWork && (
                <button type="button" aria-label={`Remove “${i.text}”`} onClick={() => void run(`rm:${i.id}`, () => checklistAction(t.id, { remove: i.id }))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canWork && (
          <form onSubmit={addItem} className="mt-2 flex gap-2">
            <label className="sr-only" htmlFor="new-item">Add a checklist item</label>
            <input id="new-item" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={300} placeholder="Add a step"
              className="h-10 flex-1 rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
            <Button type="submit" variant="outline" className="min-h-10 gap-1.5" disabled={!newItem.trim() || busy === "add"}><Plus className="h-4 w-4" aria-hidden />Add</Button>
          </form>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="comments-h">
        <h2 id="comments-h" className="mb-3 font-semibold">Comments ({d.comments.length})</h2>
        {d.comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet. Ask a question or share progress.</p> : (
          <ul className="space-y-3">
            {d.comments.map((c) => (
              <li key={c.id} className="flex gap-3 text-sm">
                <PersonAvatar name={c.author} url={c.avatarUrl} />
                <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author}</span>
                    <time dateTime={c.created_at} title={dhakaDateTime(c.created_at)}>{relativeTime(c.created_at)}</time>
                    {c.edited_at && <span>· edited</span>}
                  </p>
                  {editing?.id === c.id ? (
                    <form className="mt-1 space-y-1" onSubmit={async (e) => { e.preventDefault(); if (await run(`c:${c.id}`, () => changeCommentAction(c.id, { body: editing.body }))) setEditing(null); }}>
                      <Textarea value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} rows={2} maxLength={2000} autoFocus className="text-base md:text-sm" />
                      <div className="flex justify-end gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" size="sm">Save</Button></div>
                    </form>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap wrap-anywhere">{c.body.split(/(@[^\n@]{2,40}?)(?=\s|$|[.,!?])/).map((part, i) => (part.startsWith("@") ? <strong key={i} className="font-semibold text-primary">{part}</strong> : part))}</p>
                  )}
                  {c.author_user_id === meId && editing?.id !== c.id && (
                    <div className="mt-1 flex gap-2 text-xs">
                      <button type="button" className="inline-flex min-h-8 items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setEditing({ id: c.id, body: c.body })}><Pencil className="h-3 w-3" aria-hidden />Edit</button>
                      <button type="button" className="inline-flex min-h-8 items-center gap-1 text-muted-foreground hover:text-destructive"
                        onClick={async () => { if (await confirm({ title: "Delete this comment?", confirmLabel: "Delete", destructive: true })) await run(`c:${c.id}`, () => changeCommentAction(c.id, { delete: true })); }}><Trash2 className="h-3 w-3" aria-hidden />Delete</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canWork && (
          <form onSubmit={sendComment} className="relative mt-4 space-y-2">
            <label htmlFor="task-comment" className="text-sm font-medium">Add a comment</label>
            <Textarea ref={box} id="task-comment" value={comment} onChange={(e) => onCommentChange(e.target.value)} rows={2} maxLength={2000} placeholder="Type @ to mention someone"
              onKeyDown={(e) => {
                if (mentionQ !== null && matches[0] && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(matches[0]); }
                if (e.key === "Escape") setMentionQ(null);
              }}
              className="text-base md:text-sm" />
            {mentionQ !== null && matches.length > 0 && (
              <ul role="listbox" aria-label="Mention someone" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 shadow-lg">
                {matches.map((p) => (
                  <li key={p.user_id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <PersonAvatar name={p.full_name} url={p.avatarUrl} size="xs" />{p.full_name}<span className="text-xs text-muted-foreground">{p.badge.label}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end"><Button type="submit" className="min-h-10 gap-1.5" disabled={!comment.trim() || busy === "comment"}>{busy === "comment" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Comment</Button></div>
          </form>
        )}
      </section>

      {d.activity.length > 0 && (
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="history-h">
          <h2 id="history-h" className="mb-3 flex items-center gap-2 font-semibold"><History className="h-4 w-4" aria-hidden />History</h2>
          <ol className="relative space-y-3 border-l pl-4">
            {d.activity.map((a, i) => (
              <li key={i} className="text-sm">
                <CircleDot className="absolute -left-[7px] mt-1 h-3 w-3 bg-card text-primary" aria-hidden />
                <span className="font-medium">{a.actor}</span> {ACTIVITY[a.action] ?? a.action.replace(/^task\./, "").replace(/_/g, " ")}
                {a.status && a.action !== "task.create" ? <> to <StatusBadge status={a.status} /></> : null}
                <span className="block text-xs text-muted-foreground"><time dateTime={a.at}>{dhakaDateTime(a.at)}</time></span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
