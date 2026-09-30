/**
 * Tasks and meetings. Executives hand out tasks (to a member, or to an email address for
 * someone without an account yet) and schedule meetings (a Google Meet or any https link, or a
 * place). People see only their own tasks and the meetings they're invited to; holders of
 * tasks.manage / meetings.manage (by default the club's leaders) see and manage all.
 *
 * Tasks have a checklist, labels, a board order and comments with @mentions; meetings have
 * agenda items, minutes, decisions, attendance, and action items that become tasks. Every
 * change is audited, and open pages update live (emit).
 *
 * Notices are in-app. Email goes out only when an email provider is configured, and the
 * result says whether it did; nothing here claims a message was sent when it wasn't.
 */
import { limit } from "../limits";
import { avatarOfProfileSql, avatarUrl, withAvatars } from "../avatar";
import { auditManyStmt, auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import { siteUrl, type Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { emailEnabled } from "../email";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { emit } from "../live";
import { notifyEachStmts, notifyStmts } from "../notifications";
import { deliverEmail } from "../security";
import { batchTransition, staleAnswer, unchangedSince } from "../transition";
import { EMAIL_RE, Validator } from "../validate";
import { triggerStmts } from "../triggers";

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
const RESPONSES = ["YES", "NO", "MAYBE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Checklist items per task, labels per task, repeat meetings at once. */
export const MAX_ITEMS = 50;
export const MAX_LABELS = 6;
export const MAX_REPEAT = 12;

const dhaka = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const actorName = (ctx: Ctx) => ctx.actor?.profile?.full_name ?? ctx.actor?.user.email ?? "Someone";

/** A due date without a time means the end of that day in Dhaka, so a task isn't overdue from midnight. */
export function dueAtEndOfDay(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T23:59:00+06:00`).toISOString() : v;
}

/** Labels as typed ("posters, urgent"): trimmed, deduplicated, short. */
export function cleanLabels(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const l = String(x).replace(/\s+/g, " ").trim().slice(0, 24);
    if (l && !seen.has(l.toLowerCase())) {
      seen.add(l.toLowerCase());
      out.push(l);
    }
  }
  return out.slice(0, MAX_LABELS);
}

const parseLabels = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  title: string;
  details: string | null;
  status: TaskStatus;
  priority: Priority;
  due_at: string | null;
  assignee_user_id: string | null;
  assignee_email: string | null;
  /** The name to show: the member's, or the one typed for an email-only task, or the address. */
  assignee_name: string | null;
  event_id: string | null;
  event_title: string | null;
  meeting_id: string | null;
  meeting_title: string | null;
  created_by: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  comments: number;
  items_total: number;
  items_done: number;
  labels: string[];
  board_position: number | null;
  assignee_avatar: string | null;
  creator_avatar: string | null;
}

interface TaskQueryRow extends Omit<TaskRow, "labels" | "assignee_avatar" | "creator_avatar"> {
  labels_json: string | null;
  /** What's stored for email-only tasks (never the display fallback). */
  assignee_stored_name: string | null;
  assignee_avatar_json: string | null;
  creator_avatar_json: string | null;
}

/** Photo URLs in place of the raw media JSON, labels as a list. */
const taskOut = ({ assignee_avatar_json, creator_avatar_json, labels_json, assignee_stored_name: _s, ...t }: TaskQueryRow): TaskRow =>
  ({ ...t, labels: parseLabels(labels_json), assignee_avatar: avatarUrl(assignee_avatar_json), creator_avatar: avatarUrl(creator_avatar_json) });

const TASK_SELECT = `
  SELECT t.id, t.title, t.details, t.status, t.priority, t.due_at, t.assignee_user_id, t.assignee_email,
         COALESCE(ap.full_name, t.assignee_name, t.assignee_email) AS assignee_name, t.assignee_name AS assignee_stored_name,
         t.event_id, e.title AS event_title, t.meeting_id, mt.title AS meeting_title,
         t.created_by, COALESCE(cp.full_name, cu.email) AS creator_name, t.created_at, t.updated_at, t.completed_at,
         t.comment_count AS comments, t.labels_json, t.board_position,
         (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id) AS items_total,
         (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id AND i.done_at IS NOT NULL) AS items_done,
         ${avatarOfProfileSql("ap")} AS assignee_avatar_json, ${avatarOfProfileSql("cp")} AS creator_avatar_json
  FROM tasks t
  LEFT JOIN profiles ap ON ap.user_id = t.assignee_user_id AND ap.deleted_at IS NULL
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN profiles cp ON cp.user_id = t.created_by AND cp.deleted_at IS NULL
  LEFT JOIN events e ON e.id = t.event_id
  LEFT JOIN meetings mt ON mt.id = t.meeting_id`;

/** An account (ACTIVE) for the assignee, or an email address to hold the task for. */
async function resolveAssignee(ctx: Ctx, input: Record<string, unknown>) {
  const userId = typeof input.assigneeUserId === "string" && input.assigneeUserId ? input.assigneeUserId : null;
  if (userId) {
    const u = await ctx.db.first<{ id: string; email: string; status: string; name: string | null }>(
      "SELECT u.id, u.email, u.status, p.full_name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE u.id = ?1 AND u.deleted_at IS NULL", userId);
    if (!u) throw new ValidationError("Choose who the task is for.", { assigneeUserId: "That person wasn't found." });
    if (u.status !== "ACTIVE") throw new ValidationError("That account isn't active, so it can't receive tasks.", { assigneeUserId: "Account not active." });
    return { userId: u.id, email: u.email, name: u.name, emailOnly: false };
  }
  const email = String(input.assigneeEmail ?? "").trim().toLowerCase();
  if (!email) throw new ValidationError("Choose who the task is for: a member, or an email address.", { assigneeUserId: "Required." });
  if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.", { assigneeEmail: "Enter a valid email address." });
  // Someone with an active account gets the task in their dashboard straight away.
  const existing = await ctx.db.first<{ id: string; name: string | null }>(
    "SELECT u.id, p.full_name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL WHERE lower(u.email) = ?1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL", email);
  if (existing) return { userId: existing.id, email, name: existing.name, emailOnly: false };
  const name = String(input.assigneeName ?? "").trim().slice(0, 120) || null;
  return { userId: null, email, name, emailOnly: true };
}

async function loadTask(ctx: Ctx, id: string): Promise<TaskQueryRow> {
  const t = await ctx.db.first<TaskQueryRow>(`${TASK_SELECT} WHERE t.id = ?1 AND t.deleted_at IS NULL`, id);
  if (!t) throw new NotFoundError("Task");
  return t;
}

export interface TaskRole {
  creator: boolean;
  assignee: boolean;
  manager: boolean;
  canEdit: boolean;
}

function taskRole(ctx: Ctx, t: Pick<TaskRow, "created_by" | "assignee_user_id">): TaskRole {
  const me = requireActor(ctx).user.id;
  const manager = can(ctx, "tasks.manage");
  return { creator: t.created_by === me, assignee: t.assignee_user_id === me, manager, canEdit: t.created_by === me || manager };
}

/**
 * Which status changes this person may make now: the assignee moves their work along (start,
 * finish, reopen what they finished); the creator and managers can do anything, including
 * cancelling and bringing a cancelled task back. The page shows exactly these buttons.
 */
export function allowedTransitions(role: TaskRole, status: TaskStatus): TaskStatus[] {
  if (role.canEdit) return TASK_STATUSES.filter((s) => s !== status);
  if (!role.assignee || status === "CANCELLED") return [];
  return (["OPEN", "IN_PROGRESS", "DONE"] as const).filter((s) => s !== status);
}

/** People the task concerns, for live updates of open pages. */
const taskPeople = (t: Pick<TaskRow, "created_by" | "assignee_user_id">) => [t.created_by, t.assignee_user_id];

/**
 * Email for a task given to an address without an account, only when email is on. Members with
 * an account get the notification, which is emailed to them by their own email settings.
 */
async function emailTask(ctx: Ctx, to: string | null, subject: string, text: string): Promise<boolean> {
  if (!to || !(await emailEnabled(ctx))) return false;
  return deliverEmail(ctx, { to, subject, text }, { type: "task.email" });
}

/** Checklist lines as typed (one per line), or from a template. */
function checklistOf(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/\r?\n/);
  return list.map((l) => l.replace(/^\s*[-*•\d.)\]]*\s*(\[[ xX]?\]\s*)?/, "").trim().slice(0, 300)).filter(Boolean).slice(0, MAX_ITEMS);
}

export async function createTask(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "tasks.assign");
  await limit(ctx, "tasks.create", actor.user.id);
  // "New from template": the template fills in what the form left empty.
  const template = typeof input.templateId === "string" && input.templateId
    ? await ctx.db.first<{ title: string; details: string | null; priority: Priority; checklist_json: string | null; labels_json: string | null }>(
      "SELECT title, details, priority, checklist_json, labels_json FROM task_templates WHERE id = ?1 AND deleted_at IS NULL", input.templateId)
    : null;
  if (input.templateId && !template) throw new ValidationError("That template wasn't found.", { templateId: "Not found." });
  const v = new Validator({ ...input, title: input.title || template?.title, details: input.details || template?.details || undefined, priority: input.priority || template?.priority });
  const title = v.string("title", { required: true, max: 200, label: "Title" });
  const details = v.string("details", { max: 5000, label: "Details" });
  const dueAt = dueAtEndOfDay(v.datetime("dueAt", { label: "Due" }));
  const priority = v.oneOf("priority", PRIORITIES, { label: "Priority" }) ?? "NORMAL";
  const eventId = v.string("eventId", { max: 80 });
  const meetingId = v.string("meetingId", { max: 80 });
  v.done();
  const labels = cleanLabels(input.labels ?? parseLabels(template?.labels_json));
  const checklist = checklistOf(input.checklist ?? parseLabels(template?.checklist_json));
  const who = await resolveAssignee(ctx, input);
  if (eventId && !(await ctx.db.first("SELECT 1 FROM events WHERE id = ?1 AND deleted_at IS NULL", eventId))) throw new ValidationError("That event wasn't found.", { eventId: "Not found." });
  if (meetingId && !(await ctx.db.first("SELECT 1 FROM meetings WHERE id = ?1 AND deleted_at IS NULL", meetingId))) throw new ValidationError("That meeting wasn't found.", { meetingId: "Not found." });
  const id = newId("tsk");
  const now = nowIso();
  const due = dueAt ? ` Due ${dhaka(dueAt)}.` : "";
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO tasks (id, title, details, priority, due_at, assignee_user_id, assignee_email, assignee_name, event_id, meeting_id, labels_json, created_by, created_at, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?12)`,
      id, title, details, priority, dueAt, who.userId, who.emailOnly ? who.email : null, who.emailOnly ? who.name : null, eventId, meetingId,
      labels.length ? JSON.stringify(labels) : null, actor.user.id, now),
    ...(checklist.length ? [ctx.db.stmt(
      "INSERT INTO task_items (id, task_id, text, position, created_at) SELECT ?1 || '_' || j.key, ?2, j.value, j.key, ?3 FROM json_each(?4) AS j",
      newId("tki"), id, now, JSON.stringify(checklist))] : []),
    auditStmt(ctx, { action: "task.create", resourceType: "task", resourceId: id, after: { title, assignee: who.name ?? who.email, due_at: dueAt, priority, labels, checklist: checklist.length || undefined }, decision }),
    ...(who.userId && who.userId !== actor.user.id
      ? notifyStmts(ctx, [who.userId], { type: "task.assigned", title: `New task: ${title}`, body: `${actorName(ctx)} gave you a task.${due}`, link: `/dashboard/tasks/${id}`, resourceType: "task", resourceId: id })
      : []),
  ]);
  emit(ctx, [actor.user.id, who.userId], { t: "task", id });
  const emailed = await emailTask(ctx, who.emailOnly ? who.email : null, `GUCC task: ${title}`,
    `${actorName(ctx)} gave you a task in the Green University Computer Club.\n\n${title}${details ? `\n\n${details}` : ""}${due ? `\n\n${due.trim()}` : ""}\n\n${
      who.emailOnly ? `You'll see it in your GUCC dashboard once you have an approved account with this email address: ${siteUrl(ctx, "/auth/sign-up")}` : `Open it: ${siteUrl(ctx, `/dashboard/tasks/${id}`)}`}`);
  const message = who.emailOnly
    ? emailed ? `Task saved and emailed to ${who.email}. It moves to their dashboard once they have an approved account.` : `Task saved for ${who.email}. Email isn't set up, so tell them yourself; it moves to their dashboard once they have an approved account with that address.`
    : who.userId === actor.user.id ? "Task saved to your own list." : "Task assigned. They were notified.";
  return { id, emailed, message };
}

export async function updateTask(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new ForbiddenError("You can't change this task.");
  const v = new Validator(input);
  const status = v.oneOf("status", TASK_STATUSES, { label: "Status" });
  const editsDetails = ["title", "details", "dueAt", "priority", "assigneeUserId", "assigneeEmail", "labels"].some((k) => input[k] !== undefined);
  if (editsDetails && !role.canEdit) throw new ForbiddenError("Only the person who created the task, or someone who manages tasks, can change its details.");
  if (status && status !== t.status && !allowedTransitions(role, t.status).includes(status)) {
    throw new ForbiddenError(t.status === "CANCELLED" ? "This task was cancelled; only the person who created it can bring it back." : "Only the person who created the task can cancel it.");
  }
  const title = input.title !== undefined ? v.string("title", { required: true, max: 200, label: "Title" }) : t.title;
  const details = input.details !== undefined ? v.string("details", { max: 5000, label: "Details" }) : t.details;
  const dueAt = input.dueAt !== undefined ? dueAtEndOfDay(v.datetime("dueAt", { label: "Due" })) : t.due_at;
  const priority = input.priority !== undefined ? v.oneOf("priority", PRIORITIES, { required: true, label: "Priority" }) : t.priority;
  v.done();
  const labels = input.labels !== undefined ? cleanLabels(input.labels) : null;
  const guard = await unchangedSince(ctx, "tasks", id, input.expectedUpdatedAt);
  const reassign = role.canEdit && (input.assigneeUserId || input.assigneeEmail) ? await resolveAssignee(ctx, input) : null;
  const assigneeChanged = reassign && (reassign.userId !== t.assignee_user_id || (reassign.emailOnly && reassign.email !== t.assignee_email));
  const next = {
    title: title!, details, due_at: dueAt, priority: priority!, status: status ?? t.status,
    assignee_user_id: assigneeChanged ? reassign!.userId : t.assignee_user_id,
    assignee_email: assigneeChanged ? (reassign!.emailOnly ? reassign!.email : null) : t.assignee_email,
    // What's stored, never the display name (an email-only task keeps the name typed for it, or none).
    assignee_name: assigneeChanged ? (reassign!.emailOnly ? reassign!.name : null) : (t.assignee_user_id ? null : t.assignee_stored_name),
  };
  const now = nowIso();
  const stmts: D1StatementLike[] = [
    ...guard,
    ctx.db.stmt(
      `UPDATE tasks SET title = ?2, details = ?3, due_at = ?4, priority = ?5, status = ?6, assignee_user_id = ?7, assignee_email = ?8, assignee_name = ?9,
         completed_at = CASE WHEN ?6 = 'DONE' THEN COALESCE(completed_at, ?10) ELSE NULL END,
         labels_json = CASE WHEN ?11 = 1 THEN ?12 ELSE labels_json END,
         reminded_at = CASE WHEN due_at IS ?4 AND assignee_user_id IS ?7 THEN reminded_at ELSE NULL END, updated_at = ?10, updated_by = ?13 WHERE id = ?1`,
      id, next.title, next.details, next.due_at, next.priority, next.status, next.assignee_user_id, next.assignee_email, next.assignee_name, now,
      labels ? 1 : 0, labels?.length ? JSON.stringify(labels) : null, actor.user.id),
    auditStmt(ctx, {
      action: status && status !== t.status && !editsDetails ? "task.status" : "task.update", resourceType: "task", resourceId: id,
      before: { title: t.title, status: t.status, due_at: t.due_at, priority: t.priority, assignee: t.assignee_name },
      after: { title: next.title, status: next.status, due_at: next.due_at, priority: next.priority, assignee: assigneeChanged ? (reassign!.name ?? reassign!.email) : t.assignee_name, labels: labels ?? undefined },
    }),
  ];
  const link = `/dashboard/tasks/${id}`;
  // The creator hears about progress; a new assignee hears about the task; nobody hears about their own change.
  if (status && status !== t.status && t.created_by !== actor.user.id) {
    const word = { OPEN: "reopened", IN_PROGRESS: "started", DONE: "finished", CANCELLED: "cancelled" }[status];
    stmts.push(...notifyStmts(ctx, [t.created_by], { type: "task.status", title: `${actorName(ctx)} ${word} “${next.title}”`, link, resourceType: "task", resourceId: id }));
  }
  // The assignee hears when someone else reopens or finishes their task (cancelling has its own notice below).
  const statusToAssignee = Boolean(status && status !== t.status && status !== "CANCELLED" && !assigneeChanged && next.assignee_user_id && next.assignee_user_id !== actor.user.id && next.assignee_user_id !== t.created_by);
  if (statusToAssignee) {
    const word = { OPEN: "reopened", IN_PROGRESS: "started", DONE: "finished" }[status as "OPEN" | "IN_PROGRESS" | "DONE"];
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id!], { type: "task.status", title: `${actorName(ctx)} ${word} “${next.title}”`, link, resourceType: "task", resourceId: id }));
  }
  if (status === "CANCELLED" && t.status !== "CANCELLED" && next.assignee_user_id && next.assignee_user_id !== actor.user.id) {
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id], { type: "task.cancelled", title: `Task cancelled: ${next.title}`, link, resourceType: "task", resourceId: id }));
  }
  if (assigneeChanged && next.status !== "CANCELLED" && next.assignee_user_id && next.assignee_user_id !== actor.user.id) {
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id], { type: "task.assigned", title: `New task: ${next.title}`, body: `${actorName(ctx)} gave you a task.`, link, resourceType: "task", resourceId: id }));
  }
  // The person it was taken from, and the assignee when what's asked or when it's due changes.
  if (assigneeChanged && t.assignee_user_id && t.assignee_user_id !== actor.user.id) {
    // They can't open the task any more: the notice points to their task list.
    stmts.push(...notifyStmts(ctx, [t.assignee_user_id], { type: "task.reassigned", title: `Task moved to someone else: ${next.title}`, body: `${actorName(ctx)} gave it to ${reassign!.name ?? reassign!.email ?? "someone else"}.`, link: "/dashboard/tasks", resourceType: "task", resourceId: id }));
  }
  const detailsChanged = next.title !== t.title || (next.details ?? null) !== (t.details ?? null) || (next.due_at ?? null) !== (t.due_at ?? null) || next.priority !== t.priority;
  if (!assigneeChanged && !statusToAssignee && detailsChanged && next.assignee_user_id && next.assignee_user_id !== actor.user.id && next.status !== "CANCELLED") {
    const due = next.due_at !== t.due_at ? (next.due_at ? ` Due ${new Date(next.due_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}.` : " No due date now.") : "";
    const what = [next.title !== t.title && "title", (next.details ?? null) !== (t.details ?? null) && "details", (next.due_at ?? null) !== (t.due_at ?? null) && "due date", next.priority !== t.priority && `priority (now ${next.priority.toLowerCase()})`].filter(Boolean).join(", ");
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id], { type: "task.updated", title: `Task changed: ${next.title}`, body: `${actorName(ctx)} changed the ${what}.${due}`, link, resourceType: "task", resourceId: id }));
  }
  if (status === "DONE" && t.status !== "DONE") {
    stmts.push(...(await triggerStmts(ctx, "task.completed", { type: "task", id, ownerId: t.created_by, createdBy: t.created_by }, { title: next.title, link })));
  }
  await batchTransition(ctx, stmts, () => staleAnswer(ctx, "tasks", id));
  emit(ctx, [...taskPeople(t), next.assignee_user_id], { t: "task", id });
  if (assigneeChanged) {
    const emailed = await emailTask(ctx, reassign!.emailOnly ? reassign!.email : null, `GUCC task: ${next.title}`,
      `${actorName(ctx)} gave you a task in the Green University Computer Club.\n\n${next.title}${next.details ? `\n\n${next.details}` : ""}\n\n${reassign!.emailOnly ? `It appears in your GUCC dashboard once you have an approved account with this email address.` : `Open it: ${siteUrl(ctx, link)}`}`);
    if (reassign!.emailOnly) return { message: emailed ? `Saved and emailed to ${reassign!.email}.` : `Saved. Email isn't set up, so tell ${reassign!.email} yourself.` };
    return { message: reassign!.userId === actor.user.id ? "Saved to your own list." : "Saved. The new assignee was notified." };
  }
  return { message: "Saved.", status: next.status, updatedAt: now };
}

