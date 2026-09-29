/**
 * Two-factor sign-in, "confirm it's you" for sensitive actions, the two-factor requirement for
 * holders of sensitive permissions, idle sign-out and new-device notices.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { authorize } from "@/lib/server/authz";
import type { Ctx } from "@/lib/server/context";
import { hashPassword } from "@/lib/server/crypto";
import { issueResetLink, login, resolveSessionInfo } from "@/lib/server/services/auth";
import { confirmMfaSetup, disableMfa, mfaStatus, reauthenticate, regenerateRecoveryCodes, resetUserMfa, startMfaSetup, verifyMfaLogin } from "@/lib/server/services/mfa";
import { base32Decode, totpAt } from "@/lib/server/totp";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const PASSWORD = "correct-Horse-battery-9";
async function withPassword(opts: Parameters<TestWorld["user"]>[0]) {
  const id = await w.user(opts);
  w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(PASSWORD, "test-pepper-0123456789"), id);
  return id;
}
/** The code an authenticator app would show now (or `offset` steps later). */
const codeFor = async (secret: string, offset = 0) => totpAt(base32Decode(secret.replace(/\s/g, "")), Date.now() / 1000 + offset * 30);
/** A context for a real browser session (step-up applies). */
async function sessionCtx(userId: string, token: string): Promise<Ctx> {
  const base = await w.ctx(userId);
  const session = await resolveSessionInfo(base, token);
  return { ...base, session: session ?? undefined };
}
async function enableMfa(userId: string) {
  const { secret } = await startMfaSetup(await w.ctx(userId));
  const { recoveryCodes } = await confirmMfaSetup(await w.ctx(userId), await codeFor(secret));
  // The confirming code's step is used up; later tests use the next step.
  return { secret, recoveryCodes };
}

describe("two-factor sign-in", () => {
  it("sets up with a code, then sign-in needs a code; a pending sign-in isn't a session", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    const { secret } = await startMfaSetup(await w.ctx(id));
    await expect(confirmMfaSetup(await w.ctx(id), "000000")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await mfaStatus(await w.ctx(id))).enabled).toBe(false);
    const { recoveryCodes } = await confirmMfaSetup(await w.ctx(id), await codeFor(secret));
    expect(recoveryCodes).toHaveLength(10);
    expect((await mfaStatus(await w.ctx(id)))).toMatchObject({ enabled: true, recoveryLeft: 10 });
    // Stored encrypted, never as the base32 key.
    const row = w.sqlite.prepare("SELECT secret_enc FROM user_mfa WHERE user_id = ?").get(id) as { secret_enc: string };
    expect(row.secret_enc).toMatch(/^v1\./);
    expect(row.secret_enc).not.toContain(secret.replace(/\s/g, ""));

    const pending = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    expect(pending.mfaRequired).toBe(true);
    expect(await resolveSessionInfo(await w.ctx(), pending.token)).toBeNull();
    await expect(verifyMfaLogin(await w.ctx(), pending.token, "123456")).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await verifyMfaLogin(await w.ctx(), pending.token, await codeFor(secret, 1));
    expect((await resolveSessionInfo(await w.ctx(), ok.token))?.userId).toBe(id);
    // The same code can't be used again (replay).
    const again = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    await expect(verifyMfaLogin(await w.ctx(), again.token, await codeFor(secret, 1))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("recovery codes work once; too many wrong codes end the pending sign-in", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    const { recoveryCodes } = await enableMfa(id);
    const p1 = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    await verifyMfaLogin(await w.ctx(), p1.token, recoveryCodes[0].toUpperCase());
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'security.recovery_code'").get(id)).toEqual({ n: 1 });
    const p2 = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    await expect(verifyMfaLogin(await w.ctx(), p2.token, recoveryCodes[0])).rejects.toMatchObject({ code: "VALIDATION" });
    for (let i = 0; i < 4; i++) await expect(verifyMfaLogin(await w.ctx(), p2.token, "000000")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifyMfaLogin(await w.ctx(), p2.token, recoveryCodes[1])).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(verifyMfaLogin(await w.ctx(), p2.token, recoveryCodes[1])).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("new recovery codes need a current code; turning off needs password and code", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    const { secret, recoveryCodes } = await enableMfa(id);
    await expect(regenerateRecoveryCodes(await w.ctx(id), recoveryCodes[0])).rejects.toMatchObject({ code: "VALIDATION" });
    const fresh = await regenerateRecoveryCodes(await w.ctx(id), await codeFor(secret, 1));
    expect(fresh.recoveryCodes).not.toContain(recoveryCodes[0]);
    await expect(disableMfa(await w.ctx(id), { password: "wrong", code: fresh.recoveryCodes[0] })).rejects.toMatchObject({ code: "VALIDATION" });
    await disableMfa(await w.ctx(id), { password: PASSWORD, code: fresh.recoveryCodes[0] });
    expect((await mfaStatus(await w.ctx(id))).enabled).toBe(false);
    expect((await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD })).mfaRequired).toBeUndefined();
  });

  it("a leader can reset someone's two-factor, which signs them out", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    await enableMfa(id);
    await expect(resetUserMfa(await w.ctx(id), id, "lost phone")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await resetUserMfa(await w.ctx(mod), id, "Lost phone, checked in person");
    expect((await mfaStatus(await w.ctx(id))).enabled).toBe(false);
  });
});

