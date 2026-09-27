/** Bindings, variables and secrets of the API Worker (see wrangler.jsonc). */
export interface Env {
  DB: D1Database;
  MEDIA_PUBLIC: R2Bucket;
  MEDIA_PRIVATE: R2Bucket;
  APP_ENV: string;
  /** The Vercel frontend's public origin, used in emailed links. */
  PUBLIC_BASE_URL: string;
  /** Origins allowed to upload from the browser (comma-separated). */
  FRONTEND_ORIGIN: string;
  /** Origin that serves /media/* (this Worker, or an R2 custom domain later). */
  MEDIA_BASE_URL?: string;
  // ── secrets (wrangler secret put) ──
  /** Shared with the Next.js server only; authenticates every RPC. */
  API_SHARED_SECRET?: string;
  /** Optional, only while rotating API_SHARED_SECRET: the new key, accepted alongside the current one. */
  API_SHARED_SECRET_NEXT?: string;
  /** Signs upload tokens and private media links; salts IP hashes. */
  AUTH_SECRET?: string;
  PASSWORD_PEPPER?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  CONTACT_EMAIL?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** Optional, only while rotating: the previous AUTH_SECRET / PASSWORD_PEPPER, still accepted. */
  AUTH_SECRET_PREVIOUS?: string;
  PASSWORD_PEPPER_PREVIOUS?: string;
  /** Optional read-only token (Account Analytics: Read) for real usage in System health. */
  CF_ANALYTICS_TOKEN?: string;
  // ── ids for the usage monitor (not secrets) ──
  CF_ACCOUNT_ID?: string;
  CF_D1_DATABASE_ID?: string;
  CF_WORKER_NAME?: string;
  /** R2 bucket names, comma-separated. */
  CF_R2_BUCKETS?: string;
}
