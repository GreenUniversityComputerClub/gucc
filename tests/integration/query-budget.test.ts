import { beforeAll, describe, expect, it } from "vitest";
import { Db } from "@/lib/server/db";
import { loadActor } from "@/lib/server/authz";
import type { Ctx } from "@/lib/server/context";
import { broadcast, markSeenAtPath, saveContest, sessionCounts } from "@/lib/server/services/community";
import { chatDirectory, myConversations, pulse, reactToMessage, sendInThread, sendToPerson, thread } from "@/lib/server/services/messaging";
import { addGroupMembers, createGroup } from "@/lib/server/services/messaging-groups";
import { remindStaleApprovals } from "@/lib/server/services/approvals";
import { moveAssignment } from "@/lib/server/services/committees";
import { createEvent, publishEvent, setEventPeople, setEventStatus } from "@/lib/server/services/events";
import { committeeView, contestsView, eventView, sessionMe } from "@/lib/server/views/admin";
import { homeView } from "@/lib/server/views/home";
import { activityFeed } from "@/lib/server/services/activity";
import { systemHealth } from "@/lib/server/services/health";
import { bulkTasks, createTask, listTasks, meetingActionItems, scheduleMeeting, taskDetail, updateMeeting } from "@/lib/server/services/work";
import { runRetention } from "@/lib/server/services/retention";
import { runDailyHousekeeping, runMaintenance } from "@/lib/server/services/maintenance";
import { guardFreeTier } from "@/lib/server/services/cloudflare-usage";
import { sealAuditLog } from "@/lib/server/services/audit-seal";
import { simulateAccess } from "@/lib/server/services/access";
import { flushOutbox, sendDigests } from "@/lib/server/email-outbox";
import { notifyStmts } from "@/lib/server/notifications";
import { forgetEmailSettings } from "@/lib/server/email";
import { bulkDeleteApplications, changeMemberEmail, deleteMemberAccount } from "@/lib/server/services/accounts-admin";
import { myNotifications, markNotificationsRead } from "@/lib/server/services/community";
import { duplicateForm, listForms, saveForm } from "@/lib/server/services/forms";
import { createCampaign, runCampaignTick } from "@/lib/server/services/campaigns";
import { getBatch, importPreview, issueBatch } from "@/lib/server/services/certificates";
import { defaultConfig } from "@/lib/certificates/config";
import { readForm } from "@/lib/public/read";
import { createWorld, type TestWorld } from "../support/d1";

/**
 * The Workers free plan allows 50 D1 statements per invocation, and each statement in a
 * batch counts. Every request path must stay below that however much data it touches, so
 * these run the heaviest operations against large data and count what a real request
 * would run: the session lookup, loading the signed-in user, and the operation itself.
 */
const LIMIT = 50;
const HEADROOM = 45;

let w: TestWorld;
let pres: string;
let eventId: string;
let firstListing: string;

beforeAll(async () => {
  w = await createWorld();
  pres = await w.user({ email: "p@x.bd", positions: ["president"] });
  // 120 active members and 60 listings in the current committee.
  const insertUser = w.sqlite.prepare("INSERT INTO users (id, email, status) VALUES (?, ?, 'ACTIVE')");
  const insertProfile = w.sqlite.prepare("INSERT INTO profiles (id, user_id, full_name) VALUES (?, ?, ?)");
  const insertListing = w.sqlite.prepare(
    "INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, is_active) VALUES (?, ?, ?, 'pos:executive-member', 'Executive Member', 'STUDENT', ?, 1)");
  for (let i = 0; i < 120; i++) {
    insertUser.run(`usr_bulk_${i}`, `m${i}@x.bd`);
    insertProfile.run(`prf_bulk_${i}`, `usr_bulk_${i}`, `Member ${i}`);
    if (i < 60) insertListing.run(`cm_bulk_${i}`, w.committeeId, `prf_bulk_${i}`, i);
  }
  firstListing = "cm_bulk_30";
  const ctx = await w.ctx(pres);
  eventId = (await createEvent(ctx, { title: "Big Seminar", startAt: "2030-05-01T10:00", registrationEnabled: "on", capacity: "500" })).id;
  await publishEvent(ctx, eventId);
  const reg = w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status) VALUES (?, ?, ?, ?, ?, 'REGISTERED')");
  for (let i = 0; i < 80; i++) reg.run(`reg_${i}`, eventId, `usr_bulk_${i}`, `Member ${i}`, `m${i}@x.bd`);
});

/** Tasks made directly in the database (not part of the measured request). */
let seeded = 0;
function seedTasks(k: number): string[] {
  const ids = Array.from({ length: k }, () => `tsk_seed_${seeded++}`);
  const ins = w.sqlite.prepare("INSERT INTO tasks (id, title, assignee_user_id, created_by) VALUES (?, 'Seeded task', 'usr_bulk_3', ?)");
  for (const id of ids) ins.run(id, pres);
  return ids;
}

