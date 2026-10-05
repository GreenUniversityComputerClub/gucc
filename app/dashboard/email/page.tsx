import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin, view } from "@/lib/api/session";
import type { listCampaigns } from "@/lib/server/services/campaigns";
import { EmptyState, PageHeader, Pager } from "@/components/admin/ui";
import { pageOf } from "@/lib/pagination";
import { CampaignStatusChip, Progress } from "./status";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Announcement emails: what's sending, waiting, done; one row each with its progress. */
export default async function EmailCampaigns({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin("/dashboard/email");
  const page = pageOf((await searchParams).page);
  const { rows, total, pageSize } = await view<Awaited<ReturnType<typeof listCampaigns>>>("campaigns.list", { page }, "/dashboard/email");
  return (
    <>
      <PageHeader title="Email" description="Announcement emails to members (and event guests), sent a few at a time within the club's free email allowance."
        actions={<Link prefetch={false} href="/dashboard/email/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" aria-hidden />New email</Link>} />
      {rows.length === 0 ? (
        <EmptyState>No announcement emails yet. <Link prefetch={false} href="/dashboard/email/new" className="font-medium text-primary underline-offset-4 hover:underline">Write the first one</Link>, or tick “Also email it” when you send an announcement.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link prefetch={false} href={`/dashboard/email/${c.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{c.subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.audience} · {c.total.toLocaleString("en-US")} people · {when(c.created_at)}{c.created_by_name ? ` · ${c.created_by_name}` : ""}</p>
                  </div>
                  <CampaignStatusChip status={c.status} />
                </div>
                <Progress c={c} className="mt-3" />
                {c.paused_reason && c.status !== "PAUSED" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{c.paused_reason}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={page * pageSize < total} base="/dashboard/email" total={total} pageSize={pageSize} />
    </>
  );
}
