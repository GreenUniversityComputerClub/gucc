import Link from "next/link";
import { AlertTriangle, CalendarDays, CalendarRange, Inbox, Send, Users } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import { PageHeader, Section } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { NewTaskForm } from "./new-task-form";
import { TasksView } from "./tasks-view";
import type { TaskList } from "./live-actions";

type SP = Promise<{ view?: string; status?: string; page?: string }>;

const VIEWS = [
  { key: "mine", label: "My tasks", icon: Inbox },
  { key: "overdue", label: "Overdue", icon: AlertTriangle },
  { key: "today", label: "Due today", icon: CalendarDays },
  { key: "week", label: "This week", icon: CalendarRange },
  { key: "created", label: "Given by me", icon: Send, need: "assign" },
  { key: "all", label: "Everyone", icon: Users, need: "manage" },
] as const;

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const session = await requireSignedIn("/dashboard/tasks");
  const sp = await searchParams;
  const data = await view<TaskList>("tasks.list", { view: sp.view, status: sp.status, page: Number(sp.page) || 1 }, "/dashboard/tasks");
  const smart = data.view === "overdue" || data.view === "today" || data.view === "week";
  const q = (patch: Record<string, string>) => `/dashboard/tasks?${new URLSearchParams({ view: data.view, status: data.status, ...patch })}`;
  return (
    <>
      <PageHeader title="Tasks" description="Work given to you, and work you've given others. Move cards on the board, tick off checklists, and changes show up for everyone at once." />
      <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" aria-label="Which tasks">
        {VIEWS.filter((v) => !("need" in v) || (v.need === "assign" ? data.canAssign : data.canManage)).map((v) => (
          <Link key={v.key} prefetch={false} href={q({ view: v.key, status: "open" })} aria-current={data.view === v.key ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors", data.view === v.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            <v.icon className="h-4 w-4" aria-hidden />{v.label}
          </Link>
        ))}
      </nav>
      <Section title={VIEWS.find((v) => v.key === data.view)?.label ?? "Tasks"} actions={smart ? null : (
        <nav className="flex gap-1" aria-label="Status">
          {([["open", "Open"], ["done", "Finished"], ["all", "All"]] as const).map(([k, label]) => (
            <Link key={k} prefetch={false} href={q({ status: k })} aria-current={data.status === k ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center rounded-md px-3 text-sm", data.status === k ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{label}</Link>
          ))}
        </nav>
      )}>
        <TasksView initial={data} meId={session.user.id} />
      </Section>
      {data.canAssign && (
        <Section title="Give a task" className="mt-6 scroll-mt-20" id="give" description="For a member, or for someone without an account yet (by email). Add a checklist to break it into steps.">
          <NewTaskForm emailEnabled={data.emailEnabled} templates={data.templates} />
        </Section>
      )}
    </>
  );
}
