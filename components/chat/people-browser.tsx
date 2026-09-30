"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { activeLabel, usePresence } from "@/lib/api/presence";
import { cn } from "@/lib/utils";
import type { DirectoryPerson } from "@/lib/server/services/messaging";

type Filter = "all" | "active" | "leader" | "executive" | "faculty" | "member";
const FILTERS: Array<[Filter, string]> = [["all", "Everyone"], ["active", "Active now"], ["leader", "Leaders"], ["executive", "Executives"], ["faculty", "Faculty"], ["member", "Members"]];

/**
 * Browse and choose people from the directory: search by name, position, department or batch,
 * narrow to who is active now or to leaders, executives, faculty or members, then pick one (a
 * message) or several (a group). Works with the keyboard (arrows, Enter or Space) and never asks
 * the server while you type.
 */
export function PeopleBrowser({ people, multi, selected, onToggle, exclude = [], disabled, autoFocus }: {
  people: DirectoryPerson[];
  multi?: boolean;
  selected: string[];
  onToggle: (p: DirectoryPerson) => void;
  exclude?: string[];
  disabled?: (p: DirectoryPerson) => string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState(0);
  const online = usePresence();
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return people
      .filter((p) => !exclude.includes(p.user_id))
      .filter((p) => filter === "all" || (filter === "active" ? online(p.user_id) : p.badge.tier === filter))
      .filter((p) => {
        if (!words.length) return true;
        const hay = `${p.full_name} ${p.badge.label} ${p.department ?? ""} ${p.batch ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      // Active people first, then by seniority, then by name.
      .sort((a, b) => Number(online(b.user_id)) - Number(online(a.user_id)) || (q ? 0 : a.badge.rank - b.badge.rank) || a.full_name.localeCompare(b.full_name));
  }, [people, exclude, filter, q, online]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, active: 0, leader: 0, executive: 0, faculty: 0, member: 0 };
    for (const p of people) {
      if (exclude.includes(p.user_id)) continue;
      c.all++;
      c[p.badge.tier]++;
      if (online(p.user_id)) c.active++;
    }
    return c;
  }, [people, exclude, online]);

  useEffect(() => setActive(0), [q, filter]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} type="search" enterKeyHint="search" placeholder="Search by name, position, department or batch"
          role="combobox" aria-expanded aria-controls={`${id}-list`} aria-activedescendant={shown[active] ? `${id}-${shown[active]!.user_id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && shown[active]) { e.preventDefault(); if (!disabled?.(shown[active]!)) onToggle(shown[active]!); }
          }}
          className="h-11 w-full rounded-full border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
      </label>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Show">
        {FILTERS.filter(([f]) => f === "all" || counts[f] > 0).map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs transition-colors", filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {f === "active" && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />}{label} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      <ul ref={list} id={`${id}-list`} role="listbox" aria-multiselectable={multi || undefined} aria-label="People" className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {shown.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{people.length ? "No one matches." : "No one to show yet."}</li>}
        {shown.map((p, i) => {
          const on = selected.includes(p.user_id);
          const why = disabled?.(p) ?? null;
          const status = activeLabel(online(p.user_id), p.lastActiveAt);
          return (
            <li key={p.user_id} id={`${id}-${p.user_id}`} data-index={i} role="option" aria-selected={on} aria-disabled={Boolean(why) || undefined}
              onMouseEnter={() => setActive(i)} onClick={() => !why && onToggle(p)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors", i === active && "bg-muted", on && "bg-primary/10", why && "cursor-not-allowed opacity-50")}>
              <PersonAvatar name={p.full_name} url={p.avatarUrl} size="md" online={online(p.user_id)} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{p.full_name}</span>
                  <BadgePill badge={p.badge} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {why ?? ([status === "Active now" ? null : status, p.department, p.batch ? `Batch ${p.batch}` : null].filter(Boolean).join(" · ") || " ")}
                </span>
              </span>
              {multi && (
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")} aria-hidden>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
