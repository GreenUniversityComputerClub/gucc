/**
 * Email: notification copies go out only after the request's rows exist, only with the switch on,
 * by each person's choices, inside the daily cap (Resend's free plan: 100 a day), and every
 * outcome is logged. Switching email on needs a test email Resend accepted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { emailEnabled, forgetEmailSettings } from "@/lib/server/email";
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
/** A context that talks to "Resend" (fetch is stubbed per test). */
const resendCtx = async (userId: string | null = null): Promise<Ctx> => {
  const c = await w.ctx(userId);
  return { ...c, sendEmail: undefined, outbox: [], env: { ...c.env, APP_ENV: "production", RESEND_API_KEY: "re_test_key", RESEND_FROM_EMAIL: "GUCC <noreply@example.com>" } };
};

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

  it("send through Resend's batch endpoint and record its answer; refused messages give back the allowance", async () => {
    const a = await w.user({ email: "a@x.bd", roles: ["member"] });
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ data: [{ id: "re_msg_1" }] }), { status: 200 });
    }));
    const ctx = await resendCtx();
    setting(ctx, "email.enabled", true);
    await ctx.db.batch(notifyStmts(ctx, [a], { type: "meeting.invited", title: "Meeting: Planning" }));
    expect(await flushOutbox(ctx)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails/batch");
    expect(calls[0]!.body).toMatchObject([{ from: "GUCC <noreply@example.com>", to: "a@x.bd", subject: "Meeting: Planning" }]);
    expect(log()[0]).toMatchObject({ status: "sent", provider_id: "re_msg_1" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "The from address is not verified." }), { status: 403 })));
    const again = await resendCtx();
    await again.db.batch(notifyStmts(again, [a], { type: "meeting.changed", title: "Meeting moved" }));
    expect(await flushOutbox(again)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(log()[1]).toMatchObject({ status: "failed", error: "Resend answered 403: The from address is not verified." });
    const used = w.sqlite.prepare("SELECT count FROM usage_counters WHERE key = 'email.sent'").get() as { count: number };
    expect(used.count).toBe(1);
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
  it("needs Resend configured and a successful test email; account emails wait for the switch", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const ctx = await resendCtx(mod);
    expect(await emailEnabled(ctx)).toBe(false);
    // With Resend configured but the switch off, sign-up is still the no-email path.
    const res = await register(await resendCtx(), { email: "new@student.green.ac.bd", password: "Correct-Horse-Battery-9!", fullName: "New Member" });
    expect(res.message).toMatch(/awaiting GUCC approval/);

    await expect(setSwitch(ctx, "email.enabled", true)).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });
    await expect(updateSystemSetting(ctx, "email.enabled", "true")).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });
    await expect(sendTestEmail(await resendCtx(pres))).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "You can only send testing emails to your own email address." }), { status: 403 })));
    await expect(sendTestEmail(ctx)).rejects.toMatchObject({ code: "EMAIL_FAILED", message: expect.stringMatching(/own email address/) });
    await expect(setSwitch(ctx, "email.enabled", true)).rejects.toMatchObject({ code: "EMAIL_NOT_TESTED" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "re_test_1" }), { status: 200 })));
    expect((await sendTestEmail(ctx)).message).toMatch(/Resend accepted the message \(id re_test_1\)/);
    expect(log().at(-1)).toMatchObject({ type: "test", status: "sent", recipient: "mod@x.bd" });
    expect(await setSwitch(ctx, "email.enabled", true)).toMatchObject({ applied: true });
    expect(await emailEnabled(await resendCtx())).toBe(true);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('email.test', 'governance.protected_applied_alone')").get()).toEqual({ n: 3 });
  });

  it("lets anyone who watches health switch uploads or email off at once, but only a Moderator back on", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    await expect(setSwitch(await w.ctx(member), "media.uploads_enabled", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await setSwitch(await w.ctx(pres), "media.uploads_enabled", false)).toMatchObject({ applied: true, message: "Uploads switched off." });
    expect(w.sqlite.prepare("SELECT value_json FROM system_settings WHERE key = 'media.uploads_enabled'").get()).toEqual({ value_json: "false" });
    await expect(setSwitch(await w.ctx(pres), "media.uploads_enabled", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    expect(await updateSystemSetting(ctx, "email.daily_limit", "50")).toMatchObject({ applied: true });
  });
});
