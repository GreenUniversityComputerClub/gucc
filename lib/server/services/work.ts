/**
 * Tasks and meetings. Executives hand out tasks (to a member, or to an email address for
 * someone without an account yet) and schedule meetings with a Google Meet link they paste.
 * People see only their own tasks and the meetings they're invited to; the President, the
 * General Secretary and Moderators (tasks.manage / meetings.manage) see and manage all.
 *
 * Notices are in-app. Email goes out only when an email provider is configured, and the
 * result says whether it did; nothing here claims a message was sent when it wasn't.
 */
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { can, requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { emailEnabled } from "../email";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";
import { deliverEmail } from "../security";
import { EMAIL_RE, Validator } from "../validate";

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
const RESPONSES = ["YES", "NO", "MAYBE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const siteUrl = (ctx: Ctx, path: string) => `${(ctx.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "")}${path}`;
const dhaka = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const actorName = (ctx: Ctx) => ctx.actor?.profile?.full_name ?? ctx.actor?.user.email ?? "Someone";

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  title: string;
  details: string | null;
  status: TaskStatus;
  priority: (typeof PRIORITIES)[number];
  due_at: string | null;
  assignee_user_id: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  event_id: string | null;
  event_title: string | null;
  created_by: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  comments: number;
}

const TASK_SELECT = `
  SELECT t.id, t.title, t.details, t.status, t.priority, t.due_at, t.assignee_user_id, t.assignee_email,
         COALESCE(ap.full_name, t.assignee_name, t.assignee_email) AS assignee_name, t.event_id, e.title AS event_title,
         t.created_by, COALESCE(cp.full_name, cu.email) AS creator_name, t.created_at, t.updated_at, t.completed_at,
         (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id AND c.deleted_at IS NULL) AS comments
  FROM tasks t
  LEFT JOIN profiles ap ON ap.user_id = t.assignee_user_id AND ap.deleted_at IS NULL
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN profiles cp ON cp.user_id = t.created_by AND cp.deleted_at IS NULL
  LEFT JOIN events e ON e.id = t.event_id`;

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

async function loadTask(ctx: Ctx, id: string): Promise<TaskRow> {
  const t = await ctx.db.first<TaskRow>(`${TASK_SELECT} WHERE t.id = ?1 AND t.deleted_at IS NULL`, id);
  if (!t) throw new NotFoundError("Task");
  return t;
}

function taskRole(ctx: Ctx, t: TaskRow) {
  const me = requireActor(ctx).user.id;
  const manager = can(ctx, "tasks.manage");
  return { creator: t.created_by === me, assignee: t.assignee_user_id === me, manager, canEdit: t.created_by === me || manager };
}

/**
 * Email for a task given to an address without an account, only when email is on. Members with
 * an account get the notification, which is emailed to them by their own email settings.
 */
async function emailTask(ctx: Ctx, to: string | null, subject: string, text: string): Promise<boolean> {
  if (!to || !(await emailEnabled(ctx))) return false;
  return deliverEmail(ctx, { to, subject, text }, { type: "task.email" });
}

export async function createTask(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "tasks.assign");
  await limit(ctx, "tasks.create", actor.user.id);
  const v = new Validator(input);
  const title = v.string("title", { required: true, max: 200, label: "Title" });
  const details = v.string("details", { max: 5000, label: "Details" });
  const dueAt = v.datetime("dueAt", { label: "Due" });
  const priority = v.oneOf("priority", PRIORITIES, { label: "Priority" }) ?? "NORMAL";
  const eventId = v.string("eventId", { max: 80 });
  v.done();
  const who = await resolveAssignee(ctx, input);
  if (eventId && !(await ctx.db.first("SELECT 1 FROM events WHERE id = ?1 AND deleted_at IS NULL", eventId))) throw new ValidationError("That event wasn't found.", { eventId: "Not found." });
  const id = newId("tsk");
  const now = nowIso();
  const due = dueAt ? ` Due ${dhaka(dueAt)}.` : "";
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO tasks (id, title, details, priority, due_at, assignee_user_id, assignee_email, assignee_name, event_id, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
      id, title, details, priority, dueAt, who.userId, who.emailOnly ? who.email : null, who.emailOnly ? who.name : null, eventId, actor.user.id, now),
    auditStmt(ctx, { action: "task.create", resourceType: "task", resourceId: id, after: { title, assignee: who.name ?? who.email, due_at: dueAt, priority }, decision }),
    ...(who.userId && who.userId !== actor.user.id
      ? notifyStmts(ctx, [who.userId], { type: "task.assigned", title: `New task: ${title}`, body: `${actorName(ctx)} gave you a task.${due}`, link: `/dashboard/tasks/${id}`, resourceType: "task", resourceId: id })
      : []),
  ]);
  const emailed = await emailTask(ctx, who.emailOnly ? who.email : null, `GUCC task: ${title}`,
    `${actorName(ctx)} gave you a task in the Green University Computer Club.\n\n${title}${details ? `\n\n${details}` : ""}${due ? `\n\n${due.trim()}` : ""}\n\n${
      who.emailOnly ? `You'll see it in your GUCC dashboard once you have an approved account with this email address: ${siteUrl(ctx, "/auth/sign-up")}` : `Open it: ${siteUrl(ctx, `/dashboard/tasks/${id}`)}`}`);
  const message = who.emailOnly
    ? emailed ? `Task saved and emailed to ${who.email}. It moves to their dashboard once they have an approved account.` : `Task saved for ${who.email}. Email isn't set up, so tell them yourself; it moves to their dashboard once they have an approved account with that address.`
    : who.userId === actor.user.id ? "Task saved to your own list." : "Task assigned. They were notified (by email too, if their email settings allow it).";
  return { id, emailed, message };
}

