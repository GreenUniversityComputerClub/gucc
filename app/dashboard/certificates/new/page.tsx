import { requireAdmin, view } from "@/lib/api/session";
import type { certificateOptions } from "@/lib/server/services/certificates";
import { PageHeader } from "@/components/admin/ui";
import { CERTIFICATE_FONT_CSS } from "@/lib/certificates/fonts";
import { KINDS, type CertificateKind } from "@/lib/certificates/config";
import { IssueWizard } from "./wizard";

export default async function IssueCertificates({ searchParams }: { searchParams: Promise<{ kind?: string; event?: string }> }) {
  await requireAdmin("/dashboard/certificates/new");
  const sp = await searchParams;
  const options = await view<Awaited<ReturnType<typeof certificateOptions>>>("certificates.options", {}, "/dashboard/certificates/new");
  const kind = (KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as CertificateKind) : sp.event ? "PARTICIPATION" : "PARTICIPATION";
  return (
    <>
      <style>{CERTIFICATE_FONT_CSS}</style>
      <PageHeader title="Issue certificates" back={{ href: "/dashboard/certificates", label: "Certificates" }}
        description="Each person gets a certificate with its own code and page: a QR code on it proves it's genuine and leads to their profile." />
      <IssueWizard options={options} initialKind={kind} initialEventId={sp.event && options.events.some((e) => e.id === sp.event) ? sp.event : undefined} />
    </>
  );
}
