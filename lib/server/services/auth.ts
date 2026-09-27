/**
 * Authentication on Cloudflare: accounts, sessions and tokens live in D1.
 *
 * - Passwords: PBKDF2-SHA256 (lib/server/crypto.ts).
 * - Sessions: 256-bit random token in an HttpOnly, Secure, SameSite=Lax
 *   cookie; only its SHA-256 is stored, so a database leak yields no usable
 *   sessions.
 * - Email verification and password reset use single-use hashed tokens.
 * - Brute force: per-IP and per-account rate limits plus temporary lockout.
 * - Enumeration: registration and reset give the same answer whether or not
 *   the email exists.
 * - Registration never grants privileges: new accounts verify their email,
 *   then wait for approval (members.approve) before becoming ACTIVE members.
 */
import { limit } from "../limits";
import { assertCanGrantPermissions, assertNotSelf, GovernanceViolation } from "../../governance/invariants";
import type { Ctx, SessionInfo, UserRow } from "../context";
import { loadActor, requireActor, requirePermission, userResource } from "../authz";
import { auditStmt } from "../audit";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { newId, nowIso } from "../db";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts, usersWithPermission } from "../notifications";
import { emailEnabled } from "../email";
import { deliverEmail, getSetting, requireRecentAuth, verifyTurnstile } from "../security";
import { passwordProblem, STUDENT_ID_RE, Validator } from "../validate";
import { triggerStmts } from "../triggers";
import { describeAgent } from "./account";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const VERIFY_HOURS = 48;
const RESET_MINUTES = 60;

const addMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function baseUrl(ctx: Ctx): string {
  return (ctx.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function authEventStmt(ctx: Ctx, event: string, userId: string | null, email: string | null, detail?: string) {
  return ctx.db.stmt(
    "INSERT INTO authentication_events (id, user_id, email, event, ip_hash, user_agent, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    newId("ae"), userId, email, event, ctx.meta.ipHash, ctx.meta.userAgent?.slice(0, 300) ?? null, detail ?? null, nowIso(),
  );
}

async function issueToken(ctx: Ctx, userId: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE", minutes: number): Promise<string> {
  const token = randomToken(32);
  // One live token per purpose: older links stop working when a new one is sent.
  await ctx.db.batch([
    ctx.db.stmt("UPDATE auth_tokens SET used_at = ?3 WHERE user_id = ?1 AND purpose = ?2 AND used_at IS NULL", userId, purpose, nowIso()),
    ctx.db.stmt("INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      newId("tok"), userId, purpose, await sha256Hex(token), addMinutes(minutes), nowIso()),
  ]);
  return token;
}

async function consumeToken(ctx: Ctx, token: string, purpose: string): Promise<string> {
  const hash = await sha256Hex(token);
  const row = await ctx.db.first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND purpose = ?2",
    hash,
    purpose,
  );
  if (!row || row.used_at || row.expires_at < nowIso()) throw new AppError(400, "TOKEN_INVALID", "This link is invalid or has expired. Request a new one.");
  const changed = await ctx.db.run("UPDATE auth_tokens SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL", row.id, nowIso());
  if (changed === 0) throw new AppError(400, "TOKEN_INVALID", "This link has already been used.");
  return row.user_id;
}

// ───────────────────────────── registration ─────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  studentId?: string;
  department?: string;
  batch?: string;
  /** Optional, private: only the member and administrators with members.manage see it. */
  phone?: string;
  turnstileToken?: string;
}

export async function register(ctx: Ctx, input: RegisterInput): Promise<{ message: string }> {
  await limit(ctx, "auth.register", ctx.meta.ipHash ?? "unknown");
  const v = new Validator(input as unknown as Record<string, unknown>);
  const email = v.email("email");
  const fullName = v.string("fullName", { required: true, min: 2, max: 100, label: "Full name" });
  const studentId = v.string("studentId", { max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be 9 digits." });
  const department = v.string("department", { max: 60, label: "Department" });
  const batch = v.string("batch", { max: 20, label: "Batch" });
  const phone = v.string("phone", { max: 20, label: "Phone", pattern: /^\+?[0-9\s-]{6,20}$/, patternMessage: "Enter a valid phone number." });
  const password = typeof input.password === "string" ? input.password : "";
  const problem = passwordProblem(password, email);
  if (problem) v.errors.password = problem;
  v.done();
  await verifyTurnstile(ctx, input.turnstileToken);
  if (!(await getSetting(ctx, "auth.registration_open", true))) throw new AppError(403, "REGISTRATION_CLOSED", "Registration is currently closed.");

  // Mode A (email available): verify the address first. Mode B (no provider): go straight to
  // GUCC approval; reviewers confirm who the applicant is. Same answer whether or not the
  // email already has an account, so the form can't be used to discover members.
  const withEmail = await emailEnabled(ctx);
  const generic = withEmail
    ? { message: "Check your inbox for a verification link. If you already have an account, sign in or reset your password instead." }
    : { message: "Your account has been created and is awaiting GUCC approval. If you already had an account with this email, sign in with it instead." };
  const existing = await ctx.db.first<{ id: string }>("SELECT id FROM users WHERE email = ?1", email);
  if (existing) {
    await (await authEventStmt(ctx, "REGISTER_DUPLICATE", existing.id, email)).run();
    return generic;
  }

  const userId = newId("usr");
  const profileId = newId("prf");
  const now = nowIso();
  // A student ID already held by a legacy profile is not attached
  // automatically: anyone could type someone else's ID. It is recorded as a
  // claim for an administrator to confirm.
  const taken = studentId ? await ctx.db.first<{ id: string }>("SELECT id FROM profiles WHERE student_id = ?1 AND deleted_at IS NULL", studentId) : null;
  const status = withEmail ? "EMAIL_VERIFICATION_PENDING" : "PENDING_APPROVAL";
  const approvers = withEmail ? [] : await usersWithPermission(ctx, "members.approve");
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO users (id, email, password_hash, status, password_changed_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?5, ?4, ?4, ?4)",
      userId, email, await hashPassword(password, ctx.env.PASSWORD_PEPPER), now, status),
    ctx.db.stmt(
      "INSERT INTO profiles (id, user_id, full_name, person_type, student_id, department, batch, phone, legacy_json, created_at, updated_at) VALUES (?1, ?2, ?3, 'STUDENT', ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
      profileId, userId, fullName, taken ? null : studentId, department, batch, phone,
      taken ? JSON.stringify({ claimStudentId: studentId, claimProfileId: taken.id }) : null, now,
    ),
    await authEventStmt(ctx, "REGISTER", userId, email),
    auditStmt(ctx, { action: "user.register", resourceType: "user", resourceId: userId, actorUserId: userId, actorLabel: email, after: { email, fullName, studentId, department, batch, claim: Boolean(taken), status } }),
    ...notifyStmts(ctx, approvers, { type: "member.pending", title: "New membership application", body: `${fullName} (${email}) registered and is waiting for approval.`, link: "/dashboard/members?status=PENDING_APPROVAL", resourceType: "user", resourceId: userId }),
    ...(withEmail ? [] : await triggerStmts(ctx, "member.pending", { type: "user", id: userId, status: status }, { title: fullName ?? email!, link: "/dashboard/members?status=PENDING_APPROVAL" })),
  ]);
  if (!withEmail) return generic;
  const token = await issueToken(ctx, userId, "EMAIL_VERIFY", VERIFY_HOURS * 60);
  await deliverEmail(ctx, {
    to: email!,
    subject: "Verify your GUCC account",
    text: `Hello ${fullName},\n\nConfirm your email address to continue your GUCC membership application:\n${baseUrl(ctx)}/auth/confirm?token=${token}\n\nThe link expires in ${VERIFY_HOURS} hours. If you did not sign up, ignore this email.`,
  }, { type: "account.verify", userId });
  return generic;
}

export async function resendVerification(ctx: Ctx, emailRaw: string): Promise<{ message: string }> {
  await limit(ctx, "auth.resendVerification", ctx.meta.ipHash ?? "unknown");
  if (!(await emailEnabled(ctx))) return { message: "Email verification isn't available right now. GUCC's reviewers approve applications directly." };
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const user = await ctx.db.first<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?1 AND deleted_at IS NULL", email);
  if (user && user.status === "EMAIL_VERIFICATION_PENDING") {
    const token = await issueToken(ctx, user.id, "EMAIL_VERIFY", VERIFY_HOURS * 60);
    await deliverEmail(ctx, { to: email, subject: "Verify your GUCC account", text: `Confirm your email address:\n${baseUrl(ctx)}/auth/confirm?token=${token}` }, { type: "account.verify", userId: user.id });
  }
  return { message: "If that account is waiting for verification, a new link is on its way." };
}

