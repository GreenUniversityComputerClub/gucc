"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agendaAction } from "./event-tools";

type Item = { title: string; speaker: string; description: string; startsAt: string; endsAt: string };
/** datetime-local value in Dhaka time. */
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

/** The programme on the public event page: sessions in order, each with an optional time and speaker. */
export function AgendaEditor({ eventId, initial }: { eventId: string; initial: Array<{ starts_at: string | null; ends_at: string | null; title: string; speaker: string | null; description: string | null }> }) {
  const [items, setItems] = useState<Item[]>(initial.map((a) => ({ title: a.title, speaker: a.speaker ?? "", description: a.description ?? "", startsAt: local(a.starts_at), endsAt: local(a.ends_at) })));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Item>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });
  const input = "h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm";
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No programme yet. Add sessions, talks or breaks in the order they happen.</p>}
      {items.map((it, i) => (
        <fieldset key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <legend className="sr-only">Session {i + 1}</legend>
          <input aria-label="Title" placeholder={`Session ${i + 1} title`} value={it.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} className={input} />
          <input aria-label="Speaker" placeholder="Speaker (optional)" value={it.speaker} maxLength={200} onChange={(e) => set(i, { speaker: e.target.value })} className={input} />
          <label className="grid gap-1 text-xs text-muted-foreground">Starts (Dhaka time)<input type="datetime-local" value={it.startsAt} onChange={(e) => set(i, { startsAt: e.target.value })} className={input} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Ends<input type="datetime-local" value={it.endsAt} onChange={(e) => set(i, { endsAt: e.target.value })} className={input} /></label>
          <textarea aria-label="Description" placeholder="Short description (optional)" value={it.description} maxLength={2000} rows={2} onChange={(e) => set(i, { description: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-base sm:col-span-2 md:text-sm" />
          <div className="flex gap-1 sm:col-span-2">
            <Button type="button" variant="outline" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" size="icon" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-1.5" disabled={items.length >= 50} onClick={() => setItems((l) => [...l, { title: "", speaker: "", description: "", startsAt: "", endsAt: "" }])}><Plus className="h-4 w-4" aria-hidden />Add session</Button>
        <Button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await agendaAction(eventId, items.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), speaker: x.speaker || undefined, description: x.description || undefined, startsAt: x.startsAt || undefined, endsAt: x.endsAt || undefined }))).catch(() => null);
          setBusy(false);
          setNote(r?.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r && !r.ok ? r.error : "Couldn't save. Check your connection." });
        }}>{busy ? "Saving…" : "Save programme"}</Button>
      </div>
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>{note.text}</p>}
    </div>
  );
}
