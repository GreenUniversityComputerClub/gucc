"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchPeopleAction, searchRecipientsAction } from "@/app/dashboard/search-actions";
import type { PersonRow } from "@/lib/server/services/people";
import { cn } from "@/lib/utils";

export type PickedPerson = Pick<PersonRow, "id" | "full_name" | "student_id" | "user_id" | "email" | "person_type" | "roles_held">;

/**
 * Accessible typeahead over people (name, student ID or email). Writes the
 * chosen profile id (or user id with `valueKind="user"`) into a hidden input
 * named `name`, so it works inside any server-action form.
 */
export function PersonPicker({
  name,
  label,
  valueKind = "profile",
  withAccount = false,
  placeholder = "Search by name, student ID or email",
  hint,
  onChange,
  required,
  initial,
  source = "people",
}: {
  /** Hidden input name; omit when using onChange only. */
  name?: string;
  label: string;
  valueKind?: "profile" | "user";
  withAccount?: boolean;
  placeholder?: string;
  hint?: string;
  onChange?: (p: PickedPerson | null) => void;
  required?: boolean;
  /** Pre-selected person (e.g. an existing coordinator). */
  initial?: PickedPerson | null;
  /** "recipients": members you may message (for anyone approved), instead of the admin people search. */
  source?: "people" | "recipients";
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PersonRow[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<PickedPerson | null>(initial ?? null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => start(async () => setResults(source === "recipients" ? await searchRecipientsAction(q) : await searchPeopleAction(q, withAccount || valueKind === "user"))), 250);
  }, [q, withAccount, valueKind, source]);

  const choose = (p: PersonRow | null) => {
    setPicked(p);
    setOpen(false);
    setQ("");
    onChange?.(p);
  };
  const value = picked ? (valueKind === "user" ? picked.user_id ?? "" : picked.id) : "";

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</label>
      {name && <input type="hidden" name={name} value={value} />}
      {picked ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{picked.full_name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {(source === "recipients" ? [picked.roles_held] : [picked.student_id, picked.email ?? (picked.user_id ? "has account" : "no account"), picked.roles_held]).filter(Boolean).join(" · ")}
            </span>
          </span>
          <button type="button" onClick={() => choose(null)} className="shrink-0 rounded px-2 py-1 text-xs underline hover:bg-muted">Change</button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
            value={q}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active]); }
              else if (e.key === "Escape") setOpen(false);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {open && (q.trim().length >= 2) && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-lg">
              {pending && results.length === 0 && <li className="px-3 py-2 text-muted-foreground">Searching…</li>}
              {!pending && results.length === 0 && <li className="px-3 py-2 text-muted-foreground">{source === "recipients" ? "No member found who accepts messages from you." : `No one found${valueKind === "user" || withAccount ? " with an account" : ""}.`}</li>}
              {results.map((p, i) => {
                const disabled = valueKind === "user" && !p.user_id;
                return (
                  <li
                    key={p.id}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={disabled}
                    onMouseDown={(e) => { e.preventDefault(); if (!disabled) choose(p); }}
                    onMouseEnter={() => setActive(i)}
                    className={cn("cursor-pointer rounded px-3 py-2", i === active && "bg-muted", disabled && "cursor-not-allowed opacity-50")}
                  >
                    <span className="font-medium">{p.full_name}</span>
                    {p.person_type === "FACULTY" && <span className="ml-1 text-xs text-muted-foreground">(faculty)</span>}
                    <span className="block truncate text-xs text-muted-foreground">
                      {(source === "recipients" ? [p.roles_held] : [p.student_id, p.email ?? (p.user_id ? "has account" : "no account yet"), p.roles_held]).filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