export async function verifyEmail(ctx: Ctx, token: string): Promise<{ status: string }> {
  const userId = await consumeToken(ctx, token, "EMAIL_VERIFY");
  const user = await ctx.db.first<{ status: string; email: string }>("SELECT status, email FROM users WHERE id = ?1", userId);
  if (!user) throw new AppError(400, "TOKEN_INVALID", "Account not found.");
  if (user.status !== "EMAIL_VERIFICATION_PENDING") return { status: user.status };
  const requireApproval = await getSetting(ctx, "members.require_approval", true);
  const next = requireApproval ? "PENDING_APPROVAL" : "ACTIVE";
  const now = nowIso();
  const stmts = [
    ctx.db.stmt("UPDATE users SET status = ?2, email_verified_at = ?3, updated_at = ?3 WHERE id = ?1", userId, next, now),
    await authEventStmt(ctx, "EMAIL_VERIFIED", userId, user.email),
    auditStmt(ctx, { action: "user.email_verified", resourceType: "user", resourceId: userId, actorUserId: userId, actorLabel: user.email, after: { status: next } }),
  ];
  if (next === "ACTIVE") {
    stmts.push(ctx.db.stmt("INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) VALUES (?1, ?2, 'role:member', ?3, 'Automatic: approval not required')", newId("ur"), userId, now));
  } else {
    const approvers = await usersWithPermission(ctx, "members.approve");
    stmts.push(...notifyStmts(ctx, approvers, { type: "member.pending", title: "New membership application", body: `${user.email} verified their email and is waiting for approval.`, link: "/dashboard/members?status=PENDING_APPROVAL", resourceType: "user", resourceId: userId }));
    stmts.push(...(await triggerStmts(ctx, "member.pending", { type: "user", id: userId, status: next }, { title: user.email, link: "/dashboard/members?status=PENDING_APPROVAL" })));
  }
  await ctx.db.batch(stmts);
  return { status: next };
}

// ───────────────────────────── login / logout ─────────────────────────────

export interface SessionIssued {
  token: string;
  expiresAt: string;
  userId: string;
  status: string;
  /** The password was right and a two-factor code is still needed (the token isn't signed in yet). */
  mfaRequired?: boolean;
}

/** Minutes a password-checked sign-in waits for its two-factor code. */
const MFA_PENDING_MINUTES = 10;

