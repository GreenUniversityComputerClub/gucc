import { requireAdmin, view } from "@/lib/api/session";
import type { campaignOptions } from "@/lib/server/services/campaigns";
import { PageHeader } from "@/components/admin/ui";
import { Compose } from "../compose";

export default async function NewCampaign() {
  const session = await requireAdmin("/dashboard/email/new");
  const options = await view<Awaited<ReturnType<typeof campaignOptions>>>("campaigns.options", {}, "/dashboard/email/new");
  return (
    <>
      <PageHeader title="Email an announcement" back={{ href: "/dashboard/email", label: "Email" }}
        description="Goes to members who haven't turned off club announcements, a few at a time within the free email allowance. Each email has a one-click unsubscribe." />
      <Compose options={options} me={session.profile?.name ?? ""} />
    </>
  );
}
