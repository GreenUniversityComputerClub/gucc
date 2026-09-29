/**
 * Two-factor sign-in (authenticator app codes) and "confirm it's you" for sensitive actions.
 *
 *   setup      a secret is generated and kept encrypted until the first code proves the app works
 *   sign-in    a correct password on an account with two-factor gives a pending session that only
 *              becomes a real one with a code (or a one-time recovery code)
 *   step-up    sensitive actions need a password or code entered in the last few minutes
 *
 * Accounts holding sensitive permissions must turn it on after a grace period
 * (security.mfa_required_for_sensitive); until they do, those permissions are withheld.
 */
import { limit, checkFailures, limitFailure } from "../limits";
import { auditStmt } from "../audit";
import { loadActor, requireActor, requirePermission, userResource } from "../authz";
import { assertCanGrantPermissions, GovernanceViolation } from "../../governance/invariants";
import type { Ctx } from "../context";
import { sha256Hex, verifyPassword } from "../crypto";
import { nowIso } from "../db";
import { AppError, AuthRequiredError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";
import { getSetting, requireRecentAuth } from "../security";
import { requireSecret, verificationSecrets } from "../signing";
import { base32Encode, decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode, otpauthUri, verifyTotp } from "../totp";
import { authEventStmt, newDeviceNotice } from "./auth";

type MfaRow = { secret_enc: string; confirmed_at: string | null; recovery_json: string; last_step: number | null };

const secretKey = (ctx: Ctx) => requireSecret(ctx.env.AUTH_SECRET);

/**
 * The authenticator secret, decrypted. During an AUTH_SECRET rotation a secret still encrypted with
 * the previous key is opened with it and saved again under the current one.
 */
async function openSecret(ctx: Ctx, userId: string, stored: string): Promise<Uint8Array> {
  const [current, ...previous] = verificationSecrets(ctx.env);
  try {
    return await decryptSecret(stored, current!);
  } catch (e) {
    for (const key of previous) {
      try {
        const secret = await decryptSecret(stored, key);
        await ctx.db.run("UPDATE user_mfa SET secret_enc = ?2, updated_at = ?3 WHERE user_id = ?1 AND secret_enc = ?4", userId, await encryptSecret(secret, current!), nowIso(), stored);
        return secret;
      } catch {
        /* not this key either */
      }
    }
    throw e;
  }
}

export async function mfaStatus(ctx: Ctx) {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ confirmed_at: string | null; recovery_json: string }>("SELECT confirmed_at, recovery_json FROM user_mfa WHERE user_id = ?1", actor.user.id);
  const sec = actor.security;
  return {
    enabled: Boolean(row?.confirmed_at),
    enabledAt: row?.confirmed_at ?? null,
    recoveryLeft: row?.confirmed_at ? (JSON.parse(row.recovery_json) as string[]).length : 0,
    required: Boolean(sec?.mfaRequired),
    deadline: sec?.mfaDeadline ?? null,
    blocked: Boolean(sec?.mfaBlocked),
  };
}

/** Start (or restart) setup: a new secret, shown once as a QR code and as text. */
export async function startMfaSetup(ctx: Ctx) {
  const actor = requireActor(ctx);
  await limit(ctx, "mfa.setup", actor.user.id);
  // A stolen session must not be able to put the thief's phone on the account.
  await requireRecentAuth(ctx);
  const existing = await ctx.db.first<{ confirmed_at: string | null }>("SELECT confirmed_at FROM user_mfa WHERE user_id = ?1", actor.user.id);
  if (existing?.confirmed_at) throw new AppError(409, "MFA_ON", "Two-factor sign-in is already on. Use \"Move to a new phone\" to change the app.");
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const b32 = base32Encode(secret);
  await ctx.db.run(
    `INSERT INTO user_mfa (user_id, secret_enc, confirmed_at, recovery_json, last_step, created_at, updated_at) VALUES (?1, ?2, NULL, '[]', NULL, ?3, ?3)
     ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, confirmed_at = NULL, recovery_json = '[]', last_step = NULL, updated_at = excluded.updated_at`,
    actor.user.id, await encryptSecret(secret, secretKey(ctx)), nowIso());
  return { secret: b32.replace(/(.{4})/g, "$1 ").trim(), uri: otpauthUri(b32, actor.user.email) };
}

