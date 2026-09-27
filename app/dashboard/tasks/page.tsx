import Link from "next/link";
import { requireSignedIn, view } from "@/lib/api/session";
import type { listTasks } from "@/lib/server/services/work";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { NewTaskForm } from "./new-task-form";

type SP = Promise<{ view?: string; status?: string }>;
const due = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  await requireSignedIn("/dashboard/tasks");
  const sp = await searchParams;
  const data = await view<Awaited<ReturnType<typeof listTasks>>>("tasks.list", { view: sp.view, status: sp.status }, "/dashboard/tasks");
  const q = (patch: Record<string, string>) => `/dashboard/tasks?${new URLSearchParams({ view: data.view, status: data.status, ...patch })}`;
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm", on ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{label}</Link>
  );
  const now = new Date().toISOString();
  return (
    <>
      <PageHeader title="Tasks" description="Work given to you, and work you've given others." />
      <Section title="List" actions={
        <div className="flex flex-wrap gap-3">
          <nav className="flex gap-1" aria-label="Whose tasks">
            {tab(q({ view: "mine" }), data.view === "mine", "For me")}
            {data.canAssign && tab(q({ view: "created" }), data.view === "created", "Given by me")}
            {data.canManage && tab(q({ view: "all" }), data.view === "all", "Everyone")}
          </nav>
          <nav className="flex gap-1" aria-label="Status">
            {tab(q({ status: "open" }), data.status === "open", "Open")}
            {tab(q({ status: "done" }), data.status === "done", "Finished")}
            {tab(q({ status: "all" }), data.status === "all", "All")}
          </nav>
        </div>
      }>
        {data.rows.length === 0 ? <EmptyState>{data.view === "mine" ? "No tasks for you right now." : "No tasks here."}</EmptyState> : (
          <ul className="divide-y">
            {data.rows.map((t) => {
              const late = t.due_at && t.due_at < now && (t.status === "OPEN" || t.status === "IN_PROGRESS");
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                    <p className="text-xs text-muted-foreground">
                      {data.view === "mine" ? `From ${t.creator_name ?? "someone"}` : `For ${t.assignee_name ?? "—"}${t.assignee_user_id ? "" : " (no account yet)"}`}
                      {t.comments > 0 && ` · ${t.comments} comment${t.comments === 1 ? "" : "s"}`}
                      {t.priority === "HIGH" && " · High priority"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {t.due_at && <span className={late ? "font-medium text-destructive" : "text-muted-foreground"}>{late ? "Overdue · " : "Due "}{due(t.due_at)}</span>}
                    <StatusBadge status={t.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {data.canAssign && (
        <Section title="Give a task" className="mt-6 scroll-mt-20" id="give">
          <NewTaskForm emailEnabled={data.emailEnabled} />
        </Section>
      )}
    </>
  );
}
