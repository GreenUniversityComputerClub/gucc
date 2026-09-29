/**
 * Email: notification copies go out only after the request's rows exist, only with the switch on,
 * by each person's choices, inside the daily and monthly caps (SMTP2GO's free plan: 1,000 a
 * month), and every outcome is logged. Switching email on needs a test email SMTP2GO accepted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { emailEnabled, forgetEmailSettings, MAX_SENDS_PER_RUN, sendEmail } from "@/lib/server/email";
import { emailCategory, flushOutbox } from "@/lib/server/email-outbox";
import { notifyStmts } from "@/lib/server/notifications";
import { register } from "@/lib/server/services/auth";
import { emailPreferences, saveEmailPreferences, sendTestEmail, setSwitch } from "@/lib/server/services/system-controls";
import { updateSystemSetting } from "@/lib/server/services/governance";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const setting = (ctx: Ctx, key: string, value: unknown) => {
  w.sqlite.prepare("UPDATE system_settings SET value_json = ? WHERE key = ?").run(JSON.stringify(value), key);
  forgetEmailSettings(ctx);
};
const log = () => w.sqlite.prepare("SELECT user_id, recipient, type, status, provider_id, error FROM email_log ORDER BY rowid").all() as Array<Record<string, string | null>>;
const withOutbox = async (userId: string | null = null): Promise<Ctx> => ({ ...(await w.ctx(userId)), outbox: [] });
/** A context that talks to "SMTP2GO" (fetch is stubbed per test). */
const smtpCtx = async (userId: string | null = null): Promise<Ctx> => {
  const c = await w.ctx(userId);
  return { ...c, sendEmail: undefined, outbox: [], env: { ...c.env, APP_ENV: "production", SMTP2GO_API_KEY: "api-test-key", EMAIL_FROM: "GUCC <gucc@green.edu.bd>" } };
};
/** SMTP2GO's answer for an accepted message. */
const accepted = (id: string) => new Response(JSON.stringify({ request_id: "r1", data: { succeeded: 1, failed: 0, failures: [], email_id: id } }), { status: 200 });