/** The first correct code turns two-factor on and returns ten recovery codes, shown once. */
export async function confirmMfaSetup(ctx: Ctx, code: unknown): Promise<{ recoveryCodes: string[] }> {
  const actor = requireActor(ctx);
  await limit(ctx, "mfa.confirm", actor.user.id);
  const row = await ctx.db.first<MfaRow>("SELECT secret_enc, confirmed_at, recovery_json, last_step FROM user_mfa WHERE user_id = ?1", actor.user.id);
  if (!row) throw new AppError(409, "MFA_NOT_STARTED", "Start the setup first.");
  if (row.confirmed_at) throw new AppError(409, "MFA_ON", "Two-factor sign-in is already on.");
  const step = await verifyTotp(await openSecret(ctx, actor.user.id, row.secret_enc), String(code ?? ""));
  if (step === null) throw new ValidationError("That code isn't right. Check the app and your phone's clock, then try the newest code.", { code: "Wrong code." });
  const codes = newRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c, ctx.env.PASSWORD_PEPPER)));
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE user_mfa SET confirmed_at = ?2, recovery_json = ?3, last_step = ?4, updated_at = ?2 WHERE user_id = ?1", actor.user.id, now, JSON.stringify(hashes), step),
    ...(ctx.session ? [ctx.db.stmt("UPDATE sessions SET reauth_at = ?2 WHERE id = ?1", ctx.session.id, now)] : []),
    auditStmt(ctx, { action: "account.mfa_enabled", resourceType: "user", resourceId: actor.user.id }),
    await authEventStmt(ctx, "MFA_ENABLED", actor.user.id, actor.user.email),
    ...notifyStmts(ctx, [actor.user.id], { type: "security.mfa", title: "Two-factor sign-in is on", body: "You'll enter a code from your authenticator app when you sign in.", link: "/dashboard/security" }),
  ]);
  return { recoveryCodes: codes };
}

async function passwordOk(ctx: Ctx, userId: string, password: unknown) {
  const row = await ctx.db.first<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?1", userId);
  return (await verifyPassword(String(password ?? ""), row?.password_hash ?? null, ctx.env.PASSWORD_PEPPER, ctx.env.PASSWORD_PEPPER_PREVIOUS)).ok;
}

/** A current code or an unused recovery code; consumes it. */
async function checkSecondFactor(ctx: Ctx, userId: string, code: string): Promise<"totp" | "recovery" | null> {
  const row = await ctx.db.first<MfaRow>("SELECT secret_enc, confirmed_at, recovery_json, last_step FROM user_mfa WHERE user_id = ?1 AND confirmed_at IS NOT NULL", userId);
  if (!row) return null;
  const clean = code.trim();
  if (/^\d{6}$/.test(clean.replace(/\s/g, ""))) {
    const step = await verifyTotp(await openSecret(ctx, userId, row.secret_enc), clean, { lastStep: row.last_step });
    if (step === null) return null;
    // Guarded update: two requests with the same code can't both succeed.
    const n = await ctx.db.run("UPDATE user_mfa SET last_step = ?2, updated_at = ?3 WHERE user_id = ?1 AND (last_step IS NULL OR last_step < ?2)", userId, step, nowIso());
    return n ? "totp" : null;
  }
  if (normalizeRecoveryCode(clean).length !== 8) return null;
  const left = (JSON.parse(row.recovery_json) as string[]);
  // Codes made before a pepper rotation were hashed with the previous pepper.
  let hash = await hashRecoveryCode(clean, ctx.env.PASSWORD_PEPPER);
  if (!left.includes(hash) && ctx.env.PASSWORD_PEPPER_PREVIOUS) hash = await hashRecoveryCode(clean, ctx.env.PASSWORD_PEPPER_PREVIOUS);
  if (!left.includes(hash)) return null;
  const n = await ctx.db.run("UPDATE user_mfa SET recovery_json = ?2, updated_at = ?3 WHERE user_id = ?1 AND recovery_json = ?4",
    userId, JSON.stringify(left.filter((h) => h !== hash)), nowIso(), row.recovery_json);
  return n ? "recovery" : null;
}

