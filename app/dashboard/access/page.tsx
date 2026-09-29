import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { requireAdmin, view } from "@/lib/api/session";
import type { accessMatrix } from "@/lib/server/services/access";
import { PageHeader, Section } from "@/components/admin/ui";

type Matrix = Awaited<ReturnType<typeof accessMatrix>>;

const LABELS: Record<string, string> = {
  "members.approve": "Approve members",
  "executives.assign": "Manage executives",
  "events.publish": "Publish events",
  "posts.publish": "Publish posts",
  "media.upload": "Upload media",
  "recruitment.manage": "Recruitment",
  "messages.read": "Contact inbox",
  "lostfound.moderate": "Lost & found",
  "roles.assign": "Give roles",
  "permissions.assign": "Grant permissions",
  "audit.read": "Activity log",
  "settings.manage": "Settings",
  "users.reset_password": "Reset passwords",
};

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/access");
  const sp = await searchParams;
  const data = await view<Matrix>("access.matrix", { q: sp.q }, "/dashboard/access");

  return (
    <>
      <PageHeader title="Who can do what" description="Everyone with management access and where it comes from (positions, roles and direct grants). Governance rules can still narrow or widen a decision; open a person to see the reasoning." />
      <form className="mb-4 flex gap-2" role="search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search people</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search by name or email" className="h-10 md:h-9 w-full rounded-md border bg-background px-3 text-base md:text-sm" />
        </label>
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Search</button>
      </form>
      <Section title={`${data.people.length} ${data.people.length === 1 ? "person" : "people"}`}>
        {data.people.length === 0 ? <p className="text-sm text-muted-foreground">No one matches.</p> : (
          <>
            {/* Phones: one card per person. */}
            <ul className="space-y-3 md:hidden">
              {data.people.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(p.id)}`} className="font-medium hover:underline">{p.name ?? p.email}</Link>
                  {p.moderator && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">Moderator</span>}
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {data.permissions.filter((k) => p.cells[k]).map((k) => (
                      <li key={k} className="rounded-full border px-2 py-0.5" title={p.cells[k]!.sources.join(", ")}>{LABELS[k] ?? k}{p.cells[k]!.level === "SCOPED" ? " (part)" : ""}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {/* Larger screens: the matrix. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Management permissions by person</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="sticky left-0 bg-card py-2 pr-3 font-medium">Person</th>
                    {data.permissions.map((k) => <th key={k} scope="col" className="px-1.5 py-2 text-center font-medium" title={k}>{LABELS[k] ?? k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <th scope="row" className="sticky left-0 bg-card py-2 pr-3 text-left font-normal">
                        <Link prefetch={false} href={`/dashboard/access/${encodeURIComponent(p.id)}`} className="font-medium hover:underline">{p.name ?? p.email}</Link>
                        {p.moderator && <span className="block text-xs text-amber-700 dark:text-amber-400">Moderator</span>}
                      </th>
                      {data.permissions.map((k) => {
                        const c = p.cells[k];
                        return (
                          <td key={k} className="px-1.5 py-2 text-center" title={c ? c.sources.join(", ") : "No"}>
                            {c ? (
                              c.level === "ALL"
                                ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label={`Yes: ${c.sources.join(", ")}`} />
                                : <span className="rounded bg-muted px-1 text-[11px]" aria-label={`Part: ${c.sources.join(", ")}`}>part</span>
                            ) : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="No" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
