import Link from "next/link";
import { requireAdmin, view } from "@/lib/api/session";
import type { listCampaigns } from "@/lib/server/services/recruitment";
import type { listPositions } from "@/lib/server/services/governance";
import { ActionForm, EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { saveCampaignAction } from "../actions";
import { CampaignFields } from "./campaign-form";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function RecruitmentAdmin() {
  await requireAdmin("/dashboard/recruitment");
  const [campaigns, positions] = await Promise.all([
    view<Awaited<ReturnType<typeof listCampaigns>>>("recruitment.campaigns", {}, "/dashboard/recruitment"),
    view<Awaited<ReturnType<typeof listPositions>>>("positions.list", {}, "/dashboard/recruitment"),
  ]);
  return (
    <>
      <PageHeader title="Recruitment" description="Executive recruitment runs here: applicants apply on /recruitment, documents are stored privately in Cloudflare R2, and only recruitment managers can see applications." />
      {campaigns.length === 0 ? <EmptyState>No recruitment yet. Create one below.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link prefetch={false} href={`/dashboard/recruitment/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">{c.total} applications · {c.shortlisted} shortlisted · {c.accepted} accepted · closes {when(c.closes_at)}</span>
                </span>
                <span className="flex items-center gap-2">{c.isOpenNow && <span className="text-xs font-medium text-emerald-600">accepting now</span>}<StatusBadge status={c.status} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Section title="New recruitment" className="mt-6">
        <ActionForm action={saveCampaignAction.bind(null, null)} submitLabel="Create" redirectTo="/dashboard/recruitment/{id}">
          <CampaignFields positions={positions} />
        </ActionForm>
      </Section>
    </>
  );
}