export async function login(ctx: Ctx, input: { email: string; password: string; turnstileToken?: string }): Promise<SessionIssued> {
  const email = String(input.email ?? "").trim().toLowerCase();
  await limit(ctx, "auth.login.ip", ctx.meta.ipHash ?? "unknown");
  await limit(ctx, "auth.login.email", await sha256Hex(email));
  await verifyTurnstile(ctx, input.turnstileToken);
  const fail = new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

  const user = await ctx.db.first<UserRow>(
    "SELECT id, email, status, email_verified_at, password_hash, failed_login_count, locked_until, last_login_at, created_at FROM users WHERE email = ?1 AND deleted_at IS NULL",
    email,
  );
  if (user?.locked_until && user.locked_until > nowIso()) {
    throw new AppError(423, "LOCKED", `Too many failed attempts. Try again after ${new Date(user.locked_until).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })} (Dhaka time) or reset your password.`);
  }
  const { ok, needsRehash } = await verifyPassword(String(input.password ?? ""), user?.password_hash ?? null, ctx.env.PASSWORD_PEPPER, ctx.env.PASSWORD_PEPPER_PREVIOUS);
  if (!user || !ok) {
    if (user) {
      const count = user.failed_login_count + 1;
      const lock = count >= LOCK_AFTER ? addMinutes(LOCK_MINUTES) : null;
      await ctx.db.batch([
        ctx.db.stmt("UPDATE users SET failed_login_count = ?2, locked_until = ?3 WHERE id = ?1", user.id, lock ? 0 : count, lock),
        await authEventStmt(ctx, lock ? "LOCKED" : "LOGIN_FAILED", user.id, email),
        ...(lock ? [
          auditStmt(ctx, { action: "auth.locked", resourceType: "user", resourceId: user.id, actorUserId: null, actorLabel: email, reason: `${LOCK_AFTER} failed logins` }),
          // The owner hears about it (and gets an email when email is on): it may be someone else.
          ...notifyStmts(ctx, [user.id], { type: "security.locked", title: "Sign-in paused after failed attempts",
            body: `Someone entered a wrong password for your account ${LOCK_AFTER} times, so sign-in is paused for ${LOCK_MINUTES} minutes. If it wasn't you, choose a new password once you're in and sign out other devices.`, link: "/dashboard/security" }),
        ] : []),
      ]);
    } else {
      await (await authEventStmt(ctx, "LOGIN_FAILED", null, email, "unknown account")).run();
    }
    throw fail;
  }
  if (["SUSPENDED", "ARCHIVED", "REJECTED", "INACTIVE"].includes(user.status)) {
    await (await authEventStmt(ctx, "LOGIN_BLOCKED", user.id, email, user.status)).run();
    const messages: Record<string, string> = {
      SUSPENDED: "Your account is currently suspended. Contact the club administrators if you think this is a mistake.",
      REJECTED: "Your registration requires attention. Contact the club administrators.",
      ARCHIVED: "This account has been closed.",
      INACTIVE: "This account is inactive. Contact the club administrators to reactivate it.",
    };
    throw new AppError(403, "ACCOUNT_BLOCKED", messages[user.status] ?? "This account is not active.");
  }
  if (user.status === "EMAIL_VERIFICATION_PENDING" || user.status === "REGISTERED") {
    throw new AppError(403, "EMAIL_UNVERIFIED", "Verify your email first. We can send a new verification link.");
  }

  const token = randomToken(32);
  const now = nowIso();
  const mfa = await ctx.db.first("SELECT 1 FROM user_mfa WHERE user_id = ?1 AND confirmed_at IS NOT NULL", user.id);
  const rehash = needsRehash ? [ctx.db.stmt("UPDATE users SET password_hash = ?2 WHERE id = ?1", user.id, await hashPassword(String(input.password), ctx.env.PASSWORD_PEPPER))] : [];
  if (mfa) {
    // Password accepted; the session only counts once the two-factor code is checked.
    const expiresAt = new Date(Date.now() + MFA_PENDING_MINUTES * 60_000).toISOString();
    await ctx.db.batch([
      ctx.db.stmt("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip_hash, user_agent, mfa_pending) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6, 1)",
        await sha256Hex(token), user.id, now, expiresAt, ctx.meta.ipHash, ctx.meta.userAgent?.slice(0, 300) ?? null),
      ctx.db.stmt("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?1", user.id),
      ...rehash,
      await authEventStmt(ctx, "LOGIN_PASSWORD_OK", user.id, email, "two-factor code required"),
    ]);
    return { token, expiresAt, userId: user.id, status: user.status, mfaRequired: true };
  }
  const days = await getSetting(ctx, "auth.session_days", 30);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip_hash, user_agent, reauth_at) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6, ?3)",
      await sha256Hex(token), user.id, now, expiresAt, ctx.meta.ipHash, ctx.meta.userAgent?.slice(0, 300) ?? null),
    ctx.db.stmt("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?2 WHERE id = ?1", user.id, now),
    ...rehash,
    ...(await newDeviceNotice(ctx, user.id)),
    await authEventStmt(ctx, "LOGIN_SUCCESS", user.id, email),
    auditStmt(ctx, { action: "auth.login", resourceType: "user", resourceId: user.id, actorUserId: user.id, actorLabel: email }),
  ]);
  return { token, expiresAt, userId: user.id, status: user.status };
}

/** An in-app notice when an account signs in from a device it hasn't used in 90 days. */
export async function newDeviceNotice(ctx: Ctx, userId: string) {
  const ua = ctx.meta.userAgent?.slice(0, 300) ?? null;
  const device = describeAgent(ua);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const seen = await ctx.db.all<{ user_agent: string | null }>(
    "SELECT user_agent FROM sessions WHERE user_id = ?1 AND created_at >= ?2 AND mfa_pending = 0 ORDER BY created_at DESC LIMIT 50", userId, since);
  // The first sign-in ever isn't news; a device type not seen recently is.
  if (seen.length === 0 || seen.some((r) => describeAgent(r.user_agent) === device)) return [];
  const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
  return notifyStmts(ctx, [userId], { type: "security.new_sign_in", title: `New sign-in on ${device}`, body: `${when} (Dhaka time). If this wasn't you, change your password and sign out other devices.`, link: "/dashboard/security" });
}

