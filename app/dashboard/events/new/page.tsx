import { requireAdmin, rpc } from "@/lib/api/session";
import { redirect } from "next/navigation";
import { ActionForm, PageHeader } from "@/components/admin/ui";
import { createEventAction } from "../../actions";
import { EventFields } from "../event-form";

export default async function NewEvent() {
  const session = await requireAdmin("/dashboard/events/new");
  if (!session.caps["events.create"]) redirect("/dashboard/denied?from=/admin/events/new");
  const cats = await rpc<Array<{ slug: string; name: string }>>("categories.list", { kind: "EVENT" });
  return (
    <>
      <PageHeader title="New event" description="Saved as a draft. On the next page you can add speakers, guests and photos, then publish; depending on your position and the rules it goes live or waits for approval." />
      <ActionForm action={createEventAction} submitLabel="Create draft" redirectTo="/dashboard/events/{id}">
        <EventFields categories={cats.ok ? cats.data : []} />
      </ActionForm>
    </>
  );
}
