import type { Metadata } from "next";
import { requireAdmin, view } from "@/lib/api/session";
import type { simulatorOptions } from "@/lib/server/services/access";
import { PageHeader } from "@/components/admin/ui";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access simulator", robots: { index: false, follow: false } };

export default async function AccessSimulatorPage() {
  await requireAdmin("/dashboard/access/simulator");
  const options = await view<Awaited<ReturnType<typeof simulatorOptions>>>("access.options", {}, "/dashboard/access/simulator");
  return (
    <>
      <PageHeader title="Access simulator"
        description="Pick a person, an action and (optionally) a real item. The same engine that decides every real request shows, step by step, whether they could do it now and why: where the permission comes from, its scope, the rules, who would have to approve, and the two-factor requirement. Nothing is changed." />
      <Simulator options={options} />
    </>
  );
}
