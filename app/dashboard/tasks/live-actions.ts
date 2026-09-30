"use server";

import { rpc, runAction } from "@/lib/api/session";
import type { listTasks, taskDetail } from "@/lib/server/services/work";

/**
 * Small calls from the task list, board and task page that change one thing and return at once
 * (no page reload): moving a card, ticking a checklist item, a comment, bulk changes.
 */
type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; code?: string };
const plain = <T,>(r: { ok: true; data?: T; message?: string } | { ok: false; error: string; code: string }): Result<T> =>
  r.ok ? { ok: true, data: r.data as T, message: r.message } : { ok: false, error: r.error, code: r.code };

export type TaskList = Awaited<ReturnType<typeof listTasks>>;
export type TaskDetail = Awaited<ReturnType<typeof taskDetail>>;

export async function loadTasksAction(input: { view: string; status: string; page?: number }): Promise<Result<TaskList>> {
  const r = await rpc<TaskList>("tasks.list", input);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

export async function loadTaskAction(id: string): Promise<Result<TaskDetail>> {
  const r = await rpc<TaskDetail>("tasks.get", { id });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

export async function setTaskStatusAction(id: string, status: string, boardPosition?: number) {
  return plain(await runAction("tasks.setStatus", { id, status, boardPosition }));
}

export async function bulkTasksAction(input: { ids: string[]; action: "status" | "assignee" | "due" | "delete"; status?: string; assigneeUserId?: string; dueAt?: string }) {
  const r = await runAction<{ changed: number; skipped: number }>("tasks.bulk", input);
  if (!r.ok) return plain(r);
  const d = r.data!;
  return { ok: true as const, data: d, message: `${d.changed} task${d.changed === 1 ? "" : "s"} changed${d.skipped ? `; ${d.skipped} skipped (not yours to change that way)` : ""}.` };
}

export async function checklistAction(taskId: string, input: { add?: string; toggle?: string; done?: boolean; remove?: string; rename?: string; text?: string }) {
  return plain(await runAction<{ items: TaskDetail["items"] }>("tasks.items", { id: taskId, ...input }));
}

export async function commentAction(taskId: string, body: string, mentions: string[]) {
  return plain(await runAction<{ id: string }>("tasks.comment", { id: taskId, body, mentions }));
}

export async function changeCommentAction(commentId: string, input: { body?: string; delete?: boolean }) {
  return plain(await runAction("tasks.commentChange", { id: commentId, ...input }));
}

export async function deleteTaskAction(id: string) {
  return plain(await runAction("tasks.delete", { id }, { message: "Task deleted." }));
}

export async function saveTemplateAction(input: { title: string; details?: string; priority?: string; checklist?: string[]; labels?: string[] }) {
  return plain(await runAction<{ id: string }>("tasks.saveTemplate", input, { message: "Saved as a template." }));
}
