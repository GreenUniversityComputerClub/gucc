import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, CalendarDays, Hash, ShieldAlert, UserRound } from "lucide-react";
import { getCertificate } from "@/lib/public/data";
import { buildMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, graph } from "@/lib/seo/schema";
import { CertificateSvg } from "@/lib/certificates/render";
import { cleanConfig, formatIssued, KIND_LABEL, TEMPLATES, type CertificateData, type CertificateKind, type TemplateKey } from "@/lib/certificates/config";
import { formatCode, normalizeCode } from "@/lib/certificates/code";
import { CERTIFICATE_FONT_CSS } from "@/lib/certificates/fonts";
import { CertificateActions } from "@/components/certificates/certificate-actions";
import type { PublicCertificate } from "@/lib/public/read";

// Cached; refreshed when the certificate is corrected or revoked.
export const revalidate = 21600;

export async function generateStaticParams() {
  return [];
}

function dataOf(c: PublicCertificate): CertificateData {
  return {
    name: c.recipientName, role: c.roleLine, event: c.event?.title ?? c.name, title: c.name, rank: c.rank, team: c.team, body: c.body,
    date: formatIssued(c.issuedOn), code: formatCode(c.code), verifyUrl: absoluteUrl(`/c/${c.code}`),
  };
}

const templateOf = (t: string): TemplateKey => ((TEMPLATES as readonly string[]).includes(t) ? (t as TemplateKey) : "heritage");

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = normalizeCode(decodeURIComponent((await params).code));
  const c = code ? await getCertificate(code) : null;
  if (!c) return buildMetadata({ title: "Certificate not found", description: "No GUCC certificate has this code.", path: "/c", noIndex: true });
  const kind = KIND_LABEL[c.kind as CertificateKind] ?? "Certificate";
  return buildMetadata({
    title: `${c.recipientName}: ${kind} certificate, ${c.name}`,
    description: c.status === "REVOKED"
      ? `This GUCC certificate (${formatCode(c.code)}) was revoked.`
      : `Verified: ${c.recipientName} received a ${kind.toLowerCase()} certificate for ${c.name} from the Green University Computer Club on ${formatIssued(c.issuedOn)}.`,
    path: `/c/${c.code}`,
    image: { eyebrow: c.status === "REVOKED" ? "Revoked certificate" : "Verified GUCC certificate", title: c.recipientName, subtitle: `${kind} · ${c.name}` },
    // Shared by link only (LinkedIn and messengers still read the preview).
    noIndex: true,
  });
}

/**
 * Where a certificate's QR code and link lead: whether it's genuine (or revoked), the certificate
 * itself, what it was for, and who holds it, with downloads, print, share and LinkedIn.
 */
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const raw = decodeURIComponent((await params).code);
  const code = normalizeCode(raw);
  if (!code) notFound();
  if (raw !== code) permanentRedirect(`/c/${code}`);
  const c = await getCertificate(code);
  if (!c) notFound();
  const kind = (c.kind as CertificateKind) in KIND_LABEL ? (c.kind as CertificateKind) : "PARTICIPATION";
  const config = cleanConfig(c.design, kind);
  const data = dataOf(c);
  const template = templateOf(c.template);
  const revoked = c.status === "REVOKED";
  const issued = new Date(`${c.issuedOn}T00:00:00+06:00`);
  const linkedin = `https://www.linkedin.com/profile/add?${new URLSearchParams({
    startTask: "CERTIFICATION_NAME", name: `${KIND_LABEL[kind]} certificate: ${c.name}`, organizationName: "Green University Computer Club",
    issueYear: String(issued.getFullYear()), issueMonth: String(issued.getMonth() + 1), certUrl: data.verifyUrl, certId: data.code,
  })}`;
  const fileName = `GUCC-certificate-${c.recipientName.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}-${c.code.slice(0, 4)}`;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <style>{`${CERTIFICATE_FONT_CSS}
@media print {
  @page { size: A4 landscape; margin: 0; }
  body * { visibility: hidden !important; }
  .cert-print, .cert-print * { visibility: visible !important; }
  .cert-print { position: fixed; inset: 0; width: 297mm; height: 210mm; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
}`}</style>
      <JsonLd id="certificate" data={graph(breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Verify a certificate", path: "/c" }, { name: c.recipientName, path: `/c/${c.code}` }]))} />
      <div role="status" className={revoked
        ? "mb-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive"
        : "mb-6 flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300"}>
        {revoked ? <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" aria-hidden /> : <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />}
        <div>
          <p className="font-semibold">{revoked ? "This certificate was revoked" : "Verified: a genuine GUCC certificate"}</p>
          <p className="text-sm opacity-90">
            {revoked
              ? `Revoked${c.revokedAt ? ` on ${formatIssued(c.revokedAt)}` : ""}${c.revokeReason ? `: ${c.revokeReason}` : "."} It is no longer valid.`
              : `Issued by the Green University Computer Club to ${c.recipientName} on ${formatIssued(c.issuedOn)}.`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <h1 className="sr-only">{`${KIND_LABEL[kind]} certificate of ${c.recipientName}`}</h1>
          <div className={`cert-print overflow-hidden rounded-xl border bg-white shadow-lg ${revoked ? "opacity-60 grayscale" : ""}`}>
            <CertificateSvg template={template} config={config} data={data} className="block h-auto w-full" />
          </div>
          <div className="mt-4">
            <CertificateActions template={template} config={config} data={data} fileName={fileName} linkedin={linkedin} />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Certificate</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div><dt className="text-muted-foreground">Presented to</dt><dd className="font-medium">{c.recipientName}</dd></div>
              <div><dt className="text-muted-foreground">For</dt><dd className="font-medium">{KIND_LABEL[kind]}: {c.name}{c.roleLine ? <span className="block font-normal text-muted-foreground">{c.roleLine}</span> : null}</dd></div>
              {c.event && <div><dt className="text-muted-foreground">Event</dt><dd><Link href={`/events/${c.event.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">{c.event.title}</Link></dd></div>}
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden /><dd>Issued {formatIssued(c.issuedOn)}</dd></div>
              <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" aria-hidden /><dd className="font-mono text-xs">{data.code}</dd></div>
            </dl>
          </section>
          {c.holder ? (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Holder</h2>
              <div className="mt-3 flex items-center gap-3">
                {c.holder.avatar
                  ? <Image src={c.holder.avatar} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><UserRound className="h-6 w-6 text-muted-foreground" aria-hidden /></span>}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.holder.name}</p>
                  {(c.holder.position || c.holder.department) && <p className="truncate text-sm text-muted-foreground">{c.holder.position ?? c.holder.department}</p>}
                </div>
              </div>
              <Link href={`/members/${encodeURIComponent(c.holder.handle)}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted">View full profile</Link>
            </section>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Anyone can check a GUCC certificate here: scan its QR code, or enter its code at <Link href="/c" className="underline underline-offset-2">gucc.green.edu.bd/c</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}