export async function updateTask(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new ForbiddenError("You can't change this task.");
  const v = new Validator(input);
  const status = v.oneOf("status", TASK_STATUSES, { label: "Status" });
  const editsDetails = ["title", "details", "dueAt", "priority", "assigneeUserId", "assigneeEmail"].some((k) => input[k] !== undefined);
  if (editsDetails && !role.canEdit) throw new ForbiddenError("Only the person who created the task, the President, the General Secretary or a Moderator can change its details.");
  if (status === "CANCELLED" && !role.canEdit) throw new ForbiddenError("Only the person who created the task can cancel it.");
  const title = input.title !== undefined ? v.string("title", { required: true, max: 200, label: "Title" }) : t.title;
  const details = input.details !== undefined ? v.string("details", { max: 5000, label: "Details" }) : t.details;
  const dueAt = input.dueAt !== undefined ? v.datetime("dueAt", { label: "Due" }) : t.due_at;
  const priority = input.priority !== undefined ? v.oneOf("priority", PRIORITIES, { required: true, label: "Priority" }) : t.priority;
  v.done();
  const reassign = role.canEdit && (input.assigneeUserId || input.assigneeEmail) ? await resolveAssignee(ctx, input) : null;
  const assigneeChanged = reassign && (reassign.userId !== t.assignee_user_id || (reassign.emailOnly && reassign.email !== t.assignee_email));
  const next = {
    title: title!, details, due_at: dueAt, priority: priority!, status: status ?? t.status,
    assignee_user_id: assigneeChanged ? reassign!.userId : t.assignee_user_id,
    assignee_email: assigneeChanged ? (reassign!.emailOnly ? reassign!.email : null) : t.assignee_email,
    assignee_name: assigneeChanged ? (reassign!.emailOnly ? reassign!.name : null) : (t.assignee_user_id ? null : t.assignee_name),
  };
  const now = nowIso();
  const stmts: D1StatementLike[] = [
    ctx.db.stmt(
      `UPDATE tasks SET title = ?2, details = ?3, due_at = ?4, priority = ?5, status = ?6, assignee_user_id = ?7, assignee_email = ?8, assignee_name = ?9,
         completed_at = CASE WHEN ?6 = 'DONE' THEN COALESCE(completed_at, ?10) ELSE NULL END, updated_at = ?10 WHERE id = ?1`,
      id, next.title, next.details, next.due_at, next.priority, next.status, next.assignee_user_id, next.assignee_email, next.assignee_name, now),
    auditStmt(ctx, {
      action: status && status !== t.status && !editsDetails ? "task.status" : "task.update", resourceType: "task", resourceId: id,
      before: { title: t.title, status: t.status, due_at: t.due_at, priority: t.priority, assignee: t.assignee_name },
      after: { title: next.title, status: next.status, due_at: next.due_at, priority: next.priority, assignee: assigneeChanged ? (reassign!.name ?? reassign!.email) : t.assignee_name },
    }),
  ];
  const link = `/dashboard/tasks/${id}`;
  // The creator hears about progress; a new assignee hears about the task; nobody hears about their own change.
  if (status && status !== t.status && t.created_by !== actor.user.id) {
    const word = { OPEN: "reopened", IN_PROGRESS: "started", DONE: "finished", CANCELLED: "cancelled" }[status];
    stmts.push(...notifyStmts(ctx, [t.created_by], { type: "task.status", title: `${actorName(ctx)} ${word} “${next.title}”`, link, resourceType: "task", resourceId: id }));
  }
  if (status === "CANCELLED" && t.status !== "CANCELLED" && next.assignee_user_id && next.assignee_user_id !== actor.user.id) {
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id], { type: "task.cancelled", title: `Task cancelled: ${next.title}`, link, resourceType: "task", resourceId: id }));
  }
  if (assigneeChanged && next.assignee_user_id && next.assignee_user_id !== actor.user.id) {
    stmts.push(...notifyStmts(ctx, [next.assignee_user_id], { type: "task.assigned", title: `New task: ${next.title}`, body: `${actorName(ctx)} gave you a task.`, link, resourceType: "task", resourceId: id }));
  }
  await ctx.db.batch(stmts);
  if (assigneeChanged) {
    const emailed = await emailTask(ctx, reassign!.emailOnly ? reassign!.email : null, `GUCC task: ${next.title}`,
      `${actorName(ctx)} gave you a task in the Green University Computer Club.\n\n${next.title}${next.details ? `\n\n${next.details}` : ""}\n\n${reassign!.emailOnly ? `It appears in your GUCC dashboard once you have an approved account with this email address.` : `Open it: ${siteUrl(ctx, link)}`}`);
    if (reassign!.emailOnly) return { message: emailed ? `Saved and emailed to ${reassign!.email}.` : `Saved. Email isn't set up, so tell ${reassign!.email} yourself.` };
    return { message: reassign!.userId === actor.user.id ? "Saved to your own list." : "Saved. The new assignee was notified (by email too, if their email settings allow it)." };
  }
  return { message: "Saved." };
}

