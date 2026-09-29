"use server";

import { redirect } from "next/navigation";
import {
  clearMfaPendingCookie, clearSessionCookie, currentSessionToken, rpc, runAction, setMfaPendingCookie, setSessionCookie, takeMfaPendingToken, type ActionResult,
} from "@/lib/api/session";
import { safeLocalPath } from "@/lib/safe-path";

/** Only same-site relative paths may be used as a post-login destination. */
function safeNext(next: unknown): string {
  return safeLocalPath(next, "/dashboard/profile");
}

type Issued = { token: string; expiresAt: string; status: string; mfaRequired?: boolean };

export async function loginAction(input: { email: string; password: string; next?: string; turnstileToken?: string }): Promise<ActionResult> {
  const r = await rpc<Issued>("auth.login", { email: input.email, password: input.password, turnstileToken: input.turnstileToken });
  if (!r.ok) return { ok: false, error: r.error, code: r.code, fields: r.fields };
  if (r.data.mfaRequired) {
    // Not signed in yet: the code page finishes the sign-in with this pending token.
    await setMfaPendingCookie(r.data.token, r.data.expiresAt);
    redirect(`/auth/two-factor?next=${encodeURIComponent(safeNext(input.next))}`);
  }
  await setSessionCookie(r.data.token, r.data.expiresAt);
  redirect(r.data.status === "ACTIVE" ? safeNext(input.next) : "/dashboard/profile");
}

export async function verifyTwoFactorAction(input: { code: string; next?: string }): Promise<ActionResult> {
  const token = await takeMfaPendingToken();
  if (!token) return { ok: false, error: "That sign-in has expired. Enter your email and password again.", code: "AUTH_REQUIRED" };
  const r = await rpc<Issued>("auth.mfaVerify", { token, code: input.code });
  if (!r.ok) {
    if (r.code === "AUTH_REQUIRED" || r.code === "RATE_LIMITED") await clearMfaPendingCookie();
    return { ok: false, error: r.error, code: r.code, fields: r.fields };
  }
  await clearMfaPendingCookie();
  await setSessionCookie(r.data.token, r.data.expiresAt);
  redirect(r.data.status === "ACTIVE" ? safeNext(input.next) : "/dashboard/profile");
}

export async function registerAction(input: { email: string; password: string; fullName: string; studentId?: string; department?: string; batch?: string; phone?: string; turnstileToken?: string }) {
  return runAction<{ message: string; emailSent?: boolean }>("auth.register", input);
}

export async function resendVerificationAction(email: string) {
  return runAction<{ message: string }>("auth.resendVerification", { email });
}

export async function forgotPasswordAction(input: { email: string; turnstileToken?: string }) {
  return runAction<{ message: string }>("auth.requestPasswordReset", input);
}

export async function resetPasswordAction(input: { token: string; password: string }) {
  const r = await runAction("auth.resetPassword", input);
  return r.ok ? { ok: true as const, data: { message: "Password updated. Sign in with your new password." } } : r;
}

export async function acceptInviteAction(input: { token: string; password: string }): Promise<ActionResult> {
  const r = await rpc<Issued>("auth.acceptInvite", input);
  if (!r.ok) return { ok: false, error: r.error, code: r.code, fields: r.fields };
  await setSessionCookie(r.data.token, r.data.expiresAt);
  redirect("/dashboard/profile?welcome=1");
}

export async function changePasswordAction(input: { current: string; password: string }) {
  const r = await runAction("auth.changePassword", input);
  return r.ok ? { ok: true as const, data: { message: "Password changed." } } : r;
}

export async function logoutAction() {
  if (await currentSessionToken()) await rpc("auth.logout");
  await clearSessionCookie();
  redirect("/");
}
