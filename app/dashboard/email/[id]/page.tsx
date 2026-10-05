import { headers } from "next/headers";
import { requireAdmin, view } from "@/lib/api/session";
import type { getCampaign } from "@/lib/server/services/campaigns";
import { ActionForm, PageHeader } from "@/components/admin/ui";
import { renderEmail } from "@/lib/server/email-template";
import { cn } from "@/lib/utils";
import { setCampaignStatusAction } from "../actions";
import { CampaignStatusChip, Progress } from "../status";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const STATUS: Record<string, string> = { PENDING: "Waiting", SENDING: "Sending", SENT: "Sent", FAILED: "Failed", SKIPPED: "Skipped" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/dashboard/email/${id}`);
  const { campaign: c, recipients } = await view<Awaited<ReturnType<typeof getCampaign>>>("campaigns.get", { id }, `/dashboard/email/${id}`);
  const h = await headers();
  const site = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const preview = renderEmail({
    site, kicker: c.kind === "CERTIFICATE" ? "Your certificate" : "Club announcement", preheader: c.preheader ?? c.body.slice(0, 140), heading: c.subject,
    paragraphs: ["Hi …,", ...c.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)],
    action: c.button_label && c.button_path ? { label: c.button_label, url: `${site}${c.button_path}` } : undefined,
    footer: ["Green University Computer Club", "Unsubscribe from announcements: (a personal link)"],
  });
  const active = c.status === "QUEUED" || c.status === "SENDING";
  return (
    <>
      <PageHeader title={c.subject} back={{ href: "/dashboard/email", label: "Email" }}
        description={`${c.audience} · queued ${when(c.created_at)}${c.created_by_name ? ` by ${c.created_by_name}` : ""}${c.not_before ? ` · from ${when(c.not_before)}` : ""}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            {active && <ActionForm action={setCampaignStatusAction.bind(null, c.id, "pause")} submitLabel="Pause" variant="outline" inline />}
            {c.status === "PAUSED" && <ActionForm action={setCampaignStatusAction.bind(null, c.id, "resume")} submitLabel="Resume" inline />}
            {(active || c.status === "PAUSED") && <ActionForm action={setCampaignStatusAction.bind(null, c.id, "cancel")} submitLabel="Cancel" variant="destructive" inline confirm="Cancel this email? Nobody else gets it; those who got it keep it." />}
          </div>
        )} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Progress</h2>
              <CampaignStatusChip status={c.status} />
            </div>
            <Progress c={c} className="mt-3" />
            {c.paused_reason && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{c.paused_reason}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              {c.status === "DONE" ? `Finished ${when(c.finished_at)}.` : active ? `Goes out with the hourly job${c.last_run_at ? `; last run ${when(c.last_run_at)}` : ""}.` : ""}
            </p>
          </section>
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="text-base font-semibold">People</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Failures first, then who&apos;s still waiting{c.total > 100 ? " (the first 100)" : ""}.</p>
            <ul className="mt-3 divide-y text-sm">
              {recipients.map((r) => (
                <li key={r.seq} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name || r.email}</span>
                    {r.name && <span className="block truncate text-xs text-muted-foreground">{r.email}</span>}
                    {r.error && <span className="block text-xs text-destructive">{r.error}</span>}
                  </span>
                  <span className={cn("text-xs", r.status === "FAILED" ? "text-destructive" : r.status === "SENT" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                    {STATUS[r.status] ?? r.status}{r.sent_at ? ` · ${when(r.sent_at)}` : ""}{r.attempts > 1 ? ` · ${r.attempts} tries` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="min-w-0 overflow-hidden rounded-xl border bg-card xl:sticky xl:top-20 xl:self-start" aria-label="The email">
          <h2 className="border-b px-4 py-2 text-sm font-semibold">The email</h2>
          {/* Everything in it is escaped by renderEmail and it runs no script: no sandbox, so screen readers and checkers can read it. */}
          <iframe title="Email preview" srcDoc={preview} className="h-[36rem] w-full bg-[#f1f5f9]" />
        </section>
      </div>
    </>
  );
}
