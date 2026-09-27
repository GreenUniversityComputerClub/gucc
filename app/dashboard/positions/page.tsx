import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { positionsOverview } from "@/lib/server/views/governance";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { levelLabel } from "@/lib/governance/levels";
import { cn } from "@/lib/utils";

type Positions = Awaited<ReturnType<typeof positionsOverview>>;

export default async function PositionsPage() {
  const session = await requireAdmin("/dashboard/positions");
  const positions = await view<Positions>("views.positions", {}, "/dashboard/positions");
  const mayCreate = Boolean(session.caps["positions.create"]);
  const manage = (id: string) => `/dashboard/positions/${encodeURIComponent(id)}`;

  return (
    <>
      <PageHeader
        title="Positions"
        description="The club's structure, from the Moderator down. Whoever holds a position in GUCC's current committee gets its access; affiliated committees such as CSS don't."
        actions={mayCreate ? <Link prefetch={false} href="/dashboard/positions/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90">New position</Link> : undefined}
      />
      {positions.length === 0 ? <EmptyState>No positions yet.</EmptyState> : (
        <>
          {/* Phones: cards. */}
          <ul className="space-y-2 md:hidden">
            {positions.map((p) => (
              <li key={p.id}>
                <Link prefetch={false} href={manage(p.id)} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                  <span className="min-w-0">
                    <span className={cn("block truncate font-medium", !p.is_active && "text-muted-foreground line-through")}>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{levelLabel(p.governance_level)} · {p.holders} holder{p.holders === 1 ? "" : "s"}</span>
                  </span>
                  <span className="shrink-0 text-sm text-primary">Manage</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* Larger screens: a table. */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Positions</caption>
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Position</th>
                  <th scope="col" className="px-4 py-2 font-medium">Level</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Current holders</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Access</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Manage</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <span className={cn("font-medium", !p.is_active && "text-muted-foreground line-through")}>{p.name}</span>
                      {p.is_protected ? <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">protected</span> : null}
                      {p.parent_name && <span className="block text-xs text-muted-foreground">reports to {p.parent_name}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{levelLabel(p.governance_level)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.holders}{p.max_holders ? <span className="text-muted-foreground"> / {p.max_holders}</span> : null}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{p.key === "moderator" ? "via Moderator role" : `${p.permissions} permission${p.permissions === 1 ? "" : "s"}`}</td>
                    <td className="px-4 py-2.5 text-right"><Link prefetch={false} href={manage(p.id)} className="rounded-md border px-3 py-1 hover:bg-muted">Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
