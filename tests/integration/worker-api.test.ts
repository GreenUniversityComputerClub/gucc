/**
 * The API Worker end to end through its fetch handler: authentication of the
 * frontend (shared key), procedure allowlist, sessions, uploads with signed
 * tokens, public and private media, and CORS.
 */
import { beforeEach, describe, expect, it } from "vitest";
// Loaded dynamically so the root typecheck (DOM types) doesn't pull in Workers-only globals;
// the Worker itself is type-checked by workers/api/tsconfig.json.
const WORKER_ENTRY = "../../workers/api/src/index";
type Env = Record<string, unknown>;
let worker: { fetch(req: Request, env: Env): Promise<Response> };
import { hashPassword } from "@/lib/server/crypto";
import { createWorld, memoryBucket, type TestWorld } from "../support/d1";

const KEY = "test-shared-secret-0123456789abcdef";
const PEPPER = "test-pepper-0123456789";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let w: TestWorld;
let env: Env;
beforeEach(async () => {
  worker ??= (await import(/* @vite-ignore */ WORKER_ENTRY)).default;
  w = await createWorld();
  env = {
    DB: w.db.raw as never,
    MEDIA_PUBLIC: memoryBucket() as never,
    MEDIA_PRIVATE: memoryBucket() as never,
    APP_ENV: "test",
    PUBLIC_BASE_URL: "http://site.test",
    FRONTEND_ORIGIN: "http://site.test",
    API_SHARED_SECRET: KEY,
    AUTH_SECRET: "test-auth-secret-0123456789abcdef",
    PASSWORD_PEPPER: PEPPER,
  };
});

const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://api.test${path}`, init), env);
async function rpc<T = unknown>(name: string, input: unknown = {}, token?: string): Promise<{ status: number; body: { ok: boolean; data: T; error?: string; code?: string; revalidate?: string[] } }> {
  const res = await call(`/v1/rpc/${name}`, { method: "POST", headers: { "X-Api-Key": KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ input }) });
  return { status: res.status, body: await res.json() };
}
async function signIn(roles: string[], positions: string[] = []) {
  const id = await w.user({ email: `u${Math.random().toString(36).slice(2, 8)}@green.edu.bd`, roles: ["member", ...roles], positions });
  const email = (w.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(id) as { email: string }).email;
  w.sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword("correct-Horse-battery", PEPPER), id);
  const r = await rpc<{ token: string }>("auth.login", { email, password: "correct-Horse-battery" });
  expect(r.body.ok).toBe(true);
  return { id, token: r.body.data.token };
}

describe("gatekeeping", () => {
  it("health is public; everything under /v1 needs the shared key", async () => {
    expect((await call("/health")).status).toBe(200);
    expect((await call("/v1/public/committees")).status).toBe(401);
    expect((await call("/v1/public/committees", { headers: { "X-Api-Key": "wrong" } })).status).toBe(401);
    expect((await call("/v1/public/committees", { headers: { "X-Api-Key": KEY } })).status).toBe(200);
    expect((await call("/v1/rpc/session.me", { method: "POST" })).status).toBe(401);
  });

  it("only allowlisted procedures exist", async () => {
    expect((await rpc("constructor")).status).toBe(404);
    expect((await rpc("__proto__.x")).status).toBe(404);
    expect((await rpc("db.exec", { sql: "DROP TABLE users" })).status).toBe(404);
  });

  it("refuses when secrets are not configured", async () => {
    env.API_SHARED_SECRET = undefined as never;
    expect((await call("/v1/public/committees", { headers: { "X-Api-Key": KEY } })).status).toBe(503);
  });
});