/** Status only (the board and the status buttons): a toggle, so never replayed. */
export async function setTaskStatus(ctx: Ctx, id: string, status: unknown, boardPosition?: unknown) {
  const r = await updateTask(ctx, id, { status });
  if (typeof boardPosition === "number" && Number.isFinite(boardPosition)) {
    await ctx.db.run("UPDATE tasks SET board_position = ?2 WHERE id = ?1", id, boardPosition);
  }
  return r;
}

/**
 * Change many tasks at once (the list's checkboxes): status, assignee, due date or delete. Only
 * tasks the person may change that way are touched; one statement for all of them, one audit row
 * each (set-based), one notice per person affected.
 */
export async function bulkTasks(ctx: Ctx, input: { ids?: unknown; action?: unknown; status?: unknown; assigneeUserId?: unknown; dueAt?: unknown }) {
  const actor = requireActor(ctx);
  const ids = (Array.isArray(input.ids) ? input.ids : []).map(String).filter((x) => x.length <= 80).slice(0, 100);
  if (!ids.length) throw new ValidationError("Choose at least one task.");
  const action = ["status", "assignee", "due", "delete"].includes(String(input.action)) ? String(input.action) : null;
  if (!action) throw new ValidationError("Choose what to do.");
  const manager = can(ctx, "tasks.manage");
  const rows = await ctx.db.all<{ id: string; title: string; status: TaskStatus; created_by: string; assignee_user_id: string | null }>(
    "SELECT id, title, status, created_by, assignee_user_id FROM tasks WHERE id IN (SELECT value FROM json_each(?1)) AND deleted_at IS NULL", JSON.stringify(ids));
  const now = nowIso();
  let allowed: typeof rows = [];
  let set = "";
  const params: Array<string | null> = [];
  let what = "";
  if (action === "status") {
    const status = TASK_STATUSES.find((s) => s === input.status);
    if (!status) throw new ValidationError("Choose a status.");
    allowed = rows.filter((r) => r.status !== status && allowedTransitions(taskRole(ctx, r), r.status).includes(status));
    set = "status = ?3, completed_at = CASE WHEN ?3 = 'DONE' THEN COALESCE(completed_at, ?2) ELSE NULL END";
    params.push(status);
    what = { OPEN: "reopened", IN_PROGRESS: "started", DONE: "finished", CANCELLED: "cancelled" }[status];
  } else if (action === "due") {
    const v = new Validator({ dueAt: input.dueAt });
    const due = dueAtEndOfDay(v.datetime("dueAt", { label: "Due" }));
    v.done();
    allowed = rows.filter((r) => r.created_by === actor.user.id || manager);
    set = "due_at = ?3, reminded_at = NULL";
    params.push(due);
    what = due ? `moved the due date to ${dhaka(due)} for` : "removed the due date from";
  } else if (action === "assignee") {
    const who = await resolveAssignee(ctx, { assigneeUserId: input.assigneeUserId });
    allowed = rows.filter((r) => (r.created_by === actor.user.id || manager) && r.assignee_user_id !== who.userId);
    set = "assignee_user_id = ?3, assignee_email = NULL, assignee_name = NULL, reminded_at = NULL";
    params.push(who.userId);
    what = "reassigned";
  } else {
    allowed = rows.filter((r) => r.created_by === actor.user.id || manager);
    set = "deleted_at = ?2";
    what = "deleted";
  }
  if (!allowed.length) return { changed: 0, skipped: rows.length };
  const json = JSON.stringify(allowed.map((r) => r.id));
  const notices = action === "assignee"
    ? [{ userId: String(input.assigneeUserId), type: "task.assigned", title: `${allowed.length === 1 ? `New task: ${allowed[0]!.title}` : `${allowed.length} tasks given to you`}`, body: `${actorName(ctx)} gave you ${allowed.length === 1 ? "a task" : "tasks"}.`, link: "/dashboard/tasks" }]
    : [...new Set(allowed.map((r) => r.assignee_user_id).filter((u): u is string => !!u && u !== actor.user.id))].map((u) => ({
        userId: u, type: action === "delete" ? "task.cancelled" : action === "status" ? "task.status" : "task.updated", link: "/dashboard/tasks",
        title: `${actorName(ctx)} ${what} ${allowed.filter((r) => r.assignee_user_id === u).length === 1 ? `“${allowed.find((r) => r.assignee_user_id === u)!.title}”` : `${allowed.filter((r) => r.assignee_user_id === u).length} of your tasks`}`,
      }));
  await ctx.db.batch([
    ctx.db.stmt(`UPDATE tasks SET ${set}, updated_at = ?2, updated_by = ?4 WHERE id IN (SELECT value FROM json_each(?1))`, json, now, ...params, ...(params.length ? [] : [null]), actor.user.id),
    ...auditManyStmt(ctx, allowed.map((r) => ({ action: `task.bulk_${action}`, resourceType: "task", resourceId: r.id, before: { title: r.title, status: r.status }, after: { action, value: params[0] ?? null } }))),
    ...notifyEachStmts(ctx, notices),
  ]);
  emit(ctx, [actor.user.id, ...allowed.flatMap((r) => [r.created_by, r.assignee_user_id]), action === "assignee" ? String(input.assigneeUserId) : null], { t: "task", id: "*" });
  return { changed: allowed.length, skipped: rows.length - allowed.length };
}

