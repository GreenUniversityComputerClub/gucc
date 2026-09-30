"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Columns3, GripVertical, List, Loader2, MessageSquare, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { useLive } from "@/lib/api/live-client";
import { dhakaDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { bulkTasksAction, loadTasksAction, setTaskStatusAction, type TaskList } from "./live-actions";

type Task = TaskList["rows"][number];
type Status = Task["status"];

const COLUMNS: Array<{ status: Status; label: string }> = [
  { status: "OPEN", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "DONE", label: "Done" },
];
const WORD: Record<Status, string> = { OPEN: "To do", IN_PROGRESS: "In progress", DONE: "Done", CANCELLED: "Cancelled" };
const PRIORITY_RANK = { HIGH: 0, NORMAL: 1, LOW: 2 } as const;
type Sort = "due" | "priority" | "updated";
const LAYOUT_KEY = "gucc-tasks-layout";

const dueText = (iso: string, now: string) => {
  const today = dhakaDay(now);
  const day = dhakaDay(iso);
  const time = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
  const endOfDay = time === "23:59";
  if (day === today) return endOfDay ? "Today" : `Today ${time}`;
  if (day === dhakaDay(new Date(Date.now() + 86_400_000).toISOString())) return endOfDay ? "Tomorrow" : `Tomorrow ${time}`;
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" }) + (endOfDay ? "" : ` ${time}`);
};

/**
 * The task list and board. Search, sort and "choose several" work at once in the browser; moving
 * a card (drag it, or use its menu, or press [ and ] on a focused card) is saved without a reload
 * and put back if the server says no. Changes made elsewhere arrive live.
 */
export function TasksView({ initial, meId }: { initial: TaskList; meId: string }) {
  const [data, setData] = useState(initial);
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("due");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [confirm, dialog] = useConfirm();
  // "Now" moves on whenever the list changes (for overdue and "today" labels).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date().toISOString(), [data]);
  useEffect(() => setData(initial), [initial]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === "board" || saved === "list") setLayout(saved);
    } catch { /* private mode */ }
  }, []);
  const choose = (l: "list" | "board") => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* private mode */ }
  };
  const say = useCallback((text: string, error = false) => {
    setNote({ text, error });
    window.setTimeout(() => setNote((n) => (n?.text === text ? null : n)), error ? 7000 : 4000);
  }, []);

  // Someone else changed a task: fetch the list again (once, whatever the burst).
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      loadTasksAction({ view: data.view, status: data.status, page: data.page }).then((r) => r.ok && setData(r.data), () => undefined);
    }, 500);
  }, [data.view, data.status, data.page]);
  useLive("task", reload);
  useLive("resync", reload);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.rows.filter((t) => {
      if (!words.length) return true;
      const hay = `${t.title} ${t.details ?? ""} ${t.assignee_name ?? ""} ${t.creator_name ?? ""} ${t.labels.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const by = {
      due: (a: Task, b: Task) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      priority: (a: Task, b: Task) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"),
      updated: (a: Task, b: Task) => b.updated_at.localeCompare(a.updated_at),
    }[sort];
    return [...list].sort(by);
  }, [data.rows, q, sort]);

  async function move(t: Task, status: Status) {
    if (t.status === status) return;
    const before = t.status;
    setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === t.id ? { ...x, status } : x)) }));
    setBusy(t.id);
    const r = await setTaskStatusAction(t.id, status).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === t.id ? { ...x, status: before } : x)) }));
      say(r && !r.ok ? r.error : "Couldn't save. Check your connection.", true);
    } else say(`“${t.title}” moved to ${WORD[status].toLowerCase()}.`);
  }

  async function bulk(action: "status" | "due" | "delete", value?: string) {
    const ids = [...picked];
    if (!ids.length) return;
    if (action === "delete" && !(await confirm({ title: `Delete ${ids.length} task${ids.length === 1 ? "" : "s"}?`, description: "Only tasks you created (or all, if you manage tasks) are deleted.", confirmLabel: "Delete", destructive: true }))) return;
    setBusy("bulk");
    const r = await bulkTasksAction({ ids, action, status: action === "status" ? value : undefined, dueAt: action === "due" ? value : undefined }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return say(r && !r.ok ? r.error : "Couldn't save. Check your connection.", true);
    say(r.message ?? "Done.");
    setPicked(new Set());
    reload();
  }

  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const canMove = (t: Task) => t.assignee_user_id === meId || t.created_by === meId || data.canManage;

  const card = (t: Task, board: boolean) => {
    const late = t.due_at && t.due_at < now && (t.status === "OPEN" || t.status === "IN_PROGRESS");
    const soon = !late && t.due_at && dhakaDay(t.due_at) === dhakaDay(now);
    const other = data.view === "mine" || data.view === "overdue" || data.view === "today" || data.view === "week"
      ? { name: t.creator_name, url: t.creator_avatar, prefix: "From" } : { name: t.assignee_name, url: t.assignee_avatar, prefix: "For" };
    return (
      <article key={t.id} draggable={board && canMove(t)} tabIndex={board ? 0 : undefined}
        aria-label={board ? `${t.title}. ${WORD[t.status]}. Press [ or ] to move.` : undefined}
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragging(t.id); }}
        onDragEnd={() => { setDragging(null); setOver(null); }}
        onKeyDown={(e) => {
          if (!board || !canMove(t)) return;
          const i = COLUMNS.findIndex((c) => c.status === t.status);
          if (e.key === "]" && i < COLUMNS.length - 1) { e.preventDefault(); void move(t, COLUMNS[i + 1]!.status); }
          if (e.key === "[" && i > 0) { e.preventDefault(); void move(t, COLUMNS[i - 1]!.status); }
        }}
        className={cn("group relative flex gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          board && canMove(t) && "cursor-grab active:cursor-grabbing", dragging === t.id && "opacity-50", picked.has(t.id) && "border-primary ring-1 ring-primary/40",
          t.priority === "HIGH" && t.status !== "DONE" && "border-l-4 border-l-destructive/70", t.status === "DONE" && "opacity-75")}>
        {!board && (
          <label className="flex h-6 items-center">
            <span className="sr-only">Choose {t.title}</span>
            <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 rounded" />
          </label>
        )}
        {board && canMove(t) && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link prefetch={false} href={`/dashboard/tasks/${t.id}`} className={cn("font-medium leading-snug hover:underline", t.status === "DONE" && "line-through decoration-muted-foreground/60")}>{t.title}</Link>
            {!board && <StatusBadge status={t.status} />}
          </div>
          {t.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">{t.labels.map((l) => <span key={l} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{l}</span>)}</div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><PersonAvatar name={other.name} url={other.url} size="xs" />{other.prefix} {other.name ?? "—"}</span>
            {t.due_at && (
              <span className={cn("inline-flex items-center gap-1", late ? "font-semibold text-destructive" : soon ? "font-medium text-amber-700 dark:text-amber-400" : "")}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />{late ? "Overdue · " : ""}{dueText(t.due_at, now)}
              </span>
            )}
            {t.items_total > 0 && (
              <span className="inline-flex items-center gap-1" title={`${t.items_done} of ${t.items_total} done`}>
                <CheckSquare className="h-3.5 w-3.5" aria-hidden />{t.items_done}/{t.items_total}
              </span>
            )}
            {t.comments > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{t.comments}</span>}
            {t.priority === "HIGH" && <span className="font-medium text-destructive">High priority</span>}
          </div>
          {t.items_total > 0 && (
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(t.items_done / t.items_total) * 100}%` }} /></div>
          )}
        </div>
        {canMove(t) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Move ${t.title}`} className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {COLUMNS.filter((c) => c.status !== t.status).map((c) => (
                <DropdownMenuItem key={c.status} className="min-h-10" onSelect={() => void move(t, c.status)}>{c.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-3">
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, people or labels"
            className="h-10 w-full rounded-full border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 rounded-md border bg-background px-2 text-base md:text-sm">
            <option value="due">Due date</option><option value="priority">Priority</option><option value="updated">Recently changed</option>
          </select>
        </label>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Layout">
          {([["list", "List", List], ["board", "Board", Columns3]] as const).map(([l, label, Icon]) => (
            <button key={l} type="button" aria-pressed={layout === l} onClick={() => choose(l)}
              className={cn("inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-sm", layout === l ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" aria-hidden />{label}
            </button>
          ))}
        </div>
      </div>

      {note && <p role={note.error ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", note.error ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40")}>{note.text}</p>}

      {layout === "list" && picked.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 shadow-md" role="toolbar" aria-label="Change the chosen tasks">
          <span className="px-2 text-sm font-medium">{picked.size} chosen</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="min-h-9" disabled={busy === "bulk"}>Set status</Button></DropdownMenuTrigger>
            <DropdownMenuContent>{(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as Status[]).map((s) => <DropdownMenuItem key={s} className="min-h-10" onSelect={() => void bulk("status", s)}>{WORD[s]}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <span className="sr-only">Due date for the chosen tasks</span>
            <input type="date" className="h-9 rounded-md border bg-background px-2 text-base md:text-sm" onChange={(e) => e.target.value && void bulk("due", e.target.value)} disabled={busy === "bulk"} />
          </label>
          <Button type="button" variant="ghost" size="sm" className="min-h-9 gap-1.5 text-destructive" onClick={() => void bulk("delete")} disabled={busy === "bulk"}><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
          <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-9" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {q ? "No task matches." : data.view === "overdue" ? "Nothing overdue. Well done!" : data.view === "today" ? "Nothing due today." : data.view === "mine" ? "No tasks for you right now." : "No tasks here."}
        </p>
      ) : layout === "list" ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 rounded" checked={picked.size > 0 && rows.every((t) => picked.has(t.id))}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((t) => t.id)) : new Set())} />
            Choose all {rows.length}
          </label>
          {rows.map((t) => card(t, false))}
        </div>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {COLUMNS.map((c) => {
            const list = rows.filter((t) => t.status === c.status);
            return (
              <section key={c.status} aria-label={c.label}
                onDragOver={(e) => { e.preventDefault(); setOver(c.status); }}
                onDragLeave={() => setOver((o) => (o === c.status ? null : o))}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); const t = data.rows.find((x) => x.id === id); setOver(null); if (t && canMove(t)) void move(t, c.status); }}
                className={cn("flex w-[85vw] shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-muted/40 p-2 transition-colors sm:w-80 md:w-auto", over === c.status && "border-primary bg-primary/5")}>
                <h3 className="flex items-center justify-between px-1 pt-1 text-sm font-semibold">{c.label}<span className="rounded-full bg-background px-2 text-xs font-normal text-muted-foreground">{list.length}</span></h3>
                {list.map((t) => card(t, true))}
                {list.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{over === c.status ? "Drop here" : "Nothing here"}</p>}
              </section>
            );
          })}
        </div>
      )}
      {(data.more || data.page > 1) && (
        <nav className="flex justify-center gap-3 pt-2 text-sm" aria-label="Pages">
          {data.page > 1 && <Link prefetch={false} className="underline" href={`/dashboard/tasks?${new URLSearchParams({ view: data.view, status: data.status, page: String(data.page - 1) })}`}>Newer</Link>}
          {data.more && <Link prefetch={false} className="underline" href={`/dashboard/tasks?${new URLSearchParams({ view: data.view, status: data.status, page: String(data.page + 1) })}`}>More tasks</Link>}
        </nav>
      )}
    </div>
  );
}
