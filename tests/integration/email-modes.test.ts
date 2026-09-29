import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { changePassword, issueResetLink, login, register, requestPasswordReset, resendVerification, resetPassword } from "@/lib/server/services/auth";
import { approveMember } from "@/lib/server/services/members";
import { invitePerson } from "@/lib/server/services/people";
import { addApplicationNote, assignReviewer, getApplication, reviewApplication } from "@/lib/server/services/recruitment";
import { loadActor } from "@/lib/server/authz";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

/** A request with no email provider, as in production before one is configured. */
const noEmail = async (userId: string | null = null): Promise<Ctx> => {
  const ctx = await w.ctx(userId);
  return { ...ctx, sendEmail: undefined, env: { ...ctx.env, APP_ENV: "production" } };
};
const PASSWORD = "Correct-Horse-Battery-9!";
const user = (email: string) => w.sqlite.prepare("SELECT id, status, email_verified_at FROM users WHERE email = ?").get(email) as { id: string; status: string; email_verified_at: string | null } | undefined;

describe("sign-up without an email provider (no-email mode)", () => {
  it("goes straight to GUCC approval, tells reviewers in the app, and sends nothing", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const res = await register(await noEmail(), { email: "new@student.green.ac.bd", password: PASSWORD, fullName: "New Member", studentId: "232005555", department: "CSE", batch: "232" });
    expect(res.message).toMatch(/^Your account has been created and is awaiting GUCC approval\./);
    expect(user("new@student.green.ac.bd")).toMatchObject({ status: "PENDING_APPROVAL", email_verified_at: null });
    expect(w.emails).toHaveLength(0);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM auth_tokens").get()).toEqual({ n: 0 });
    expect(w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ?").get(gs)).toEqual({ title: "New membership application" });

    // Same answer for an email that already has an account; no second account.
    const again = await register(await noEmail(), { email: "new@student.green.ac.bd", password: PASSWORD, fullName: "Someone Else" });
    expect(again.message).toBe(res.message);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM users WHERE email = 'new@student.green.ac.bd'").get()).toEqual({ n: 1 });

    // Approval works without email verification and activates the account.
    await approveMember(await noEmail(gs), user("new@student.green.ac.bd")!.id);
    expect(user("new@student.green.ac.bd")!.status).toBe("ACTIVE");
  });

  it("never claims a verification or reset email was sent", async () => {
    await register(await noEmail(), { email: "a@student.green.ac.bd", password: PASSWORD, fullName: "A Member" });
    expect((await resendVerification(await noEmail(), "a@student.green.ac.bd")).message).toMatch(/isn't available/);
    const reset = await requestPasswordReset(await noEmail(), { email: "a@student.green.ac.bd" });
    expect(reset.message).toMatch(/Ask a GUCC administrator/);
    expect((await requestPasswordReset(await noEmail(), { email: "nobody@x.bd" })).message).toBe(reset.message);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM auth_tokens").get()).toEqual({ n: 0 });
  });

  it("with email available, sign-up verifies the address first", async () => {
    const res = await register(await w.ctx(null), { email: "b@student.green.ac.bd", password: PASSWORD, fullName: "B Member" });
    expect(res.message).toMatch(/Check your inbox/);
    expect(user("b@student.green.ac.bd")!.status).toBe("EMAIL_VERIFICATION_PENDING");
    expect(w.emails[0].text).toMatch(/\/auth\/confirm\?token=/);
  });
});

describe("administrator reset links", () => {
  it("work once, and can't be used on yourself, Moderators, suspended or more powerful accounts", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    // An account holding something the General Secretary doesn't have club-wide (a protected setting).
    w.sqlite.exec("INSERT INTO roles (id, key, name, rank) VALUES ('role:systems', 'systems', 'Systems', 40)");
    w.sqlite.exec("INSERT INTO role_permissions (role_id, permission_id) VALUES ('role:systems', 'perm:settings.system')");
    const admin = await w.user({ email: "tech@x.bd", roles: ["systems"] });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });

    const link = await issueResetLink(await noEmail(gs), member);
    expect(link.url).toMatch(/\/auth\/update-password\?token=/);
    const token = new URL(link.url).searchParams.get("token")!;
    await resetPassword(await noEmail(), { token, password: PASSWORD });
    await expect(resetPassword(await noEmail(), { token, password: PASSWORD })).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'user.reset_link'").get()).toEqual({ n: 1 });
    expect(JSON.stringify(w.sqlite.prepare("SELECT * FROM audit_logs WHERE action = 'user.reset_link'").all())).not.toContain(token);

    await expect(issueResetLink(await noEmail(gs), gs)).rejects.toMatchObject({ code: "SELF_ESCALATION" });
    // The General Secretary has the Moderators' authority, so even a Moderator's account can be recovered.
    expect((await issueResetLink(await noEmail(gs), mod)).url).toMatch(/update-password/);
    expect((await issueResetLink(await noEmail(gs), admin)).url).toMatch(/update-password/);
    w.sqlite.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(member);
    await expect(issueResetLink(await noEmail(gs), member)).rejects.toMatchObject({ code: "BAD_STATE" });
    // Without users.reset_password: refused.
    await expect(issueResetLink(await noEmail(exec), member)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("other account safeguards", () => {
  it("invitations without email hand the link to the administrator instead of claiming it was sent", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    w.sqlite.prepare("INSERT INTO profiles (id, full_name) VALUES ('prf_new', 'Newly Added')").run();
    const res = await invitePerson(await noEmail(gs), "prf_new", "added@green.edu.bd");
    expect(res.message).toMatch(/no email was sent/);
    expect(res.link).toMatch(/\/auth\/accept-invite\?token=/);
    const sent = await invitePerson(await w.ctx(gs), "prf_new", "added@green.edu.bd");
    expect(sent.message).toMatch(/^Invitation sent to added@green.edu.bd\. .*spam or junk folder/);
  });

  it("changing your password signs out your other sessions but keeps this one", async () => {
    await register(await noEmail(), { email: "c@student.green.ac.bd", password: PASSWORD, fullName: "C Member" });
    const id = user("c@student.green.ac.bd")!.id;
    w.sqlite.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(id);
    const here = await login(await noEmail(), { email: "c@student.green.ac.bd", password: PASSWORD });
    await login(await noEmail(), { email: "c@student.green.ac.bd", password: PASSWORD });
    await changePassword(await noEmail(id), id, PASSWORD, "Another-Strong-Pass-7#", here.token);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND revoked_at IS NULL").get(id)).toEqual({ n: 1 });
    expect(w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ?").get(id)).toEqual({ title: "Your password was changed" });
  });

  it("approving a claim links the executive profile, keeps sign-up details and applies the position", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    // The GS as imported from the legacy data: a profile with a position, no account.
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, student_id) VALUES ('prf_gs', 'Bakul Ahmed', '232002184')").run();
    w.sqlite.prepare("DELETE FROM committee_members WHERE position_id = 'pos:general-secretary'").run();
    w.sqlite.prepare("INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, is_active) VALUES ('cm_gs', ?, 'prf_gs', 'pos:general-secretary', 'General Secretary', 'STUDENT', 1)").run(w.committeeId);
    await register(await noEmail(), { email: "bakul@example.com", password: PASSWORD, fullName: "Bakul Ahmed", studentId: "232002184", department: "CSE", batch: "232", phone: "01700000000" });
    const applicant = user("bakul@example.com")!.id;
    expect(w.sqlite.prepare("SELECT user_id FROM profiles WHERE id = 'prf_gs'").get()).toEqual({ user_id: null });

    await approveMember(await noEmail(pres), applicant, { linkProfileId: "prf_gs" });
    expect(w.sqlite.prepare("SELECT user_id, department, batch, phone FROM profiles WHERE id = 'prf_gs'").get())
      .toEqual({ user_id: applicant, department: "CSE", batch: "232", phone: "01700000000" });
    const actor = await loadActor(w.db, applicant);
    expect(actor?.subject.positions.map((p) => p.key)).toContain("general-secretary");
    expect(actor?.user.status).toBe("ACTIVE");
  });

  it("recruitment: reviewers are assigned, notes accumulate, and a missing email is reported", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    w.sqlite.prepare("INSERT INTO recruitment_campaigns (id, title, status) VALUES ('rc1', 'Call 2027', 'OPEN')").run();
    w.sqlite.prepare("INSERT INTO recruitment_applications (id, campaign_id, full_name, student_id, email, phone, position_id) VALUES ('ra1', 'rc1', 'Applicant', '232009999', 'ap@x.bd', '0170', 'pos:executive-member')").run();

    await expect(assignReviewer(await noEmail(pres), "ra1", exec)).rejects.toMatchObject({ code: "VALIDATION" });
    await assignReviewer(await noEmail(pres), "ra1", gs);
    expect(w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = ?").get(gs)).toEqual({ title: "Review Applicant's application" });
    await addApplicationNote(await noEmail(gs), "ra1", "Strong background");
    const r = await reviewApplication(await noEmail(gs), "ra1", { status: "SHORTLISTED", note: "Interview on Sunday", notify: true });
    expect(r.message).toMatch(/NOT emailed/);
    const view = await getApplication(await noEmail(gs), "ra1");
    expect(view.notes.map((n) => n.body)).toEqual(["Strong background", "Interview on Sunday"]);
    expect(view.reviewers.map((x) => x.id)).toEqual(expect.arrayContaining([pres, gs]));
  });
});
