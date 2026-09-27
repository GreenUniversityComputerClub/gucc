import { redirect } from "next/navigation";

/** The audit log became the activity log. */
export default async function AuditRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  redirect(sp.tab === "signins" ? "/dashboard/activity?tab=signins" : "/dashboard/activity");
}
