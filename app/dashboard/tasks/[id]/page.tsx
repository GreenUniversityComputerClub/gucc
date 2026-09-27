import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { taskDetail } from "@/lib/server/services/work";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { commentTaskAction, editTaskAction, taskStatusAction } from "../actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16) : "");

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSignedIn(`/dashboard/tasks/${id}`);
  const { task: t, comments, role } = await view<Awaited<ReturnType<typeof taskDetail>>>("tasks.get", { id }, `/dashboard/tasks/${id}`);
  const open = t.status === "OPEN" || t.status === "IN_PROGRESS";
  const statusButton = (status: string, label: string, variant: "default" | "outline" = "outline") => (
    <ActionForm key={status} action={taskStatusAction.bind(null, t.id, status)} submitLabel={label} successMessage="Updated." variant={variant} inline />
  );
  return (
    <>
      <PageHeader title={t.title} description={`${t.assignee_user_id ? "For" : "For (no account yet)"} ${t.assignee_name ?? "—"} · given by ${t.creator_name ?? "someone"} on ${when(t.created_at)}`}
        actions={<Link href="/dashboard/tasks" className="text-sm underline">All tasks</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title="Details">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={t.status} />
              {t.due_at && <span>Due {when(t.due_at)}</span>}
              <span className="text-muted-foreground">Priority: {t.priority.toLowerCase()}</span>
              {t.event_title && <span className="text-muted-foreground">Event: {t.event_title}</span>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{t.details || <span className="text-muted-foreground">No details.</span>}</p>
            {(role.assignee || role.canEdit) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {t.status === "OPEN" && statusButton("IN_PROGRESS", "Start")}
                {open && statusButton("DONE", "Mark done", "default")}
                {!open && statusButton("OPEN", "Reopen")}
                {role.canEdit && open && (
                  <ActionForm action={taskStatusAction.bind(null, t.id, "CANCELLED")} submitLabel="Cancel task" successMessage="Cancelled." variant="ghost" confirm="Cancel this task? The assignee is told." inline />
                )}
              </div>
            )}
          </Section>
          <Section title={`Comments (${comments.length})`}>
            {comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3 text-sm">
                    <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{c.author}</span> · {when(c.created_at)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={commentTaskAction.bind(null, t.id)} submitLabel="Comment" resetOnSuccess className="mt-4 space-y-3">
              <Field name="body" label="Add a comment" type="textarea" rows={2} required />
            </ActionForm>
          </Section>
        </div>
        {role.canEdit && (
          <Section title="Edit">
            <ActionForm action={editTaskAction.bind(null, t.id)}>
              <Field name="title" label="Task" defaultValue={t.title} required />
              <Field name="details" label="Details" type="textarea" rows={4} defaultValue={t.details} />
              <Field name="dueAt" label="Due (Dhaka time)" type="datetime-local" defaultValue={local(t.due_at)} />
              <Field name="priority" label="Priority" type="select" defaultValue={t.priority} options={[{ value: "LOW", label: "Low" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }]} />
              <PersonPicker name="assigneeUserId" label="Give to someone else (optional)" valueKind="user" withAccount />
            </ActionForm>
          </Section>
        )}
      </div>
    </>
  );
}
