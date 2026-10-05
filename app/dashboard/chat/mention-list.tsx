"use client";

import { AtSign } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { EVERYONE } from "@/lib/chat/mentions";
import type { MentionCandidate } from "./use-mentions";

/**
 * The people matching an "@" being typed, above the message box (at most 40% of the screen, so
 * it fits above a phone's keyboard). Choosing keeps the focus in the box.
 */
export function MentionList({ id, matches, active, onHover, onChoose, className }: {
  id: string;
  matches: MentionCandidate[];
  active: number;
  onHover: (i: number) => void;
  onChoose: (c: MentionCandidate) => void;
  className?: string;
}) {
  if (!matches.length) return null;
  return (
    <ul id={id} role="listbox" aria-label="People to mention"
      className={cn("absolute inset-x-0 bottom-full z-30 mb-2 max-h-[40vh] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1", className)}>
      {matches.map((c, i) => (
        <li key={c.u} id={`${id}-${i}`} role="option" aria-selected={i === active}
          onPointerDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onChoose(c)}
          className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
          {c.u === EVERYONE
            ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><AtSign className="h-4 w-4" aria-hidden /></span>
            : <PersonAvatar name={c.name} url={c.avatarUrl ?? null} size="sm" />}
          <span className="min-w-0">
            <span className="block truncate font-medium">{c.u === EVERYONE ? "@everyone" : c.name}</span>
            {c.hint && <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
