import { cn } from "@/lib/utils";

const CHIP: Record<string, [string, string]> = {
  QUEUED: ["Waiting to start", "bg-sky-500/15 text-sky-700 dark:text-sky-300"],
  SENDING: ["Sending", "bg-amber-500/15 text-amber-700 dark:text-amber-300"],
  PAUSED: ["Paused", "bg-slate-500/15 text-slate-700 dark:text-slate-300"],
  DONE: ["Sent", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"],
  CANCELLED: ["Cancelled", "bg-rose-500/15 text-rose-700 dark:text-rose-300"],
};

export function CampaignStatusChip({ status }: { status: string }) {
  const [label, cls] = CHIP[status] ?? [status.toLowerCase(), "bg-muted text-muted-foreground"];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

/** Sent, failed and skipped out of everyone, as one bar. */
export function Progress({ c, className }: { c: { total: number; sent: number; failed: number; skipped: number }; className?: string }) {
  const pct = (n: number) => (c.total ? (n / c.total) * 100 : 0);
  const done = c.sent + c.failed + c.skipped;
  return (
    <div className={className}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={done} aria-label={`${done} of ${c.total} handled`}>
        <span className="bg-emerald-500" style={{ width: `${pct(c.sent)}%` }} />
        <span className="bg-rose-500" style={{ width: `${pct(c.failed)}%` }} />
        <span className="bg-slate-400" style={{ width: `${pct(c.skipped)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{c.sent.toLocaleString("en-US")}</span> sent of {c.total.toLocaleString("en-US")}
        {c.failed ? ` · ${c.failed} failed` : ""}{c.skipped ? ` · ${c.skipped} skipped (unsubscribed)` : ""}
      </p>
    </div>
  );
}