describe("sessions and authorization", () => {
  it("login issues a token; session.me reflects capabilities; logout revokes it", async () => {
    const { token } = await signIn([], ["president"]);
    const me = await rpc<{ adminAccess: boolean; caps: Record<string, boolean> }>("session.me", {}, token);
    expect(me.body.data.adminAccess).toBe(true);
    expect(me.body.data.caps["members.approve"]).toBe(true);
    expect((await rpc("views.home", {}, token)).body.ok).toBe(true);
    await rpc("auth.logout", {}, token);
    expect((await rpc("session.me", {}, token)).body.data).toBeNull();
    expect((await rpc("views.home", {}, token)).status).toBe(401);
  });

  it("wrong passwords are rejected with a generic message", async () => {
    const { id } = await signIn([]);
    const email = (w.sqlite.prepare("SELECT email FROM users WHERE id = ?").get(id) as { email: string }).email;
    const r = await rpc("auth.login", { email, password: "nope-nope-nope" });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Email or password is incorrect.");
    expect((await rpc("auth.login", { email: "nobody@x.bd", password: "nope-nope-nope" })).body.error).toBe("Email or password is incorrect.");
  });

  it("members are denied admin data; errors never leak internals", async () => {
    const { token } = await signIn([]);
    const r = await rpc("members.list", {}, token);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
    const bad = await rpc("views.committee", { id: "x' OR 1=1 --" }, (await signIn([], ["president"])).token);
    expect(bad.status).toBe(404);
  });

  it("writes report the cache tags to refresh", async () => {
    const { token } = await signIn([], ["president"]);
    const r = await rpc<{ id: string }>("committees.create", { input: { name: "GUCC Executive Committee 2027", slug: "2027", termLabel: "2027", status: "UPCOMING" } }, token);
    expect(r.body.ok).toBe(true);
    expect(r.body.revalidate).toContain("committees");
  });
});

describe("uploads and media", () => {
  it("uploads with a signed token, serves public images, and protects private files", async () => {
    const { token } = await signIn([], ["president"]);
    const t = await rpc<{ token: string }>("media.uploadToken", { purpose: "library" }, token);
    const form = () => {
      const fd = new FormData();
      fd.append("file_master", new Blob([PNG], { type: "image/png" }), "dot.png");
      fd.append("filename", "dot.png");
      return fd;
    };
    // No origin / foreign origin / missing token are refused.
    expect((await call("/v1/upload", { method: "POST", body: form() })).status).toBe(403);
    expect((await call("/v1/upload", { method: "POST", headers: { Origin: "https://evil.test" }, body: form() })).status).toBe(403);
    const preflight = await call("/v1/upload", { method: "OPTIONS", headers: { Origin: "http://site.test" } });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://site.test");
    expect((await call("/v1/upload", { method: "POST", headers: { Origin: "http://site.test" }, body: form() })).status).toBe(401);

    const up = await call("/v1/upload", { method: "POST", headers: { Origin: "http://site.test", Authorization: `Bearer ${t.body.data.token}`, "Content-Length": String(PNG.length + 400) }, body: form() });
    const body = (await up.json()) as { ok: boolean; data: { id: string; url: string } };
    expect(up.status).toBe(200);
    expect(body.data.url).toMatch(/^\/media\/media\/\d{4}\/\d{2}\/med_/);
    const img = await call(body.data.url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("immutable");

    // Make it private: moved to the private bucket, plain URL now 404, signed URL works.
    await rpc("media.update", { id: body.data.id, visibility: "PRIVATE" }, token);
    expect((await call(body.data.url)).status).toBe(404);
    const signed = await rpc<string>("media.signedUrl", { id: body.data.id }, token);
    expect(signed.body.data).toMatch(/\?exp=\d+&sig=/);
    const priv = await call(signed.body.data);
    expect(priv.status).toBe(200);
    expect(priv.headers.get("cache-control")).toBe("private, no-store");
    expect((await call(signed.body.data.replace(/sig=[^&]+/, "sig=AAAA"))).status).toBe(404);
    // Members cannot mint links to others' private files.
    const member = await signIn([]);
    expect((await rpc("media.signedUrl", { id: body.data.id }, member.token)).status).toBe(403);
  });

  it("rejects disguised files and path tricks", async () => {
    const { token } = await signIn([], ["president"]);
    const t = await rpc<{ token: string }>("media.uploadToken", { purpose: "library" }, token);
    const fd = new FormData();
    fd.append("file_master", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
    const r = await call("/v1/upload", { method: "POST", headers: { Origin: "http://site.test", Authorization: `Bearer ${t.body.data.token}`, "Content-Length": "500" }, body: fd });
    expect(r.status).toBe(400);
    for (const p of ["/media/..%2f..%2fwrangler.jsonc", "/media/media/2026/01/../../x", "/media/%E0%A4%A"]) expect((await call(p)).status).toBe(404);
  });
});