/** Resolve a session cookie to a user id. */
export async function resolveSession(ctx: Ctx, token: string | undefined | null): Promise<string | null> {
  return (await resolveSessionInfo(ctx, token))?.userId ?? null;
}

/**
 * Resolve a session cookie. Sessions end when revoked, at their absolute expiry, after the idle
 * period (security.session_idle_days), or while still waiting for a two-factor code. Activity is
 * recorded at most every 10 minutes.
 */
export async function resolveSessionInfo(ctx: Ctx, token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = await sha256Hex(token);
  const row = await ctx.db.first<{
    user_id: string; created_at: string; expires_at: string; last_seen_at: string | null; revoked_at: string | null; reauth_at: string | null; mfa_pending: number; status: string;
    idle_days: string | null; idle_hours_sensitive: string | null; max_days: string | null;
  }>(
    `SELECT s.user_id, s.created_at, s.expires_at, s.last_seen_at, s.revoked_at, s.reauth_at, s.mfa_pending, u.status,
            (SELECT value_json FROM system_settings WHERE key = 'security.session_idle_days') AS idle_days,
            (SELECT value_json FROM system_settings WHERE key = 'security.session_idle_hours_sensitive') AS idle_hours_sensitive,
            (SELECT value_json FROM system_settings WHERE key = 'security.session_max_days') AS max_days
     FROM sessions s JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL WHERE s.id = ?1`,
    id,
  );
  const now = nowIso();
  if (!row || row.revoked_at || row.expires_at < now || row.mfa_pending) return null;
  if (["SUSPENDED", "ARCHIVED", "REJECTED", "INACTIVE"].includes(row.status)) return null;
  const num = (v: string | null, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const idleMs = num(row.idle_days, 14) * 86_400_000;
  const maxMs = num(row.max_days, 30) * 86_400_000;
  const lastSeen = row.last_seen_at ?? row.created_at;
  if (Date.now() - new Date(lastSeen).getTime() > idleMs || Date.now() - new Date(row.created_at).getTime() > maxMs) {
    await ctx.db.run("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL", id, now);
    return null;
  }
  if (Date.now() - new Date(lastSeen).getTime() > 10 * 60_000) await ctx.db.run("UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1", id, now);
  return { id, userId: row.user_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, reauthAt: row.reauth_at, idleHoursSensitive: num(row.idle_hours_sensitive, 12) };
}

export async function logout(ctx: Ctx, token: string | undefined | null): Promise<void> {
  if (!token) return;
  const id = await sha256Hex(token);
  const row = await ctx.db.first<{ user_id: string }>("SELECT user_id FROM sessions WHERE id = ?1", id);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL", id, nowIso()),
    ...(row ? [await authEventStmt(ctx, "LOGOUT", row.user_id, null)] : []),
  ]);
}

// ───────────────────────────── password reset ─────────────────────────────

