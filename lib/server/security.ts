/**
 * Rate limiting, Turnstile verification, same-origin checks and settings.
 */
import type { Ctx } from "./context";
import { AppError, RateLimitError, ValidationError } from "./errors";
import { sendEmail, type EmailMessage } from "./email";

/**
 * Keys that went over their limit, per database binding, until their window ends. The D1 count
 * only grows within a window, so a key over its limit stays over it: repeats from a flood are
 * refused from memory without spending a D1 statement. (Each Worker isolate has its own copy;
 * the D1 counter stays the source of truth.)
 */
const blocked = new WeakMap<object, Map<string, number>>();
const MAX_BLOCKED = 5000;

/**
 * Fixed-window counter in D1. One UPSERT per check; the window resets itself.
 * Throws RateLimitError once `limit` hits within `windowSeconds`.
 */
export async function rateLimit(ctx: Ctx, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Local development resets limits by clearing the table (the end-to-end suite does), which this
  // memory wouldn't see: there the database alone decides.
  const known = ctx.env.APP_ENV === "development" ? undefined : blocked.get(ctx.db.raw);
  const until = known?.get(key);
  if (until !== undefined) {
    if (until > now) throw new RateLimitError(until - now);
    known?.delete(key);
  }
  const windowStart = now - (now % windowSeconds);
  const row = await ctx.db.first<{ count: number; window_start: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start
     RETURNING count, window_start`,
    key,
    windowStart,
  );
  if (row && row.count > limit) {
    const end = windowStart + windowSeconds;
    if (ctx.env.APP_ENV === "development") throw new RateLimitError(end - now);
    let map = known;
    if (!map) blocked.set(ctx.db.raw, (map = new Map()));
    if (map.size >= MAX_BLOCKED) map.clear();
    map.set(key, end);
    throw new RateLimitError(end - now);
  }
}

/**
 * Cloudflare Turnstile. Required whenever a secret is configured; skipped in
 * development without one so local work needs no Cloudflare account.
 */
export async function verifyTurnstile(ctx: Ctx, token: string | null | undefined): Promise<void> {
  const secret = ctx.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Not configured yet: rate limits and account lockout still apply. Warn loudly
    // in deployed environments instead of locking everyone out of sign-in.
    if (ctx.env.APP_ENV === "production" || ctx.env.APP_ENV === "staging") console.warn(`[${ctx.meta.requestId}] TURNSTILE_SECRET_KEY is not set; bot protection is off.`);
    return;
  }
  if (!token) throw new ValidationError("Please complete the verification challenge.");
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  let data: { success?: boolean } | null = null;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    data = res.status >= 500 ? null : ((await res.json().catch(() => null)) as { success?: boolean } | null);
  } catch {
    data = null;
  }
  if (data === null) {
    // Turnstile itself can't be reached. Refusing everyone would lock the club out of sign-in, so
    // the request goes ahead under a much stricter per-address limit; an answer that says the token
    // is invalid is still refused.
    console.warn(`[${ctx.meta.requestId}] Turnstile unreachable; allowing under the fallback limit.`);
    await rateLimit(ctx, `turnstile.fallback:${ctx.meta.ipHash ?? "unknown"}`, 5, 3600);
    return;
  }
  if (!data.success) throw new ValidationError("Verification failed. Please try again.");
}

/**
 * CSRF defence for route handlers: a state-changing request must come from
 * our own origin. (Server Actions get the same check from Next.js itself.)
 */
export function assertSameOrigin(request: Request, allowedOrigin?: string): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) throw new AppError(403, "CSRF", "Missing origin.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(403, "CSRF", "Bad origin.");
  }
  const allowed = new Set([host, allowedOrigin ? new URL(allowedOrigin).host : null].filter(Boolean));
  if (!allowed.has(originHost)) throw new AppError(403, "CSRF", "Cross-site request rejected.");
}

/** Several system settings in one query, each with its fallback. */
export async function getSettings<T extends Record<string, unknown>>(ctx: Ctx, defaults: T): Promise<T> {
  const rows = await ctx.db.all<{ key: string; value_json: string }>(
    "SELECT key, value_json FROM system_settings WHERE key IN (SELECT value FROM json_each(?1))", JSON.stringify(Object.keys(defaults)));
  const out: Record<string, unknown> = { ...defaults };
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value_json);
    } catch {
      /* keep the fallback */
    }
  }
  return out as T;
}

export async function getSetting<T>(ctx: Ctx, key: string, fallback: T): Promise<T> {
  const row = await ctx.db.first<{ value_json: string }>("SELECT value_json FROM system_settings WHERE key = ?1", key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function getOrgSetting<T>(ctx: Ctx, key: string, fallback: T): Promise<T> {
  const row = await ctx.db.first<{ value_json: string }>("SELECT value_json FROM organization_settings WHERE key = ?1", key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

/** Send an email through the configured provider (see ./email.ts). False when it wasn't sent. */
export async function deliverEmail(ctx: Ctx, msg: EmailMessage, info: { type: string; userId?: string | null }): Promise<boolean> {
  return (await sendEmail(ctx, msg, info)).ok;
}

/**
 * Sensitive actions call this: the password (or a code) must have been entered recently in this
 * session. Contexts without a session (tests, scheduled jobs) aren't browser sessions and pass.
 */
export async function requireRecentAuth(ctx: Ctx): Promise<void> {
  if (!ctx.session) return;
  const minutes = await getSetting(ctx, "security.reauth_minutes", 10);
  const at = ctx.session.reauthAt;
  if (at && Date.now() - new Date(at).getTime() <= minutes * 60_000) return;
  throw new AppError(401, "REAUTH_REQUIRED", "Confirm it's you: enter your password to continue.");
}
