/**
 * Per-request service context. The IP and user agent come from the trusted
 * headers the Next.js server forwards (only honoured with a valid API key);
 * direct browser requests (uploads) use Cloudflare's own client IP.
 */
import { loadActor } from "../../../lib/server/authz";
import type { Ctx } from "../../../lib/server/context";
import { hashIp } from "../../../lib/server/crypto";
import { Db } from "../../../lib/server/db";
import { resolveSessionInfo } from "../../../lib/server/services/auth";
import type { Env } from "./env";

export interface BuiltCtx {
  ctx: Ctx;
  tags: Set<string>;
}

export async function buildCtx(env: Env, req: Request, opts: { trusted: boolean; sessionToken?: string | null; userId?: string | null }): Promise<BuiltCtx> {
  const h = req.headers;
  const tags = new Set<string>();
  const ip = opts.trusted ? h.get("x-client-ip") || h.get("cf-connecting-ip") : h.get("cf-connecting-ip");
  const ua = opts.trusted ? h.get("x-user-agent") || h.get("user-agent") : h.get("user-agent");
  const requestId = (opts.trusted && h.get("x-request-id")?.slice(0, 64)) || h.get("cf-ray") || crypto.randomUUID();
  const db = new Db(env.DB);
  const ctx: Ctx = {
    db,
    env: {
      APP_ENV: env.APP_ENV,
      PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
      MEDIA_BASE_URL: env.MEDIA_BASE_URL,
      AUTH_SECRET: env.AUTH_SECRET,
      PASSWORD_PEPPER: env.PASSWORD_PEPPER,
      TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
      SMTP2GO_API_KEY: env.SMTP2GO_API_KEY,
      EMAIL_FROM: env.EMAIL_FROM,
      CONTACT_EMAIL: env.CONTACT_EMAIL,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY,
      GEMINI_MODEL: env.GEMINI_MODEL,
      AUTH_SECRET_PREVIOUS: env.AUTH_SECRET_PREVIOUS,
      PASSWORD_PEPPER_PREVIOUS: env.PASSWORD_PEPPER_PREVIOUS,
      CF_ANALYTICS_TOKEN: env.CF_ANALYTICS_TOKEN,
      CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      CF_D1_DATABASE_ID: env.CF_D1_DATABASE_ID,
      CF_WORKER_NAME: env.CF_WORKER_NAME,
      CF_R2_BUCKETS: env.CF_R2_BUCKETS,
    },
    meta: { requestId, ipHash: await hashIp(ip, env.AUTH_SECRET), userAgent: ua?.slice(0, 300) ?? null, origin: h.get("origin") },
    actor: null,
    media: { public: env.MEDIA_PUBLIC as never, private: env.MEDIA_PRIVATE as never },
    revalidate: (t) => t.forEach((x) => tags.add(x)),
    outbox: [],
  };
  const session = !opts.userId && opts.sessionToken ? await resolveSessionInfo(ctx, opts.sessionToken) : null;
  if (session) ctx.session = session;
  const userId = opts.userId ?? session?.userId ?? null;
  if (userId) ctx.actor = await loadActor(db, userId);
  // Accounts with sensitive permissions are signed out sooner when idle.
  if (session && ctx.actor?.security?.holdsSensitive) {
    const idle = Date.now() - new Date(session.lastSeenAt ?? session.createdAt).getTime();
    if (idle > session.idleHoursSensitive * 3600_000) {
      await db.run("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL", session.id, new Date().toISOString());
      ctx.actor = null;
      delete ctx.session;
    }
  }
  return { ctx, tags };
}