/** A 50-person group the President is in, with a message (made once, outside the measured request). */
let big: string | null = null;
async function bigGroup(): Promise<string> {
  if (big) return big;
  const ctx = await w.ctx(pres);
  big = (await createGroup(ctx, { name: "Big group", memberIds: Array.from({ length: 49 }, (_, i) => `usr_bulk_${i + 10}`) })).conversationId;
  await sendInThread(ctx, big, "Welcome everyone");
  // Group creation is limited per day; the measured requests below create more.
  w.sqlite.prepare("DELETE FROM rate_limits").run();
  return big;
}

/** Statements a request would run: session lookup (1) + loading the actor + the operation. */
async function measure(userId: string, op: (ctx: Ctx) => Promise<unknown>): Promise<number> {
  const db = new Db(w.db.raw);
  const actor = await loadActor(db, userId);
  const ctx: Ctx = { ...(await w.ctx(userId)), db, actor };
  await op(ctx);
  return db.queries + 1;
}

describe("every request stays within the free plan's 50 D1 statements", () => {
  it.each([
    ["broadcast to 120 members", (c: Ctx) => broadcast(c, { title: "General meeting", body: "Friday 3 PM", audience: "members" })],
    ["cancel an event with 80 registrants", (c: Ctx) => setEventStatus(c, eventId, "CANCELLED", "Rescheduled")],
    ["reorder a 60-person committee", (c: Ctx) => moveAssignment(c, firstListing, "up")],
    ["save 40 event people", (c: Ctx) => setEventPeople(c, eventId, Array.from({ length: 40 }, (_, i) => ({ role: "SPEAKER" as const, name: `Speaker ${i}` })))],
    ["save a contest with 30 teams", (c: Ctx) => saveContest(c, null, { type: "IUPC", title: "Big contest", teams: JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: `Team ${i}`, members: ["A", "B", "C"], rank: i + 1 }))) })],
    ["committee page with 60 listings", (c: Ctx) => committeeView(c, w.committeeId)],
    ["event page", (c: Ctx) => eventView(c, eventId)],
    ["contests page", (c: Ctx) => contestsView(c)],
    ["dashboard home", (c: Ctx) => homeView(c)],
    ["session (every dashboard page)", (c: Ctx) => sessionMe(c)],
    ["activity log page", (c: Ctx) => activityFeed(c, {})],
    ["system health", (c: Ctx) => systemHealth(c)],
    ["give a task", (c: Ctx) => createTask(c, { title: "Prepare the venue", assigneeUserId: "usr_bulk_1", dueAt: "2030-05-01T10:00" })],
    ["tasks list", (c: Ctx) => listTasks(c, { view: "all", status: "all" })],
    ["invite the whole committee (60) to a meeting", (c: Ctx) => scheduleMeeting(c, { title: "General meeting", startsAt: "2030-05-02T10:00", allExecutives: true, participants: "" })],
    // Scheduling and then moving it (with 70 participants) together, which is stricter than one request.
    ["schedule and move a 70-person meeting", async (c: Ctx) => {
      const { id } = await scheduleMeeting(c, { title: "Sync", startsAt: "2030-05-03T10:00", allExecutives: true, participants: "" });
      await updateMeeting(c, id, { title: "Sync", startsAt: "2030-05-04T10:00", participants: Array.from({ length: 70 }, (_, i) => `usr_bulk_${i}`).join(",") });
    }],
    // Groups at the size limit (50 people): creating, writing, reading, reacting, adding.
    ["start a 50-person group", (c: Ctx) => createGroup(c, { name: "Everyone", memberIds: Array.from({ length: 49 }, (_, i) => `usr_bulk_${i}`) })],
    ["write in a 50-person group", async (c: Ctx) => sendInThread(c, await bigGroup(), "Meeting at 3 in room 402")],
    ["mention 3 people in a 50-person group", async (c: Ctx) => sendInThread(c, await bigGroup(), "@Member 10 @Member 11 @Member 12 bring the banner", undefined, undefined, ["usr_bulk_10", "usr_bulk_11", "usr_bulk_12"])],
    ["@everyone in a 50-person group", async (c: Ctx) => sendInThread(c, await bigGroup(), "@everyone meeting now", undefined, undefined, ["*"])],
    ["open a 50-person group", async (c: Ctx) => thread(c, await bigGroup())],
    ["react in a 50-person group", async (c: Ctx) => {
      const id = (w.sqlite.prepare("SELECT id FROM messages WHERE conversation_id = ? AND kind = 'TEXT' LIMIT 1").get(await bigGroup()) as { id: string }).id;
      return reactToMessage(c, id, "love");
    }],
    ["add 30 people to a group", async (c: Ctx) => {
      const { conversationId } = await createGroup({ ...c, db: w.db }, { name: "Small", memberIds: ["usr_bulk_100", "usr_bulk_101"] });
      return addGroupMembers(c, conversationId, Array.from({ length: 30 }, (_, i) => `usr_bulk_${60 + i}`));
    }],
    ["the new-message directory (120 members)", (c: Ctx) => chatDirectory(c)],
    ["the conversation list", (c: Ctx) => myConversations(c)],
    ["bulk-change 100 tasks", (c: Ctx) => bulkTasks(c, { ids: seedTasks(100), action: "status", status: "DONE" })],
    ["open a task with its checklist, comments and history", (c: Ctx) => taskDetail(c, seedTasks(1)[0]!)],
    ["schedule a weekly meeting 12 times for the whole committee", (c: Ctx) => scheduleMeeting(c, { title: "Weekly", startsAt: "2030-06-01T10:00", allExecutives: true, participants: "", repeatWeeks: 12, agendaItems: "Updates\nBudget\nAny other business" })],
    ["20 action items from a meeting", async (c: Ctx) => {
      const { id } = await scheduleMeeting({ ...c, db: w.db }, { title: "Review", startsAt: "2030-06-02T10:00", participants: "usr_bulk_1" });
      return meetingActionItems(c, id, Array.from({ length: 20 }, (_, i) => ({ title: `Action ${i}`, assigneeUserId: `usr_bulk_${i}` })));
    }],
    ["access simulator", (c: Ctx) => simulateAccess(c, { userId: "usr_bulk_1", permission: "events.publish", resourceType: "event", resourceId: eventId })],
    // A notification to 60 people and its email copies, flushed after the response in the same invocation.
    ["notify 60 people and email them", async (c: Ctx) => {
      w.sqlite.prepare("UPDATE system_settings SET value_json = 'true' WHERE key = 'email.enabled'").run();
      forgetEmailSettings(c);
      const ctx = { ...c, outbox: [] as string[] };
      await ctx.db.batch(notifyStmts(ctx, Array.from({ length: 60 }, (_, i) => `usr_bulk_${i}`), { type: "task.assigned", title: "New task" }));
      await flushOutbox(ctx);
    }],
    // Round 9: the club's leadership looking after accounts.
    ["delete a member's account", (c: Ctx) => deleteMemberAccount(c, "usr_bulk_110", { reason: "Asked to leave", confirmName: "Member 110" })],
    ["bulk-delete 100 applications", (c: Ctx) => {
      const ids = Array.from({ length: 100 }, (_, i) => `usr_app_${i}`);
      const insert = w.sqlite.prepare("INSERT INTO users (id, email, status) VALUES (?, ?, 'REJECTED') ON CONFLICT DO NOTHING");
      ids.forEach((id, i) => insert.run(id, `app${i}@x.bd`));
      return bulkDeleteApplications(c, ids, "Spam sign-ups");
    }],
    ["change a member's sign-in email", (c: Ctx) => changeMemberEmail(c, "usr_bulk_111", { email: "new111@x.bd", reason: "Lost the old mailbox" })],
    ["save a form (rename, checked, cover, event)", async (c: Ctx) => {
      const { id } = await saveForm({ ...c, db: w.db }, null, { title: "CR form", url: "https://forms.gle/Budget1", slug: "cr-budget" });
      return saveForm(c, id, { title: "CR form", url: "https://forms.gle/Budget1", slug: "cr-budget-2", eventId, inspected: "1", openUrl: "https://docs.google.com/forms/d/e/x/viewform", requiresSignIn: "1", questionCount: "9", listed: "1" });
    }],
    ["duplicate a form", async (c: Ctx) => duplicateForm(c, (await saveForm({ ...c, db: w.db }, null, { title: "Survey", url: "https://forms.gle/Budget2" })).id)],
    ["forms list", (c: Ctx) => listForms(c)],
    ["queue an announcement email to 120 members", (c: Ctx) => createCampaign(c, { subject: "Fair", body: "Saturday.", audience: { kind: "members" } })],
    ["issue 300 certificates with notices and emails", async (c: Ctx) => {
      const members = (await importPreview({ ...c, db: w.db }, { kind: "members" })).rows.slice(0, 100);
      const guests = Array.from({ length: 200 }, (_, i) => ({ name: `Guest ${i}`, email: `guest${i}@mail.com` }));
      return issueBatch(c, { name: "Fair 2026", kind: "PARTICIPATION", source: "MANUAL", template: "emerald", config: defaultConfig(), issuedOn: "2026-10-12", recipients: [...members, ...guests], email: true, emailGuests: true });
    }],
    ["load a committee's certificate lines", (c: Ctx) => importPreview(c, { kind: "committee", committeeIds: [w.committeeId] })],
    ["open an issue of 300 certificates", async (c: Ctx) => {
      const { id } = await issueBatch({ ...c, db: w.db }, { name: "Open me", kind: "PARTICIPATION", source: "MANUAL", template: "heritage", config: defaultConfig(), issuedOn: "2026-10-12",
        recipients: Array.from({ length: 300 }, (_, i) => ({ name: `Person ${i}` })) });
      return getBatch(c, id, { q: "Person 1" });
    }],
  ])("%s", async (_name, op) => {
    const n = await measure(pres, op);
    expect(n, `ran ${n} statements`).toBeLessThanOrEqual(HEADROOM);
    expect(n).toBeLessThan(LIMIT);
  });

  // Scheduled runs are invocations too: the hourly job (with the free-tier guard and the seal) and
  // the daily clean-up each get their own 50.
  it("the hourly job, with the free-tier guard and the audit seal", async () => {
    // Three requests waiting long enough for a reminder (the most one run sends).
    const writer = await w.user({ email: "writer@x.bd", roles: ["member"] });
    for (let i = 0; i < 4; i++) {
      const { createPost, publishPost } = await import("@/lib/server/services/posts");
      const { id } = await createPost(await w.ctx(pres), { type: "BLOG", title: `Waiting post ${i}`, body: "x" });
      w.sqlite.prepare("UPDATE posts SET created_by = ? WHERE id = ?").run(writer, id);
      await publishPost(await w.ctx(writer), id).catch(() => undefined);
    }
    // With email on and an announcement email waiting, so every email step really runs.
    const setEmail = (on: boolean) => {
      w.sqlite.prepare("INSERT INTO system_settings (key, value_json) VALUES ('email.enabled', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(on ? "true" : "false");
      forgetEmailSettings({ db: w.db } as Ctx);
    };
    setEmail(true);
    await createCampaign(await w.ctx(pres), { subject: "General meeting", body: "Friday at 3 PM.", audience: { kind: "members" } });
    try {
      const db = new Db(w.db.raw);
      const ctx: Ctx = { ...(await w.ctx(null)), db, outbox: [], fetchBudget: { left: 45 } };
      await runMaintenance(ctx);
      await remindStaleApprovals(ctx, new Date(Date.now() + 3 * 86_400_000));
      await guardFreeTier(ctx);
      await sealAuditLog(ctx);
      await flushOutbox(ctx);
      await sendDigests(ctx, new Date(Date.now() + 3600_000));
      expect((await runCampaignTick(ctx))?.sent).toBeGreaterThan(0);
      expect(db.queries + 1, `ran ${db.queries + 1} statements`).toBeLessThanOrEqual(HEADROOM);
    } finally {
      setEmail(false);
    }
  });

  // Frequent checks answered from the session alone (no permission load): the session lookup
  // plus exactly one statement, so an open dashboard tab costs next to nothing.
  it("live badges, 'anything new?' and clear-on-open use one statement each", async () => {
    const other = await w.user({ email: "chat@x.bd", roles: ["member"] });
    const me = await w.user({ email: "me@x.bd", roles: ["member"] });
    const { conversationId } = await sendToPerson(await w.ctx(other), { userId: me, body: "hi" });
    for (const op of [(c: Ctx) => sessionCounts(c), (c: Ctx) => pulse(c, conversationId), (c: Ctx) => markSeenAtPath(c, `/dashboard/chat/${conversationId}`),
      // The header's bell: the newest notifications, and "mark all as read".
      (c: Ctx) => myNotifications(c, 10), (c: Ctx) => markNotificationsRead(c, "all")]) {
      const db = new Db(w.db.raw);
      const ctx: Ctx = { ...(await w.ctx(null)), db, session: { id: "s", userId: me, createdAt: "", lastSeenAt: null, reauthAt: null, idleHoursSensitive: 12 } };
      await op(ctx);
      expect(db.queries).toBe(1);
    }
  });

  it("a public form page reads one statement, by any address it has had", async () => {
    const ctx = await w.ctx(pres);
    const { id } = await saveForm(ctx, null, { title: "Read once", url: "https://forms.gle/Budget3", slug: "read-once" });
    await saveForm(ctx, id, { title: "Read once", url: "https://forms.gle/Budget3", slug: "read-once-2" });
    const db = new Db(w.db.raw);
    expect((await readForm(db, "READ-ONCE"))?.slug).toBe("read-once-2");
    expect(db.queries).toBe(1);
  });

  it("the daily clean-up", async () => {
    const db = new Db(w.db.raw);
    const ctx: Ctx = { ...(await w.ctx(null)), db };
    await runRetention(ctx);
    await runDailyHousekeeping(ctx);
    await flushOutbox({ ...ctx, outbox: ctx.outbox ?? [] });
    expect(db.queries + 1, `ran ${db.queries + 1} statements`).toBeLessThanOrEqual(HEADROOM);
  });
});
