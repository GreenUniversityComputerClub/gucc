/**
 * The Worker's first line of defence and repeat protection, through its fetch handler:
 * in-memory per-IP limits (no D1 or R2 work), method and URL checks, the "blocked until"
 * memory in front of the D1 limiter, and idempotent mutations (replay, in progress, retry).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, sha256Hex } from "@/lib/server/crypto";
import { rateLimit } from "@/lib/server/security";
import { createWorld, memoryBucket, type TestWorld } from "../support/d1";

const WORKER_ENTRY = "../../workers/api/src/index";
const GUARD = "../../workers/api/src/guard";
type Env = Record<string, unknown>;
let worker: { fetch(req: Request, env: Env): Promise<Response> };
let resetGuard: () => void;

const KEY = "test-shared-secret-0123456789abcdef";
const PEPPER = "test-pepper-0123456789";

let w: TestWorld;
let env: Env;
beforeEach(async () => {
  worker ??= (await import(/* @vite-ignore */ WORKER_ENTRY)).default;
  resetGuard ??= (await import(/* @vite-ignore */ GUARD)).resetGuard;
  resetGuard();
  w = await createWorld();
  env = {
    DB: w.db.raw as never, MEDIA_PUBLIC: memoryBucket() as never, MEDIA_PRIVATE: memoryBucket() as never, APP_ENV: "test",
    PUBLIC_BASE_URL: "http://site.test", FRONTEND_ORIGIN: "http://site.test", API_SHARED_SECRET: KEY, AUTH_SECRET: "test-auth-secret-0123456789abcdef", PASSWORD_PEPPER: PEPPER,
  };
});

const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://api.test${path}`, init), env);
async function rpc<T = unknown>(name: string, input: unknown = {}, token?: string, headers: Record<string, string> = {}) {
  const res = await call(`/v1/rpc/${name}`, { method: "POST", headers: { "X-Api-Key": KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify({ input }) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: T; code?: string; error?: string; replayed?: boolean } };
}
async function signIn(positions: string[]) {
  const id = await w.user({ email: `u${Math.random().toString(36).slice(2, 8)}@green.edu.bd`, roles: ["member"], positions });
  const email = (w.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(id) as { email: string }).email;
  w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), id);
  const r = await rpc<{ token: string }>("auth.login", { email, password: "correct-Horse-battery" });
  return { id, token: r.body.data.token };
}
const count = (sql: string) => (w.sqlite.prepare(sql).get() as { n: number }).n;

describe("edge guard", () => {
  it("answers floods from one address with 429 before touching the database", async () => {
    for (let i = 0; i < 30; i++) expect((await call("/health", { headers: { "cf-connecting-ip": "203.0.113.9" } })).status).toBe(200);
    const res = await call("/health", { headers: { "cf-connecting-ip": "203.0.113.9" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    // Another address is unaffected.
    expect((await call("/health", { headers: { "cf-connecting-ip": "203.0.113.10" } })).status).toBe(200);
  });

  it("limits media requests per address and refuses anything but GET and HEAD", async () => {
    expect((await call("/media/x.webp", { method: "POST" })).status).toBe(405);
    expect((await call("/media/x.webp", { method: "DELETE" })).status).toBe(405);
    expect((await call(`/media/${"a".repeat(600)}`)).status).toBe(404);
    for (let i = 0; i < 300; i++) await call("/media/missing.webp", { headers: { "cf-connecting-ip": "198.51.100.1" } });
    expect((await call("/media/missing.webp", { headers: { "cf-connecting-ip": "198.51.100.1" } })).status).toBe(429);
  });

  it("says which procedures don't exist, so an older website can tell the API is newer or older", async () => {
    const r = await rpc("nothing.here");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("UNKNOWN_PROCEDURE");
  });

  it("remembers keys over their limit, so repeats cost no D1 statement", async () => {
    const ctx = await w.ctx();
    await rateLimit(ctx, "t:1", 2, 60);
    await rateLimit(ctx, "t:1", 2, 60);
    await expect(rateLimit(ctx, "t:1", 2, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const before = ctx.db.queries;
    await expect(rateLimit(ctx, "t:1", 2, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(ctx.db.queries).toBe(before);
    // Other keys, and other databases, are unaffected.
    await rateLimit(ctx, "t:2", 2, 60);
    const other = await createWorld();
    await rateLimit(await other.ctx(), "t:1", 2, 60);
  });
});

describe("idempotent mutations", () => {
  it("a repeat within seconds gets the first answer instead of running again", async () => {
    const { token } = await signIn(["president"]);
    const input = { title: "Book the hall", assigneeEmail: "guest@example.com" };
    const first = await rpc<{ id: string }>("tasks.create", input, token);
    expect(first.body.ok).toBe(true);
    const second = await rpc<{ id: string }>("tasks.create", input, token);
    expect(second.body).toMatchObject({ ok: true, replayed: true, data: { id: first.body.data.id } });
    expect(count("SELECT COUNT(*) n FROM tasks")).toBe(1);
    // A different input is a different action.
    expect((await rpc("tasks.create", { ...input, title: "Print posters" }, token)).body.ok).toBe(true);
    expect(count("SELECT COUNT(*) n FROM tasks")).toBe(2);
  });

  it("tells a repeat that the first request is still running", async () => {
    const { id, token } = await signIn(["president"]);
    const key = await sha256Hex(`${id}|tasks.create|key:abc-123`);
    w.sqlite.prepare("INSERT INTO idempotency_keys (key, procedure, status, created_at) VALUES (?, 'tasks.create', 'pending', ?)").run(key, new Date().toISOString());
    const r = await rpc("tasks.create", { title: "X", assigneeEmail: "g@example.com" }, token, { "Idempotency-Key": "abc-123" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("IN_PROGRESS");
    expect(count("SELECT COUNT(*) n FROM tasks")).toBe(0);
  });

  it("a failed action leaves no key behind, so fixing the input and retrying works", async () => {
    const { token } = await signIn(["president"]);
    const bad = await rpc("tasks.create", { title: "" }, token);
    expect(bad.body.ok).toBe(false);
    expect(count("SELECT COUNT(*) n FROM idempotency_keys")).toBe(0);
    expect((await rpc("tasks.create", { title: "Now valid", assigneeEmail: "g@example.com" }, token)).body.ok).toBe(true);
  });

  it("never stores answers that carry secrets, or reads", async () => {
    const { token } = await signIn(["president"]);
    await rpc("session.me", {}, token);
    await rpc("tasks.list", {}, token);
    expect(count("SELECT COUNT(*) n FROM idempotency_keys")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM idempotency_keys WHERE procedure = 'auth.login'")).toBe(0);
  });
});
