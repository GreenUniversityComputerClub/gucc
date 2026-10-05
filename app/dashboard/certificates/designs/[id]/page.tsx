import { notFound } from "next/navigation";
import { requireAdmin, view } from "@/lib/api/session";
import type { listDesigns } from "@/lib/server/services/certificates";
import { PageHeader } from "@/components/admin/ui";
import { CERTIFICATE_FONT_CSS } from "@/lib/certificates/fonts";
import { DesignForm } from "../design-form";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/dashboard/certificates/designs/${id}`);
  const design = id === "new" ? null : (await view<Awaited<ReturnType<typeof listDesigns>>>("certificateDesigns.list", {}, "/dashboard/certificates")).find((d) => d.id === id);
  if (id !== "new" && !design) notFound();
  return (
    <>
      <style>{CERTIFICATE_FONT_CSS}</style>
      <PageHeader title={design ? design.name : "New design"} back={{ href: "/dashboard/certificates?tab=designs", label: "Designs" }}
        description="The club's version of a template: wording, signatories and logos. Certificates already issued keep the look they had." />
      <DesignForm design={design ?? null} />
    </>
  );
}