/** Soft-delete one task (its creator or a manager). */
export async function deleteTask(ctx: Ctx, id: string) {
  const t = await loadTask(ctx, id);
  if (!taskRole(ctx, t).canEdit) throw new ForbiddenError("Only the person who created the task can delete it.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE tasks SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1", id, nowIso()),
    auditStmt(ctx, { action: "task.delete", resourceType: "task", resourceId: id, before: { title: t.title, status: t.status } }),
  ]);
  emit(ctx, taskPeople(t), { t: "task", id });
}

/** People mentioned in a comment who can see the task (its creator, assignee, managers), by account id. */
async function mentioned(ctx: Ctx, raw: unknown): Promise<string[]> {
  const ids = (Array.isArray(raw) ? raw : []).map(String).filter((x) => x.length <= 80).slice(0, 10);
  if (!ids.length) return [];
  const rows = await ctx.db.all<{ id: string }>("SELECT id FROM users WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'ACTIVE' AND deleted_at IS NULL", JSON.stringify(ids));
  return rows.map((r) => r.id);
}

export async function commentOnTask(ctx: Ctx, id: string, rawBody: unknown, rawMentions?: unknown) {
  const actor = requireActor(ctx);
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new ForbiddenError("You can't comment on this task.");
  const body = String(rawBody ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Write a comment.", { body: "Write a comment." });
  if (body.length > 2000) throw new ValidationError("Keep comments under 2,000 characters.", { body: "Too long." });
  await limit(ctx, "tasks.comment", actor.user.id);
  const others = [t.created_by, t.assignee_user_id].filter((u): u is string => !!u && u !== actor.user.id);
  // @mentions: people outside the task are told too (they open it through the notice only if they may).
  const mentions = (await mentioned(ctx, rawMentions)).filter((u) => u !== actor.user.id && !others.includes(u));
  const now = nowIso();
  const commentId = newId("tcm");
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO task_comments (id, task_id, author_user_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", commentId, id, actor.user.id, body, now),
    ctx.db.stmt("UPDATE tasks SET updated_at = ?2, comment_count = comment_count + 1 WHERE id = ?1", id, now),
    ...notifyStmts(ctx, others, { type: "task.comment", title: `${actorName(ctx)} commented on “${t.title}”`, body: body.slice(0, 140), link: `/dashboard/tasks/${id}`, resourceType: "task", resourceId: id }),
    ...notifyStmts(ctx, mentions, { type: "task.mention", title: `${actorName(ctx)} mentioned you on “${t.title}”`, body: body.slice(0, 140), link: `/dashboard/tasks/${id}`, resourceType: "task", resourceId: id }),
  ]);
  emit(ctx, [actor.user.id, ...others], { t: "task", id });
  return { id: commentId };
}

