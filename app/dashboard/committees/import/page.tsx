import { redirect } from "next/navigation";
import { requireAdmin, view } from "@/lib/api/session";
import type { CommitteeRow } from "@/lib/server/services/committees";
import { PageHeader } from "@/components/admin/ui";
import { ImportClient } from "./import-client";

export default async function ImportExecutivesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireAdmin("/dashboard/committees/import");
  if (!session.caps["executives.import"]) redirect("/dashboard/denied?from=/dashboard/committees/import");
  const sp = await searchParams;
  const committees = await view<CommitteeRow[]>("committees.list", {}, "/dashboard/committees/import");
  const current = committees.find((c) => c.status === "CURRENT");
  const chosen = committees.find((c) => c.id === sp.committee) ?? current ?? committees[0];

  return (
    <>
      <PageHeader
        title="Import executives"
        description="Add many executives at once from a JSON or CSV file. You'll see exactly what would happen first; nothing changes until you confirm."
      />
      <ImportClient committees={committees.map((c) => ({ id: c.id, name: c.name, status: c.status }))} defaultCommitteeId={chosen?.id ?? ""} />
    </>
  );
}
