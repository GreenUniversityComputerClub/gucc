/**
 * Free-tier protection: atomic daily budgets and the storage cap for R2 (the only Cloudflare
 * service billed past its free amount), plus the AI answer ceiling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistantChat } from "@/lib/server/services/assistant";
import { uploadMedia } from "@/lib/server/services/media";
import { release, reserve, usageOf } from "@/lib/server/usage";
import { guardFreeTier } from "@/lib/server/services/cloudflare-usage";
import { createWorld, type TestWorld } from "../support/d1";

const PNG_A = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PNG_B = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const setting = (key: string, value: unknown) => w.sqlite.prepare("UPDATE system_settings SET value_json = ? WHERE key = ?").run(JSON.stringify(value), key);

describe("atomic budgets", () => {
  it("never let two requests take the last unit, and give units back on release", async () => {
    const ctx = await w.ctx();
    expect(await reserve(ctx, "k", 9, 10)).toBe(true);
    const [a, b] = await Promise.all([reserve(ctx, "k", 1, 10), reserve(ctx, "k", 1, 10)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await reserve(ctx, "k", 1, 10)).toBe(false);
    expect((await usageOf(ctx, ["k"])).k).toBe(10);
    await release(ctx, "k", 3);
    expect((await usageOf(ctx, ["k"])).k).toBe(7);
    await release(ctx, "k", 50);
    expect((await usageOf(ctx, ["k"])).k).toBe(0);
    // A first reservation larger than the limit is refused without creating a row.
    expect(await reserve(ctx, "big", 11, 10)).toBe(false);
    expect((await usageOf(ctx, ["big"])).big).toBe(0);
  });
});

describe("R2 guards", () => {
  it("refuse uploads past the daily write budget, the storage cap, or when paused", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    setting("media.daily_object_writes", 1);
    await uploadMedia(await w.ctx(pres), { files: { master: PNG_A }, originalFilename: "a.png" });
    await expect(uploadMedia(await w.ctx(pres), { files: { master: PNG_B }, originalFilename: "b.png" })).rejects.toMatchObject({ code: "DAILY_LIMIT" });
    setting("media.daily_object_writes", 100);

    setting("media.storage_limit_bytes", 10);
    await expect(uploadMedia(await w.ctx(pres), { files: { master: PNG_B }, originalFilename: "b.png" })).rejects.toMatchObject({ code: "STORAGE_FULL" });
    // The refused upload gave back the write it had reserved.
    expect((await usageOf(await w.ctx(), ["r2.objects"]))["r2.objects"]).toBe(1);
    setting("media.storage_limit_bytes", 8 * 1024 ** 3);

    setting("media.uploads_enabled", false);
    await expect(uploadMedia(await w.ctx(pres), { files: { master: PNG_B }, originalFilename: "b.png" })).rejects.toMatchObject({ code: "UPLOADS_PAUSED" });
  });

  it("releases the reservation when writing to storage fails", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const ctx = await w.ctx(pres);
    const failing = { ...ctx.media!.public, put: async () => { throw new Error("R2 down"); } };
    await expect(uploadMedia({ ...ctx, media: { public: failing, private: ctx.media!.private } }, { files: { master: PNG_A }, originalFilename: "a.png" })).rejects.toThrow(/R2 down/);
    const u = await usageOf(await w.ctx(), ["r2.objects"]);
    expect(u["r2.objects"]).toBe(0);
    expect(w.sqlite.prepare("SELECT count FROM usage_counters WHERE day = 'total' AND key = 'r2.stored_bytes'").get()).toEqual({ count: 0 });
  });

  it("never sets a storage class (only Standard storage is free)", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const seen: unknown[] = [];
    const ctx = await w.ctx(pres);
    const spy = { ...ctx.media!.public, put: async (k: string, v: unknown, o?: unknown) => { seen.push(o); return ctx.media!.public.put(k, v as never, o as never); } };
    await uploadMedia({ ...ctx, media: { public: spy, private: ctx.media!.private } }, { files: { master: PNG_A }, originalFilename: "a.png" });
    expect(seen.length).toBeGreaterThan(0);
    for (const o of seen) expect(JSON.stringify(o)).not.toMatch(/storageClass/i);
  });
});

describe("AI ceiling", () => {
  it("answers from the club's data once the daily AI allowance is used", async () => {
    setting("assistant.daily_limit", 0);
    const ctx = { ...(await w.ctx()), env: { ...(await w.ctx()).env, GOOGLE_API_KEY: "test-key" } };
    const r = await assistantChat(ctx, { message: "How can I join GUCC?" });
    expect(r.response).toMatch(/sign-up|Recruitment/);
  });
});

describe("free-tier guard (hourly)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pauses uploads near R2's free storage, tells Moderators once, and warns about other limits once a day", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    // Cloudflare says: 9.3 GB stored (93% of 10 GB), 80,000 API requests today (80%).
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const q = String(JSON.parse(String(init.body)).query);
      const data = q.includes("r2StorageAdaptiveGroups")
        ? [{ max: { payloadSize: 9.3 * 1024 ** 3, metadataSize: 0 }, dimensions: { bucketName: "gucc-media-public-production" } }]
        : q.includes("workersInvocationsAdaptive") ? [{ sum: { requests: 80_000, errors: 3 }, quantiles: { cpuTimeP50: 1500, cpuTimeP99: 4000 } }]
          : [];
      return new Response(JSON.stringify({ data: { viewer: { accounts: [{ rows: data }] } } }), { status: 200 });
    }));
    const c = await w.ctx();
    const ctx = { ...c, env: { ...c.env, CF_ANALYTICS_TOKEN: "t", CF_ACCOUNT_ID: "a", CF_D1_DATABASE_ID: "d", CF_WORKER_NAME: "gucc-api" } };
    const first = await guardFreeTier(ctx);
    expect(first.paused).toBe(true);
    expect(first.alerts.join(" ")).toMatch(/R2 storage: 93%/);
    expect(first.alerts.join(" ")).toMatch(/Worker requests today: 80%/);
    expect(w.sqlite.prepare("SELECT value_json FROM system_settings WHERE key = 'media.uploads_enabled'").get()).toEqual({ value_json: "false" });
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'usage.uploads_paused'").get()).toEqual({ n: 1 });
    const notices = () => (w.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'system.usage'").get(mod) as { n: number }).n;
    expect(notices()).toBe(3); // the pause, and one warning per metric
    // The next hour: already paused, warnings already sent today.
    const second = await guardFreeTier(ctx);
    expect(second.paused).toBe(false);
    expect(notices()).toBe(3);
    // Uploads are refused while paused.
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    await expect(uploadMedia(await w.ctx(pres), { files: { master: PNG_A }, originalFilename: "a.png" })).rejects.toMatchObject({ code: "UPLOADS_PAUSED" });
  });

  it("without the analytics token, uses GUCC's own count of stored bytes", async () => {
    w.sqlite.prepare("INSERT INTO usage_counters (day, key, count) VALUES ('total', 'r2.stored_bytes', ?)").run(Math.round(9.6 * 1024 ** 3));
    const r = await guardFreeTier(await w.ctx());
    expect(r.paused).toBe(true);
  });
});
