import "server-only";
/**
 * Request-scoped helpers for pages, server actions and route handlers:
 * the session cookie, who is signed in (from the API), admin gating, and
 * running mutations so cached public pages refresh afterwards.
 *
 * The cookie holds an opaque 256-bit token; only its hash is stored in D1 and
 * the Worker re-validates it on every call. Nothing here grants access —
 * showing or hiding UI is a convenience; the Worker authorizes every action.
 */
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { SessionView } from "@/lib/server/views/admin";
import { callApi, type RpcResult } from "./client";
import { normalizeSession } from "./contracts";
import { SECURE_SITE, SESSION_COOKIE, SIGNED_IN_HINT } from "./cookies";

export { SESSION_COOKIE };
export type Session = SessionView;
export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string; code: string; fields?: Record<string, string>; trace?: string[] };

async function requestContext() {
  const h = await headers();
  const c = await cookies();
  return {
    sessionToken: c.get(SESSION_COOKIE)?.value ?? null,
    // Vercel sets x-forwarded-for / x-real-ip from the TCP connection; the first hop is the client.
    ip: h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-vercel-id") ?? null,
  };
}

/** Call a procedure as the current visitor. Does not revalidate (safe during render). */
export async function rpc<T>(name: string, input: unknown = {}): Promise<RpcResult<T>> {
  return callApi<T>(name, input, await requestContext());
}

/** The signed-in user and their capabilities, once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const c = await cookies();
  if (!c.get(SESSION_COOKIE)?.value) return null;
  const r = await rpc<unknown>("session.me");
  return r.ok ? normalizeSession(r.data) : null;
});

export async function requireSignedIn(nextPath = "/dashboard"): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  return s;
}

/**
 * Club-management pages of the dashboard: signed in, ACTIVE, and able to use at least one
 * management area. Members who open one land on the "not allowed" page; every page and
 * action is still authorized by the API, so this is navigation, never the control.
 */
export async function requireAdmin(nextPath = "/dashboard"): Promise<Session> {
  const s = await requireSignedIn(nextPath);
  if (!s.adminAccess) redirect("/dashboard/denied");
  return s;
}

/** The API doesn't have this procedure: it's older than the website. */
function apiTooOld(r: { ok: false; code?: string; error?: string }): boolean {
  return r.code === "UNKNOWN_PROCEDURE" || (r.code === "NOT_FOUND" && r.error === "Not found.");
}

/**
 * Load an admin view. Sign-in problems go to the login page, missing records
 * to the 404 page, and denials to a friendly "no access" page — never a crash.
 */
export async function view<T>(name: string, input: unknown = {}, from = "/dashboard"): Promise<T> {
  const r = await rpc<T>(name, input);
  if (r.ok) return r.data;
  if (r.code === "AUTH_REQUIRED") redirect(`/auth/login?next=${encodeURIComponent(from)}`);
  // An API older than this website doesn't know the procedure yet (older Workers answer a
  // plain "Not found."): say so instead of showing a 404 or crashing.
  if (apiTooOld(r)) redirect(`/dashboard/unavailable?from=${encodeURIComponent(from)}`);
  if (r.code === "NOT_FOUND") notFound();
  if (r.code === "FORBIDDEN" || r.code === "GOVERNANCE") redirect(`/dashboard/denied?from=${encodeURIComponent(from)}`);
  throw new Error(`${r.error} (${r.code})`);
}

/**
 * Run a mutation from a server action: call the procedure, refresh every
 * cache tag it touched plus the admin pages, and return a user-safe result.
 */
export async function runAction<T>(name: string, input: unknown, opts: { message?: string } = {}): Promise<ActionResult<T>> {
  const r = await rpc<T>(name, input);
  if (!r.ok) {
    if (r.code === "AUTH_REQUIRED") redirect("/auth/login");
    if (apiTooOld(r)) return { ok: false, error: "This needs the latest version of the club's API. It will work after the next API release.", code: "API_OUTDATED" };
    return { ok: false, error: r.error, code: r.code, fields: r.fields, trace: r.trace };
  }
  // Public pages cached under these tags refresh on their next request. Admin
  // pages are dynamic: the form refreshes the current route after success
  // (router.refresh), so the action response itself stays small.
  const tags = r.revalidate ?? [];
  if (tags.length) await refreshPublicPages(tags);
  return { ok: true, data: r.data, message: opts.message };
}

/**
 * Refresh cached public pages for these tags through our own /api/revalidate
 * route, after the action's response is sent, so the action returns at once
 * and the public cache refresh doesn't depend on the visitor's browser.
 */
async function refreshPublicPages(tags: string[]) {
  const secret = process.env.API_SHARED_SECRET;
  if (!secret) return;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  after(() =>
    fetch(`${proto}://${host}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": secret },
      body: JSON.stringify({ tags }),
      cache: "no-store",
    }).then(
      (res) => void (res.ok || console.error(`[revalidate] ${res.status} for ${tags.join(",")}`)),
      (e) => console.error("[revalidate] failed", e),
    ),
  );
}

export async function setSessionCookie(token: string, expiresAt: string) {
  const c = await cookies();
  const secure = SECURE_SITE || process.env.NODE_ENV === "production";
  c.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
  c.set(SIGNED_IN_HINT, "1", { httpOnly: false, secure, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
}

export async function clearSessionCookie() {
  const c = await cookies();
  const secure = SECURE_SITE || process.env.NODE_ENV === "production";
  // Expired copies with the same attributes: browsers ignore a "__Host-" cookie deletion that
  // isn't Secure with Path=/, which would leave a shared computer signed in.
  c.set(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  c.set(SIGNED_IN_HINT, "", { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

/** A sign-in that passed the password and waits for its two-factor code (ten minutes). */
export const MFA_COOKIE = "gucc_mfa_pending";

export async function setMfaPendingCookie(token: string, expiresAt: string) {
  (await cookies()).set(MFA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
    expires: new Date(expiresAt),
  });
}

export async function takeMfaPendingToken(): Promise<string | null> {
  return (await cookies()).get(MFA_COOKIE)?.value ?? null;
}

export async function clearMfaPendingCookie() {
  (await cookies()).set(MFA_COOKIE, "", { path: "/auth", maxAge: 0 });
}

/** Token for the current request (for logout). */
export async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
