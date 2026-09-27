/**
 * Tasks, meetings, the notification center, System health and the assistant's data fallback.
 */
import { readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { answerFromData, assistantChat } from "@/lib/server/services/assistant";
import { markNotificationsRead, myNotifications } from "@/lib/server/services/community";
import { LATEST_MIGRATION, systemHealth } from "@/lib/server/services/health";
import { recordHeartbeat } from "@/lib/server/services/maintenance";
import { approveMember } from "@/lib/server/services/members";
import { searchPeople } from "@/lib/server/services/people";
import {
  cancelMeeting, commentOnTask, createTask, listMeetings, listTasks, meetingDetail, normalizeMeetUrl, respondToMeeting, saveMeetingNotes, scheduleMeeting, taskDetail, updateMeeting, updateTask,
} from "@/lib/server/services/work";
import { homeView } from "@/lib/server/views/home";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const count = (sql: string, ...args: string[]) => (w.sqlite.prepare(sql).get(...args) as { n: number }).n;
/** A context in no-email mode (production without a provider). */
const noEmail = (c: Ctx): Ctx => ({ ...c, env: { ...c.env, APP_ENV: "production" }, sendEmail: undefined });
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("tasks", () => {
  it("an executive gives a task; the assignee is notified, works on it, and the creator hears back", async () => {
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"], name: "Gen Sec" });
    const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "Rafi" });
    const { id, message } = await createTask(await w.ctx(gs), { title: "Book the seminar hall", details: "Room 402 for Friday", dueAt: "2030-01-10T15:00", assigneeUserId: m });
    // Members with an account get the notification; its email copy follows their own email choices.
    expect(message).toBe("Task assigned. They were notified (by email too, if their email settings allow it).");
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'task.assigned'", m)).toBe(1);
    expect(w.emails).toHaveLength(0);
    // Zone-less times are Dhaka time.
    expect((await taskDetail(await w.ctx(m), id)).task.due_at).toBe("2030-01-10T09:00:00.000Z");

    expect((await listTasks(await w.ctx(m))).rows.map((t) => t.id)).toEqual([id]);
    await updateTask(await w.ctx(m), id, { status: "IN_PROGRESS" });
    await commentOnTask(await w.ctx(m), id, "Hall is free, booking now.");
    await updateTask(await w.ctx(m), id, { status: "DONE" });
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type IN ('task.status','task.comment')", gs)).toBe(3);
    const done = await taskDetail(await w.ctx(gs), id);
    expect(done.task.status).toBe("DONE");
    expect(done.task.completed_at).toBeTruthy();
    expect(done.comments.map((c) => c.body)).toEqual(["Hall is free, booking now."]);

    // The assignee may change the status only; details belong to the creator and managers.
    await expect(updateTask(await w.ctx(m), id, { title: "Something else" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTask(await w.ctx(m), id, { status: "CANCELLED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("other members can't see, change or create tasks", async () => {
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const other = await w.user({ email: "o@x.bd", roles: ["member"] });
    const { id } = await createTask(await w.ctx(exec), { title: "Design the poster", assigneeUserId: m });
    await expect(taskDetail(await w.ctx(other), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(await w.ctx(other), id, { status: "DONE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(commentOnTask(await w.ctx(other), id, "hi")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createTask(await w.ctx(m), { title: "x", assigneeUserId: other })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Only managers see everyone's tasks.
    expect((await listTasks(await w.ctx(exec), { view: "all" })).view).toBe("mine");
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    expect((await listTasks(await w.ctx(pres), { view: "all" })).rows.map((t) => t.id)).toEqual([id]);
    await updateTask(await w.ctx(pres), id, { title: "Design the workshop poster" });
  });

  it("an email-only task says honestly whether anything was emailed, and moves to the account on approval", async () => {
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    const out = await createTask(noEmail(await w.ctx(exec)), { title: "Send your CV", assigneeEmail: "Guest@Example.com", assigneeName: "Guest" });
    expect(out.emailed).toBe(false);
    expect(out.message).toMatch(/Email isn't set up, so tell them yourself/);
    expect(w.emails).toHaveLength(0);
    expect(w.sqlite.prepare("SELECT assignee_user_id, assignee_email FROM tasks WHERE id = ?").get(out.id)).toEqual({ assignee_user_id: null, assignee_email: "guest@example.com" });

    const withEmail = await createTask(await w.ctx(exec), { title: "Bring the banner", assigneeEmail: "guest@example.com" });
    expect(withEmail.emailed).toBe(true);
    expect(w.emails.at(-1)).toMatchObject({ to: "guest@example.com" });

    // No account is created; when that address signs up and is approved, the tasks follow.
    expect(count("SELECT COUNT(*) n FROM users WHERE email = 'guest@example.com'")).toBe(0);
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const applicant = await w.user({ email: "guest@example.com", status: "PENDING_APPROVAL" });
    await approveMember(await w.ctx(pres), applicant);
    expect(count("SELECT COUNT(*) n FROM tasks WHERE assignee_user_id = ?", applicant)).toBe(2);
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'task.assigned'", applicant)).toBe(2);
    // An address that already has an active account gets the task in the dashboard at once.
    const direct = await createTask(await w.ctx(exec), { title: "Check the projector", assigneeEmail: "GUEST@example.com" });
    expect(w.sqlite.prepare("SELECT assignee_user_id FROM tasks WHERE id = ?").get(direct.id)).toEqual({ assignee_user_id: applicant });
  });

  it("the dashboard home shows my tasks with overdue ones as attention items", async () => {
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const { id } = await createTask(await w.ctx(exec), { title: "Late task", assigneeUserId: m, dueAt: future(2) });
    w.sqlite.prepare("UPDATE tasks SET due_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id);
    const home = await homeView(await w.ctx(m));
    expect(home.tasks.map((t) => t.id)).toEqual([id]);
    expect(home.attention[0]).toMatchObject({ key: "tasks", label: "1 overdue task" });
  });
});

describe("meetings", () => {
  it("accepts only real Google Meet links, normalised", () => {
    expect(normalizeMeetUrl("abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(normalizeMeetUrl("meet.google.com/ABC-DEFG-HIJ?authuser=0")).toBe("https://meet.google.com/abc-defg-hij");
    expect(normalizeMeetUrl("")).toBeNull();
    expect(() => normalizeMeetUrl("https://zoom.us/j/123")).toThrow(/Google Meet/);
    expect(() => normalizeMeetUrl("https://meet.google.com.evil.com/abc-defg-hij")).toThrow(/Google Meet/);
  });

  it("schedules, notifies once per change, collects replies and cancels", async () => {
    const gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"] });
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    const c = await w.user({ email: "c@x.bd", roles: ["member"] });
    const pending = await w.user({ email: "pending@x.bd", status: "PENDING_APPROVAL" });
    const { id } = await scheduleMeeting(await w.ctx(gs), { title: "Workshop planning", startsAt: future(3), meetUrl: "abc-defg-hij", participants: `${a},${b},${pending}` });
    const invited = (u: string) => count("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'meeting.invited'", u);
    expect([invited(a), invited(b), invited(pending), invited(gs)]).toEqual([1, 1, 0, 0]);
    expect((await meetingDetail(await w.ctx(a), id)).participants).toHaveLength(3);
    await expect(meetingDetail(await w.ctx(c), id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await respondToMeeting(await w.ctx(a), id, "YES");
    expect((await listMeetings(await w.ctx(a))).rows[0]).toMatchObject({ id, my_response: "YES" });

    // Only the agenda changes: nobody is notified. A new time: existing participants once; a newcomer gets an invitation only.
    await updateMeeting(await w.ctx(gs), id, { title: "Workshop planning", startsAt: (await meetingDetail(await w.ctx(gs), id)).meeting.starts_at, meetUrl: "abc-defg-hij", agenda: "1. Budget" });
    expect(count("SELECT COUNT(*) n FROM notifications WHERE type = 'meeting.changed'")).toBe(0);
    await updateMeeting(await w.ctx(gs), id, { title: "Workshop planning", startsAt: future(4), meetUrl: "abc-defg-hij", participants: `${a},${b},${c}` });
    expect(count("SELECT COUNT(*) n FROM notifications WHERE type = 'meeting.changed' AND user_id IN (?, ?)", a, b)).toBe(2);
    expect(count("SELECT COUNT(*) n FROM notifications WHERE user_id = ?", c)).toBe(1);

    await expect(updateMeeting(await w.ctx(a), id, { title: "Mine now", startsAt: future(5) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveMeetingNotes(await w.ctx(a), id, "notes")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await saveMeetingNotes(await w.ctx(gs), id, "Decided the budget.");
    await cancelMeeting(await w.ctx(gs), id, "Venue unavailable");
    expect(count("SELECT COUNT(*) n FROM notifications WHERE type = 'meeting.cancelled'")).toBe(3);
    await expect(respondToMeeting(await w.ctx(b), id, "NO")).rejects.toMatchObject({ code: "BAD_STATE" });
    await expect(cancelMeeting(await w.ctx(gs), id, null)).rejects.toMatchObject({ code: "BAD_STATE" });
  });

  it("members can't schedule; a meeting needs someone to invite and a future time", async () => {
    const exec = await w.user({ email: "e@x.bd", roles: ["member"], positions: ["executive-member"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(scheduleMeeting(await w.ctx(m), { title: "x", startsAt: future(1), participants: exec })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scheduleMeeting(await w.ctx(exec), { title: "x", startsAt: future(1), participants: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(scheduleMeeting(await w.ctx(exec), { title: "x", startsAt: "2020-01-01T10:00", participants: m })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(scheduleMeeting(await w.ctx(exec), { title: "x", startsAt: future(1), meetUrl: "https://example.com", participants: m })).rejects.toMatchObject({ code: "VALIDATION" });
    const other = await w.user({ email: "e2@x.bd", roles: ["member"], positions: ["executive-member"] });
    const ok = await scheduleMeeting(await w.ctx(exec), { title: "Committee sync", startsAt: future(1), participants: "", allExecutives: true, location: "Room 402" });
    expect((await meetingDetail(await w.ctx(other), ok.id)).participants.map((p) => p.user_id).sort()).toEqual([exec, other].sort());
    expect(ok.message).toMatch(/notified in the dashboard/);
  });
});

describe("notification center", () => {
  it("filters unread and pages with a cursor", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    for (let i = 0; i < 5; i++) {
      w.sqlite.prepare("INSERT INTO notifications (id, user_id, type, title, channel, created_at) VALUES (?, ?, 't', ?, 'IN_APP', ?)").run(`ntf_${i}`, m, `N${i}`, `2026-09-0${i + 1}T00:00:00.000Z`);
    }
    await markNotificationsRead(await w.ctx(m), ["ntf_4"]);
    const first = await myNotifications(await w.ctx(m), 2);
    expect(first.rows.map((r) => r.title)).toEqual(["N4", "N3"]);
    expect(first.unread).toBe(4);
    const second = await myNotifications(await w.ctx(m), 2, { before: first.next });
    expect(second.rows.map((r) => r.title)).toEqual(["N2", "N1"]);
    const unreadOnly = await myNotifications(await w.ctx(m), 10, { unreadOnly: true });
    expect(unreadOnly.rows.map((r) => r.title)).toEqual(["N3", "N2", "N1", "N0"]);
    expect(unreadOnly.next).toBeNull();
  });
});

describe("system health", () => {
  it("reports real checks and is limited to leaders", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    await expect(systemHealth(await w.ctx(m))).rejects.toMatchObject({ code: "FORBIDDEN" });
    let h = await systemHealth(await w.ctx(pres));
    const by = (k: string) => h.checks.find((c) => c.key === k)!;
    expect(by("d1").status).toBe("HEALTHY");
    expect(by("r2-public").status).toBe("UNKNOWN");
    expect(by("cron").status).toBe("UNKNOWN");
    await recordHeartbeat(await w.ctx(), "maintenance", true, {});
    h = await systemHealth(await w.ctx(pres));
    expect(by("cron")).toMatchObject({ status: "HEALTHY" });
    await recordHeartbeat(await w.ctx(), "maintenance", false, { error: "boom" });
    h = await systemHealth(await w.ctx(pres));
    expect(by("cron")).toMatchObject({ status: "ERROR" });
    expect(by("cron").detail).toMatch(/boom/);
    const quiet = await systemHealth(noEmail(await w.ctx(pres)));
    expect(quiet.checks.find((c) => c.key === "email")).toMatchObject({ status: "WARNING" });
  });

  it("knows the newest migration in the repository", () => {
    expect(readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort().at(-1)).toBe(LATEST_MIGRATION);
  });
});

describe("assistant without an AI key", () => {
  it("answers from the club's own data and never errors", async () => {
    const c = await w.ctx();
    expect((await assistantChat(c, { message: "How can I join GUCC?" })).response).toMatch(/sign-up|Recruitment/);
    expect(await answerFromData(c, "Who is the president?")).toMatch(/Executives page/);
    expect(await answerFromData(c, "What is the weather?")).toMatch(/joining GUCC, events/);
  });
});

describe("people search privacy", () => {
  it("people who can search but don't manage members (e.g. an affiliated committee executive) don't see account emails", async () => {
    const exec = await w.user({ email: "e@x.bd", roles: ["member", "unit-executive"] });
    await w.user({ email: "rafi@x.bd", roles: ["member"], name: "Rafi Ahmed" });
    const rows = await searchPeople(await w.ctx(exec), { q: "Rafi" });
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBeNull();
    expect(await searchPeople(await w.ctx(exec), { q: "rafi@x" })).toHaveLength(0);
  });
});

describe("recruitment import", () => {
  it("guesses columns, previews, skips duplicates and problems, and imports the rest", async () => {
    const { guessMapping, mapRows } = await import("@/lib/recruitment/import-fields");
    const { importApplications, saveCampaign } = await import("@/lib/server/services/recruitment");
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const { id } = await saveCampaign(await w.ctx(pres), null, { title: "Call 2027", closesAt: new Date(Date.now() + 7 * 86400_000).toISOString(), status: "OPEN", positionIds: ["pos:executive-member", "pos:treasurer"] });
    const headers = ["Timestamp", "Your Name", "Student ID", "Email Address", "Mobile Number", "Position applied for", "CGPA", "Why do you want to join?"];
    const mapping = guessMapping(headers);
    expect(mapping).toMatchObject({ fullName: 1, studentId: 2, email: 3, phone: 4, position: 5, cgpa: 6 });
    const rows = mapRows([
      ["t", "Rafi Ahmed", "232002010", "rafi@x.bd", "01711111111", "Executive Member", "3.5", "I like code"],
      ["t", "Rafi Again", "232002010", "rafi2@x.bd", "01711111112", "Executive Member", "3.1", ""],
      ["t", "Nadia", "23200201", "nadia@x.bd", "01711111113", "Treasurer", "3.9", ""],
      ["t", "Tanvir", "232002012", "tanvir@x.bd", "01711111114", "President", "3.0", ""],
      ["t", "Mim", "232002013", "mim@x.bd", "01711111115", "treasurer", "", ""],
    ], mapping);
    const preview = await importApplications(await w.ctx(pres), id, rows, false);
    expect(preview.rows.map((r) => r.outcome)).toEqual(["add", "duplicate", "error", "error", "add"]);
    expect(preview.rows[3].message).toMatch(/isn't open/);
    expect(count("SELECT COUNT(*) n FROM recruitment_applications WHERE campaign_id = ?", id)).toBe(0);
    const done = await importApplications(await w.ctx(pres), id, rows, true);
    expect(done.added).toBe(2);
    expect(count("SELECT COUNT(*) n FROM recruitment_applications WHERE campaign_id = ?", id)).toBe(2);
    // Importing the same file again adds nothing.
    await expect(importApplications(await w.ctx(pres), id, rows, true)).rejects.toMatchObject({ code: "NOTHING_TO_IMPORT" });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(importApplications(await w.ctx(m), id, rows, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
