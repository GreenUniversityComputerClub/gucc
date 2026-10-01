import { cn } from "@/lib/utils";

/** A person's status line: "Active now" stands out in green with a dot; older times stay quiet. */
export function ActiveStatus({ label, className }: { label: string | null | undefined; className?: string }) {
  if (!label) return null;
  if (label !== "Active now") return <span className={className}>{label}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400", className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
      Active now
    </span>
  );
}