/** Turn two-factor off (password and a code). Not allowed while the account's permissions require it. */
export async function disableMfa(ctx: Ctx, input: { password?: unknown; code?: unknown }) {
  const actor = requireActor(ctx);
  await limit(ctx, "account.reauth", actor.user.id);
  if (actor.security?.mfaRequired) throw new AppError(409, "MFA_REQUIRED", "Your permissions require two-factor sign-in, so it can't be turned off. To change phones, use \"Move to a new phone\" instead.");
  if (!(await passwordOk(ctx, actor.user.id, input.password))) throw new ValidationError("That password isn't right.", { password: "Check your password." });
  if (!(await checkSecondFactor(ctx, actor.user.id, String(input.code ?? "")))) throw new ValidationError("That code isn't right.", { code: "Wrong code." });
  await ctx.db.batch([
    ctx.db.stmt("DELETE FROM user_mfa WHERE user_id = ?1", actor.user.id),
    auditStmt(ctx, { action: "account.mfa_disabled", resourceType: "user", resourceId: actor.user.id }),
    await authEventStmt(ctx, "MFA_DISABLED", actor.user.id, actor.user.email),
    ...notifyStmts(ctx, [actor.user.id], { type: "security.mfa", title: "Two-factor sign-in was turned off", body: "If this wasn't you, change your password now.", link: "/dashboard/security" }),
  ]);
}

export async function regenerateRecoveryCodes(ctx: Ctx, code: unknown): Promise<{ recoveryCodes: string[] }> {
  const actor = requireActor(ctx);
  await limit(ctx, "account.reauth", actor.user.id);
  if ((await checkSecondFactor(ctx, actor.user.id, String(code ?? ""))) !== "totp") throw new ValidationError("Enter the current code from your authenticator app.", { code: "Wrong code." });
  const codes = newRecoveryCodes();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE user_mfa SET recovery_json = ?2, updated_at = ?3 WHERE user_id = ?1", actor.user.id,
      JSON.stringify(await Promise.all(codes.map((c) => hashRecoveryCode(c, ctx.env.PASSWORD_PEPPER)))), nowIso()),
    auditStmt(ctx, { action: "account.mfa_recovery_codes", resourceType: "user", resourceId: actor.user.id }),
  ]);
  return { recoveryCodes: codes };
}

/**
 * Move two-factor to a new phone without turning it off (leaders must keep it on): the password
 * and a current code or a recovery code prove it's you, then a new secret waits beside the old
 * one until the new app's first code proves it works. Until then the old app keeps working.
 */
export async function startMfaReplace(ctx: Ctx, input: { password?: unknown; code?: unknown }) {
  const actor = requireActor(ctx);
  await limit(ctx, "account.reauth", actor.user.id);
  const on = await ctx.db.value<string>("SELECT confirmed_at FROM user_mfa WHERE user_id = ?1 AND confirmed_at IS NOT NULL", actor.user.id);
  if (!on) throw new AppError(409, "MFA_OFF", "Two-factor sign-in isn't on. Set it up instead.");
  if (!(await passwordOk(ctx, actor.user.id, input.password))) throw new ValidationError("That password isn't right.", { password: "Check your password." });
  if (!(await checkSecondFactor(ctx, actor.user.id, String(input.code ?? "")))) throw new ValidationError("That code isn't right. Use your old app's current code or a recovery code.", { code: "Wrong code." });
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const b32 = base32Encode(secret);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE user_mfa SET pending_secret_enc = ?2, pending_at = ?3, updated_at = ?3 WHERE user_id = ?1", actor.user.id, await encryptSecret(secret, secretKey(ctx)), now),
    ...(ctx.session ? [ctx.db.stmt("UPDATE sessions SET reauth_at = ?2 WHERE id = ?1", ctx.session.id, now)] : []),
  ]);
  return { secret: b32.replace(/(.{4})/g, "$1 ").trim(), uri: otpauthUri(b32, actor.user.email) };
}

