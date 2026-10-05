import { permanentRedirect, redirect } from "next/navigation";
import { getCertificateByStudent } from "@/lib/public/data";

/**
 * Old certificate links (/executives/certs/<student ID>): to the person's verifiable certificate
 * when one is issued, otherwise to their executive page.
 */
export default async function OldCertificateLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = /^\d{6,12}$/.test(id) ? await getCertificateByStudent(id).catch(() => null) : null;
  if (cert) permanentRedirect(`/c/${cert.code}`);
  redirect(`/executives/${encodeURIComponent(id)}`);
}
