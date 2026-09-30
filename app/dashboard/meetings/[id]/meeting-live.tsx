"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CalendarPlus, Check, CheckCircle2, CircleHelp, Download, ListChecks, Loader2, Plus, Trash2, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { useLive } from "@/lib/api/live-client";
import { googleCalendarUrl } from "@/lib/ics";
import { dhakaDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { actionItemsAction, agendaAction, attendanceAction, loadMeetingAction, rsvpAction, type MeetingDetail } from "../actions";

type Response = "YES" | "MAYBE" | "NO";
const RSVP: Array<{ r: Response; label: string; icon: typeof Check; tone: string }> = [
  { r: "YES", label: "Going", icon: CheckCircle2, tone: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { r: "MAYBE", label: "Maybe", icon: CircleHelp, tone: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { r: "NO", label: "Not going", icon: XCircle, tone: "border-destructive bg-destructive/10 text-destructive" },
];

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "in 25 min", "in 3 h", "tomorrow"… or "now" while it runs. */
export function startsIn(starts: string, ends: string | null, now: number): string | null {
  const s = new Date(starts).getTime();
  const e = ends ? new Date(ends).getTime() : s + 3 * 3600_000;
  if (now >= s && now < e) return "Happening now";
  if (now >= e) return null;
  const min = Math.round((s - now) / 60_000);
  if (min < 60) return `Starts in ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Starts in ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

/**
 * The live parts of a meeting page: replies with a running tally, joining and adding it to a
 * calendar, the agenda, who came, and action items that become tasks. Saves without reloading;
 * others' replies and changes arrive live.
 */
export function MeetingLive({ initial, meId }: { initial: MeetingDetail; meId: string }) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [agenda, setAgenda] = useState(initial.agenda.map((a) => ({ title: a.title, notes: a.notes ?? "", ownerUserId: a.owner_user_id ?? "" })));
  const [attended, setAttended] = useState<Set<string>>(() => new Set(initial.participants.filter((p) => p.attended).map((p) => p.user_id)));
  const [actions, setActions] = useState<Array<{ title: string; assigneeUserId: string; dueAt: string }>>([{ title: "", assigneeUserId: "", dueAt: "" }]);
  const now = useNow();
  const m = d.meeting;

  const say = (text: string, error = false) => {
    setNote({ text, error });
    window.setTimeout(() => setNote((n) => (n?.text === text ? null : n)), error ? 7000 : 4000);
  };
  const reload = useCallback(async () => {
    const r = await loadMeetingAction(m.id).catch(() => null);
    if (r?.ok) setD(r.data);
  }, [m.id]);
  useLive("meeting", (ev) => ev.id === m.id && void reload());
  useLive("task", () => void reload());
  useLive("resync", () => void reload());

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(key);
    const r: { ok: boolean; error?: string; message?: string } = await fn().catch(() => ({ ok: false, error: "Couldn't save. Check your connection and try again." }));
    setBusy(null);
    if (!r.ok) say(r.error ?? "Couldn't save.", true);
    else {
      if (r.message) say(r.message);
      await reload();
    }
    return r.ok;
  };

  async function rsvp(r: Response) {
    if (m.my_response === r) return;
    const before = m.my_response;
    // Shown at once, tally included.
    setD((x) => {
      const delta = (k: Response) => (r === k ? 1 : 0) - (before === k ? 1 : 0);
      return { ...x, meeting: { ...x.meeting, my_response: r, going: x.meeting.going + delta("YES"), maybe: x.meeting.maybe + delta("MAYBE"), declined: x.meeting.declined + delta("NO") },
        participants: x.participants.map((p) => (p.user_id === meId ? { ...p, response: r } : p)) };
    });
    await run(`rsvp:${r}`, () => rsvpAction(m.id, r));
  }

  const scheduled = m.status === "SCHEDULED";
  const started = new Date(m.starts_at).getTime() - 15 * 60_000 <= now;
  const soon = startsIn(m.starts_at, m.ends_at, now);
  const link = m.meet_url ?? m.join_url;
  const joinable = scheduled && link && !m.over && new Date(m.starts_at).getTime() - 10 * 60_000 <= now;
  const invited = d.participants.some((p) => p.user_id === meId) && m.created_by !== meId;
  const calendarItem = { uid: `${m.id}@gucc`, title: m.title, start: m.starts_at, end: m.ends_at, location: m.location ?? link, description: m.agenda };
  const people = d.participants.map((p) => ({ id: p.user_id, name: p.name ?? "Member" }));

  return (
    <div className="space-y-6">
      {note && <p role={note.error ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", note.error ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40")}>{note.text}</p>}

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Taking part">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={m.status} />
          {scheduled && soon && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", soon === "Happening now" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary")}>{soon}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            {joinable && <a href={link!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Video className="h-4 w-4" aria-hidden />Join now</a>}
            {scheduled && !m.over && (
              <>
                <a href={googleCalendarUrl(calendarItem)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><CalendarPlus className="h-4 w-4" aria-hidden />Google Calendar</a>
                <a href={`/api/ics/meeting/${m.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><Download className="h-4 w-4" aria-hidden />.ics</a>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {RSVP.map(({ r, label }) => (
            <div key={r} className="rounded-lg bg-muted/50 p-2">
              <p className="text-xl font-semibold tabular-nums">{r === "YES" ? m.going : r === "MAYBE" ? m.maybe : m.declined}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {invited && scheduled && !m.over && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Will you come?</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your reply">
              {RSVP.map(({ r, label, icon: Icon, tone }) => (
                <button key={r} type="button" aria-pressed={m.my_response === r} disabled={Boolean(busy)} onClick={() => void rsvp(r)}
                  className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors", m.my_response === r ? tone : "hover:bg-muted")}>
                  {busy === `rsvp:${r}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}{label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="agenda-h">
        <h2 id="agenda-h" className="mb-3 font-semibold">Agenda</h2>
        {!d.role.canEdit ? (
          d.agenda.length === 0 ? <p className="text-sm text-muted-foreground">{m.agenda || "No agenda yet."}</p> : (
            <ol className="space-y-2">
              {d.agenda.map((a, i) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{i + 1}. {a.title}{a.owner && <span className="font-normal text-muted-foreground"> · {a.owner}</span>}</p>
                  {a.notes && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.notes}</p>}
                </li>
              ))}
            </ol>
          )
        ) : (
          <div className="space-y-2">
            {m.agenda && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.agenda}</p>}
            {agenda.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <input aria-label={`Item ${i + 1}`} value={a.title} maxLength={200} placeholder={`Item ${i + 1}`} onChange={(e) => setAgenda((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="h-10 rounded-md border bg-background px-3 text-base md:text-sm" />
                <select aria-label="Who leads it" value={a.ownerUserId} onChange={(e) => setAgenda((l) => l.map((x, j) => (j === i ? { ...x, ownerUserId: e.target.value } : x)))} className="h-10 rounded-md border bg-background px-2 text-base md:text-sm">
                  <option value="">Anyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="flex gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => setAgenda((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })} className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Move down" disabled={i === agenda.length - 1} onClick={() => setAgenda((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; })} className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" aria-label="Remove item" onClick={() => setAgenda((l) => l.filter((_, j) => j !== i))} className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                <textarea aria-label={`Notes for item ${i + 1}`} value={a.notes} maxLength={5000} rows={2} placeholder="Notes and what was decided" onChange={(e) => setAgenda((l) => l.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                  className="rounded-md border bg-background px-3 py-2 text-base sm:col-span-3 md:text-sm" />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-10 gap-1.5" onClick={() => setAgenda((l) => [...l, { title: "", notes: "", ownerUserId: "" }])} disabled={agenda.length >= 30}><Plus className="h-4 w-4" aria-hidden />Add item</Button>
              <Button type="button" className="min-h-10" disabled={busy === "agenda"} onClick={() => void run("agenda", () => agendaAction(m.id, agenda.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), notes: a.notes.trim() || null, ownerUserId: a.ownerUserId || null }))))}>
                {busy === "agenda" ? "Saving…" : "Save agenda"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {d.role.canEdit && m.status !== "CANCELLED" && started && (
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="attend-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="attend-h" className="font-semibold">Who came</h2>
            <span className="text-sm text-muted-foreground">{attended.size} of {d.participants.length}</span>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {d.participants.map((p) => (
              <li key={p.user_id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-muted/60">
                  <input type="checkbox" checked={attended.has(p.user_id)} onChange={(e) => setAttended((s) => { const n = new Set(s); if (e.target.checked) n.add(p.user_id); else n.delete(p.user_id); return n; })} className="h-5 w-5 rounded accent-primary" />
                  <PersonAvatar name={p.name} url={p.avatarUrl} size="xs" /><span className="truncate text-sm">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-3 min-h-10" disabled={busy === "attend"} onClick={() => void run("attend", () => attendanceAction(m.id, [...attended]))}>{busy === "attend" ? "Saving…" : "Save attendance"}</Button>
        </section>
      )}

      {d.canAssign && m.status !== "CANCELLED" && (
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="actions-h">
          <h2 id="actions-h" className="mb-1 flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4" aria-hidden />Action items</h2>
          <p className="mb-3 text-sm text-muted-foreground">Each becomes a task for the person you choose, linked to this meeting.</p>
          {d.tasks.length > 0 && (
            <ul className="mb-3 divide-y rounded-lg border">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <a href={`/dashboard/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</a>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">{t.assignee}{t.due_at ? ` · due ${dhakaDate(t.due_at)}` : ""}<StatusBadge status={t.status} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_auto]">
                <input aria-label="Action" value={a.title} maxLength={200} placeholder="What needs doing" onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-10 rounded-md border bg-background px-3 text-base md:text-sm" />
                <select aria-label="Who" value={a.assigneeUserId} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { ...x, assigneeUserId: e.target.value } : x)))} className="h-10 rounded-md border bg-background px-2 text-base md:text-sm">
                  <option value="">Who?</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input aria-label="Due" type="date" value={a.dueAt} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? { ...x, dueAt: e.target.value } : x)))} className="h-10 rounded-md border bg-background px-2 text-base md:text-sm" />
                <button type="button" aria-label="Remove" onClick={() => setActions((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : [{ title: "", assigneeUserId: "", dueAt: "" }]))} className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-10 gap-1.5" onClick={() => setActions((l) => [...l, { title: "", assigneeUserId: "", dueAt: "" }])} disabled={actions.length >= 20}><Plus className="h-4 w-4" aria-hidden />Another</Button>
              <Button type="button" className="min-h-10" disabled={busy === "actions" || !actions.some((a) => a.title.trim() && a.assigneeUserId)}
                onClick={async () => { if (await run("actions", () => actionItemsAction(m.id, actions.filter((a) => a.title.trim() && a.assigneeUserId).map((a) => ({ ...a, title: a.title.trim(), dueAt: a.dueAt || undefined }))))) setActions([{ title: "", assigneeUserId: "", dueAt: "" }]); }}>
                {busy === "actions" ? "Creating…" : "Create tasks"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
