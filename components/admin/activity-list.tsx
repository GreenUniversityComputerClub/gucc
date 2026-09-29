import Link from "next/link";
import type { ActivityEntry } from "@/lib/server/services/activity";
import { PersonAvatar } from "@/components/person-avatar";

const AREA_STYLE: Record<string, string> = {
  Members: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Security: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Content: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  Events: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Executives: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Governance: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  Media: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  Recruitment: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  Services: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  "Tasks & meetings": "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
};
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });

/** The activity timeline: grouped by day, one sentence per change, details on demand. */
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  const days: Array<{ day: string; items: ActivityEntry[] }> = [];
  for (const e of entries) {
    const d = dayOf(e.at);
    if (days.at(-1)?.day !== d) days.push({ day: d, items: [] });
    days.at(-1)!.items.push(e);
  }
  return (
    <div className="space-y-6">
      {days.map(({ day, items }) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{day}</h3>
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <PersonAvatar name={e.actor.name} url={e.actor.avatarUrl ?? null} size="xs" className="mt-px" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{e.actor.name}</span> {e.verb}
                      {e.showTarget && e.target && <> {e.target.link ? <Link prefetch={false} href={e.target.link} className="underline underline-offset-2">{e.target.name}</Link> : e.target.name}</>}
                      {e.reason && <span className="text-muted-foreground"> · “{e.reason}”</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 ${AREA_STYLE[e.area] ?? "bg-muted"}`}>{e.area}</span>
                      <time dateTime={e.at} className="tabular-nums text-muted-foreground">{timeOf(e.at)}</time>
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                    {e.changes.length > 0 ? (
                      <table className="w-full table-fixed">
                        <thead className="text-left text-muted-foreground"><tr><th className="w-1/4 pb-1 font-medium">What</th><th className="pb-1 font-medium">Before</th><th className="pb-1 font-medium">After</th></tr></thead>
                        <tbody>
                          {e.changes.map((c) => (
                            <tr key={c.field} className="align-top">
                              <td className="py-0.5 pr-2 text-muted-foreground">{c.field}</td>
                              <td className="break-words py-0.5 pr-2 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300">{c.before}</td>
                              <td className="break-words py-0.5 text-emerald-700 dark:text-emerald-300">{c.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <p className="text-muted-foreground">No field changes recorded.</p>}
                    {e.decision && <p><span className="text-muted-foreground">Decision:</span> {e.decision}</p>}
                    <p className="font-mono text-muted-foreground">{e.action}{e.requestId ? ` · request ${e.requestId.slice(0, 8)}` : ""}</p>
                    {e.requestId && <Link prefetch={false} href={`/dashboard/activity?request=${encodeURIComponent(e.requestId)}`} className="underline">Everything done in this step</Link>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
