"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { REACTIONS, groupReactions, type ReactionKey } from "@/lib/chat/reactions";
import type { Badge } from "@/lib/server/person-badge";
import { cn } from "@/lib/utils";

export interface ReactionPerson {
  name: string;
  avatarUrl: string | null;
  badge?: Badge | null;
}

/**
 * Who reacted to a message: everyone, or one emoji at a time (tabs with counts), with their photo
 * and club badge. Your own reaction can be removed from here. Stays current while open: the list
 * comes from the conversation, which live updates keep fresh.
 */
export function ReactionsDialog({ reactions, me, person, onRemoveMine, onClose }: {
  /** Null when closed. */
  reactions: Array<{ u: string; e: ReactionKey }> | null;
  me: string;
  person: (id: string) => ReactionPerson;
  onRemoveMine: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ReactionKey | "all">("all");
  const groups = useMemo(() => groupReactions(reactions ?? []), [reactions]);
  useEffect(() => {
    if (!reactions) setTab("all");
  }, [reactions]);
  // Nothing left on the tab (someone removed theirs): back to everyone.
  useEffect(() => {
    if (tab !== "all" && !groups.some((g) => g.e === tab)) setTab("all");
  }, [groups, tab]);
  // You first, then in the order people reacted.
  const rows = (reactions ?? []).filter((r) => tab === "all" || r.e === tab).sort((a, b) => Number(b.u === me) - Number(a.u === me));
  const total = reactions?.length ?? 0;

  return (
    <Dialog open={Boolean(reactions)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-3 p-0 sm:max-w-sm">
        <DialogHeader className="px-5 pt-5 text-left">
          <DialogTitle>Reactions</DialogTitle>
          <DialogDescription>{total} {total === 1 ? "person" : "people"} reacted to this message.</DialogDescription>
        </DialogHeader>
        {groups.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b px-4 pb-2 [scrollbar-width:none]" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}
              className={cn("inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium", tab === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              All {total}
            </button>
            {groups.map((g) => (
              <button key={g.e} type="button" role="tab" aria-selected={tab === g.e} aria-label={`${REACTIONS[g.e].label}: ${g.count}`} onClick={() => setTab(g.e)}
                className={cn("inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm", tab === g.e ? "bg-primary/15 font-semibold text-primary" : "hover:bg-muted")}>
                <span aria-hidden className="text-base leading-none">{REACTIONS[g.e].emoji}</span>{g.count}
              </button>
            ))}
          </div>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" role="list">
          {rows.map((r) => {
            const p = r.u === me ? { ...person(r.u), name: "You" } : person(r.u);
            return (
              <li key={r.u} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50">
                <span className="relative shrink-0">
                  <PersonAvatar name={p.name} url={p.avatarUrl} size="md" />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-background text-sm leading-none" aria-hidden>{REACTIONS[r.e].emoji}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  {r.u === me ? <span className="block text-xs text-muted-foreground">{REACTIONS[r.e].label}</span> : p.badge && p.badge.tier !== "member" ? <BadgePill badge={p.badge} /> : <span className="block text-xs text-muted-foreground">{REACTIONS[r.e].label}</span>}
                </span>
                {r.u === me && (
                  <button type="button" onClick={onRemoveMine} className="inline-flex min-h-9 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-destructive">
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
