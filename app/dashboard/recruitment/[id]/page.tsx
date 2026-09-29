import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listApplications, listCampaigns } from "@/lib/server/services/recruitment";
import type { listPositions } from "@/lib/server/services/governance";
import { ActionForm, EmptyState, PageHeader, Pager, StatusBadge } from "@/components/admin/ui";
import { saveCampaignAction } from "../../actions";
import { CampaignFields } from "../campaign-form";
import { ImportApplications } from "./import-applications";

const STATUSES = ["", "SUBMITTED", "SHORTLISTED", "INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"];

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/dashboard/recruitment");
  const { id } = await params;
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const [campaigns, positions, apps] = await Promise.all([
    view<Awaited<ReturnType<typeof listCampaigns>>>("recruitment.campaigns", {}, "/dashboard/recruitment"),
    view<Awaited<ReturnType<typeof listPositions>>>("positions.list", {}, "/dashboard/recruitment"),
    view<Awaited<ReturnType<typeof listApplications>>>("recruitment.applications", { campaignId: id, status: sp.status, positionId: sp.position, q: sp.q, page, mine: sp.mine === "1" }, `/dashboard/recruitment/${id}`),
  ]);
  const c = campaigns.find((x) => x.id === id);
  if (!c) return <EmptyState>Recruitment not found.</EmptyState>;
  const offered = positions.filter((p) => c.positionIds.includes(p.id));
  const total = Object.values(apps.counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/recruitment", label: "Recruitment" }}
        title={c.title}
        description={`${total} applications${c.isOpenNow ? " · accepting applications now" : ""}`}
        actions={<><StatusBadge status={c.status} /><a href={`/api/admin/recruitment/${id}/export`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Download CSV</a>{c.isOpenNow && <Link prefetch={false} href="/recruitment" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Public form</Link>}</>}
      />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link prefetch={false} key={s || "all"} href={`/dashboard/recruitment/${id}?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(sp.position ? { position: sp.position } : {}) })}`} className={`rounded-full border px-3 py-1 ${(sp.status ?? "") === s ? "bg-primary text-primary-foreground" : ""}`}>
            {s ? `${s.toLowerCase()} (${apps.counts[s] ?? 0})` : `All (${total})`}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, student ID or email" aria-label="Search applications" className="h-10 md:h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:text-sm sm:min-w-56" />
        <select name="position" defaultValue={sp.position ?? ""} aria-label="Position" className="h-10 md:h-9 rounded-md border bg-background px-3 text-base md:text-sm">
          <option value="">All positions</option>
          {offered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Assigned to me</label>
        <button className="h-9 rounded-md border px-4 text-sm">Filter</button>
      </form>
      {apps.rows.length === 0 ? <EmptyState>No applications match.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {apps.rows.map((a) => (
            <li key={a.id}>
              <Link prefetch={false} href={`/dashboard/recruitment/applications/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="font-medium">{a.full_name}</span> <span className="text-sm text-muted-foreground">· {a.position_name}</span>
                  <span className="block text-xs text-muted-foreground">{a.student_id} · {a.semester ?? "—"} semester · CGPA {a.cgpa ?? "—"} · {a.completed_credit ?? "—"} credits{a.assigned_name ? ` · reviewer: ${a.assigned_name}` : ""}</span>
                </span>
                <StatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={apps.hasMore} base={`/dashboard/recruitment/${id}`} params={{ status: sp.status, position: sp.position, q: sp.q, mine: sp.mine }} />
      <details className="mt-6 rounded-xl border bg-card p-5">
        <summary className="cursor-pointer font-medium">Import applications from a spreadsheet</summary>
        <div className="mt-4"><ImportApplications campaignId={id} positions={offered.map((p) => p.name)} /></div>
      </details>
      <details className="mt-6 rounded-xl border bg-card p-5">
        <summary className="cursor-pointer font-medium">Edit recruitment</summary>
        <div className="mt-4">
          <ActionForm action={saveCampaignAction.bind(null, id)} submitLabel="Save">
            <CampaignFields c={c as unknown as Record<string, unknown> & { positionIds: string[] }} positions={positions} />
          </ActionForm>
        </div>
      </details>
    </>
  );
}
