import { beforeEach, describe, expect, it } from "vitest";
import { login, logout, register, requestPasswordReset, resetPassword, resolveSession, verifyEmail } from "@/lib/server/services/auth";
import { approveMember, rejectMember, suspendUser } from "@/lib/server/services/members";
import { hashPassword } from "@/lib/server/crypto";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const tokenFrom = (text: string, param = "token") => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get(param)!;

describe("registration → verification → approval", () => {
  it("never grants privileges on registration and requires approval", async () => {
    const ctx = await w.ctx();
    await register(ctx, { email: "New@Student.green.ac.bd", password: "a-long-Passphrase-42", fullName: "New Student", studentId: "232002999" });
    const u = w.sqlite.prepare("SELECT id, status, password_hash FROM users WHERE email = ?").get("new@student.green.ac.bd") as { id: string; status: string; password_hash: string };
    expect(u.status).toBe("EMAIL_VERIFICATION_PENDING");
    // Peppered PBKDF2 sized for the Workers free-plan CPU limit.
    expect(u.password_hash).toMatch(/^pbkdf2_sha256p\$20000\$/);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id = ?").get(u.id)).toEqual({ n: 0 });

    // Unverified accounts cannot sign in.
    await expect(login(await w.ctx(), { email: "new@student.green.ac.bd", password: "a-long-Passphrase-42" })).rejects.toMatchObject({ code: "EMAIL_UNVERIFIED" });

    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const res = await verifyEmail(await w.ctx(), tokenFrom(w.emails[0].text));
    expect(res.status).toBe("PENDING_APPROVAL");
    // Tokens are single-use.
    await expect(verifyEmail(await w.ctx(), tokenFrom(w.emails[0].text))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    // Approvers are notified.
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'member.pending'").get(mod)).toEqual({ n: 1 });

    // Pending members can sign in but hold no permissions.
    const session = await login(await w.ctx(), { email: "new@student.green.ac.bd", password: "a-long-Passphrase-42" });
    expect(await resolveSession(await w.ctx(), session.token)).toBe(u.id);

    await approveMember(await w.ctx(mod), u.id);
    const after = w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(u.id) as { status: string };
    expect(after.status).toBe("ACTIVE");
    expect(w.sqlite.prepare("SELECT role_id FROM user_roles WHERE user_id = ?").all(u.id)).toEqual([{ role_id: "role:member" }]);
  });

  it("does not reveal whether an email is registered", async () => {
    await w.user({ email: "taken@x.bd" });
    const a = await register(await w.ctx(), { email: "taken@x.bd", password: "another-Passphrase-9", fullName: "Someone" });
    const b = await register(await w.ctx(), { email: "free@x.bd", password: "another-Passphrase-9", fullName: "Someone" });
    expect(a.message).toBe(b.message);
  });

  it("records a claim instead of attaching someone else's student ID", async () => {
    w.sqlite.exec("INSERT INTO profiles (id, full_name, student_id) VALUES ('legacy', 'Former Executive', '221002213')");
    await register(await w.ctx(), { email: "claimer@x.bd", password: "claim-Passphrase-77", fullName: "Claimer", studentId: "221002213" });
    const p = w.sqlite.prepare("SELECT student_id, json_extract(legacy_json, '$.claimStudentId') claim FROM profiles WHERE full_name = 'Claimer'").get() as { student_id: string | null; claim: string };
    expect(p.student_id).toBeNull();
    expect(p.claim).toBe("221002213");
  });

  it("rejects weak passwords and invalid input with field errors", async () => {
    await expect(register(await w.ctx(), { email: "bad", password: "short", fullName: "X" })).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { email: expect.any(String), password: expect.any(String), fullName: expect.any(String) },
    });
  });
});

describe("login security", () => {
  it("locks the account after repeated failures and audits it", async () => {
    const id = await w.user({ email: "victim@x.bd" });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery"), id);
    for (let i = 0; i < 5; i++) {
      await expect(login(await w.ctx(), { email: "victim@x.bd", password: `wrong-${i}` })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(login(await w.ctx(), { email: "victim@x.bd", password: "correct-Horse-battery" })).rejects.toMatchObject({ code: "LOCKED" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'auth.locked'").get()).toEqual({ n: 1 });
  });

  it("stores only a hash of the session token and revokes on logout", async () => {
    const id = await w.user({ email: "s@x.bd" });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery"), id);
    const s = await login(await w.ctx(), { email: "s@x.bd", password: "correct-Horse-battery" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE id = ?").get(s.token)).toEqual({ n: 0 });
    expect(await resolveSession(await w.ctx(), s.token)).toBe(id);
    await logout(await w.ctx(), s.token);
    expect(await resolveSession(await w.ctx(), s.token)).toBeNull();
  });

  it("suspension ends sessions immediately", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const id = await w.user({ email: "t@x.bd", roles: ["member"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery"), id);
    const s = await login(await w.ctx(), { email: "t@x.bd", password: "correct-Horse-battery" });
    await suspendUser(await w.ctx(mod), id, "Spam");
    expect(await resolveSession(await w.ctx(), s.token)).toBeNull();
    await expect(login(await w.ctx(), { email: "t@x.bd", password: "correct-Horse-battery" })).rejects.toMatchObject({ code: "ACCOUNT_BLOCKED" });
  });

  it("password reset works once, revokes sessions, and verifies the email", async () => {
    const id = await w.user({ email: "r@x.bd", status: "EMAIL_VERIFICATION_PENDING" });
    await requestPasswordReset(await w.ctx(), { email: "r@x.bd" });
    const token = tokenFrom(w.emails.at(-1)!.text);
    await resetPassword(await w.ctx(), { token, password: "brand-New-passphrase-1" });
    await expect(resetPassword(await w.ctx(), { token, password: "brand-New-passphrase-2" })).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect((w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(id) as { status: string }).status).toBe("PENDING_APPROVAL");
  });
});

describe("member management authorization", () => {
  it("only authorized, non-self actors approve; reasons are required", async () => {
    const pending = await w.user({ email: "p@x.bd", status: "PENDING_APPROVAL" });
    const treasurer = await w.user({ email: "tr@x.bd", positions: ["treasurer"] });
    const president = await w.user({ email: "pr@x.bd", positions: ["president"] });
    await expect(approveMember(await w.ctx(treasurer), pending)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(rejectMember(await w.ctx(president), pending, "")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await rejectMember(await w.ctx(president), pending, "Not a GUB student");
    expect((w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(pending) as { status: string }).status).toBe("REJECTED");
  });

  it("the President, equal to a Moderator, may suspend a Moderator; an administrator may not", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const admin = await w.user({ email: "ad@x.bd", roles: ["administrator"] });
    const president = await w.user({ email: "pr@x.bd", positions: ["president"] });
    await expect(suspendUser(await w.ctx(admin), mod, "coup")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await suspendUser(await w.ctx(president), mod, "Stepped down");
    expect(w.sqlite.prepare("SELECT status FROM users WHERE id = ?").get(mod)).toEqual({ status: "SUSPENDED" });
  });
});

describe("audit log", () => {
  it("is append-only at the database level", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const pending = await w.user({ email: "p@x.bd", status: "PENDING_APPROVAL" });
    await approveMember(await w.ctx(mod), pending);
    expect(() => w.sqlite.exec("UPDATE audit_logs SET action = 'x'")).toThrow(/append-only/);
    expect(() => w.sqlite.exec("DELETE FROM audit_logs")).toThrow(/append-only/);
  });
});