export async function commentOnTask(ctx: Ctx, id: string, rawBody: unknown) {
  const actor = requireActor(ctx);
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new ForbiddenError("You can't comment on this task.");
  const body = String(rawBody ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw new ValidationError("Write a comment.", { body: "Write a comment." });
  if (body.length > 2000) throw new ValidationError("Keep comments under 2,000 characters.", { body: "Too long." });
  await limit(ctx, "tasks.comment", actor.user.id);
  const others = [t.created_by, t.assignee_user_id].filter((u): u is string => !!u && u !== actor.user.id);
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO task_comments (id, task_id, author_user_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", newId("tcm"), id, actor.user.id, body, nowIso()),
    ctx.db.stmt("UPDATE tasks SET updated_at = ?2 WHERE id = ?1", id, nowIso()),
    ...notifyStmts(ctx, others, { type: "task.comment", title: `${actorName(ctx)} commented on “${t.title}”`, body: body.slice(0, 140), link: `/dashboard/tasks/${id}`, resourceType: "task", resourceId: id }),
  ]);
}

export async function listTasks(ctx: Ctx, input: { view?: string; status?: string; assignee?: string } = {}) {
  const actor = requireActor(ctx);
  const manager = can(ctx, "tasks.manage");
  // Managers may look at one person's tasks (the Tasks tab of a profile).
  if (input.assignee && manager) {
    const rows = await ctx.db.all<TaskRow>(`${TASK_SELECT} WHERE t.deleted_at IS NULL AND t.assignee_user_id = ?1 ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_at IS NULL, t.due_at, t.created_at DESC LIMIT 100`, input.assignee);
    return { rows, view: "person", status: "all", canAssign: can(ctx, "tasks.assign"), canManage: manager, emailEnabled: await emailEnabled(ctx) };
  }
  const view = input.view === "all" && manager ? "all" : input.view === "created" ? "created" : "mine";
  const status = input.status === "done" ? "done" : input.status === "all" ? "all" : "open";
  const rows = await ctx.db.all<TaskRow>(
    `${TASK_SELECT}
     WHERE t.deleted_at IS NULL
       AND (?1 = 'all' OR (?1 = 'mine' AND t.assignee_user_id = ?2) OR (?1 = 'created' AND t.created_by = ?2))
       AND (?3 = 'all' OR (?3 = 'open' AND t.status IN ('OPEN','IN_PROGRESS')) OR (?3 = 'done' AND t.status IN ('DONE','CANCELLED')))
     ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_at IS NULL, t.due_at, t.created_at DESC
     LIMIT 200`,
    view, actor.user.id, status);
  return { rows, view, status, canAssign: can(ctx, "tasks.assign"), canManage: manager, emailEnabled: await emailEnabled(ctx) };
}

