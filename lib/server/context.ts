/**
 * The context every service function receives. Built per request by the
 * Next.js glue (lib/server/request-context.ts) or directly by tests.
 */
import type { Rule, Subject } from "../governance/types";
import type { Db } from "./db";
import type { HubClient, LiveItem } from "./live";

export interface RequestMeta {
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
  origin: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  status: Subject["status"];
  email_verified_at: string | null;
  password_hash: string | null;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface Actor {
  user: Pick<UserRow, "id" | "email" | "status">;
  profile: { id: string; full_name: string } | null;
  subject: Subject;
  rules: Rule[];
  /** Two-factor state. `mfaBlocked`: sensitive permissions are withheld until two-factor is on. */
  security?: { mfaEnabled: boolean; holdsSensitive: boolean; mfaRequired: boolean; mfaDeadline: string | null; mfaBlocked: boolean };
}

/** The signed-in session behind this request (absent for tests, cron and upload tokens). */
export interface SessionInfo {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string | null;
  reauthAt: string | null;
  /** Settings for idle sign-out of accounts with sensitive permissions. */
  idleHoursSensitive: number;
}

/** Minimal R2 surface we use, so tests can pass an in-memory bucket. */
export interface BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream | string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; size: number; httpEtag?: string } | null>;
  delete(key: string | string[]): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
}

export interface ServiceEnv {
  APP_ENV?: string;
  /** Public site origin (the Vercel frontend), used in email links. */
  PUBLIC_BASE_URL?: string;
  /** Origin that serves /media/* (the API Worker, or an R2 custom domain). */
  MEDIA_BASE_URL?: string;
  AUTH_SECRET?: string;
  /** Secret mixed into every password hash; never stored in the database. */
  PASSWORD_PEPPER?: string;
  TURNSTILE_SECRET_KEY?: string;
  SMTP2GO_API_KEY?: string;
  /** The verified SMTP2GO sender, e.g. "GUCC <gucc@green.edu.bd>". */
  EMAIL_FROM?: string;
  CONTACT_EMAIL?: string;
  /** Google Gemini key for the site assistant (optional). */
  GOOGLE_API_KEY?: string;
  GEMINI_MODEL?: string;
  AUTH_SECRET_PREVIOUS?: string;
  PASSWORD_PEPPER_PREVIOUS?: string;
  CF_ANALYTICS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_D1_DATABASE_ID?: string;
  CF_WORKER_NAME?: string;
  CF_R2_BUCKETS?: string;
}

/** Public and private objects live in separate buckets, so a public bucket domain can never expose private files. */
export interface MediaBuckets {
  public: BucketLike;
  private: BucketLike;
}

export interface Ctx {
  db: Db;
  env: ServiceEnv;
  meta: RequestMeta;
  actor: Actor | null;
  session?: SessionInfo;
  media?: MediaBuckets;
  /** Outgoing email hook; defaults to SMTP2GO or the console. Tests capture it. */
  sendEmail?: (msg: { to: string; subject: string; text: string; html?: string; replyTo?: string }) => Promise<void>;
  /** Called after writes so cached public pages refresh. */
  revalidate?: (tags: string[]) => void;
  /**
   * Ids of the notifications this request creates. After it succeeds, the ones that were really
   * written are emailed (lib/server/email-outbox.ts). Absent where nothing flushes it.
   */
  outbox?: string[];
  /** Live events this request produces (lib/server/live.ts); pushed to open tabs after it succeeds. */
  live?: LiveItem[];
  /** The live hub, where the Worker has one. */
  hub?: HubClient;
  /**
   * Outgoing requests this invocation may still make (Workers Free allows 50). The hourly job sets
   * it so its emails (each one a request to SMTP2GO) can't push the run over; absent means no
   * shared limit (one request's own emails stay far below it).
   */
  fetchBudget?: { left: number };
  /** Announcement emails were queued or resumed: start sending them after the response. */
  campaignTick?: boolean;
}

/** Take up to `wanted` outgoing requests from the invocation's budget; how many may be made. */
export function takeFetches(ctx: Pick<Ctx, "fetchBudget">, wanted: number): number {
  if (!ctx.fetchBudget) return wanted;
  const n = Math.max(0, Math.min(wanted, ctx.fetchBudget.left));
  ctx.fetchBudget.left -= n;
  return n;
}

/** Give back requests that weren't made after all. */
export function returnFetches(ctx: Pick<Ctx, "fetchBudget">, n: number): void {
  if (ctx.fetchBudget && n > 0) ctx.fetchBudget.left += n;
}

/**
 * The website's address (PUBLIC_BASE_URL without a trailing slash) followed by `path`, for links in
 * emails and notices. Locally, without the setting, links point at the dev server.
 */
export const siteUrl = (ctx: Pick<Ctx, "env">, path = "") => `${(ctx.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "")}${path}`;
