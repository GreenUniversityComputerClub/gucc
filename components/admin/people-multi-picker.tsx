"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { searchPeopleAction } from "@/app/dashboard/search-actions";
import type { PersonRow } from "@/lib/server/services/people";

export type Chosen = { userId: string; name: string };

/**
 * Pick several people with accounts (e.g. meeting participants). Writes the chosen user ids,
 * comma-separated, into a hidden input named `name`.
 */
export function PeopleMultiPicker({ name, label, initial = [], hint }: { name: string; label: string; initial?: Chosen[]; hint?: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonRow[]>([]);
  const [chosen, setChosen] = useState<Chosen[]>(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => start(async () => setResults(await searchPeopleAction(q, true))), 250);
  }, [q]);

  const add = (p: PersonRow) => {
    if (p.user_id && !chosen.some((c) => c.userId === p.user_id)) setChosen([...chosen, { userId: p.user_id, name: p.full_name }]);
    setQ("");
    setResults([]);
  };
  const options = results.filter((r) => r.user_id && r.account_status === "ACTIVE" && !chosen.some((c) => c.userId === r.user_id));

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input type="hidden" name={name} value={chosen.map((c) => c.userId).join(",")} />
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen">
          {chosen.map((c) => (
            <li key={c.userId} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm">
              {c.name}
              <button type="button" onClick={() => setChosen(chosen.filter((x) => x.userId !== c.userId))} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${c.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or student ID" autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (options[0]) add(options[0]); } }}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" aria-describedby={hint ? `${id}-hint` : undefined} />
        {q.trim().length >= 2 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md" role="listbox">
            {pending && options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>}
            {!pending && options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No active members found.</li>}
            {options.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => add(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="font-medium">{p.full_name}</span>
                  <span className="block text-xs text-muted-foreground">{[p.student_id, p.roles_held].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
