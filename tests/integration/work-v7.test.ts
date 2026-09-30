/**
 * Round 8 tasks and meetings: status buttons that match the rules, no replayed toggles, stale
 * edits refused, checklists, labels, bulk changes, comments with mentions, smart views, due
 * dates at the end of the day, and meetings with repeats, agenda, attendance, action items,
 * conflicts and an end.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { isIdempotent } from "@/lib/server/idempotency";
import { runMaintenance } from "@/lib/server/services/maintenance";
import {
  allowedTransitions, bulkTasks, changeTaskComment, changeTaskItems, commentOnTask, createTask, dhakaDayEnd, listMeetings, listTasks, meetingActionItems, meetingConflicts,
  meetingDetail, respondToMeeting, saveAgenda, saveAttendance, saveTaskTemplate, scheduleMeeting, setTaskStatus, taskDetail, updateMeeting, updateTask,
} from "@/lib/server/services/work";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const n = (sql: string, ...args: string[]) => Number((w.sqlite.prepare(sql).get(...args) as { n: number }).n);
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const noEmail = (c: Ctx): Ctx => ({ ...c, env: { ...c.env, APP_ENV: "production" }, sendEmail: undefined });

async function team() {
  const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"], name: "Gen Sec" });
  const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"], name: "Esha" });
  const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "Mahi" });
  return { gs, exec, m };
}

describe("tasks", () => {
  it("toggles are never replayed, so done → reopen → done within seconds all happen", () => {
    for (const p of ["tasks.setStatus", "tasks.items", "meetings.respond", "meetings.attendance", "chat.react"]) expect(isIdempotent(p)).toBe(false);
  });

  it("status buttons match what the server allows (no Reopen for the assignee of a cancelled task)", () => {
    const assignee = { creator: false, assignee: true, manager: false, canEdit: false };
    expect(allowedTransitions(assignee, "CANCELLED")).toEqual([]);
    expect(allowedTransitions(assignee, "OPEN")).toEqual(["IN_PROGRESS", "DONE"]);
    expect(allowedTransitions({ ...assignee, canEdit: true }, "CANCELLED")).toEqual(["OPEN", "IN_PROGRESS", "DONE"]);
  });

  it("editing an email-only task keeps its typed name (never the email address)", async () => {
    const { exec } = await team();
    const { id } = await createTask(noEmail(await w.ctx(exec)), { title: "Posters", assigneeEmail: "guest@example.com" });
    await updateTask(await w.ctx(exec), id, { title: "Posters A3" });
    expect(w.sqlite.prepare("SELECT assignee_name FROM tasks WHERE id = ?").get(id)).toEqual({ assignee_name: null });
  });

  it("a date without a time is due at the end of that day in Dhaka", async () => {
    const { exec, m } = await team();
    const { id } = await createTask(await w.ctx(exec), { title: "Report", assigneeUserId: m, dueAt: "2030-05-01" });
    expect((await taskDetail(await w.ctx(m), id)).task.due_at).toBe("2030-05-01T17:59:00.000Z");
  });

  it("a stale edit form is refused and says who changed it", async () => {
    const { exec, gs, m } = await team();
    const { id } = await createTask(await w.ctx(exec), { title: "Venue", assigneeUserId: m });
    const loaded = (await taskDetail(await w.ctx(exec), id)).task.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await updateTask(await w.ctx(gs), id, { title: "Venue booking", expectedUpdatedAt: (await taskDetail(await w.ctx(gs), id)).task.updated_at });
    await expect(updateTask(await w.ctx(exec), id, { title: "Venue (old form)", expectedUpdatedAt: loaded })).rejects.toMatchObject({ code: "STALE" });
  });

  it("checklist, labels and templates", async () => {
    const { exec, m } = await team();
    const { id: tpl } = await saveTaskTemplate(await w.ctx(exec), { title: "Event setup", checklist: ["Book hall", "Print posters"], labels: ["events", "setup"] });
    const { id } = await createTask(await w.ctx(exec), { templateId: tpl, assigneeUserId: m });
    let d = await taskDetail(await w.ctx(m), id);
    expect(d.task).toMatchObject({ title: "Event setup", labels: ["events", "setup"], items_total: 2, items_done: 0 });
    const first = d.items[0]!.id;
    await changeTaskItems(await w.ctx(m), id, { toggle: first, done: true });
    await changeTaskItems(await w.ctx(m), id, { add: "Order snacks\nArrange chairs" });
    d = await taskDetail(await w.ctx(m), id);
    expect(d.task).toMatchObject({ items_total: 4, items_done: 1 });
    await changeTaskItems(await w.ctx(exec), id, { remove: first });
    expect((await taskDetail(await w.ctx(m), id)).task).toMatchObject({ items_total: 3, items_done: 0 });
    const stranger = await w.user({ email: "s@x.bd", roles: ["member"] });
    await expect(changeTaskItems(await w.ctx(stranger), id, { add: "sneaky" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the board moves a task without replays; the creator hears back", async () => {
    const { exec, m } = await team();
    const { id } = await createTask(await w.ctx(exec), { title: "Slides", assigneeUserId: m });
    await setTaskStatus(await w.ctx(m), id, "DONE", 1.5);
    await setTaskStatus(await w.ctx(m), id, "OPEN");
    await setTaskStatus(await w.ctx(m), id, "DONE");
    expect(w.sqlite.prepare("SELECT status, board_position FROM tasks WHERE id = ?").get(id)).toEqual({ status: "DONE", board_position: 1.5 });
    await expect(setTaskStatus(await w.ctx(m), id, "CANCELLED")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bulk changes touch only what the person may change, in one go", async () => {
    const { exec, gs, m } = await team();
    const mine = await createTask(await w.ctx(exec), { title: "Mine", assigneeUserId: m });
    const theirs = await createTask(await w.ctx(gs), { title: "Theirs", assigneeUserId: m });
    expect(await bulkTasks(await w.ctx(exec), { ids: [mine.id, theirs.id], action: "due", dueAt: "2030-06-01" })).toEqual({ changed: 1, skipped: 1 });
    // The General Secretary manages tasks: both.
    expect(await bulkTasks(await w.ctx(gs), { ids: [mine.id, theirs.id], action: "status", status: "CANCELLED" })).toEqual({ changed: 2, skipped: 0 });
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'task.bulk_status'")).toBe(2);
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'task.updated'", m)).toBe(1);
  });

  it("comments keep a count, can be edited and deleted, and mention people", async () => {
    const { exec, m, gs } = await team();
    const { id } = await createTask(await w.ctx(exec), { title: "Budget", assigneeUserId: m });
    const { id: c } = await commentOnTask(await w.ctx(m), id, "@Gen Sec can you check?", [gs]);
    expect(n("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'task.mention'", gs)).toBe(1);
    expect((await taskDetail(await w.ctx(m), id)).task.comments).toBe(1);
    await changeTaskComment(await w.ctx(m), c, { body: "@Gen Sec please check" });
    await expect(changeTaskComment(await w.ctx(exec), c, { body: "not mine" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await changeTaskComment(await w.ctx(m), c, { delete: true });
    expect((await taskDetail(await w.ctx(m), id)).task.comments).toBe(0);
  });

  it("smart views: overdue, today and this week", async () => {
    const { exec, m } = await team();
    await createTask(await w.ctx(exec), { title: "Late", assigneeUserId: m, dueAt: new Date(Date.now() - 3600_000).toISOString() });
    await createTask(await w.ctx(exec), { title: "Later", assigneeUserId: m, dueAt: future(3) });
    await createTask(await w.ctx(exec), { title: "Someday", assigneeUserId: m });
    const titles = async (view: string) => (await listTasks(await w.ctx(m), { view })).rows.map((r) => r.title).sort();
    expect(await titles("overdue")).toEqual(["Late"]);
    expect(await titles("week")).toEqual(["Late", "Later"]);
    expect(await titles("mine")).toEqual(["Late", "Later", "Someday"]);
    expect(dhakaDayEnd(new Date("2026-09-30T20:00:00.000Z"))).toBe("2026-10-01T18:00:00.000Z");
  });
});

describe("meetings", () => {
  it("repeat weekly, with an agenda, conflicts, attendance, action items and an end", async () => {
    const { exec, m, gs } = await team();
    const r = await scheduleMeeting(await w.ctx(exec), { title: "Weekly sync", startsAt: future(1), endsAt: new Date(Date.now() + 86_400_000 + 3600_000).toISOString(), participants: m, repeatWeeks: 3, agendaItems: "Updates\nBudget" });
    expect(r.message).toMatch(/3, weekly/);
    expect(n("SELECT COUNT(*) n FROM meetings WHERE series_id IS NOT NULL")).toBe(3);
    expect(n("SELECT COUNT(*) n FROM meeting_participants")).toBe(6);
    expect(n("SELECT COUNT(*) n FROM meeting_agenda_items")).toBe(6);
    // The same people at an overlapping time: a warning.
    expect((await meetingConflicts(await w.ctx(gs), { startsAt: new Date(Date.now() + 86_400_000 + 1800_000).toISOString(), participants: [m] })).conflicts).toMatchObject([{ name: "Mahi", title: "Weekly sync" }]);
    await saveAgenda(await w.ctx(exec), r.id, [{ title: "Updates", notes: "All on track" }, { title: "Fair", ownerUserId: m }]);
    const d = await meetingDetail(await w.ctx(m), r.id);
    expect(d.agenda.map((a) => [a.title, a.owner])).toEqual([["Updates", null], ["Fair", "Mahi"]]);
    await respondToMeeting(await w.ctx(m), r.id, "YES");
    expect((await meetingDetail(await w.ctx(exec), r.id)).meeting.going).toBe(2);
    // Attendance only once it has started; action items become tasks.
    await expect(saveAttendance(await w.ctx(exec), r.id, [m])).rejects.toMatchObject({ code: "BAD_STATE" });
    w.sqlite.prepare("UPDATE meetings SET starts_at = ?, ends_at = ? WHERE id = ?").run(new Date(Date.now() - 7200_000).toISOString(), new Date(Date.now() - 3600_000).toISOString(), r.id);
    expect(await saveAttendance(await w.ctx(exec), r.id, [m])).toEqual({ attended: 1 });
    expect(await meetingActionItems(await w.ctx(exec), r.id, [{ title: "Send minutes", assigneeUserId: m, dueAt: "2030-01-02" }, { title: "No one" }])).toEqual({ created: 1 });
    expect((await meetingDetail(await w.ctx(exec), r.id)).tasks).toMatchObject([{ title: "Send minutes", assignee: "Mahi" }]);
    // It's over: no more changes to time or replies, and the hourly job marks it done.
    await expect(updateMeeting(await w.ctx(exec), r.id, { title: "Moved", startsAt: future(5) })).rejects.toMatchObject({ code: "BAD_STATE" });
    await expect(respondToMeeting(await w.ctx(m), r.id, "NO")).rejects.toMatchObject({ code: "BAD_STATE" });
    expect((await runMaintenance(await w.ctx(null))).meetingsDone).toBe(1);
    expect((await listMeetings(await w.ctx(m), { when: "past" })).rows.map((x) => x.status)).toEqual(["DONE"]);
  });
});