describe("confirm it's you (step-up)", () => {
  it("sensitive actions in a browser session need a recent password", async () => {
    const mod = await withPassword({ email: "mod@x.bd", roles: ["moderator"] });
    const target = await w.user({ email: "t@x.bd", roles: ["member"] });
    const s = await login(await w.ctx(), { email: "mod@x.bd", password: PASSWORD });
    // Fresh sign-in counts as confirmation.
    await expect(issueResetLink(await sessionCtx(mod, s.token), target)).resolves.toBeTruthy();
    w.sqlite.prepare("UPDATE sessions SET reauth_at = '2020-01-01T00:00:00.000Z'").run();
    await expect(issueResetLink(await sessionCtx(mod, s.token), target)).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    await expect(reauthenticate(await sessionCtx(mod, s.token), { password: "nope" })).rejects.toMatchObject({ code: "VALIDATION" });
    await reauthenticate(await sessionCtx(mod, s.token), { password: PASSWORD });
    await expect(issueResetLink(await sessionCtx(mod, s.token), target)).resolves.toBeTruthy();
  });
});

describe("two-factor required for sensitive permissions", () => {
  it("withholds sensitive permissions after the grace period, keeps the rest, and restores them with two-factor", async () => {
    const pres = await withPassword({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const holdsNow = async () => (await w.ctx(pres)).actor!.security!;
    expect(await holdsNow()).toMatchObject({ holdsSensitive: true, mfaRequired: true, mfaBlocked: false });
    const sensitive = w.sqlite.prepare(
      `SELECT pm.key FROM position_permissions pp JOIN permissions pm ON pm.id = pp.permission_id WHERE pp.position_id = 'pos:president' AND pm.is_sensitive = 1 LIMIT 1`).get() as { key: string };
    expect(authorize(await w.ctx(pres), sensitive.key).outcome).not.toBe("DENY");

    // An old account promoted just now still gets the whole grace period: it starts when the
    // sensitive access began, not when the account was created.
    w.sqlite.prepare("UPDATE users SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(pres);
    w.sqlite.prepare("UPDATE system_settings SET updated_at = '2020-01-01T00:00:00.000Z' WHERE key = 'security.mfa_required_for_sensitive'").run();
    expect(await holdsNow()).toMatchObject({ mfaBlocked: false, mfaDeadline: expect.any(String) });

    // Grace over: the account, the rule and the President listing are all old.
    w.sqlite.prepare("UPDATE committee_members SET created_at = '2020-01-01T00:00:00.000Z', start_date = NULL WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = ?)").run(pres);
    expect(await holdsNow()).toMatchObject({ mfaBlocked: true });
    expect(authorize(await w.ctx(pres), sensitive.key).outcome).toBe("DENY");
    expect(authorize(await w.ctx(pres), "events.read").outcome).not.toBe("DENY");
    await expect(disableMfa(await w.ctx(pres), { password: PASSWORD, code: "x" })).rejects.toMatchObject({ code: "MFA_REQUIRED" });

    await enableMfa(pres);
    expect(await holdsNow()).toMatchObject({ mfaEnabled: true, mfaBlocked: false });
    expect(authorize(await w.ctx(pres), sensitive.key).outcome).not.toBe("DENY");
    // Required accounts can't turn it off.
    await expect(disableMfa(await w.ctx(pres), { password: PASSWORD, code: "000000" })).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });

  it("ordinary members aren't asked for two-factor", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    expect((await w.ctx(m)).actor!.security).toMatchObject({ holdsSensitive: false, mfaRequired: false, mfaBlocked: false });
  });
});

describe("sessions", () => {
  it("end after the idle period and at the absolute limit", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    const s = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    expect(await resolveSessionInfo(await w.ctx(), s.token)).not.toBeNull();
    const old = new Date(Date.now() - 15 * 86_400_000).toISOString();
    w.sqlite.prepare("UPDATE sessions SET last_seen_at = ? WHERE user_id = ?").run(old, id);
    expect(await resolveSessionInfo(await w.ctx(), s.token)).toBeNull();
    expect(w.sqlite.prepare("SELECT revoked_at IS NOT NULL AS r FROM sessions WHERE user_id = ?").get(id)).toEqual({ r: 1 });

    const s2 = await login(await w.ctx(), { email: "a@x.bd", password: PASSWORD });
    w.sqlite.prepare("UPDATE sessions SET created_at = ? WHERE revoked_at IS NULL AND user_id = ?").run(new Date(Date.now() - 31 * 86_400_000).toISOString(), id);
    expect(await resolveSessionInfo(await w.ctx(), s2.token)).toBeNull();
  });

  it("a sign-in from a new kind of device leaves a notice", async () => {
    const id = await withPassword({ email: "a@x.bd", roles: ["member"] });
    const chrome = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
    await login(await w.ctx(null, { userAgent: chrome }), { email: "a@x.bd", password: PASSWORD });
    await login(await w.ctx(null, { userAgent: chrome }), { email: "a@x.bd", password: PASSWORD });
    const notices = () => (w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'security.new_sign_in'").get(id) as { n: number }).n;
    expect(notices()).toBe(0);
    await login(await w.ctx(null, { userAgent: android }), { email: "a@x.bd", password: PASSWORD });
    expect(notices()).toBe(1);
  });
});

describe("activity log seals", () => {
  it("chains hourly seals and notices a changed entry", async () => {
    const { sealAuditLog, verifyAuditLog } = await import("@/lib/server/services/audit-seal");
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    expect((await verifyAuditLog(await w.ctx(pres))).seals).toBe(0);
    await expect(verifyAuditLog(await w.ctx(m))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const insert = w.sqlite.prepare("INSERT INTO audit_logs (id, action, created_at) VALUES (?, 'test.action', ?)");
    insert.run("aud_1", "2026-09-01T00:00:00.000Z");
    insert.run("aud_2", "2026-09-01T00:01:00.000Z");
    expect((await sealAuditLog(await w.ctx())).sealed).toBeGreaterThanOrEqual(2);
    expect((await sealAuditLog(await w.ctx())).sealed).toBe(0);
    insert.run("aud_3", "2026-09-01T01:00:00.000Z");
    await sealAuditLog(await w.ctx());
    expect(await verifyAuditLog(await w.ctx(pres))).toMatchObject({ ok: true, seals: 2 });
    // The table refuses edits; someone with direct database access could drop that guard.
    expect(() => w.sqlite.prepare("UPDATE audit_logs SET reason = 'x' WHERE id = 'aud_3'").run()).toThrow(/append-only/);
    w.sqlite.exec("DROP TRIGGER audit_logs_no_update; DROP TRIGGER audit_logs_no_delete;");
    w.sqlite.prepare("UPDATE audit_logs SET reason = 'edited later' WHERE id = 'aud_3'").run();
    expect(await verifyAuditLog(await w.ctx(pres))).toMatchObject({ ok: false });
    w.sqlite.prepare("UPDATE audit_logs SET reason = NULL WHERE id = 'aud_3'").run();
    expect((await verifyAuditLog(await w.ctx(pres))).ok).toBe(true);
    w.sqlite.prepare("DELETE FROM audit_logs WHERE id = 'aud_3'").run();
    expect((await verifyAuditLog(await w.ctx(pres))).ok).toBe(false);
  });
});

describe("member export", () => {
  it("is CSV-injection safe, limited to member managers, needs a recent password and is audited", async () => {
    const { exportMembersCsv } = await import("@/lib/server/services/members");
    const mod = await withPassword({ email: "mod@x.bd", roles: ["moderator"] });
    const m = await w.user({ email: "m@x.bd", roles: ["member"], name: "=HYPERLINK(\"http://evil\")" });
    await expect(exportMembersCsv(await w.ctx(m))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const out = await exportMembersCsv(await w.ctx(mod), { status: "ACTIVE" });
    expect(out.csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(out.filename).toMatch(/^gucc-members-active-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'members.export'").get()).toEqual({ n: 1 });
    const s = await login(await w.ctx(), { email: "mod@x.bd", password: PASSWORD });
    w.sqlite.prepare("UPDATE sessions SET reauth_at = NULL").run();
    await expect(exportMembersCsv(await sessionCtx(mod, s.token))).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  });
});