/** Edit or delete your own comment (managers may delete any). */
export async function changeTaskComment(ctx: Ctx, commentId: string, input: { body?: unknown; delete?: unknown }) {
  const actor = requireActor(ctx);
  const c = await ctx.db.first<{ task_id: string; author_user_id: string }>("SELECT task_id, author_user_id FROM task_comments WHERE id = ?1 AND deleted_at IS NULL", commentId);
  if (!c) throw new NotFoundError("Comment");
  const t = await loadTask(ctx, c.task_id);
  const mine = c.author_user_id === actor.user.id;
  const now = nowIso();
  if (input.delete === true) {
    if (!mine && !can(ctx, "tasks.manage")) throw new ForbiddenError("You can delete only your own comments.");
    await ctx.db.batch([
      ctx.db.stmt("UPDATE task_comments SET deleted_at = ?2 WHERE id = ?1", commentId, now),
      ctx.db.stmt("UPDATE tasks SET comment_count = max(0, comment_count - 1), updated_at = ?2 WHERE id = ?1", c.task_id, now),
      auditStmt(ctx, { action: "task.comment_delete", resourceType: "task", resourceId: c.task_id }),
    ]);
  } else {
    if (!mine) throw new ForbiddenError("You can edit only your own comments.");
    const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
    if (!body) throw new ValidationError("Write a comment.", { body: "Write a comment." });
    if (body.length > 2000) throw new ValidationError("Keep comments under 2,000 characters.", { body: "Too long." });
    await ctx.db.run("UPDATE task_comments SET body = ?2, edited_at = ?3 WHERE id = ?1", commentId, body, now);
  }
  emit(ctx, taskPeople(t), { t: "task", id: c.task_id });
}

/** Checklist: add lines, tick or untick, rename, remove. The assignee and the task's editors. */
export async function changeTaskItems(ctx: Ctx, taskId: string, input: { add?: unknown; toggle?: unknown; done?: unknown; remove?: unknown; rename?: unknown; text?: unknown }) {
  const actor = requireActor(ctx);
  const t = await loadTask(ctx, taskId);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new NotFoundError("Task");
  const now = nowIso();
  const stmts: D1StatementLike[] = [];
  if (input.add !== undefined) {
    const lines = checklistOf(input.add);
    if (!lines.length) throw new ValidationError("Write the item.", { add: "Write the item." });
    if (t.items_total + lines.length > MAX_ITEMS) throw new ValidationError(`A checklist can have up to ${MAX_ITEMS} items.`);
    stmts.push(ctx.db.stmt(
      "INSERT INTO task_items (id, task_id, text, position, created_at) SELECT ?1 || '_' || j.key, ?2, j.value, ?3 + j.key, ?4 FROM json_each(?5) AS j",
      newId("tki"), taskId, t.items_total, now, JSON.stringify(lines)));
  }
  if (typeof input.toggle === "string") {
    const done = input.done === true;
    stmts.push(ctx.db.stmt("UPDATE task_items SET done_at = CASE WHEN ?3 = 1 THEN COALESCE(done_at, ?4) ELSE NULL END, done_by = CASE WHEN ?3 = 1 THEN ?5 ELSE NULL END WHERE id = ?1 AND task_id = ?2",
      input.toggle, taskId, done ? 1 : 0, now, actor.user.id));
  }
  if (typeof input.rename === "string") {
    const text = String(input.text ?? "").trim().slice(0, 300);
    if (!text) throw new ValidationError("Write the item.");
    stmts.push(ctx.db.stmt("UPDATE task_items SET text = ?3 WHERE id = ?1 AND task_id = ?2", input.rename, taskId, text));
  }
  if (typeof input.remove === "string") stmts.push(ctx.db.stmt("DELETE FROM task_items WHERE id = ?1 AND task_id = ?2", input.remove, taskId));
  if (!stmts.length) throw new ValidationError("Nothing to change.");
  stmts.push(ctx.db.stmt("UPDATE tasks SET updated_at = ?2 WHERE id = ?1", taskId, now));
  await ctx.db.batch(stmts);
  emit(ctx, taskPeople(t), { t: "task", id: taskId });
  return { items: await taskItems(ctx, taskId) };
}

async function taskItems(ctx: Ctx, taskId: string) {
  return ctx.db.all<{ id: string; text: string; done_at: string | null; position: number }>(
    "SELECT id, text, done_at, position FROM task_items WHERE task_id = ?1 ORDER BY position, created_at LIMIT 60", taskId);
}

/** Lists that use an index each (instead of one query with OR-ed conditions). */
export type TaskView = "mine" | "created" | "all" | "overdue" | "today" | "week";
export const TASK_VIEWS: TaskView[] = ["mine", "overdue", "today", "week", "created", "all"];

/** Midnight at the end of today (and of the next seven days) in Dhaka, as UTC instants. */
export function dhakaDayEnd(now = new Date(), days = 1): string {
  const d = new Date(now.getTime() + 6 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + days * 86_400_000 - 6 * 3600_000).toISOString();
}