export async function requestPasswordReset(ctx: Ctx, input: { email: string; turnstileToken?: string }): Promise<{ message: string }> {
  await limit(ctx, "auth.passwordReset", ctx.meta.ipHash ?? "unknown");
  await verifyTurnstile(ctx, input.turnstileToken);
  if (!(await emailEnabled(ctx))) {
    return { message: "Password reset by email isn't available yet. Ask a GUCC administrator (the President, General Secretary or a Moderator) for a reset link." };
  }
  const email = String(input.email ?? "").trim().toLowerCase();
  const user = await ctx.db.first<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?1 AND deleted_at IS NULL", email);
  if (user && !["ARCHIVED", "REJECTED"].includes(user.status)) {
    const token = await issueToken(ctx, user.id, "PASSWORD_RESET", RESET_MINUTES);
    await (await authEventStmt(ctx, "PASSWORD_RESET_REQUESTED", user.id, email)).run();
    await deliverEmail(ctx, {
      to: email,
      subject: "Reset your GUCC password",
      text: `Use this link to choose a new password:\n${baseUrl(ctx)}/auth/update-password?token=${token}\n\nIt expires in ${RESET_MINUTES} minutes. If you did not ask for this, you can ignore this email.`,
    }, { type: "account.reset", userId: user.id });
  }
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPassword(ctx: Ctx, input: { token: string; password: string }): Promise<void> {
  const password = String(input.password ?? "");
  const userId = await consumeToken(ctx, String(input.token ?? ""), "PASSWORD_RESET");
  const user = await ctx.db.first<{ email: string; status: string; email_verified_at: string | null }>("SELECT email, status, email_verified_at FROM users WHERE id = ?1", userId);
  if (!user) throw new AppError(400, "TOKEN_INVALID", "Account not found.");
  const problem = passwordProblem(password, user.email);
  if (problem) throw new ValidationError(problem, { password: problem });
  const now = nowIso();
  await ctx.db.batch([
    // Receiving the reset email proves ownership of the address.
    ctx.db.stmt(
      `UPDATE users SET password_hash = ?2, password_changed_at = ?3, failed_login_count = 0, locked_until = NULL, updated_at = ?3,
              email_verified_at = COALESCE(email_verified_at, ?3),
              status = CASE WHEN status IN ('EMAIL_VERIFICATION_PENDING','REGISTERED') THEN 'PENDING_APPROVAL' ELSE status END
       WHERE id = ?1`,
      userId, await hashPassword(password, ctx.env.PASSWORD_PEPPER), now,
    ),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL", userId, now),
    await authEventStmt(ctx, "PASSWORD_RESET", userId, user.email),
    auditStmt(ctx, { action: "auth.password_reset", resourceType: "user", resourceId: userId, actorUserId: userId, actorLabel: user.email }),
  ]);
}

/**
 * Accept an executive invitation: choose a password, and the account (created
 * by the inviter and already linked to the person's profile) becomes an
 * ACTIVE member. Opening the emailed link proves the address. Signs them in.
 */
export async function acceptInvite(ctx: Ctx, input: { token: string; password: string }): Promise<SessionIssued> {
  await limit(ctx, "auth.acceptInvite", ctx.meta.ipHash ?? "unknown");
  const hash = await sha256Hex(String(input.token ?? ""));
  const pending = await ctx.db.first<{ user_id: string; email: string }>(
    "SELECT t.user_id, u.email FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?1 AND t.purpose = 'INVITE' AND t.used_at IS NULL AND t.expires_at > ?2",
    hash, nowIso());
  if (!pending) throw new AppError(400, "TOKEN_INVALID", "This invitation is invalid or has expired. Ask the person who invited you to send a new one.");
  const password = String(input.password ?? "");
  const problem = passwordProblem(password, pending.email);
  if (problem) throw new ValidationError(problem, { password: problem });
  const userId = await consumeToken(ctx, String(input.token), "INVITE");
  const now = nowIso();
  const token = randomToken(32);
  const days = await getSetting(ctx, "auth.session_days", 30);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  await ctx.db.batch([
    ctx.db.stmt(
      `UPDATE users SET password_hash = ?2, password_changed_at = ?3, email_verified_at = COALESCE(email_verified_at, ?3), approved_at = COALESCE(approved_at, ?3),
              status = CASE WHEN status IN ('REGISTERED','EMAIL_VERIFICATION_PENDING','PENDING_APPROVAL','APPROVED') THEN 'ACTIVE' ELSE status END, updated_at = ?3
       WHERE id = ?1`,
      userId, await hashPassword(password, ctx.env.PASSWORD_PEPPER), now),
    ctx.db.stmt("INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) VALUES (?1, ?2, 'role:member', ?3, 'Accepted an executive invitation') ON CONFLICT DO NOTHING", newId("ur"), userId, now),
    ctx.db.stmt("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip_hash, user_agent) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)",
      await sha256Hex(token), userId, now, expiresAt, ctx.meta.ipHash, ctx.meta.userAgent?.slice(0, 300) ?? null),
    await authEventStmt(ctx, "INVITE_ACCEPTED", userId, pending.email),
    auditStmt(ctx, { action: "auth.invite_accepted", resourceType: "user", resourceId: userId, actorUserId: userId, actorLabel: pending.email }),
  ]);
  const status = (await ctx.db.value<string>("SELECT status FROM users WHERE id = ?1", userId)) ?? "ACTIVE";
  return { token, expiresAt, userId, status };
}

const ADMIN_RESET_HOURS = 24;

/**
 * A one-time password reset link an administrator (users.reset_password) passes on
 * privately, for members who can't receive email (and in no-email mode, the only way to
 * reset). The link works once, for 24 hours; only its hash is stored. Refused for your own
 * account, for Moderators unless you are one, and for anyone holding club-wide permissions
 * you don't have, so it can never be used to take over a more powerful account.
 */
export async function issueResetLink(ctx: Ctx, userId: string): Promise<{ url: string; expiresAt: string; message: string }> {
  const actor = requireActor(ctx);
  const target = await userResource(ctx.db, userId);
  if (!target) throw new NotFoundError("Account");
  const decision = requirePermission(ctx, "users.reset_password", target);
  assertNotSelf(actor.subject, userId, "password with an administrator link; use Change password in your account");
  await requireRecentAuth(ctx);
  if (target.isProtected) requirePermission(ctx, "governance.protected");
  if (["ARCHIVED", "REJECTED", "SUSPENDED"].includes(String(target.status))) throw new AppError(409, "BAD_STATE", "Reactivate the account before resetting its password.");
  const theirs = (await loadActor(ctx.db, userId))?.subject.grants.filter((g) => g.scope === "ALL").map((g) => g.permission) ?? [];
  try {
    assertCanGrantPermissions(actor.subject, [...new Set(theirs)]);
  } catch (e) {
    if (e instanceof GovernanceViolation) throw new ForbiddenError("This account has access you don't have, so only someone with at least the same access (or a Moderator) can reset its password.");
    throw e;
  }
  const token = await issueToken(ctx, userId, "PASSWORD_RESET", ADMIN_RESET_HOURS * 60);
  const user = await ctx.db.first<{ email: string }>("SELECT email FROM users WHERE id = ?1", userId);
  await ctx.db.batch([
    await authEventStmt(ctx, "PASSWORD_RESET_LINK_ISSUED", userId, user?.email ?? null, `by ${actor.user.id}`),
    auditStmt(ctx, { action: "user.reset_link", resourceType: "user", resourceId: userId, after: { validHours: ADMIN_RESET_HOURS }, decision }),
  ]);
  return {
    url: `${baseUrl(ctx)}/auth/update-password?token=${token}`,
    expiresAt: addMinutes(ADMIN_RESET_HOURS * 60),
    message: `Reset link for ${user?.email ?? "the member"}. Give it to them privately; it works once, for ${ADMIN_RESET_HOURS} hours.`,
  };
}

/** Change your own password. Every other session of the account ends; this one stays signed in. */
export async function changePassword(ctx: Ctx, userId: string, current: string, next: string, keepSessionToken?: string | null): Promise<{ message: string }> {
  const user = await ctx.db.first<{ email: string; password_hash: string | null }>("SELECT email, password_hash FROM users WHERE id = ?1", userId);
  if (!user) throw new AppError(404, "NOT_FOUND", "Account not found.");
  const { ok } = await verifyPassword(current, user.password_hash, ctx.env.PASSWORD_PEPPER, ctx.env.PASSWORD_PEPPER_PREVIOUS);
  if (!ok) throw new ValidationError("Current password is incorrect.", { current: "Current password is incorrect." });
  const problem = passwordProblem(next, user.email);
  if (problem) throw new ValidationError(problem, { password: problem });
  const now = nowIso();
  const keep = keepSessionToken ? await sha256Hex(keepSessionToken) : "";
  await ctx.db.batch([
    ctx.db.stmt("UPDATE users SET password_hash = ?2, password_changed_at = ?3, updated_at = ?3 WHERE id = ?1", userId, await hashPassword(next, ctx.env.PASSWORD_PEPPER), now),
    ctx.db.stmt("UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL AND id <> ?3", userId, now, keep),
    await authEventStmt(ctx, "PASSWORD_CHANGED", userId, user.email),
    auditStmt(ctx, { action: "auth.password_changed", resourceType: "user", resourceId: userId }),
    ...notifyStmts(ctx, [userId], { type: "security.password_changed", title: "Your password was changed", body: "You were signed out everywhere else. If this wasn't you, contact a GUCC administrator right away.", link: "/dashboard/profile" }),
  ]);
  return { message: "Password changed. You were signed out on your other devices." };
}