/** Minutes a new phone has to show its first code before the move must start again. */
const REPLACE_MINUTES = 30;

/** The new app's first code switches over and returns ten new recovery codes (the old ones stop working). */
export async function confirmMfaReplace(ctx: Ctx, code: unknown): Promise<{ recoveryCodes: string[] }> {
  const actor = requireActor(ctx);
  await limit(ctx, "mfa.confirm", actor.user.id);
  const row = await ctx.db.first<{ pending_secret_enc: string | null; pending_at: string | null }>(
    "SELECT pending_secret_enc, pending_at FROM user_mfa WHERE user_id = ?1 AND confirmed_at IS NOT NULL", actor.user.id);
  if (!row?.pending_secret_enc || !row.pending_at || Date.now() - new Date(row.pending_at).getTime() > REPLACE_MINUTES * 60_000) {
    throw new AppError(409, "MFA_NOT_STARTED", "Start the move to a new phone again.");
  }
  const step = await verifyTotp(await openSecret(ctx, actor.user.id, row.pending_secret_enc), String(code ?? ""));
  if (step === null) throw new ValidationError("That code isn't right. Use the newest code from the new app and check the phone's clock.", { code: "Wrong code." });
  const codes = newRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c, ctx.env.PASSWORD_PEPPER)));
  const now = nowIso();
  const n = await ctx.db.run(
    `UPDATE user_mfa SET secret_enc = pending_secret_enc, pending_secret_enc = NULL, pending_at = NULL, recovery_json = ?2, last_step = ?3, updated_at = ?4
     WHERE user_id = ?1 AND pending_secret_enc = ?5`, actor.user.id, JSON.stringify(hashes), step, now, row.pending_secret_enc);
  if (!n) throw new AppError(409, "MFA_NOT_STARTED", "Start the move to a new phone again.");
  await ctx.db.batch([
    auditStmt(ctx, { action: "account.mfa_replaced", resourceType: "user", resourceId: actor.user.id }),
    await authEventStmt(ctx, "MFA_REPLACED", actor.user.id, actor.user.email),
    ...notifyStmts(ctx, [actor.user.id], { type: "security.mfa", title: "Two-factor sign-in moved to a new app", body: "Your old authenticator app and recovery codes no longer work. If this wasn't you, change your password now.", link: "/dashboard/security" }),
  ]);
  return { recoveryCodes: codes };
}

/** A Moderator resets someone's two-factor (lost phone and no recovery codes). They set it up again. */
export async function resetUserMfa(ctx: Ctx, userId: string, reason: unknown) {
  const actor = requireActor(ctx);
  // Account recovery: the same power as issuing a password-reset link.
  const decision = requirePermission(ctx, "users.reset_password");
  await requireRecentAuth(ctx);
  if (userId === actor.user.id) throw new ValidationError("Use your own security page for your account.");
  // The same guards as a password-reset link: never a way into a more powerful account.
  const target = await userResource(ctx.db, userId);
  if (!target) throw new NotFoundError("Account");
  if (target.isProtected) requirePermission(ctx, "governance.protected");
  const theirs = (await loadActor(ctx.db, userId))?.subject.grants.filter((g) => g.scope === "ALL").map((g) => g.permission) ?? [];
  try {
    assertCanGrantPermissions(actor.subject, [...new Set(theirs)]);
  } catch (e) {
    if (e instanceof GovernanceViolation) throw new ForbiddenError("This account has access you don't have, so only someone with at least the same access (or a Moderator) can reset its two-factor sign-in.");
    throw e;
  }
  const why = String(reason ?? "").trim();
  if (why.length < 5) throw new ValidationError("Say why (for the activity log).", { reason: "At least 5 characters." });
  const n = await ctx.db.run("DELETE FROM user_mfa WHERE user_id = ?1", userId);
  if (!n) throw new AppError(409, "MFA_OFF", "This account doesn't use two-factor sign-in.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", userId, nowIso()),
    auditStmt(ctx, { action: "account.mfa_reset", resourceType: "user", resourceId: userId, reason: why, decision }),
    ...notifyStmts(ctx, [userId], { type: "security.mfa", title: "Your two-factor sign-in was reset", body: "A club leader reset it. Set it up again from your security page.", link: "/dashboard/security" }),
  ]);
}

