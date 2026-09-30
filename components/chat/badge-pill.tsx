import { cn } from "@/lib/utils";
import type { Badge } from "@/lib/server/person-badge";

const TIER = {
  leader: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  executive: "border-primary/30 bg-primary/10 text-primary dark:text-emerald-300",
  former: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  faculty: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  member: "border-border bg-muted text-muted-foreground",
} as const;

/** What someone is in the club, short (a position's initials and year, "Faculty", "Member"), with the full title on hover. */
export function BadgePill({ badge, className }: { badge: Badge | null | undefined; className?: string }) {
  if (!badge) return null;
  return (
    <span className={cn("inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-1.5 py-px text-[10px] font-medium leading-4", TIER[badge.tier], className)} title={badge.label} aria-label={badge.label}>
      {badge.short ?? badge.label}
    </span>
  );
}
