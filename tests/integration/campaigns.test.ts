/**
 * Announcement emails (round 9): who they go to (opted-out, unconfirmed and closed accounts
 * left out; event guests on request), how they're paced (reserves, the hourly cap, the month),
 * claiming so nobody gets two, retries, pause/resume/cancel, one-click unsubscribe, and the
 * publish and broadcast paths that queue them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { forgetEmailSettings } from "@/lib/server/email";
import {
  audiencePeople, campaignAllowance, createCampaign, getCampaign, plainText, runCampaignTick, sendTestCampaign, setCampaignStatus, setPostEmail, unsubscribe, unsubscribeToken,
} from "@/lib/server/services/campaigns";
import { broadcast } from "@/lib/server/services/community";
import { createPost, publishPost } from "@/lib/server/services/posts";
import { estimateDelivery } from "@/lib/email/estimate";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
let gs: string;
beforeEach(async () => {
  w = await createWorld();
  gs = await w.user({ email: "gs@x.bd", roles: ["member"], positions: ["general-secretary"], name: "Gina Sultana" });
});

const setting = (ctx: Ctx, key: string, value: unknown) => {
  w.sqlite.prepare("INSERT INTO system_settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(key, JSON.stringify(value));
  forgetEmailSettings(ctx);
};
const emailOn = async (daily = 200) => {
  const c = await w.ctx(gs);
  setting(c, "email.enabled", true);
  setting(c, "email.daily_limit", daily);
  return c;
};
const members = (n: number, prefix = "m") => Promise.all(Array.from({ length: n }, (_, i) => w.user({ email: `${prefix}${i}@x.bd`, roles: ["member"], name: `Member ${i}` })));
const row = <T>(sql: string, ...args: unknown[]) => w.sqlite.prepare(sql).get(...(args as never[])) as T;
const DRAFT = { subject: "General meeting on Friday", body: "Room 402 at 3 PM.\n\nBring your ideas.", buttonLabel: "Details", buttonPath: "/events/general-meeting", audience: { kind: "members" } };

describe("who gets announcement emails", () => {
  it("members with a confirmed address who didn't opt out; guests only on request and until they unsubscribe", async () => {
    const [a, b, c] = await members(3);
    w.sqlite.prepare("UPDATE users SET email_verified_at = NULL WHERE id = ?").run(b);
    w.sqlite.prepare("INSERT INTO notification_preferences (user_id, category, email) VALUES (?, 'announcements', 0)").run(c);
    const ctx = await w.ctx(gs);
    expect((await audiencePeople(ctx, { kind: "members" })).map((p) => p.email).sort()).toEqual(["gs@x.bd", "m0@x.bd"]);
    expect((await audiencePeople(ctx, { kind: "executives" })).map((p) => p.email)).toEqual(["gs@x.bd"]);

    w.sqlite.exec(`INSERT INTO events (id, slug, title, status) VALUES ('evt_1', 'fair', 'Fair', 'PUBLISHED')`);
    w.sqlite.prepare("INSERT INTO event_registrations (id, event_id, user_id, name, email, status) VALUES ('r1', 'evt_1', ?, 'M0', 'm0@x.bd', 'REGISTERED'), ('r2', 'evt_1', NULL, 'Guest', 'Guest@Mail.com', 'ATTENDED'), ('r3', 'evt_1', NULL, 'Gone', 'gone@mail.com', 'CANCELLED')").run(a);
    const event = { kind: "event" as const, eventId: "evt_1", statuses: ["REGISTERED", "ATTENDED"] as Array<"REGISTERED" | "ATTENDED">, guests: false };
    expect((await audiencePeople(ctx, event)).map((p) => p.email)).toEqual(["m0@x.bd"]);
    expect((await audiencePeople(ctx, { ...event, guests: true })).map((p) => p.email)).toEqual(["m0@x.bd", "Guest@Mail.com"]);
    // The guest unsubscribes from a link: they're left out from then on.
    await unsubscribe(ctx, await unsubscribeToken(ctx, "guest@mail.com", null));
    expect((await audiencePeople(ctx, { ...event, guests: true })).map((p) => p.email)).toEqual(["m0@x.bd"]);
  });

  it("needs the email.campaigns permission (Moderators, the President and the General Secretary)", async () => {
    const [m] = await members(1);
    await expect(createCampaign(await w.ctx(m!), DRAFT)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createCampaign(await w.ctx(gs), { ...DRAFT, buttonPath: "https://evil.example" })).rejects.toMatchObject({ code: "VALIDATION", fields: { buttonPath: expect.any(String) } });
    const r = await createCampaign(await w.ctx(gs), DRAFT);
    expect(r.total).toBe(2);
  });
});

describe("sending", () => {
  // Early in a UTC day, so "the next hour" never crosses midnight into a fresh daily allowance.
  beforeEach(() => {
    const today = new Date();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 3) });
  });
  afterEach(() => vi.useRealTimers());

  it("goes a few at a time: never into the reserves, at most the hourly cap, each person once", async () => {
    await members(30);
    const ctx = await emailOn(40);
    setting(ctx, "email.campaign_hourly_max", 20);
    const { id, total } = await createCampaign(ctx, DRAFT);
    expect(total).toBe(31);
    expect(ctx.campaignTick).toBe(true);
    // First run: 20 (the hourly cap).
    expect(await runCampaignTick(ctx)).toMatchObject({ campaign: id, sent: 20, failed: 0 });
    // Same hour: nothing more.
    expect(await runCampaignTick(ctx)).toMatchObject({ sent: 0, waiting: expect.stringContaining("hour") });
    // Next hour: only 10 more today (40 a day, 10 kept for account mail).
    const later = new Date(Date.now() + 61 * 60_000);
    expect(await runCampaignTick(ctx, later)).toMatchObject({ sent: 10 });
    expect(await runCampaignTick(ctx, new Date(later.getTime() + 61 * 60_000))).toMatchObject({ sent: 0, waiting: expect.stringContaining("tomorrow") });
    const tomorrow = new Date(Date.now() + 26 * 3600_000);
    expect(await runCampaignTick(ctx, tomorrow)).toMatchObject({ sent: 1 });
    expect(row<{ status: string; sent: number }>("SELECT status, sent FROM email_campaigns WHERE id = ?", id)).toEqual({ status: "DONE", sent: 31 });
    const to = w.emails.map((e) => e.to);
    expect(new Set(to).size).toBe(31);
    expect(await runCampaignTick(ctx, tomorrow)).toBeNull();
  });

  it("each email greets the person, has the button, and a one-click unsubscribe", async () => {
    const [m] = await members(1);
    const ctx = await emailOn();
    await createCampaign(ctx, DRAFT);
    await runCampaignTick(ctx);
    const mail = w.emails.find((e) => e.to === "m0@x.bd") as unknown as { subject: string; text: string; html: string; headers: Record<string, string> };
    expect(mail.subject).toBe("General meeting on Friday");
    expect(mail.text).toContain("Hi Member,");
    expect(mail.text).toContain("Details: http://test.local/events/general-meeting");
    expect(mail.html).toContain("Club announcement");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = mail.headers["List-Unsubscribe"]!.match(/<(http[^>]+)>/)![1]!;
    const token = new URL(link).searchParams.get("t");
    // The link works without signing in: their choice is switched off.
    await expect(unsubscribe(await w.ctx(null), token)).resolves.toMatchObject({ member: true });
    expect(row<{ email: number }>("SELECT email FROM notification_preferences WHERE user_id = ? AND category = 'announcements'", m).email).toBe(0);
    await unsubscribe(await w.ctx(null), token, true);
    expect(row<{ email: number }>("SELECT email FROM notification_preferences WHERE user_id = ? AND category = 'announcements'", m).email).toBe(1);
    await expect(unsubscribe(await w.ctx(null), `${token}x`)).rejects.toMatchObject({ code: "BAD_LINK" });
  });

  it("someone who unsubscribes meanwhile is skipped; a refused message is tried again, three times at most", async () => {
    const [a, b] = await members(2);
    const ctx = await emailOn();
    setting(ctx, "email.campaign_hourly_max", 1);
    const { id } = await createCampaign(ctx, { ...DRAFT, audience: { kind: "members" } });
    w.sqlite.prepare("INSERT INTO notification_preferences (user_id, category, email) VALUES (?, 'announcements', 0)").run(a);
    const failing = { ...ctx, sendEmail: vi.fn(async (m: { to: string }) => { if (m.to === "m1@x.bd") throw new Error("refused"); w.emails.push(m as never); }) };
    let at = Date.now();
    for (let i = 0; i < 6; i++, at += 61 * 60_000) await runCampaignTick(failing, new Date(at));
    const people = (await getCampaign(ctx, id)).recipients;
    expect(people.find((p) => p.email === "m0@x.bd")).toMatchObject({ status: "SKIPPED" });
    expect(people.find((p) => p.email === "m1@x.bd")).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(people.find((p) => p.email === "gs@x.bd")).toMatchObject({ status: "SENT" });
    expect(row<{ status: string }>("SELECT status FROM email_campaigns WHERE id = ?", id).status).toBe("DONE");
    expect(b).toBeTruthy();
  });

  it("pause, resume and cancel", async () => {
    await members(5);
    const ctx = await emailOn();
    setting(ctx, "email.campaign_hourly_max", 2);
    const { id } = await createCampaign(ctx, DRAFT);
    await setCampaignStatus(ctx, id, "pause");
    expect(await runCampaignTick(ctx)).toBeNull();
    await expect(setCampaignStatus(ctx, id, "pause")).rejects.toMatchObject({ code: "WRONG_STATE" });
    await setCampaignStatus(ctx, id, "resume");
    expect(await runCampaignTick(ctx)).toMatchObject({ sent: 2 });
    await setCampaignStatus(ctx, id, "cancel");
    expect(row<{ status: string; sent: number; skipped: number }>("SELECT status, sent, skipped FROM email_campaigns WHERE id = ?", id)).toEqual({ status: "CANCELLED", sent: 2, skipped: 4 });
  });

  it("nothing goes while email is switched off; a test goes to yourself", async () => {
    await members(2);
    const ctx = await w.ctx(gs);
    await createCampaign(ctx, DRAFT);
    expect(await runCampaignTick(ctx)).toBeNull();
    expect(w.emails).toHaveLength(0);
    const on = await emailOn();
    await sendTestCampaign(on, DRAFT);
    expect(w.emails.map((e) => [e.to, e.subject])).toEqual([["gs@x.bd", "[Test] General meeting on Friday"]]);
  });

  it("the allowance and the estimate", async () => {
    const ctx = await emailOn(100);
    const a = await campaignAllowance(ctx, { dailyLimit: 100, monthlyLimit: 1000 });
    expect(a).toMatchObject({ dailyReserve: 10, monthlyReserve: 60, hourlyMax: 20, now: 20 });
    expect(estimateDelivery(250, a)).toMatchObject({ perDay: 90, todayLeft: 90, days: 3, nextMonth: 0 });
    expect(estimateDelivery(1000, { ...a, month: 100 })).toMatchObject({ monthLeft: 840, nextMonth: 160, days: null });
  });
});

describe("what queues them", () => {
  it("an announcement emailed when it's published (once)", async () => {
    await members(3);
    const ctx = await emailOn();
    const { id } = await createPost(ctx, { type: "ANNOUNCEMENT", title: "Recruitment is open", excerpt: "Apply by Friday.", body: "## Apply\n\nFill the **form** at [this link](https://x.bd)." });
    await expect(setPostEmail(ctx, id, { on: "on", audience: { kind: "members" } })).resolves.toMatchObject({ queued: false });
    await publishPost(ctx, id);
    const c = row<{ id: string; subject: string; body: string; button_path: string; total: number; post_id: string }>("SELECT id, subject, body, button_path, total, post_id FROM email_campaigns");
    expect(c).toMatchObject({ subject: "Recruitment is open", body: "Apply by Friday.", button_path: "/announcements/recruitment-is-open", total: 4, post_id: id });
    expect(row<{ email_campaign_id: string; email_intent_json: string | null }>("SELECT email_campaign_id, email_intent_json FROM posts WHERE id = ?", id)).toEqual({ email_campaign_id: c.id, email_intent_json: null });
    await expect(setPostEmail(ctx, id, { on: "on" })).rejects.toMatchObject({ code: "ALREADY_EMAILED" });
    expect(plainText("## Apply\n\nFill the **form** at [this link](https://x.bd).")).toBe("Apply\n\nFill the form at this link.");
  });

  it("a broadcast with “Also email it”", async () => {
    await members(2);
    const ctx = await emailOn();
    const r = await broadcast(ctx, { title: "Exam break", body: "No meetings until the 20th.", audience: "members", email: true });
    expect(r).toMatchObject({ sent: 2, emailed: 3 });
    expect(row<{ n: number }>("SELECT COUNT(*) n FROM email_campaign_recipients").n).toBe(3);
  });
});
