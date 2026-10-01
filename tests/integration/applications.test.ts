/**
 * Membership applications never get stuck behind email: when a verification email can't go out
 * (email off, the allowance used up, a failed send), the application goes to "Waiting for
 * approval" and the reviewers are told, at sign-up, at sign-in, when email is switched off, and
 * from the hourly job. Invited accounts and applications whose email did go out are left alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { forgetEmailSettings } from "@/lib/server/email";
import { releaseStuckApplications } from "@/lib/server/applications";
import { login, register, resendVerification } from "@/lib/server/services/auth";
import { updateOwnProfile } from "@/lib/server/services/members";
import { setSwitch } from "@/lib/server/services/system-controls";
import { runMaintenance } from "@/lib/server/services/maintenance";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const PASSWORD = "Correct-Horse-Battery-9!";
const user = (email: string) => w.sqlite.prepare("SELECT id, status, email_verified_at FROM users WHERE email = ?").get(email) as { id: string; status: string; email_verified_at: string | null } | undefined;
const notices = (userId: string) => w.sqlite.prepare("SELECT title, body FROM notifications WHERE user_id = ? AND type = 'member.pending'").all(userId) as Array<{ title: string; body: string }>;
const setting = (ctx: Ctx, key: string, value: unknown) => {
  w.sqlite.prepare("UPDATE system_settings SET value_json = ? WHERE key = ?").run(JSON.stringify(value), key);
  forgetEmailSettings(ctx);
};
/** A request with no email provider (email off). */
const noEmail = async (userId: string | null = null): Promise<Ctx> => {
  const ctx = await w.ctx(userId);
  return { ...ctx, sendEmail: undefined, env: { ...ctx.env, APP_ENV: "production" } };
};
const apply = (ctx: Ctx, email: string, fullName = "New Applicant") => register(ctx, { email, password: PASSWORD, fullName });

