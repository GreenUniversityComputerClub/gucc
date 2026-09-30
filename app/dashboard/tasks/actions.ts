"use server";

import { runAction } from "@/lib/api/session";

type Fd = FormData;
const s = (fd: Fd, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

export async function createTaskAction(fd: Fd) {
  const toEmail = s(fd, "assignTo") === "email";
  return runAction<{ id: string; message: string }>("tasks.create", {
    title: s(fd, "title"),
    details: s(fd, "details"),
    dueAt: s(fd, "dueAt"),
    priority: s(fd, "priority"),
    assigneeUserId: toEmail ? undefined : s(fd, "assigneeUserId"),
    assigneeEmail: toEmail ? s(fd, "assigneeEmail") : undefined,
    assigneeName: toEmail ? s(fd, "assigneeName") : undefined,
    labels: s(fd, "labels"),
    checklist: s(fd, "checklist"),
    templateId: s(fd, "templateId") || undefined,
  });
}

export async function editTaskAction(id: string, fd: Fd) {
  const reassign = s(fd, "assigneeUserId");
  return runAction("tasks.update", {
    id,
    title: s(fd, "title"),
    details: s(fd, "details") ?? "",
    dueAt: s(fd, "dueAt") ?? "",
    priority: s(fd, "priority"),
    labels: s(fd, "labels") ?? "",
    expectedUpdatedAt: s(fd, "expectedUpdatedAt"),
    ...(reassign ? { assigneeUserId: reassign } : {}),
  });
}

export async function taskStatusAction(id: string, status: string, _fd: Fd) {
  return runAction("tasks.setStatus", { id, status });
}

export async function commentTaskAction(id: string, fd: Fd) {
  return runAction("tasks.comment", { id, body: s(fd, "body") }, { message: "Comment added." });
}
