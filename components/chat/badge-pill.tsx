import { cn } from "@/lib/utils";
import type { Badge } from "@/lib/server/person-badge";

const TIER = {
  leader: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  executive: "border-primary/30 bg-primary/10 text-primary dark:text-emerald-300",
  faculty: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  member: "border-border bg-muted text-muted-foreground",
} as const;

/** What someone is in the club ("President", "General Secretary", "Faculty", "Member"), as a small pill. */
export function BadgePill({ badge, className }: { badge: Badge | null | undefined; className?: string }) {
  if (!badge) return null;
  return (
    <span className={cn("inline-flex max-w-full shrink-0 items-center truncate rounded-full border px-1.5 py-px text-[10px] font-medium leading-4", TIER[badge.tier], className)} title={badge.label}>
      {badge.label}
    </span>
  );
}
