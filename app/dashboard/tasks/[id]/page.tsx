import { requireSignedIn, view } from "@/lib/api/session";
import { ActionForm, Field, PageHeader, Section } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { dhakaDateTime } from "@/lib/time";
import { editTaskAction } from "../actions";
import type { TaskDetail } from "../live-actions";
import { TaskDetailView } from "./task-detail";

/** datetime-local value in Dhaka time. */
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSignedIn(`/dashboard/tasks/${id}`);
  const data = await view<TaskDetail>("tasks.get", { id }, `/dashboard/tasks/${id}`);
  const t = data.task;
  return (
    <>
      <PageHeader back={{ href: "/dashboard/tasks", label: "Tasks" }} title={t.title} />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><PersonAvatar name={t.assignee_name} url={t.assignee_avatar} size="sm" />For <span className="font-medium text-foreground">{t.assignee_name ?? "—"}</span>{t.assignee_user_id ? "" : " (no account yet)"}</span>
        <span className="inline-flex items-center gap-2"><PersonAvatar name={t.creator_name} url={t.creator_avatar} size="sm" />Given by <span className="font-medium text-foreground">{t.creator_name ?? "someone"}</span> · {dhakaDateTime(t.created_at)}</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* On phones the edit form comes first, above the long comment thread. */}
        {data.role.canEdit && (
          <div className="order-first lg:order-last">
            <Section title="Edit">
              <ActionForm action={editTaskAction.bind(null, t.id)}>
                <input type="hidden" name="expectedUpdatedAt" value={t.updated_at} />
                <Field name="title" label="Task" defaultValue={t.title} required />
                <Field name="details" label="Details" type="textarea" rows={4} defaultValue={t.details} />
                <Field name="dueAt" label="Due (Dhaka time)" type="datetime-local" defaultValue={local(t.due_at)} />
                <Field name="priority" label="Priority" type="select" defaultValue={t.priority} options={[{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }]} />
                <Field name="labels" label="Labels" defaultValue={t.labels.join(", ")} hint="Separate with commas; up to 6." />
                <PersonPicker name="assigneeUserId" label="Give to someone else (optional)" valueKind="user" withAccount />
              </ActionForm>
            </Section>
          </div>
        )}
        <TaskDetailView initial={data} meId={session.user.id} />
      </div>
    </>
  );
}