export async function listTasks(ctx: Ctx, input: { view?: string; status?: string; assignee?: string; page?: number } = {}) {
  const actor = requireActor(ctx);
  const manager = can(ctx, "tasks.manage");
  const canAssign = can(ctx, "tasks.assign");
  const base = { canAssign, canManage: manager, emailEnabled: await emailEnabled(ctx) };
  // Managers may look at one person's tasks (the Tasks tab of a profile).
  if (input.assignee && manager) {
    const rows = await ctx.db.all<TaskQueryRow>(`${TASK_SELECT} WHERE t.deleted_at IS NULL AND t.assignee_user_id = ?1 ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_at IS NULL, t.due_at, t.created_at DESC LIMIT 100`, input.assignee);
    return { rows: rows.map(taskOut), view: "person", status: "all", more: false, page: 1, templates: [], ...base };
  }
  const view: TaskView = (TASK_VIEWS as string[]).includes(input.view ?? "") ? (input.view as TaskView) : "mine";
  const effective: TaskView = view === "all" && !manager ? "mine" : view === "created" && !canAssign ? "mine" : view;
  const status = input.status === "done" ? "done" : input.status === "all" ? "all" : "open";
  const page = Math.max(1, Math.min(Number(input.page) || 1, 50));
  const now = new Date();
  const statusSql = status === "open" ? "t.status IN ('OPEN','IN_PROGRESS')" : status === "done" ? "t.status IN ('DONE','CANCELLED')" : "1 = 1";
  // Overdue / today / this week: my tasks (everyone's for managers who chose "all" first? no: mine).
  const where: Record<TaskView, string> = {
    mine: `t.assignee_user_id = ?1 AND ${statusSql}`,
    created: `t.created_by = ?1 AND ${statusSql}`,
    all: statusSql,
    overdue: "t.assignee_user_id = ?1 AND t.status IN ('OPEN','IN_PROGRESS') AND t.due_at IS NOT NULL AND t.due_at < ?2",
    today: "t.assignee_user_id = ?1 AND t.status IN ('OPEN','IN_PROGRESS') AND t.due_at IS NOT NULL AND t.due_at <= ?3",
    week: "t.assignee_user_id = ?1 AND t.status IN ('OPEN','IN_PROGRESS') AND t.due_at IS NOT NULL AND t.due_at <= ?4",
  };
  const size = 100;
  const rows = await ctx.db.all<TaskQueryRow>(
    `${TASK_SELECT}
     WHERE t.deleted_at IS NULL AND ${where[effective]}
     ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_at IS NULL, t.due_at, t.created_at DESC
     LIMIT ?5 OFFSET ?6`,
    actor.user.id, now.toISOString(), dhakaDayEnd(now), dhakaDayEnd(now, 7), size + 1, (page - 1) * size);
  const templates = canAssign
    ? await ctx.db.all<{ id: string; title: string }>("SELECT id, title FROM task_templates WHERE deleted_at IS NULL AND created_by = ?1 ORDER BY created_at DESC LIMIT 30", actor.user.id)
    : [];
  return { rows: rows.slice(0, size).map(taskOut), view: effective, status, more: rows.length > size, page, templates, ...base };
}

export async function taskDetail(ctx: Ctx, id: string) {
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new NotFoundError("Task");
  const [comments, items, activity] = await Promise.all([
    ctx.db.all<{ id: string; body: string; created_at: string; edited_at: string | null; author_user_id: string; author: string | null; avatar_json: string | null }>(
      `SELECT c.id, c.body, c.created_at, c.edited_at, c.author_user_id, COALESCE(p.full_name, u.email) AS author, ${avatarOfProfileSql("p")} AS avatar_json FROM task_comments c
       JOIN users u ON u.id = c.author_user_id LEFT JOIN profiles p ON p.user_id = c.author_user_id AND p.deleted_at IS NULL
       WHERE c.task_id = ?1 AND c.deleted_at IS NULL ORDER BY c.created_at LIMIT 300`, id),
    taskItems(ctx, id),
    // What happened to it, from the activity log (who, what, when).
    ctx.db.all<{ action: string; created_at: string; actor: string | null; after_json: string | null }>(
      `SELECT a.action, a.created_at, COALESCE(p.full_name, a.actor_label, 'GUCC') AS actor, a.after_json FROM audit_logs a
       LEFT JOIN profiles p ON p.user_id = a.actor_user_id AND p.deleted_at IS NULL
       WHERE a.resource_type = 'task' AND a.resource_id = ?1 ORDER BY a.created_at DESC LIMIT 20`, id),
  ]);
  return {
    task: taskOut(t), comments: withAvatars(comments), items, role, transitions: allowedTransitions(role, t.status),
    activity: activity.map((a) => ({ action: a.action, at: a.created_at, actor: a.actor, status: a.after_json ? (JSON.parse(a.after_json) as { status?: string }).status ?? null : null })),
    emailEnabled: await emailEnabled(ctx),
  };
}