describe("sign-up when a verification email can't go out", () => {
  it("with the club's email allowance used up: straight to approval, nothing sent, reviewers told", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const ctx = await w.ctx(null);
    setting(ctx, "email.daily_limit", 0);
    const res = await apply(ctx, "a@student.green.ac.bd");
    expect(res).toMatchObject({ emailSent: false, message: expect.stringMatching(/awaiting GUCC approval/) });
    expect(user("a@student.green.ac.bd")).toMatchObject({ status: "PENDING_APPROVAL", email_verified_at: null });
    expect(w.emails).toHaveLength(0);
    expect(notices(gs)).toHaveLength(1);
  });

  it("when the email service fails: the new account doesn't wait for a link that isn't coming", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx: Ctx = { ...(await w.ctx(null)), sendEmail: async () => { throw new Error("SMTP down"); } };
    const res = await apply(ctx, "b@student.green.ac.bd", "Babul Mia");
    expect(res).toMatchObject({ emailSent: false, message: expect.stringMatching(/couldn't email you a verification link/) });
    expect(user("b@student.green.ac.bd")!.status).toBe("PENDING_APPROVAL");
    const [n] = notices(gs);
    expect(n!.body).toMatch(/Babul Mia \(b@student\.green\.ac\.bd\) is waiting for approval\. Their email isn't verified/);
    expect(w.sqlite.prepare("SELECT reason FROM audit_logs WHERE action = 'member.verification_skipped'").get()).toEqual({ reason: expect.stringMatching(/couldn't be sent/) });
  });

  it("with email working, nothing changes: verify first", async () => {
    await apply(await w.ctx(null), "c@student.green.ac.bd");
    expect(user("c@student.green.ac.bd")!.status).toBe("EMAIL_VERIFICATION_PENDING");
    expect(w.emails).toHaveLength(1);
  });
});

describe("an application already waiting for verification", () => {
  it("signs in once email can't verify it, and goes to the reviewers; while email works, it must verify", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    await apply(await w.ctx(null), "d@student.green.ac.bd", "Dipu Saha");
    await expect(login(await w.ctx(null), { email: "d@student.green.ac.bd", password: PASSWORD })).rejects.toMatchObject({ code: "EMAIL_UNVERIFIED" });

    // Email switched off (or out of allowance): the resend page says to sign in, and signing in works.
    expect((await resendVerification(await noEmail(), "d@student.green.ac.bd")).message).toMatch(/just sign in/);
    await expect(login(await noEmail(), { email: "d@student.green.ac.bd", password: "wrong-password-123!" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(user("d@student.green.ac.bd")!.status).toBe("EMAIL_VERIFICATION_PENDING");
    const session = await login(await noEmail(), { email: "d@student.green.ac.bd", password: PASSWORD });
    expect(session).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(user("d@student.green.ac.bd")!.status).toBe("PENDING_APPROVAL");
    expect(notices(gs).at(-1)!.body).toMatch(/Dipu Saha .* email isn't verified \(email is switched off\)/);
  });

  it("goes to the reviewers the moment a leader switches email off", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const ctx = await w.ctx(mod);
    setting(ctx, "email.enabled", true);
    await apply(await w.ctx(null), "e1@student.green.ac.bd");
    await apply(await w.ctx(null), "e2@student.green.ac.bd");
    const invited = await w.user({ email: "invited@x.bd", status: "REGISTERED" });

    const res = await setSwitch(ctx, "email.enabled", false);
    expect(res.message).toBe("Email switched off. 2 applications waiting for email verification moved to Waiting for approval.");
    expect(user("e1@student.green.ac.bd")!.status).toBe("PENDING_APPROVAL");
    expect(user("e2@student.green.ac.bd")!.status).toBe("PENDING_APPROVAL");
    // An invited account is activated by its invitation, never by this.
    expect(w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(invited)).toEqual({ status: "REGISTERED" });
    // One notice per reviewer, however many moved.
    expect(notices(gs).at(-1)!.title).toBe("2 membership applications are waiting");
  });
});

describe("a verification email that failed", () => {
  it("lets the applicant sign in to the reviewers even while email works for others", async () => {
    await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    await apply(await w.ctx(null), "f@student.green.ac.bd", "Farhan Ali");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // The resend fails (the email service is down): nothing is coming, so signing in is enough.
    const down: Ctx = { ...(await w.ctx(null)), sendEmail: async () => { throw new Error("SMTP down"); } };
    expect((await resendVerification(down, "f@student.green.ac.bd")).message).toMatch(/just sign in/);
    expect(await login(await w.ctx(null), { email: "f@student.green.ac.bd", password: PASSWORD })).toMatchObject({ status: "PENDING_APPROVAL" });
  });
});

describe("the hourly safety net", () => {
  it("releases applications whose verification email never went out, and only those", async () => {
    await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    await apply(await w.ctx(null), "sent@student.green.ac.bd");
    const failed = await w.user({ email: "failed@x.bd", status: "EMAIL_VERIFICATION_PENDING" });
    w.sqlite.prepare("INSERT INTO email_log (id, created_at, user_id, recipient, type, status) VALUES ('eml_1', ?, ?, 'failed@x.bd', 'account.verify', 'skipped_limit')").run(hourAgo, failed);
    const young = await w.user({ email: "young@x.bd", status: "EMAIL_VERIFICATION_PENDING" });
    w.sqlite.prepare("UPDATE users SET created_at = ? WHERE email IN ('sent@student.green.ac.bd', 'failed@x.bd')").run(hourAgo);

    const ctx = await w.ctx(null);
    expect(await releaseStuckApplications(ctx)).toBe(1);
    expect(user("failed@x.bd")!.status).toBe("PENDING_APPROVAL");
    expect(user("sent@student.green.ac.bd")!.status).toBe("EMAIL_VERIFICATION_PENDING");
    expect(w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(young)).toEqual({ status: "EMAIL_VERIFICATION_PENDING" });
    // Nothing left to do: one statement, no changes.
    expect(await releaseStuckApplications(ctx)).toBe(0);

    // Email can't verify anyone now: everyone old enough goes, from the hourly job itself.
    const off = await noEmail();
    expect((await runMaintenance(off)).applicationsReleased).toBe(1);
    expect(user("sent@student.green.ac.bd")!.status).toBe("PENDING_APPROVAL");
  });
});

describe("an applicant correcting their details", () => {
  it("sets a free student ID, and records a taken one as a claim", async () => {
    const id = await w.user({ email: "app@x.bd", name: "Applicant", status: "PENDING_APPROVAL" });
    await updateOwnProfile(await w.ctx(id), { fullName: "Applicant One", studentId: "232002111" });
    expect(w.sqlite.prepare("SELECT student_id FROM profiles WHERE user_id = ?").get(id)).toEqual({ student_id: "232002111" });
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, student_id) VALUES ('prf_old', 'Old Record', '232002222')").run();
    await updateOwnProfile(await w.ctx(id), { fullName: "Applicant One", studentId: "232002222" });
    const row = w.sqlite.prepare("SELECT student_id, legacy_json FROM profiles WHERE user_id = ?").get(id) as { student_id: string | null; legacy_json: string };
    expect(row.student_id).toBeNull();
    expect(JSON.parse(row.legacy_json)).toMatchObject({ claimStudentId: "232002222", claimProfileId: "prf_old" });
  });
});