export async function taskDetail(ctx: Ctx, id: string) {
  const t = await loadTask(ctx, id);
  const role = taskRole(ctx, t);
  if (!role.canEdit && !role.assignee) throw new NotFoundError("Task");
  const comments = await ctx.db.all<{ id: string; body: string; created_at: string; author_user_id: string; author: string | null }>(
    `SELECT c.id, c.body, c.created_at, c.author_user_id, COALESCE(p.full_name, u.email) AS author FROM task_comments c
     JOIN users u ON u.id = c.author_user_id LEFT JOIN profiles p ON p.user_id = c.author_user_id AND p.deleted_at IS NULL
     WHERE c.task_id = ?1 AND c.deleted_at IS NULL ORDER BY c.created_at LIMIT 300`, id);
  return { task: t, comments, role, emailEnabled: await emailEnabled(ctx) };
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
  status: "SCHEDULED" | "CANCELLED" | "DONE";
  created_by: string;
  organizer: string | null;
  participants: number;
  my_response: string | null;
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

/** `me` is the placeholder that holds the viewer's user id, e.g. "?2". */
const meetingSelect = (me: string) => `
  SELECT m.id, m.title, m.agenda, m.notes, m.starts_at, m.ends_at, m.location, m.meet_url, m.status, m.created_by,
         COALESCE(p.full_name, u.email) AS organizer,
         (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS participants,
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

function meetingFields(input: Record<string, unknown>, current?: MeetingRow) {
  const v = new Validator(input);
  const title = v.string("title", { required: true, max: 200, label: "Title" });
  const startsAt = v.datetime("startsAt", { required: true, label: "Starts" });
  const endsAt = v.datetime("endsAt", { label: "Ends" });
  const location = v.string("location", { max: 200, label: "Place" });
  const agenda = v.string("agenda", { max: 5000, label: "Agenda" });
  const notes = input.notes !== undefined ? v.string("notes", { max: 20000, label: "Notes" }) : current?.notes ?? null;
  if (startsAt && endsAt) v.check(endsAt > startsAt, "endsAt", "The meeting must end after it starts.");
  if (startsAt && !current) v.check(startsAt > new Date(Date.now() - 3600_000).toISOString(), "startsAt", "Choose a time in the future.");
  v.done();
  return { title: title!, startsAt: startsAt!, endsAt, location, agenda, notes, meetUrl: normalizeMeetUrl(input.meetUrl) };
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

function whenText(m: { startsAt: string; location: string | null; meetUrl: string | null }) {
  return [dhaka(m.startsAt), m.location, m.meetUrl ? "Google Meet" : null].filter(Boolean).join(" · ");
}

export async function scheduleMeeting(ctx: Ctx, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "meetings.schedule");
  await limit(ctx, "meetings.schedule", actor.user.id);
  const f = meetingFields(input);
  const people = (await participantIds(ctx, input)).filter((u) => u !== actor.user.id);
  if (people.length === 0) throw new ValidationError("Invite at least one person.", { participants: "Invite at least one person." });
  const id = newId("mtg");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO meetings (id, title, agenda, starts_at, ends_at, location, meet_url, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      id, f.title, f.agenda, f.startsAt, f.endsAt, f.location, f.meetUrl, actor.user.id, now),
    ctx.db.stmt(
      `INSERT INTO meeting_participants (meeting_id, user_id, response, added_at)
       SELECT ?1, j.value, CASE WHEN j.value = ?3 THEN 'YES' ELSE 'INVITED' END, ?4 FROM json_each(?2) j`,
      id, JSON.stringify([actor.user.id, ...people]), actor.user.id, now),
    auditStmt(ctx, { action: "meeting.schedule", resourceType: "meeting", resourceId: id, after: { title: f.title, starts_at: f.startsAt, meet_url: f.meetUrl, participants: people.length + 1 }, decision }),
    ...notifyStmts(ctx, people, { type: "meeting.invited", title: `Meeting: ${f.title}`, body: `${actorName(ctx)} invited you. ${whenText(f)}`, link: `/dashboard/meetings/${id}`, resourceType: "meeting", resourceId: id }),
  ]);
  return { id, message: `Meeting scheduled. ${people.length} ${people.length === 1 ? "person was" : "people were"} notified in the dashboard.` };
}

export async function updateMeeting(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, the President, the General Secretary or a Moderator can change this meeting.");
  if (m.status === "CANCELLED") throw new AppError(409, "BAD_STATE", "This meeting was cancelled.");
  const f = meetingFields(input, m);
  const current = await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id);
  const had = new Set(current.map((r) => r.user_id));
  const wanted = input.participants !== undefined || input.allExecutives ? new Set([m.created_by, ...(await participantIds(ctx, input))]) : had;
  const added = [...wanted].filter((u) => !had.has(u));
  const removed = [...had].filter((u) => !wanted.has(u) && u !== m.created_by);
  const moved = f.startsAt !== m.starts_at || (f.endsAt ?? null) !== (m.ends_at ?? null) || (f.location ?? null) !== (m.location ?? null) || (f.meetUrl ?? null) !== (m.meet_url ?? null);
  const now = nowIso();
  const link = `/dashboard/meetings/${id}`;
  const stay = [...had].filter((u) => wanted.has(u) && u !== actor.user.id);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meetings SET title = ?2, agenda = ?3, notes = ?4, starts_at = ?5, ends_at = ?6, location = ?7, meet_url = ?8, updated_at = ?9 WHERE id = ?1",
      id, f.title, f.agenda, f.notes, f.startsAt, f.endsAt, f.location, f.meetUrl, now),
    ...(added.length ? [ctx.db.stmt("INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id, added_at) SELECT ?1, value, ?3 FROM json_each(?2)", id, JSON.stringify(added), now)] : []),
    ...(removed.length ? [ctx.db.stmt("DELETE FROM meeting_participants WHERE meeting_id = ?1 AND user_id IN (SELECT value FROM json_each(?2))", id, JSON.stringify(removed))] : []),
    auditStmt(ctx, {
      action: "meeting.update", resourceType: "meeting", resourceId: id,
      before: { title: m.title, starts_at: m.starts_at, location: m.location, meet_url: m.meet_url },
      after: { title: f.title, starts_at: f.startsAt, location: f.location, meet_url: f.meetUrl, added: added.length || undefined, removed: removed.length || undefined },
    }),
    // One notice per person: newcomers get the invitation, everyone else only hears about a new time, place or link.
    ...notifyStmts(ctx, added.filter((u) => u !== actor.user.id), { type: "meeting.invited", title: `Meeting: ${f.title}`, body: `${actorName(ctx)} invited you. ${whenText(f)}`, link, resourceType: "meeting", resourceId: id }),
    ...(moved ? notifyStmts(ctx, stay, { type: "meeting.changed", title: `Meeting changed: ${f.title}`, body: `Now ${whenText(f)}`, link, resourceType: "meeting", resourceId: id }) : []),
  ]);
  return { message: moved || added.length ? "Saved. Participants were notified in the dashboard." : "Saved." };
}

export async function cancelMeeting(ctx: Ctx, id: string, reasonRaw: unknown) {
  const actor = requireActor(ctx);
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, the President, the General Secretary or a Moderator can cancel this meeting.");
  if (m.status !== "SCHEDULED") throw new AppError(409, "BAD_STATE", "Only scheduled meetings can be cancelled.");
  const reason = String(reasonRaw ?? "").trim().slice(0, 300) || null;
  const people = (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM meeting_participants WHERE meeting_id = ?1", id)).map((r) => r.user_id).filter((u) => u !== actor.user.id);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meetings SET status = 'CANCELLED', cancelled_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'SCHEDULED'", id, now),
    auditStmt(ctx, { action: "meeting.cancel", resourceType: "meeting", resourceId: id, reason, before: { status: m.status }, after: { status: "CANCELLED" } }),
    ...notifyStmts(ctx, people, { type: "meeting.cancelled", title: `Meeting cancelled: ${m.title}`, body: [dhaka(m.starts_at), reason].filter(Boolean).join(" · "), link: `/dashboard/meetings/${id}`, resourceType: "meeting", resourceId: id }),
  ]);
}

/** Notes after (or during) the meeting: the organiser or a manager; participants can read them. */
export async function saveMeetingNotes(ctx: Ctx, id: string, notesRaw: unknown) {
  const m = await loadMeeting(ctx, id);
  if (!meetingRole(ctx, m).canEdit) throw new ForbiddenError("Only the organiser, the President, the General Secretary or a Moderator can write the notes.");
  const notes = String(notesRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (notes.length > 20000) throw new ValidationError("Keep notes under 20,000 characters.", { notes: "Too long." });
  await ctx.db.batch([
    ctx.db.stmt("UPDATE meetings SET notes = ?2, updated_at = ?3 WHERE id = ?1", id, notes || null, nowIso()),
    auditStmt(ctx, { action: "meeting.notes", resourceType: "meeting", resourceId: id }),
  ]);
}

export async function respondToMeeting(ctx: Ctx, id: string, responseRaw: unknown) {
  const actor = requireActor(ctx);
  const response = RESPONSES.find((r) => r === responseRaw);
  if (!response) throw new ValidationError("Choose yes, no or maybe.");
  const m = await loadMeeting(ctx, id);
  if (m.my_response === null) throw new NotFoundError("Meeting");
  if (m.status !== "SCHEDULED") throw new AppError(409, "BAD_STATE", "This meeting isn't open for replies.");
  await ctx.db.run("UPDATE meeting_participants SET response = ?3 WHERE meeting_id = ?1 AND user_id = ?2", id, actor.user.id, response);
}

export async function listMeetings(ctx: Ctx, input: { when?: string; all?: boolean } = {}) {
  const me = requireActor(ctx).user.id;
  const manager = can(ctx, "meetings.manage");
  const all = !!input.all && manager;
  const past = input.when === "past";
  const cutoff = new Date(Date.now() - 3 * 3600_000).toISOString();
  const rows = await ctx.db.all<MeetingRow>(
    `${meetingSelect("?4")}
     WHERE m.deleted_at IS NULL AND (?1 = 1 OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = ?4))
       AND ((?2 = 0 AND COALESCE(m.ends_at, m.starts_at) >= ?3) OR (?2 = 1 AND COALESCE(m.ends_at, m.starts_at) < ?3))
     ORDER BY CASE WHEN ?2 = 1 THEN m.starts_at END DESC, m.starts_at LIMIT 100`,
    all ? 1 : 0, past ? 1 : 0, cutoff, me);
  return { rows, all, past, canSchedule: can(ctx, "meetings.schedule"), canManage: manager };
}

export async function meetingDetail(ctx: Ctx, id: string) {
  const m = await loadMeeting(ctx, id);
  const role = meetingRole(ctx, m);
  if (!role.canEdit && !role.participant) throw new NotFoundError("Meeting");
  const participants = await ctx.db.all<{ user_id: string; name: string | null; response: string }>(
    `SELECT mp.user_id, COALESCE(p.full_name, u.email) AS name, mp.response FROM meeting_participants mp JOIN users u ON u.id = mp.user_id
     LEFT JOIN profiles p ON p.user_id = mp.user_id AND p.deleted_at IS NULL WHERE mp.meeting_id = ?1 ORDER BY (mp.user_id = ?2) DESC, name`, id, m.created_by);
  return { meeting: m, participants, role };
}

/** For the dashboard home: my open tasks (overdue first) and my next meetings. */
export async function myWorkSummary(ctx: Ctx) {
  const me = requireActor(ctx).user.id;
  const [tasks, meetings] = await Promise.all([
    ctx.db.all<{ id: string; title: string; due_at: string | null; status: string; priority: string }>(
      `SELECT id, title, due_at, status, priority FROM tasks WHERE assignee_user_id = ?1 AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS')
       ORDER BY due_at IS NULL, due_at, created_at DESC LIMIT 6`, me),
    ctx.db.all<{ id: string; title: string; starts_at: string; meet_url: string | null; location: string | null }>(
      `SELECT m.id, m.title, m.starts_at, m.meet_url, m.location FROM meetings m JOIN meeting_participants mp ON mp.meeting_id = m.id AND mp.user_id = ?1
       WHERE m.deleted_at IS NULL AND m.status = 'SCHEDULED' AND COALESCE(m.ends_at, m.starts_at) >= ?2 ORDER BY m.starts_at LIMIT 4`, me, nowIso()),
  ]);
  return { tasks, meetings };
}