/** Finish a sign-in that is waiting for its code. Returns the now-active session. */
export async function verifyMfaLogin(ctx: Ctx, token: unknown, code: unknown) {
  const raw = String(token ?? "");
  if (raw.length < 20 || raw.length > 100) throw new AuthRequiredError("Sign in again.");
  const id = await sha256Hex(raw);
  const s = await ctx.db.first<{ user_id: string; expires_at: string; revoked_at: string | null; mfa_pending: number; email: string; status: string }>(
    "SELECT s.user_id, s.expires_at, s.revoked_at, s.mfa_pending, u.email, u.status FROM sessions s JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL WHERE s.id = ?1", id);
  if (!s || !s.mfa_pending || s.revoked_at || s.expires_at < nowIso()) throw new AuthRequiredError("That sign-in has expired. Enter your email and password again.");
  // Wrong codes are counted per account, so starting a new sign-in doesn't reset the count.
  try {
    await checkFailures(ctx, "mfa.login", s.user_id);
  } catch {
    await ctx.db.run("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1", id, nowIso());
    throw new AppError(429, "RATE_LIMITED", "Too many wrong codes. For your safety this sign-in was stopped: wait 15 minutes, then sign in again with your email and password.");
  }
  const kind = await checkSecondFactor(ctx, s.user_id, String(code ?? ""));
  if (!kind) {
    await limitFailure(ctx, "mfa.login", s.user_id);
    await (await authEventStmt(ctx, "MFA_FAILED", s.user_id, s.email)).run();
    throw new ValidationError("That code isn't right. Use the newest code from your app, or a recovery code.", { code: "Wrong code." });
  }
  const days = await getSetting(ctx, "auth.session_days", 30);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const now = nowIso();
  const left = kind === "recovery" ? (JSON.parse((await ctx.db.value<string>("SELECT recovery_json FROM user_mfa WHERE user_id = ?1", s.user_id)) ?? "[]") as string[]).length : null;
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sessions SET mfa_pending = 0, expires_at = ?2, last_seen_at = ?3, reauth_at = ?3 WHERE id = ?1", id, expiresAt, now),
    ctx.db.stmt("UPDATE users SET last_login_at = ?2 WHERE id = ?1", s.user_id, now),
    ...(await newDeviceNotice(ctx, s.user_id)),
    await authEventStmt(ctx, kind === "recovery" ? "LOGIN_SUCCESS_RECOVERY_CODE" : "LOGIN_SUCCESS", s.user_id, s.email, "two-factor"),
    auditStmt(ctx, { action: "auth.login", resourceType: "user", resourceId: s.user_id, actorUserId: s.user_id, actorLabel: s.email, reason: kind === "recovery" ? "Signed in with a recovery code" : null }),
    ...(kind === "recovery" ? notifyStmts(ctx, [s.user_id], { type: "security.recovery_code", title: "A recovery code was used to sign in", body: `${left} left. Make new ones on your security page if you're running low.`, link: "/dashboard/security" }) : []),
  ]);
  return { token: raw, expiresAt, status: s.status };
}

/** "Confirm it's you": a password (or a current code) refreshes the step-up window for this session. */
export async function reauthenticate(ctx: Ctx, input: { password?: unknown; code?: unknown }) {
  const actor = requireActor(ctx);
  if (!ctx.session) throw new AuthRequiredError("Sign in again.");
  await limit(ctx, "account.reauth", actor.user.id);
  const byCode = input.code ? (await checkSecondFactor(ctx, actor.user.id, String(input.code))) === "totp" : false;
  if (!byCode && !(await passwordOk(ctx, actor.user.id, input.password))) throw new ValidationError("That password isn't right.", { password: "Check your password." });
  await ctx.db.run("UPDATE sessions SET reauth_at = ?2 WHERE id = ?1", ctx.session.id, nowIso());
}

export { requireRecentAuth };
