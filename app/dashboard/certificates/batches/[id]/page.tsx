import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin, view } from "@/lib/api/session";
import type { getBatch } from "@/lib/server/services/certificates";
import { ActionForm, Field, PageHeader, Pager } from "@/components/admin/ui";
import { CertificateSvg } from "@/lib/certificates/render";
import { CERTIFICATE_FONT_CSS } from "@/lib/certificates/fonts";
import { formatIssued, KIND_LABEL, TEMPLATE_INFO, type CertificateData } from "@/lib/certificates/config";
import { formatCode } from "@/lib/certificates/code";
import { absoluteUrl } from "@/lib/seo/site";
import { pageOf } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { restoreCertificateAction, revokeCertificateAction, updateCertificateAction } from "../../actions";
import { AddPeople, DownloadAll } from "./batch-tools";

/** One issue of certificates: everyone in it, with their codes, corrections, revoking and downloads. */
export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAdmin(`/dashboard/certificates/batches/${id}`);
  const page = pageOf(sp.page);
  const { batch, rows, total, pageSize } = await view<Awaited<ReturnType<typeof getBatch>>>("certificateBatches.get", { id, q: sp.q, page }, `/dashboard/certificates/batches/${id}`);
  const date = formatIssued(batch.issued_on);
  const dataOf = (r: (typeof rows)[number]): CertificateData => {
    let fields: { rank?: string; team?: string } = {};
    try {
      fields = r.fields_json ? JSON.parse(r.fields_json) : {};
    } catch {
      fields = {};
    }
    return { name: r.recipient_name, role: r.role_line, body: r.body, event: batch.event_title ?? batch.name, title: batch.name, rank: fields.rank, team: fields.team, date, code: formatCode(r.code), verifyUrl: absoluteUrl(`/c/${r.code}`) };
  };
  const valid = rows.filter((r) => r.status === "VALID");
  return (
    <>
      <style>{CERTIFICATE_FONT_CSS}</style>
      <PageHeader title={batch.name} back={{ href: "/dashboard/certificates", label: "Certificates" }}
        description={`${KIND_LABEL[batch.kind]} · ${TEMPLATE_INFO[batch.template]?.name ?? batch.template} · issued ${date} · ${batch.recipient_count} people${batch.event_title ? ` · ${batch.event_title}` : ""}`}
        actions={batch.email_campaign_id ? <Link prefetch={false} href={`/dashboard/email/${batch.email_campaign_id}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">Email progress</Link> : undefined} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex min-w-0 flex-1 gap-2" role="search">
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or code" aria-label="Search this issue" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-base md:h-9 md:text-sm" />
              <button className="h-10 rounded-md border px-4 text-sm font-medium hover:bg-muted md:h-9">Search</button>
            </form>
            <DownloadAll template={batch.template} config={batch.config} items={valid.map(dataOf)} fileName={`GUCC-certificates-${batch.name.replace(/[^\w]+/g, "-")}${page > 1 ? `-${page}` : ""}.pdf`} />
            <AddPeople batchId={batch.id} />
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((r) => (
              <li key={r.id} className="p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("font-medium", r.status === "REVOKED" && "text-muted-foreground line-through")}>{r.recipient_name}</p>
                    <p className="text-xs text-muted-foreground">{[r.role_line, r.recipient_email, formatCode(r.code)].filter(Boolean).join(" · ")}</p>
                    {r.status === "REVOKED" && <p className="text-xs text-destructive">Revoked{r.revoke_reason ? `: ${r.revoke_reason}` : ""}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <a href={`/c/${r.code}`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm text-primary hover:underline">Open<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                    {r.handle && <Link prefetch={false} href={`/members/${encodeURIComponent(r.handle)}`} className="inline-flex min-h-10 items-center rounded-md px-2 text-sm hover:underline">Profile</Link>}
                    {r.status === "REVOKED" && <ActionForm action={restoreCertificateAction.bind(null, r.id)} submitLabel="Make valid again" variant="ghost" inline />}
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground">Correct or revoke</summary>
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    <ActionForm action={updateCertificateAction.bind(null, r.id)} submitLabel="Save correction" className="space-y-2 rounded-lg border p-3">
                      <Field name="name" label="Name on the certificate" defaultValue={r.recipient_name} required />
                      <Field name="role" label="Role or line" defaultValue={r.role_line ?? ""} />
                      <Field name="body" label="Their own sentence (optional)" type="textarea" rows={2} defaultValue={r.body ?? ""} />
                    </ActionForm>
                    {r.status === "VALID" && (
                      <ActionForm action={revokeCertificateAction.bind(null, r.id)} submitLabel="Revoke" variant="destructive" confirm={`Revoke ${r.recipient_name}'s certificate? Its page will say it's no longer valid.`} className="space-y-2 rounded-lg border border-destructive/30 p-3">
                        <Field name="reason" label="Why (shown on its page)" required placeholder="Issued by mistake" />
                      </ActionForm>
                    )}
                  </div>
                </details>
              </li>
            ))}
            {rows.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nobody matches.</li>}
          </ul>
          <Pager page={page} hasMore={page * pageSize < total} base={`/dashboard/certificates/batches/${batch.id}`} params={{ q: sp.q }} total={total} pageSize={pageSize} />
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          {rows[0] && (
            <section className="overflow-hidden rounded-xl border bg-card">
              <h2 className="border-b px-4 py-2 text-sm font-semibold">{rows[0].recipient_name}</h2>
              <div className="bg-muted/40 p-3">
                <CertificateSvg template={batch.template} config={batch.config} data={dataOf(rows[0])} id="batch-preview" className="block h-auto w-full rounded shadow" />
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
