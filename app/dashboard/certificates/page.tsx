import Link from "next/link";
import { Award, Eye, EyeOff, Palette, Plus } from "lucide-react";
import { getSession, requireSignedIn, view } from "@/lib/api/session";
import type { listBatches, listDesigns, myCertificates } from "@/lib/server/services/certificates";
import { ActionForm, EmptyState, PageHeader, Pager } from "@/components/admin/ui";
import { pageOf } from "@/lib/pagination";
import { formatIssued, KIND_LABEL, TEMPLATE_INFO, type CertificateKind, type TemplateKey } from "@/lib/certificates/config";
import { cn } from "@/lib/utils";
import { certificateVisibilityAction, deleteDesignAction } from "./actions";

type Tab = "issued" | "designs" | "mine";

/**
 * Certificates: everyone sees theirs (and chooses which show on their profile); people who issue
 * certificates also see every issue and the saved designs.
 */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requireSignedIn("/dashboard/certificates");
  const session = await getSession();
  const manager = Boolean(session?.caps["certificates.manage"]);
  const sp = await searchParams;
  const tab: Tab = manager ? (sp.tab === "designs" || sp.tab === "mine" ? sp.tab : "issued") : "mine";
  const page = pageOf(sp.page);
  const tabs: Array<[Tab, string]> = manager ? [["issued", "Issued"], ["designs", "Designs"], ["mine", "Mine"]] : [];

  return (
    <>
      <PageHeader title="Certificates"
        description={manager ? "Certificates the club issued: each has its own code and page that proves it's genuine. Issue to members, event participants, speakers or former executives." : "Your GUCC certificates: download them, print them or add them to LinkedIn."}
        actions={manager ? <Link prefetch={false} href="/dashboard/certificates/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" aria-hidden />Issue certificates</Link> : undefined} />
      {tabs.length > 0 && (
        <nav aria-label="Certificates" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 text-sm">
          {tabs.map(([k, label]) => (
            <Link prefetch={false} key={k} href={k === "issued" ? "/dashboard/certificates" : `/dashboard/certificates?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={cn("inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5", tab === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</Link>
          ))}
        </nav>
      )}
      {tab === "issued" && <Issued page={page} />}
      {tab === "designs" && <Designs />}
      {tab === "mine" && <Mine />}
    </>
  );
}

async function Issued({ page }: { page: number }) {
  const { rows, total, pageSize } = await view<Awaited<ReturnType<typeof listBatches>>>("certificateBatches.list", { page }, "/dashboard/certificates");
  if (!rows.length) return <EmptyState>No certificates issued yet. <Link prefetch={false} href="/dashboard/certificates/new" className="font-medium text-primary underline-offset-4 hover:underline">Issue the first ones</Link>.</EmptyState>;
  return (
    <>
      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.id}>
            <Link prefetch={false} href={`/dashboard/certificates/batches/${b.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Award className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {KIND_LABEL[b.kind as CertificateKind] ?? b.kind} · {TEMPLATE_INFO[b.template as TemplateKey]?.name ?? b.template} · issued {formatIssued(b.issued_on)}{b.created_by_name ? ` by ${b.created_by_name}` : ""}
                </span>
              </span>
              <span className="text-sm font-medium">{b.recipient_count}<span className="font-normal text-muted-foreground"> people{b.revoked ? ` · ${b.revoked} revoked` : ""}</span></span>
            </Link>
          </li>
        ))}
      </ul>
      <Pager page={page} hasMore={page * pageSize < total} base="/dashboard/certificates" total={total} pageSize={pageSize} />
    </>
  );
}

async function Designs() {
  const designs = await view<Awaited<ReturnType<typeof listDesigns>>>("certificateDesigns.list", {}, "/dashboard/certificates?tab=designs");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Save the club&apos;s wording, signatories and logos once; use them for every issue. A design used before stays as it was on what was issued.</p>
        <Link prefetch={false} href="/dashboard/certificates/designs/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><Palette className="h-4 w-4" aria-hidden />New design</Link>
      </div>
      {designs.length === 0 ? <EmptyState>No saved designs. The seven templates are ready to use as they are.</EmptyState> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <li key={d.id} className="flex flex-col rounded-xl border bg-card p-4">
              <p className="font-medium">{d.name}{d.isDefault && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Default</span>}</p>
              <p className="text-xs text-muted-foreground">{TEMPLATE_INFO[d.template].name} · {d.config.signatories.map((s) => s.name).join(", ")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link prefetch={false} href={`/dashboard/certificates/designs/${d.id}`} className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">Edit</Link>
                <ActionForm action={deleteDesignAction.bind(null, d.id)} submitLabel="Delete" variant="ghost" inline confirm={`Delete the design “${d.name}”? Certificates already issued keep their look.`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function Mine() {
  const mine = await view<Awaited<ReturnType<typeof myCertificates>>>("certificates.list", {}, "/dashboard/certificates?tab=mine");
  if (!mine.length) return <EmptyState>No certificates yet. When the club issues you one (for an event, a contest or your service), it appears here.</EmptyState>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {mine.map((c) => (
        <li key={c.id} className="flex flex-col rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{KIND_LABEL[c.kind as CertificateKind] ?? c.kind}</p>
          <p className="mt-1 font-medium">{c.name}</p>
          {c.role_line && <p className="text-sm text-muted-foreground">{c.role_line}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Issued {formatIssued(c.issued_on)} · <span className="font-mono">{c.display}</span>{c.status === "REVOKED" ? " · revoked" : ""}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link prefetch={false} href={`/c/${c.code}`} className="inline-flex min-h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Open, download or share</Link>
            <ActionForm action={certificateVisibilityAction.bind(null, c.id, c.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")} inline variant="ghost"
              submitLabel={c.visibility === "PUBLIC" ? "Hide from my profile" : "Show on my profile"} />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{c.visibility === "PUBLIC" ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}{c.visibility === "PUBLIC" ? "On your profile" : "Hidden"}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
