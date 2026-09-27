/**
 * What happens when a dependency fails (docs/platform/FAILURE_MODES.md): the database, file
 * storage, email, bot protection or analytics. Each failure gives a clear, safe answer; nothing
 * leaks internals, and actions that don't depend on the failed service still work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/server/context";
import { hashPassword } from "@/lib/server/crypto";
import { sendEmail } from "@/lib/server/email";
import { verifyTurnstile } from "@/lib/server/security";
import { fetchCloudflareUsage } from "@/lib/server/services/cloudflare-usage";
import { invitePerson } from "@/lib/server/services/people";
import { createWorld, memoryBucket, type TestWorld } from "../support/d1";

const WORKER_ENTRY = "../../workers/api/src/index";
type Env = Record<string, unknown>;
let worker: { fetch(req: Request, env: Env): Promise<Response> };
const KEY = "test-shared-secret-0123456789abcdef";
const PEPPER = "test-pepper-0123456789";

let w: TestWorld;
let env: Env;
beforeEach(async () => {
  worker ??= (await import(/* @vite-ignore */ WORKER_ENTRY)).default;
  w = await createWorld();
  env = {
    DB: w.db.raw as never, MEDIA_PUBLIC: memoryBucket() as never, MEDIA_PRIVATE: memoryBucket() as never, APP_ENV: "test",
    PUBLIC_BASE_URL: "http://site.test", FRONTEND_ORIGIN: "http://site.test", API_SHARED_SECRET: KEY, AUTH_SECRET: "test-auth-secret-0123456789abcdef", PASSWORD_PEPPER: PEPPER,
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://api.test${path}`, { ...init, headers: { "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250)}`, ...(init.headers ?? {}) } }), env);
const brokenDb = { prepare: () => { throw new Error("D1_ERROR: storage is offline (internal detail)"); }, batch: async () => { throw new Error("D1_ERROR: offline"); } };

describe("database unavailable", () => {
  it("health says so with 503; procedures answer a safe error without internals", async () => {
    env.DB = brokenDb as never;
    const health = await call("/health");
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({ ok: false });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await call("/v1/rpc/auth.login", { method: "POST", headers: { "X-Api-Key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ input: { email: "a@x.bd", password: "whatever-123" } }) });
    expect(r.status).toBe(500);
    const body = await r.json() as { ok: boolean; error: string; code: string };
    expect(body).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(body.error).toMatch(/^Something went wrong\. Reference: /);
    expect(JSON.stringify(body)).not.toMatch(/offline|internal detail|D1_ERROR/);
  });
});

describe("file storage unavailable", () => {
  it("media answers 503 (retry later, not cached) instead of an error page", async () => {
    const id = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), id);
    w.sqlite.prepare(`INSERT INTO media (id, storage, object_key, media_type, visibility, status, bucket, variants_json) VALUES ('med_00000000-0000-4000-8000-000000000001', 'R2', 'media/2026/09/med_00000000-0000-4000-8000-000000000001/md.webp', 'IMAGE', 'PUBLIC', 'READY', 'public', ?)`)
      .run(JSON.stringify({ md: { key: "media/2026/09/med_00000000-0000-4000-8000-000000000001/md.webp", size: 10 } }));
    env.MEDIA_PUBLIC = { get: async () => { throw new Error("R2 unavailable"); } } as never;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call("/media/media/2026/09/med_00000000-0000-4000-8000-000000000001/md.webp");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBe("30");
  });
});

describe("email service unavailable", () => {
  it("records the failure and the action still completes, giving the link to share instead", async () => {
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"] });
    const c = await w.ctx(gs);
    const ctx: Ctx = { ...c, sendEmail: undefined, env: { ...c.env, APP_ENV: "production", RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "GUCC <noreply@example.com>" } };
    w.sqlite.prepare("UPDATE system_settings SET value_json = 'true' WHERE key = 'email.enabled'").run();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const direct = await sendEmail(ctx, { to: "a@x.bd", subject: "S", text: "T" }, { type: "test.failure" });
    expect(direct).toEqual({ ok: false, error: "The email service could not be reached." });
    expect(w.sqlite.prepare("SELECT status, error FROM email_log WHERE type = 'test.failure'").get()).toEqual({ status: "failed", error: "The email service could not be reached." });

    w.sqlite.exec("INSERT INTO profiles (id, full_name) VALUES ('prf_new', 'New Executive')");
    const invite = await invitePerson(ctx, "prf_new", "new.exec@x.bd");
    expect(invite.message).toMatch(/no email was sent/);
    expect(invite.link).toMatch(/\/auth\/accept-invite\?token=/);
  });
});

describe("bot protection unavailable", () => {
  it("lets people through under a strict per-address limit, and still refuses an invalid token", async () => {
    const c = await w.ctx(null, { ipHash: "ip-turnstile" });
    const ctx: Ctx = { ...c, env: { ...c.env, TURNSTILE_SECRET_KEY: "ts-secret" } };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    for (let i = 0; i < 5; i++) await verifyTurnstile(ctx, "token");
    await expect(verifyTurnstile(ctx, "token")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(verifyTurnstile({ ...ctx, meta: { ...ctx.meta, ipHash: "ip-other" } }, "bad-token")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifyTurnstile(ctx, null)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("analytics unavailable", () => {
  it("reports Unknown rather than guessing", async () => {
    const c = await w.ctx();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const usage = await fetchCloudflareUsage({ ...c, env: { ...c.env, CF_ANALYTICS_TOKEN: "t", CF_ACCOUNT_ID: "a", CF_D1_DATABASE_ID: "d", CF_WORKER_NAME: "w", CF_R2_BUCKETS: "b" } });
    expect(usage.available).toBe(false);
    expect(usage.workerRequestsToday).toBeNull();
    expect(usage.r2StorageBytes).toBeNull();
    const none = await fetchCloudflareUsage(c);
    expect(none).toMatchObject({ available: false, workerRequestsToday: null });
  });
});

describe("missing configuration", () => {
  it("the API refuses clearly when its secrets aren't set", async () => {
    env.AUTH_SECRET = undefined as never;
    const r = await call("/v1/public/committees", { headers: { "X-Api-Key": KEY } });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: "MISCONFIGURED" });
  });
});