describe("notification emails", () => {
  it("send nothing while email is switched off (the default)", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const ctx = await withOutbox();
    await ctx.db.batch(notifyStmts(ctx, [m], { type: "task.assigned", title: "New task: Posters" }));
    expect(ctx.outbox).toHaveLength(1);
    expect(await flushOutbox(ctx)).toBeNull();
    expect(w.emails).toHaveLength(0);
    expect(log()).toHaveLength(0);
  });

  it("with email on: follow each person's choices, always send security notices, log everything", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const b = await w.user({ email: "b@x.bd", roles: ["member"] });
    await saveEmailPreferences(await w.ctx(b), { work: false, approvals: true, roles: true, events: true, messages: false });
    const ctx = await withOutbox();
    setting(ctx, "email.enabled", true);
    await ctx.db.batch([
      ...notifyStmts(ctx, [a, b], { type: "task.assigned", title: "New task: Posters", body: "Due Friday.", link: "/dashboard/tasks/t1" }),
      ...notifyStmts(ctx, [b], { type: "security.new_sign_in", title: "New sign-in on Chrome on Android" }),
      // In-app only: club-wide or already emailed elsewhere.
      ...notifyStmts(ctx, [a], { type: "member.approved", title: "Your GUCC account has been approved" }),
    ]);
    expect(await flushOutbox(ctx)).toEqual({ sent: 2, failed: 0, skipped: 1 });
    expect(w.emails.map((e) => [e.to, e.subject]).sort()).toEqual([["a@x.bd", "New task: Posters"], ["b@x.bd", "New sign-in on Chrome on Android"]]);
    expect(w.emails.find((e) => e.to === "a@x.bd")!.text).toContain("http://test.local/dashboard/tasks/t1");
    expect(log().map((r) => [r.recipient, r.type, r.status]).sort()).toEqual([
      ["a@x.bd", "task.assigned", "sent"], ["b@x.bd", "security.new_sign_in", "sent"], ["b@x.bd", "task.assigned", "skipped_pref"],
    ]);
    // The outbox is emptied: a second flush sends nothing again.
    expect(await flushOutbox(ctx)).toBeNull();
  });

  it("never email a notification that wasn't written, or an unconfirmed or inactive address", async () => {
    const pending = await w.user({ email: "p@x.bd", status: "PENDING_APPROVAL" });
    const unverified = await w.user({ email: "u@x.bd", roles: ["member"] });
    w.sqlite.prepare("UPDATE users SET email_verified_at = NULL WHERE id = ?").run(unverified);
    const ok = await w.user({ email: "ok@x.bd", roles: ["member"] });
    const ctx = await withOutbox();
    setting(ctx, "email.enabled", true);
    // Built but never written (the request failed before its batch): nothing to email.
    notifyStmts(ctx, [ok], { type: "task.assigned", title: "Rolled back" });
    await ctx.db.batch(notifyStmts(ctx, [pending, unverified], { type: "task.assigned", title: "Hidden" }));
    expect(await flushOutbox(ctx)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(w.emails).toHaveLength(0);
  });

  it("stay inside the daily limit, most important first, and log the rest as skipped", async () => {
    const ids = [await w.user({ email: "1@x.bd", roles: ["member"] }), await w.user({ email: "2@x.bd", roles: ["member"] }), await w.user({ email: "3@x.bd", roles: ["member"] })];
    const ctx = await withOutbox();
    setting(ctx, "email.enabled", true);
    setting(ctx, "email.daily_limit", 2);
    await ctx.db.batch([
      ...notifyStmts(ctx, [ids[0]!, ids[1]!], { type: "event.registered", title: "You're registered" }),
      ...notifyStmts(ctx, [ids[2]!], { type: "security.password_changed", title: "Your password was changed" }),
    ]);
    expect(await flushOutbox(ctx)).toEqual({ sent: 2, failed: 0, skipped: 1 });
    expect(w.emails.map((e) => e.subject)).toContain("Your password was changed");
    expect(log().filter((r) => r.status === "skipped_limit")).toHaveLength(1);
    const used = w.sqlite.prepare("SELECT count FROM usage_counters WHERE key = 'email.sent'").get() as { count: number };
    expect(used.count).toBe(2);
  });

  it("send through SMTP2GO and record its answer; refused messages give back the allowance", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return accepted("em_msg_1");
    }));
    const ctx = await smtpCtx();
    setting(ctx, "email.enabled", true);
    await ctx.db.batch(notifyStmts(ctx, [a], { type: "meeting.invited", title: "Meeting: Planning" }));
    expect(await flushOutbox(ctx)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(calls[0]!.url).toBe("https://api.smtp2go.com/v3/email/send");
    expect(calls[0]!.headers["X-Smtp2go-Api-Key"]).toBe("api-test-key");
    expect(calls[0]!.body).toMatchObject({ sender: "GUCC <gucc@green.edu.bd>", to: ["a@x.bd"], subject: "Meeting: Planning" });
    expect((calls[0]!.body as { text_body: string }).text_body).toContain("Meeting: Planning");
    expect(log()[0]).toMatchObject({ status: "sent", provider_id: "em_msg_1" });

    // SMTP2GO answers 200 with failed: 1 when it refuses a message.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { succeeded: 0, failed: 1, failures: ["a@x.bd: sender not verified"] } }), { status: 200 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const again = await smtpCtx();
    await again.db.batch(notifyStmts(again, [a], { type: "meeting.changed", title: "Meeting moved" }));
    expect(await flushOutbox(again)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(log()[1]).toMatchObject({ status: "failed", error: "SMTP2GO answered 200: a@x.bd: sender not verified" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { error_code: "E_ApiResponseCodes.API_EXCEPTION", error: "Invalid API key" } }), { status: 401 })));
    const third = await smtpCtx();
    await third.db.batch(notifyStmts(third, [a], { type: "meeting.changed", title: "Meeting moved again" }));
    expect(await flushOutbox(third)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(log()[2]).toMatchObject({ status: "failed", error: "SMTP2GO answered 401: Invalid API key" });
    const used = w.sqlite.prepare("SELECT count FROM usage_counters WHERE key = 'email.sent'").get() as { count: number };
    expect(used.count).toBe(1);
  });

  it("send a Reply-To header only when there is one", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), accepted("em_1"))));
    const ctx = await smtpCtx();
    setting(ctx, "email.enabled", true);
    await sendEmail(ctx, { to: "a@x.bd", subject: "Hello\nBcc: x@y.z", text: "T", replyTo: "club@x.bd" });
    await sendEmail(ctx, { to: "b@x.bd", subject: "Plain", text: "T", html: "<p>T</p>" });
    expect(bodies[0]).toMatchObject({ subject: "Hello Bcc: x@y.z", custom_headers: [{ header: "Reply-To", value: "club@x.bd" }] });
    expect(bodies[0]).not.toHaveProperty("html_body");
    expect(bodies[1]).toMatchObject({ html_body: "<p>T</p>" });
    expect(bodies[1]).not.toHaveProperty("custom_headers");
  });

  it("stop at the monthly limit even when today's allowance is left", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => accepted("em_1")));
    const ctx = await smtpCtx();
    setting(ctx, "email.enabled", true);
    setting(ctx, "email.monthly_limit", 3);
    const month = new Date().toISOString().slice(0, 7);
    // Earlier days this month already used 2 (the 1st is always in this month).
    if (new Date().toISOString().slice(8, 10) !== "01") w.sqlite.prepare("INSERT INTO usage_counters (day, key, count) VALUES (?, 'email.sent', 2)").run(`${month}-01`);
    else w.sqlite.prepare("INSERT INTO usage_counters (day, key, count) VALUES (?, 'email.sent', 2)").run(new Date().toISOString().slice(0, 10));
    expect(await sendEmail(ctx, { to: "a@x.bd", subject: "One", text: "T" })).toMatchObject({ ok: true });
    const refused = await sendEmail(ctx, { to: "b@x.bd", subject: "Two", text: "T" });
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/This month's email limit \(3\)/) });
    expect(log().at(-1)).toMatchObject({ status: "skipped_limit" });
  });

  it("send at most one run's worth per request and log the rest as skipped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => accepted("em_1")));
    const people: string[] = [];
    for (let i = 0; i < MAX_SENDS_PER_RUN + 2; i++) people.push(await w.user({ email: `p${i}@x.bd`, roles: ["member"] }));
    const ctx = await smtpCtx();
    setting(ctx, "email.enabled", true);
    setting(ctx, "email.daily_limit", 200);
    await ctx.db.batch(notifyStmts(ctx, people, { type: "task.assigned", title: "New task" }));
    expect(await flushOutbox(ctx)).toEqual({ sent: MAX_SENDS_PER_RUN, failed: 0, skipped: 2 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(MAX_SENDS_PER_RUN);
  });

  it("map notification types to choices", () => {
    expect(emailCategory("security.locked")).toBe("security");
    expect(emailCategory("member.pending")).toBe("approvals");
    expect(emailCategory("approval.approved")).toBe("approvals");
    expect(emailCategory("role.granted")).toBe("roles");
    expect(emailCategory("task.comment")).toBe("work");
    expect(emailCategory("event.promoted")).toBe("events");
    expect(emailCategory("message.received")).toBe("messages");
    expect(emailCategory("broadcast")).toBeNull();
    expect(emailCategory("member.approved")).toBeNull();
  });
});