/** Save a task as a template (title, details, priority, checklist, labels) for "New from template". */
export async function saveTaskTemplate(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  requirePermission(ctx, "tasks.assign");
  const v = new Validator(input);
  const title = v.string("title", { required: true, max: 200, label: "Title" });
  const details = v.string("details", { max: 5000, label: "Details" });
  const priority = v.oneOf("priority", PRIORITIES, { label: "Priority" }) ?? "NORMAL";
  v.done();
  const id = newId("ttp");
  await ctx.db.run("INSERT INTO task_templates (id, title, details, priority, checklist_json, labels_json, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    id, title, details, priority, JSON.stringify(checklistOf(input.checklist)), JSON.stringify(cleanLabels(input.labels)), actor.user.id, nowIso());
  return { id };
}

export async function deleteTaskTemplate(ctx: Ctx, id: string) {
  const actor = requireActor(ctx);
  const n = await ctx.db.run("UPDATE task_templates SET deleted_at = ?3 WHERE id = ?1 AND created_by = ?2 AND deleted_at IS NULL", id, actor.user.id, nowIso());
  if (!n) throw new NotFoundError("Template");
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export interface MeetingRow {
  id: string;
  title: string;
  agenda: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meet_url: string | null;
  join_url: string | null;
  status: "SCHEDULED" | "CANCELLED" | "DONE";
  created_by: string;
  organizer: string | null;
  participants: number;
  going: number;
  maybe: number;
  declined: number;
  my_response: string | null;
  decisions_json: string | null;
  series_id: string | null;
  updated_at: string;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** Accepts "abc-defg-hij", "meet.google.com/abc-defg-hij" or the full https link; returns the canonical link. */
export function normalizeMeetUrl(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const code = v.replace(/^https?:\/\//i, "").replace(/^meet\.google\.com\//i, "").split(/[?#]/)[0]!.toLowerCase();
  const url = `https://meet.google.com/${code}`;
  if (!MEET_RE.test(url)) throw new ValidationError("Paste a Google Meet link like https://meet.google.com/abc-defg-hij.", { meetUrl: "Not a Google Meet link." });
  return url;
}

/** A join link: Google Meet (stored canonically) or any other https link (Zoom, Teams, Jitsi…). */
export function joinLink(raw: unknown): { meetUrl: string | null; joinUrl: string | null } {
  const v = String(raw ?? "").trim();
  if (!v) return { meetUrl: null, joinUrl: null };
  if (/meet\.google\.com|^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(v)) return { meetUrl: normalizeMeetUrl(v), joinUrl: null };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new ValidationError("Paste the full meeting link, starting with https://.", { meetUrl: "Not a link." });
  }
  if (u.protocol !== "https:" || v.length > 500) throw new ValidationError("Meeting links must start with https://.", { meetUrl: "Use an https link." });
  return { meetUrl: null, joinUrl: u.toString() };
}

/** `me` is the placeholder that holds the viewer's user id, e.g. "?2". */
const meetingSelect = (me: string) => `
  SELECT m.id, m.title, m.agenda, m.notes, m.starts_at, m.ends_at, m.location, m.meet_url, m.join_url, m.status, m.created_by, m.decisions_json, m.series_id, m.updated_at,
         COALESCE(p.full_name, u.email) AS organizer,
         (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS participants,
         (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.response = 'YES') AS going,
         (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.response = 'MAYBE') AS maybe,
         (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.response = 'NO') AS declined,
         (SELECT response FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = ${me}) AS my_response
  FROM meetings m JOIN users u ON u.id = m.created_by LEFT JOIN profiles p ON p.user_id = m.created_by AND p.deleted_at IS NULL`;

async function loadMeeting(ctx: Ctx, id: string): Promise<MeetingRow> {
  const me = requireActor(ctx).user.id;
  const m = await ctx.db.first<MeetingRow>(`${meetingSelect("?2")} WHERE m.id = ?1 AND m.deleted_at IS NULL`, id, me);
  if (!m) throw new NotFoundError("Meeting");
  return m;
}

function meetingRole(ctx: Ctx, m: MeetingRow) {
  const me = requireActor(ctx).user.id;
  const manager = can(ctx, "meetings.manage");
  return { organizer: m.created_by === me, participant: m.my_response !== null, manager, canEdit: m.created_by === me || manager };
}

/** Over: its end (or three hours after the start without one) has passed. */
const isOver = (m: Pick<MeetingRow, "starts_at" | "ends_at">, now = Date.now()) =>
  new Date(m.ends_at ?? new Date(new Date(m.starts_at).getTime() + 3 * 3600_000).toISOString()).getTime() <= now;

function meetingFields(input: Record<string, unknown>, current?: MeetingRow) {
  const v = new Validator(input);
  const title = v.string("title", { required: true, max: 200, label: "Title" });
  const startsAt = v.datetime("startsAt", { required: true, label: "Starts" });
  const endsAt = v.datetime("endsAt", { label: "Ends" });
  const location = v.string("location", { max: 200, label: "Place" });
  const agenda = v.string("agenda", { max: 5000, label: "Agenda" });
  const notes = input.notes !== undefined ? v.string("notes", { max: 20000, label: "Notes" }) : current?.notes ?? null;
  if (startsAt && endsAt) v.check(endsAt > startsAt, "endsAt", "The meeting must end after it starts.");
  // A new time must be in the future (a meeting already under way may keep its start).
  if (startsAt && (!current || startsAt !== current.starts_at)) v.check(startsAt > new Date(Date.now() - 5 * 60_000).toISOString(), "startsAt", "Choose a time in the future.");
  v.done();
  return { title: title!, startsAt: startsAt!, endsAt, location, agenda, notes, ...joinLink(input.meetUrl ?? input.joinUrl) };
}

/** Participants: chosen accounts, optionally everyone on the current committee. Active accounts only. */
async function participantIds(ctx: Ctx, input: Record<string, unknown>): Promise<string[]> {
  const chosen = (Array.isArray(input.participants) ? input.participants : String(input.participants ?? "").split(","))
    .map((x) => String(x).trim()).filter(Boolean).slice(0, 300);
  const ids = new Set(chosen);
  if (input.allExecutives === true || input.allExecutives === "on" || input.allExecutives === "true") {
    const rows = await ctx.db.all<{ id: string }>(
      `SELECT DISTINCT pr.user_id AS id FROM committee_members cm JOIN profiles pr ON pr.id = cm.profile_id AND pr.user_id IS NOT NULL
       JOIN committees c ON c.id = cm.committee_id AND c.status = 'CURRENT' JOIN users u ON u.id = pr.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
       WHERE cm.is_active = 1 AND cm.deleted_at IS NULL`);
    for (const r of rows) ids.add(r.id);
  }
  if (ids.size === 0) return [];
  const active = await ctx.db.all<{ id: string }>(
    "SELECT u.id FROM users u WHERE u.id IN (SELECT value FROM json_each(?1)) AND u.status = 'ACTIVE' AND u.deleted_at IS NULL", JSON.stringify([...ids]));
  return active.map((r) => r.id);
}

function whenText(m: { startsAt: string; location: string | null; meetUrl: string | null; joinUrl?: string | null }) {
  return [dhaka(m.startsAt), m.location, m.meetUrl ? "Google Meet" : m.joinUrl ? "Online" : null].filter(Boolean).join(" · ");
}

export async function scheduleMeeting(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "meetings.schedule");
  await limit(ctx, "meetings.schedule", actor.user.id);
  const f = meetingFields(input);
  const repeat = Math.max(1, Math.min(MAX_REPEAT, Number(input.repeatWeeks) || 1));
  const people = (await participantIds(ctx, input)).filter((u) => u !== actor.user.id);
  if (people.length === 0) throw new ValidationError("Invite at least one person.", { participants: "Invite at least one person." });
  const now = nowIso();
  const series = repeat > 1 ? newId("ser") : null;
  const WEEK = 7 * 86_400_000;
  const occurrences = Array.from({ length: repeat }, (_, i) => ({
    id: newId("mtg"),
    s: new Date(new Date(f.startsAt).getTime() + i * WEEK).toISOString(),
    e: f.endsAt ? new Date(new Date(f.endsAt).getTime() + i * WEEK).toISOString() : null,
  }));
  const agendaItems = agendaOf(input.agendaItems);
  const first = occurrences[0]!.id;
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO meetings (id, title, agenda, starts_at, ends_at, location, meet_url, join_url, series_id, created_by, created_at, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), ?1, ?2, json_extract(j.value, '$.s'), json_extract(j.value, '$.e'), ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?7 FROM json_each(?9) AS j`,
      f.title, f.agenda, f.location, f.meetUrl, f.joinUrl, series, actor.user.id, now, JSON.stringify(occurrences)),
    ctx.db.stmt(
      `INSERT INTO meeting_participants (meeting_id, user_id, response, added_at)
       SELECT json_extract(o.value, '$.id'), p.value, CASE WHEN p.value = ?3 THEN 'YES' ELSE 'INVITED' END, ?4 FROM json_each(?1) AS o, json_each(?2) AS p`,
      JSON.stringify(occurrences), JSON.stringify([actor.user.id, ...people]), actor.user.id, now),
    ...(agendaItems.length ? [ctx.db.stmt(
      `INSERT INTO meeting_agenda_items (id, meeting_id, title, position, created_at)
       SELECT 'agi_' || lower(hex(randomblob(12))), json_extract(o.value, '$.id'), a.value, a.key, ?3 FROM json_each(?1) AS o, json_each(?2) AS a`,
      JSON.stringify(occurrences), JSON.stringify(agendaItems), now)] : []),
    ...(await triggerStmts(ctx, "meeting.scheduled", { type: "meeting", id: first, ownerId: actor.user.id, createdBy: actor.user.id }, { title: f.title, link: `/dashboard/meetings/${first}` })),
    auditStmt(ctx, { action: "meeting.schedule", resourceType: "meeting", resourceId: first, after: { title: f.title, starts_at: f.startsAt, participants: people.length + 1, repeat: repeat > 1 ? repeat : undefined }, decision }),
    ...notifyStmts(ctx, people, {
      type: "meeting.invited", title: `Meeting: ${f.title}`,
      body: `${actorName(ctx)} invited you. ${whenText(f)}${repeat > 1 ? ` · weekly, ${repeat} times` : ""}`, link: `/dashboard/meetings/${first}`, resourceType: "meeting", resourceId: first,
    }),
  ]);
  emit(ctx, [actor.user.id, ...people], { t: "meeting", id: first });
  return { id: first, message: `Meeting${repeat > 1 ? `s (${repeat}, weekly)` : ""} scheduled. ${people.length} ${people.length === 1 ? "person was" : "people were"} notified in the dashboard.` };
}

export async function updateMeeting(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, or someone who manages meetings, can change this meeting.");
  if (m.status === "CANCELLED") throw new AppError(409, "BAD_STATE", "This meeting was cancelled.");
  if (m.status === "DONE" || isOver(m)) throw new AppError(409, "BAD_STATE", "This meeting is over. You can still write its notes, decisions and attendance.");
  const f = meetingFields(input, m);
  const guard = await unchangedSince(ctx, "meetings", id, input.expectedUpdatedAt);
  const current = await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id);
  const had = new Set(current.map((r) => r.user_id));
  const wanted = input.participants !== undefined || input.allExecutives ? new Set([m.created_by, ...(await participantIds(ctx, input))]) : had;
  const added = [...wanted].filter((u) => !had.has(u));
  const removed = [...had].filter((u) => !wanted.has(u) && u !== m.created_by);
  const moved = f.startsAt !== m.starts_at || (f.endsAt ?? null) !== (m.ends_at ?? null) || (f.location ?? null) !== (m.location ?? null)
    || (f.meetUrl ?? null) !== (m.meet_url ?? null) || (f.joinUrl ?? null) !== (m.join_url ?? null);
  const now = nowIso();
  const link = `/dashboard/meetings/${id}`;
  const stay = [...had].filter((u) => wanted.has(u) && u !== actor.user.id);
  await batchTransition(ctx, [
    ...guard,
    ctx.db.stmt(`UPDATE meetings SET title = ?2, agenda = ?3, notes = ?4, reminded_at = CASE WHEN starts_at IS ?5 THEN reminded_at ELSE NULL END, starts_at = ?5, ends_at = ?6,
                   location = ?7, meet_url = ?8, join_url = ?9, updated_at = ?10, updated_by = ?11 WHERE id = ?1`,
      id, f.title, f.agenda, f.notes, f.startsAt, f.endsAt, f.location, f.meetUrl, f.joinUrl, now, actor.user.id),
    ...(added.length ? [ctx.db.stmt("INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id, added_at) SELECT ?1, value, ?3 FROM json_each(?2)", id, JSON.stringify(added), now)] : []),
    ...(removed.length ? [ctx.db.stmt("DELETE FROM meeting_participants WHERE meeting_id = ?1 AND user_id IN (SELECT value FROM json_each(?2))", id, JSON.stringify(removed))] : []),
    auditStmt(ctx, {
      action: "meeting.update", resourceType: "meeting", resourceId: id,
      before: { title: m.title, starts_at: m.starts_at, location: m.location, meet_url: m.meet_url ?? m.join_url },
      after: { title: f.title, starts_at: f.startsAt, location: f.location, meet_url: f.meetUrl ?? f.joinUrl, added: added.length || undefined, removed: removed.length || undefined },
    }),
    // One notice per person: newcomers get the invitation, everyone else only hears about a new time, place or link.
    ...notifyStmts(ctx, added.filter((u) => u !== actor.user.id), { type: "meeting.invited", title: `Meeting: ${f.title}`, body: `${actorName(ctx)} invited you. ${whenText(f)}`, link, resourceType: "meeting", resourceId: id }),
    ...(moved ? notifyStmts(ctx, stay, { type: "meeting.changed", title: `Meeting changed: ${f.title}`, body: `Now ${whenText(f)}. Was ${whenText({ startsAt: m.starts_at, location: m.location, meetUrl: m.meet_url, joinUrl: m.join_url })}.`, link, resourceType: "meeting", resourceId: id }) : []),
    // Removed people can't open the meeting any more: tell them, and link to their meetings list.
    ...notifyStmts(ctx, removed.filter((u) => u !== actor.user.id), { type: "meeting.removed", title: `You're no longer in: ${f.title}`, body: `${actorName(ctx)} removed you from this meeting.`, link: "/dashboard/meetings", resourceType: "meeting", resourceId: id }),
  ], () => staleAnswer(ctx, "meetings", id));
  emit(ctx, [...had, ...added], { t: "meeting", id });
  return { message: moved || added.length ? "Saved. Participants were notified in the dashboard." : "Saved." };
}

