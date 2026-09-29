"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search, Undo2, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/admin/ui";
import { dhakaDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { registrationStatusAction } from "../../actions";

type Status = "REGISTERED" | "WAITLISTED" | "CANCELLED" | "ATTENDED" | "REJECTED";
export interface Registration { id: string; name: string; email: string; student_id: string | null; status: string; created_at: string }

const PAGE = 50;
const FILTERS: Array<[string, string]> = [["", "All"], ["REGISTERED", "Registered"], ["ATTENDED", "Attended"], ["WAITLISTED", "Waitlist"], ["CANCELLED", "Cancelled"]];
const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * Check-in at the door: search by name, email or student ID; one tap to mark someone attended
 * (and undo it); admit from the waitlist; cancel with a confirmation. Updates in place.
 */
export function Registrations({ initial }: { initial: Registration[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => (!filter || r.status === filter) && (!n || r.name.toLowerCase().includes(n) || r.email.toLowerCase().includes(n) || (r.student_id ?? "").includes(n)));
  }, [rows, q, filter]);

  const set = (r: Registration, status: Status) => {
    setBusy(r.id);
    start(async () => {
      const res = await registrationStatusAction(r.id, status, new FormData()).catch(() => null);
      setBusy(null);
      if (res?.ok) {
        setRows((all) => all.map((x) => (x.id === r.id ? { ...x, status } : x)));
        setNote({ text: status === "ATTENDED" ? `${r.name} checked in.` : status === "REGISTERED" ? `${r.name} is registered.` : `${r.name}'s registration was cancelled.` });
      } else setNote({ text: res && !res.ok ? res.error : "Couldn't save. Check your connection and try again.", error: true });
    });
  };

  return (
    <div>
      {confirmDialog}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Find a registration</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Name, email or student ID"
            className="h-11 w-full rounded-md border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setShown(PAGE); }}
              className={cn("min-h-9 rounded-full border px-3 text-xs", filter === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {label}{v ? ` (${counts[v] ?? 0})` : ` (${rows.length})`}
            </button>
          ))}
        </div>
      </div>
      {note && <p role={note.error ? "alert" : "status"} className={cn("mb-2 text-sm", note.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>{note.text}</p>}
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? "No registrations yet." : "No one matches."}</p>
      ) : (
        <ul className="divide-y text-sm">
          {list.slice(0, shown).map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{r.name} <StatusBadge status={r.status} /></p>
                <p className="truncate text-xs text-muted-foreground">{[r.email, r.student_id, `registered ${dhakaDateTime(r.created_at)}`].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(r.status === "REGISTERED" || r.status === "WAITLISTED") && (
                  <button type="button" className={cn(btn, "border-emerald-500/50")} disabled={busy === r.id} onClick={() => set(r, "ATTENDED")}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />Check in
                  </button>
                )}
                {r.status === "ATTENDED" && (
                  <button type="button" className={btn} disabled={busy === r.id} onClick={() => set(r, "REGISTERED")}>
                    <Undo2 className="h-4 w-4" aria-hidden />Undo check-in
                  </button>
                )}
                {r.status === "WAITLISTED" && (
                  <button type="button" className={btn} disabled={busy === r.id} onClick={() => set(r, "REGISTERED")}>
                    <UserPlus className="h-4 w-4" aria-hidden />Admit
                  </button>
                )}
                {r.status !== "CANCELLED" && r.status !== "ATTENDED" && (
                  <button type="button" className={btn} disabled={busy === r.id} onClick={async () => {
                    if (await confirm({ title: `Cancel ${r.name}'s registration?`, description: r.status === "REGISTERED" ? "Their seat goes to the first person on the waitlist, who is told." : undefined, confirmLabel: "Cancel registration", cancelLabel: "Keep it", destructive: true })) set(r, "CANCELLED");
                  }}>
                    <XCircle className="h-4 w-4" aria-hidden />Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown && (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</Button>
        </div>
      )}
    </div>
  );
}