describe("switching email on", () => {
  it("needs SMTP2GO configured and a successful test email; account emails wait for the switch", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    // A developer watches System health but can't change protected settings.
    const pres = await w.user({ email: "dev@x.bd", roles: ["developer"] });
    const ctx = await smtpCtx(mod);
    expect(await emailEnabled(ctx)).toBe(false);
    // With SMTP2GO configured but the switch off, sign-up is still the no-email path.
    const res = await register(await smtpCtx(), { email: "new@student.green.ac.bd", password: "Correct-Horse-Battery-9!", fullName: "New Member" });
    expect(res.message).toMatch(/awaiting GUCC approval/);

    await expect(setSwitch(ctx, "email.enabled", true)).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });
    await expect(updateSystemSetting(ctx, "email.enabled", "true")).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });
    await expect(sendTestEmail(await smtpCtx(pres))).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { error_code: "E_ApiResponseCodes.NON_VALIDATED_SENDER", error: "The sender is not a verified sender." } }), { status: 400 })));
    await expect(sendTestEmail(ctx)).rejects.toMatchObject({ code: "EMAIL_FAILED", message: expect.stringMatching(/not a verified sender/) });
    await expect(setSwitch(ctx, "email.enabled", true)).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });

    vi.stubGlobal("fetch", vi.fn(async () => accepted("em_test_1")));
    expect((await sendTestEmail(ctx)).message).toMatch(/SMTP2GO accepted the message \(id em_test_1\)/);
    expect(log().at(-1)).toMatchObject({ type: "test", status: "sent", recipient: "mod@x.bd" });
    expect(await setSwitch(ctx, "email.enabled", true)).toMatchObject({ applied: true });
    expect(await emailEnabled(await smtpCtx())).toBe(true);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('email.test', 'governance.protected_applied_alone')").get()).toEqual({ n: 3 });
  });

  it("refuses a test email when no provider is configured (an error, never a success message)", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const c = await w.ctx(mod);
    await expect(sendTestEmail({ ...c, sendEmail: undefined, env: { ...c.env, APP_ENV: "production" } })).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
  });

  it("lets anyone who watches health switch uploads or email off at once, but only a Moderator back on", async () => {
    const dev = await w.user({ email: "dev@x.bd", roles: ["developer"] });
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(setSwitch(await w.ctx(member), "media.uploads_enabled", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await setSwitch(await w.ctx(dev), "media.uploads_enabled", false)).toMatchObject({ applied: true, message: "Uploads switched off." });
    expect(w.sqlite.prepare("SELECT value_json FROM system_settings WHERE key = 'media.uploads_enabled'").get()).toEqual({ value_json: "false" });
    await expect(setSwitch(await w.ctx(dev), "media.uploads_enabled", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The President has the Moderators' authority: switching back on is theirs to do.
    expect(await setSwitch(await w.ctx(pres), "media.uploads_enabled", true)).toMatchObject({ applied: true });
    await expect(setSwitch(await w.ctx(pres), "settings.anything", false)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps personal choices, with defaults for what isn't chosen yet", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const before = await emailPreferences(await w.ctx(m));
    expect(before.choices.find((c) => c.key === "messages")!.email).toBe(false);
    expect(before.choices.find((c) => c.key === "work")!.email).toBe(true);
    await saveEmailPreferences(await w.ctx(m), { work: false, messages: true, approvals: true, roles: true, events: true });
    const after = await emailPreferences(await w.ctx(m));
    expect(after.choices.find((c) => c.key === "messages")!.email).toBe(true);
    expect(after.choices.find((c) => c.key === "work")!.email).toBe(false);
  });
});

describe("free-tier-safe settings", () => {
  it("refuse values past what the free plans include", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const ctx = await w.ctx(mod);
    await expect(updateSystemSetting(ctx, "media.storage_limit_bytes", String(20 * 1024 ** 3))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateSystemSetting(ctx, "email.daily_limit", "500")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateSystemSetting(ctx, "media.daily_object_writes", "100000")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateSystemSetting(ctx, "email.monthly_limit", "5000")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await updateSystemSetting(ctx, "email.daily_limit", "150")).toMatchObject({ applied: true });
  });
});