export async function cancelMeeting(ctx: Ctx, id: string, reasonRaw: unknown) {
  const actor = requireActor(ctx);
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, or someone who manages meetings, can cancel this meeting.");
  if (m.status !== "SCHEDULED" || isOver(m)) throw new AppError(409, "BAD_STATE", "Only upcoming meetings can be cancelled.");
  const reason = String(reasonRaw ?? "").trim().slice(0, 300) || null;
  const everyone = (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id)).map((r) => r.user_id);
  const people = everyone.filter((u) => u !== actor.user.id);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meetings SET status = 'CANCELLED', cancelled_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1 AND status = 'SCHEDULED'", id, now, actor.user.id),
    auditStmt(ctx, { action: "meeting.cancel", resourceType: "meeting", resourceId: id, reason, before: { status: m.status }, after: { status: "CANCELLED" } }),
    ...notifyStmts(ctx, people, { type: "meeting.cancelled", title: `Meeting cancelled: ${m.title}`, body: [dhaka(m.starts_at), reason].filter(Boolean).join(" · "), link: `/dashboard/meetings/${id}`, resourceType: "meeting", resourceId: id }),
  ]);
  emit(ctx, everyone, { t: "meeting", id });
}

const DECISIONS_MAX = 30;
const decisionsOf = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/\r?\n/)).map((l) => l.replace(/^\s*[-*•\d.)]*\s*/, "").trim().slice(0, 300)).filter(Boolean).slice(0, DECISIONS_MAX);
const agendaOf = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/\r?\n/)).map((l) => l.replace(/^\s*[-*•\d.)]*\s*/, "").trim().slice(0, 200)).filter(Boolean).slice(0, 30);

/** Notes and decisions, during or after the meeting: the organiser or a manager; participants can read them. */
export async function saveMeetingNotes(ctx: Ctx, id: string, notesRaw: unknown, decisionsRaw?: unknown) {
  const actor = requireActor(ctx);
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, or someone who manages meetings, can write the notes.");
  const notes = String(notesRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (notes.length > 20000) throw new ValidationError("Keep notes under 20,000 characters.", { notes: "Too long." });
  const decisions = decisionsRaw === undefined ? null : decisionsOf(decisionsRaw);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meetings SET notes = ?2, decisions_json = CASE WHEN ?4 = 1 THEN ?5 ELSE decisions_json END, updated_at = ?3, updated_by = ?6 WHERE id = ?1",
      id, notes || null, nowIso(), decisions ? 1 : 0, decisions?.length ? JSON.stringify(decisions) : null, actor.user.id),
    auditStmt(ctx, { action: "meeting.notes", resourceType: "meeting", resourceId: id, after: { decisions: decisions?.length } }),
  ]);
  emit(ctx, (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id)).map((r) => r.user_id), { t: "meeting", id });
}

/** The agenda as a list of items (replaces the list); notes per item stay with their title. */
export async function saveAgenda(ctx: Ctx, id: string, raw: unknown) {
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, or someone who manages meetings, can change the agenda.");
  const items = (Array.isArray(raw) ? raw : []).slice(0, 30).map((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as { title?: unknown; notes?: unknown; ownerUserId?: unknown };
    return { title: String(o.title ?? "").trim().slice(0, 200), notes: String(o.notes ?? "").trim().slice(0, 5000) || null, owner: typeof o.ownerUserId === "string" && o.ownerUserId ? o.ownerUserId : null, position: i };
  }).filter((x) => x.title);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("DELETE FROM meeting_agenda_items WHERE meeting_id = ?1", id),
    ...(items.length ? [ctx.db.stmt(
      `INSERT INTO meeting_agenda_items (id, meeting_id, title, notes, owner_user_id, position, created_at)
       SELECT 'agi_' || lower(hex(randomblob(12))), ?1, json_extract(j.value, '$.title'), json_extract(j.value, '$.notes'),
              (SELECT id FROM users WHERE id = json_extract(j.value, '$.owner') AND status = 'ACTIVE'), json_extract(j.value, '$.position'), ?2 FROM json_each(?3) AS j`,
      id, now, JSON.stringify(items))] : []),
    ctx.db.stmt("UPDATE meetings SET updated_at = ?2 WHERE id = ?1", id, now),
    auditStmt(ctx, { action: "meeting.agenda", resourceType: "meeting", resourceId: id, after: { items: items.length } }),
  ]);
  emit(ctx, (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id)).map((r) => r.user_id), { t: "meeting", id });
}

/** Who came (after it started): one statement for everyone. */
export async function saveAttendance(ctx: Ctx, id: string, attendedRaw: unknown) {
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, or someone who manages meetings, can take attendance.");
  if (m.status === "CANCELLED") throw new AppError(409, "BAD_STATE", "This meeting was cancelled.");
  if (new Date(m.starts_at).getTime() > Date.now() + 15 * 60_000) throw new AppError(409, "BAD_STATE", "Take attendance once the meeting has started.");
  const attended = (Array.isArray(attendedRaw) ? attendedRaw : []).map(String).slice(0, 300);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meeting_participants SET attended = CASE WHEN user_id IN (SELECT value FROM json_each(?2)) THEN 1 ELSE 0 END WHERE meeting_id = ?1", id, JSON.stringify(attended)),
    auditStmt(ctx, { action: "meeting.attendance", resourceType: "meeting", resourceId: id, after: { attended: attended.length } }),
  ]);
  return { attended: attended.length };
}

/**
 * Action items become tasks: one statement for all of them, each linked to the meeting, the
 * people they're given to told once each. Needs tasks.assign.
 */
export async function meetingActionItems(ctx: Ctx, id: string, raw: unknown) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "tasks.assign");
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit && !m.my_response) throw new NotFoundError("Meeting");
  const list = (Array.isArray(raw) ? raw : []).slice(0, 20).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const v = new Validator(o);
    const title = v.string("title", { max: 200, label: "Action" });
    const due = dueAtEndOfDay(v.datetime("dueAt", { label: "Due" }));
    v.done();
    return { title, due, assignee: typeof o.assigneeUserId === "string" ? o.assigneeUserId : "" };
  }).filter((x) => x.title && x.assignee);
  if (!list.length) throw new ValidationError("Add at least one action with a person.");
  const people = new Set((await ctx.db.all<{ id: string }>("SELECT id FROM users WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'ACTIVE' AND deleted_at IS NULL",
    JSON.stringify(list.map((x) => x.assignee)))).map((r) => r.id));
  const rows = list.filter((x) => people.has(x.assignee)).map((x) => ({ id: newId("tsk"), ...x }));
  if (!rows.length) throw new ValidationError("Those people don't have active accounts.");
  await limit(ctx, "tasks.create", actor.user.id);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO tasks (id, title, due_at, assignee_user_id, meeting_id, created_by, created_at, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.title'), json_extract(j.value, '$.due'), json_extract(j.value, '$.assignee'), ?2, ?3, ?4, ?4, ?3 FROM json_each(?1) AS j`,
      JSON.stringify(rows), id, actor.user.id, now),
    auditStmt(ctx, { action: "meeting.actions", resourceType: "meeting", resourceId: id, after: { tasks: rows.length }, decision }),
    ...notifyEachStmts(ctx, [...new Set(rows.map((r) => r.assignee))].filter((u) => u !== actor.user.id).map((u) => {
      const mine = rows.filter((r) => r.assignee === u);
      return { userId: u, type: "task.assigned", title: mine.length === 1 ? `New task: ${mine[0]!.title}` : `${mine.length} tasks from “${m.title}”`, body: `From the meeting “${m.title}”.`, link: mine.length === 1 ? `/dashboard/tasks/${mine[0]!.id}` : "/dashboard/tasks", resourceType: "task", resourceId: mine[0]!.id };
    })),
  ]);
  emit(ctx, [actor.user.id, ...rows.map((r) => r.assignee)], { t: "task", id: "*" });
  return { created: rows.length };
}

export async function respondToMeeting(ctx: Ctx, id: string, responseRaw: unknown) {
  const actor = requireActor(ctx);
  const response = RESPONSES.find((r) => r === responseRaw);
  if (!response) throw new ValidationError("Choose yes, no or maybe.");
  const m = await loadMeeting(ctx, id);
  if (m.my_response === null) throw new NotFoundError("Meeting");
  if (m.status !== "SCHEDULED" || isOver(m)) throw new AppError(409, "BAD_STATE", "This meeting isn't open for replies.");
  await ctx.db.run("UPDATE meeting_participants SET response = ?3, responded_at = ?4 WHERE meeting_id = ?1 AND user_id = ?2", id, actor.user.id, response, nowIso());
  // The organiser (and anyone with the page open) sees the tally change at once; no notice rows.
  emit(ctx, (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id)).map((r) => r.user_id), { t: "meeting", id });
  return { response };
}

/** People already busy at this time (another scheduled meeting overlapping), to warn before scheduling. */
export async function meetingConflicts(ctx: Ctx, input: { startsAt?: unknown; endsAt?: unknown; participants?: unknown; exceptId?: unknown }) {
  requireActor(ctx);
  const v = new Validator(input as Record<string, unknown>);
  const starts = v.datetime("startsAt", { required: true, label: "Starts" });
  const ends = v.datetime("endsAt", { label: "Ends" }) ?? (starts ? new Date(new Date(starts).getTime() + 3600_000).toISOString() : null);
  v.done();
  const ids = (Array.isArray(input.participants) ? input.participants : String(input.participants ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean).slice(0, 300);
  if (!ids.length || !starts || !ends) return { conflicts: [] };
  const rows = await ctx.db.all<{ name: string; title: string; starts_at: string }>(
    `SELECT DISTINCT COALESCE(p.full_name, 'Someone') AS name, m.title, m.starts_at FROM meeting_participants mp
     JOIN meetings m ON m.id = mp.meeting_id AND m.deleted_at IS NULL AND m.status = 'SCHEDULED' AND m.id <> COALESCE(?4, '')
     LEFT JOIN profiles p ON p.user_id = mp.user_id AND p.deleted_at IS NULL
     WHERE mp.user_id IN (SELECT value FROM json_each(?1)) AND mp.response <> 'NO'
       AND m.starts_at < ?3 AND COALESCE(m.ends_at, strftime('%Y-%m-%dT%H:%M:%fZ', m.starts_at, '+1 hour')) > ?2
     LIMIT 20`, JSON.stringify(ids), starts, ends, typeof input.exceptId === "string" ? input.exceptId : null);
  return { conflicts: rows };
}

export async function listMeetings(ctx: Ctx, input: { when?: string; all?: boolean; month?: string } = {}) {
  const me = requireActor(ctx).user.id;
  const manager = can(ctx, "meetings.manage");
  const all = !!input.all && manager;
  const when = ["upcoming", "today", "past", "month"].includes(input.when ?? "") ? input.when! : "upcoming";
  const now = new Date();
  // "Today" and the calendar month in Dhaka time.
  const dayStart = new Date(new Date(dhakaDayEnd(now)).getTime() - 86_400_000).toISOString();
  const month = /^\d{4}-\d{2}$/.test(input.month ?? "") ? input.month! : new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00+06:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const iso = now.toISOString();
  // Upcoming: not over yet (a meeting under way stays here until it ends). Past: over.
  const range: Record<string, [string, string, string, string]> = {
    upcoming: [new Date(now.getTime() - 86_400_000).toISOString(), "9999", "ASC", "> ?5"],
    today: [dayStart, dhakaDayEnd(now), "ASC", "IS NOT NULL"],
    past: ["0000", iso, "DESC", "<= ?5"],
    month: [monthStart.toISOString(), monthEnd.toISOString(), "ASC", "IS NOT NULL"],
  };
  const [from, to, order, end] = range[when]!;
  const rows = await ctx.db.all<MeetingRow>(
    `${meetingSelect("?4")}
     WHERE m.deleted_at IS NULL AND m.starts_at >= ?2 AND m.starts_at < ?3
       AND COALESCE(m.ends_at, strftime('%Y-%m-%dT%H:%M:%fZ', m.starts_at, '+3 hours')) ${end}
       AND (?1 = 1 OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = ?4))
     ORDER BY m.starts_at ${order} LIMIT 150`,
    all ? 1 : 0, from, to, me, iso);
  return { rows, all, past: when === "past", when, month, canSchedule: can(ctx, "meetings.schedule"), canManage: manager };
}

export async function meetingDetail(ctx: Ctx, id: string) {
  const m = await loadMeeting(ctx, id);
  const role = meetingRole(ctx, m);
  if (!role.canEdit && !role.participant) throw new NotFoundError("Meeting");
  const [participants, agenda, tasks] = await Promise.all([
    ctx.db.all<{ user_id: string; name: string | null; response: string; attended: number | null; avatar_json: string | null }>(
      `SELECT mp.user_id, COALESCE(p.full_name, u.email) AS name, mp.response, mp.attended, ${avatarOfProfileSql("p")} AS avatar_json FROM meeting_participants mp JOIN users u ON u.id = mp.user_id
       LEFT JOIN profiles p ON p.user_id = mp.user_id AND p.deleted_at IS NULL WHERE mp.meeting_id = ?1 ORDER BY (mp.user_id = ?2) DESC, name`, id, m.created_by),
    ctx.db.all<{ id: string; title: string; notes: string | null; owner_user_id: string | null; owner: string | null; position: number }>(
      `SELECT a.id, a.title, a.notes, a.owner_user_id, p.full_name AS owner, a.position FROM meeting_agenda_items a
       LEFT JOIN profiles p ON p.user_id = a.owner_user_id AND p.deleted_at IS NULL WHERE a.meeting_id = ?1 ORDER BY a.position`, id),
    ctx.db.all<{ id: string; title: string; status: string; assignee: string | null; due_at: string | null }>(
      `SELECT t.id, t.title, t.status, COALESCE(p.full_name, t.assignee_name, t.assignee_email) AS assignee, t.due_at FROM tasks t
       LEFT JOIN profiles p ON p.user_id = t.assignee_user_id AND p.deleted_at IS NULL WHERE t.meeting_id = ?1 AND t.deleted_at IS NULL ORDER BY t.created_at LIMIT 50`, id),
  ]);
  return {
    meeting: { ...m, decisions: parseLabels(m.decisions_json), over: isOver(m) }, participants: withAvatars(participants), agenda, tasks, role,
    canAssign: can(ctx, "tasks.assign"),
  };
}
