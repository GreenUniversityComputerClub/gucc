/**
 * Data retention (docs/platform/PRIVACY.md) and the media lifecycle: what expires is removed
 * (files included), what's still needed stays, and nothing in use is ever deleted.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { archiveMedia, purgeMedia, uploadMedia } from "@/lib/server/services/media";
import { runRetention } from "@/lib/server/services/retention";
import { checkAuditSeals, sealAuditLog } from "@/lib/server/services/audit-seal";
import { createWorld, type TestWorld } from "../support/d1";

const PNG_A = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PNG_B = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const n = (sql: string, ...args: unknown[]) => (w.sqlite.prepare(sql).get(...(args as never[])) as { n: number }).n;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe("retention", () => {
  it("removes expired diagnostics, sign-in events and contact messages, and keeps recent ones", async () => {
    const run = w.sqlite.prepare.bind(w.sqlite);
    run("INSERT INTO error_events (id, created_at, message) VALUES ('e1', ?, 'old'), ('e2', ?, 'new')").run(daysAgo(31), daysAgo(1));
    run("INSERT INTO email_log (id, created_at, recipient, type, status) VALUES ('m1', ?, 'a@x.bd', 't', 'sent'), ('m2', ?, 'a@x.bd', 't', 'sent')").run(daysAgo(91), daysAgo(89));
    run("INSERT INTO idempotency_keys (key, procedure, status, created_at) VALUES ('k1', 'p', 'done', ?), ('k2', 'p', 'done', ?)").run(daysAgo(2), new Date().toISOString());
    run("INSERT INTO authentication_events (id, event, created_at) VALUES ('a1', 'LOGIN_FAILED', ?), ('a2', 'LOGIN_FAILED', ?)").run(daysAgo(366), daysAgo(10));
    run("INSERT INTO contact_messages (id, name, email, message, created_at) VALUES ('c1', 'A', 'a@x.bd', 'hi', ?), ('c2', 'B', 'b@x.bd', 'hi', ?)").run(daysAgo(400), daysAgo(20));
    run("INSERT INTO usage_counters (day, key, count) VALUES (?, 'r2.objects', 5), (?, 'r2.objects', 5), ('total', 'r2.stored_bytes', 9)").run(daysAgo(420).slice(0, 10), daysAgo(3).slice(0, 10));
    const report = await runRetention(await w.ctx());
    expect(report).toMatchObject({ errorEvents: 1, emailLog: 1, idempotencyKeys: 1, authEvents: 1, contactMessages: 1, usageCounters: 1 });
    expect(n("SELECT COUNT(*) n FROM error_events")).toBe(1);
    expect(n("SELECT COUNT(*) n FROM usage_counters WHERE day = 'total'")).toBe(1);
  });

  it("deletes unsuccessful applications a year after the recruitment closed, with their documents", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const file = await uploadMedia(await w.ctx(pres), { files: { master: PNG_A }, originalFilename: "cv.png", visibility: "PRIVATE" });
    w.sqlite.exec(`INSERT INTO recruitment_campaigns (id, title, status, closes_at, positions_json) VALUES ('rc_old', 'Old', 'CLOSED', '${daysAgo(400)}', '[]'), ('rc_new', 'New', 'CLOSED', '${daysAgo(30)}', '[]')`);
    const app = w.sqlite.prepare(`INSERT INTO recruitment_applications (id, campaign_id, full_name, student_id, email, phone, position_id, status, cv_media_id) VALUES (?, ?, 'X', ?, ?, '01700000000', 'pos:treasurer', ?, ?)`);
    app.run("ra_1", "rc_old", "231000001", "x1@x.bd", "REJECTED", file.id);
    app.run("ra_2", "rc_old", "231000002", "x2@x.bd", "ACCEPTED", null);
    app.run("ra_3", "rc_new", "231000003", "x3@x.bd", "REJECTED", null);
    w.sqlite.exec("INSERT INTO recruitment_notes (id, application_id, author_id, body) VALUES ('rn_1', 'ra_1', NULL, 'note')");
    const keys = Object.values(JSON.parse((w.sqlite.prepare("SELECT variants_json FROM media WHERE id = ?").get(file.id) as { variants_json: string }).variants_json) as Record<string, { key: string }>).map((v) => v.key);
    expect(keys.every((k) => w.privateBucket.objects.has(k))).toBe(true);

    expect((await runRetention(await w.ctx())).applications).toBe(1);
    expect((w.sqlite.prepare("SELECT id FROM recruitment_applications ORDER BY id").all() as Array<{ id: string }>).map((r) => r.id)).toEqual(["ra_2", "ra_3"]);
    expect(n("SELECT COUNT(*) n FROM recruitment_notes")).toBe(0);
    expect(keys.some((k) => w.privateBucket.objects.has(k))).toBe(false);
    expect(n("SELECT COUNT(*) n FROM media WHERE id = ? AND purged_at IS NOT NULL", file.id)).toBe(1);
  });

  it("anonymises registrations two years after the event, keeping the count", async () => {
    w.sqlite.exec(`INSERT INTO events (id, slug, title, status, start_at, end_at) VALUES ('ev_old', 'old', 'Old', 'COMPLETED', '${daysAgo(800)}', '${daysAgo(799)}'), ('ev_new', 'new', 'New', 'COMPLETED', '${daysAgo(30)}', '${daysAgo(29)}')`);
    w.sqlite.exec("INSERT INTO event_registrations (id, event_id, name, email, phone, student_id) VALUES ('er1', 'ev_old', 'Rafi', 'rafi@x.bd', '017', '231000001'), ('er2', 'ev_new', 'Nadia', 'nadia@x.bd', NULL, NULL)");
    expect((await runRetention(await w.ctx())).registrationsAnonymised).toBe(1);
    expect(w.sqlite.prepare("SELECT name, email, phone, student_id FROM event_registrations WHERE id = 'er1'").get()).toEqual({ name: "Former participant", email: "anonymised-er1@invalid", phone: null, student_id: null });
    expect(w.sqlite.prepare("SELECT name FROM event_registrations WHERE id = 'er2'").get()).toEqual({ name: "Nadia" });
    // A second run changes nothing.
    expect((await runRetention(await w.ctx())).registrationsAnonymised).toBe(0);
  });

  it("removes the activity log's entries older than two years, whole seals at a time, and the rest still verifies", async () => {
    const ins = w.sqlite.prepare("INSERT INTO audit_logs (id, action, created_at) VALUES (?, 'x', ?)");
    for (let i = 0; i < 5; i++) ins.run(`old_${i}`, daysAgo(800));
    await sealAuditLog(await w.ctx());
    for (let i = 0; i < 3; i++) ins.run(`new_${i}`, daysAgo(10));
    await sealAuditLog(await w.ctx());
    expect((await runRetention(await w.ctx())).auditRows).toBe(5);
    expect(n("SELECT COUNT(*) n FROM audit_logs")).toBe(3);
    expect(n("SELECT COUNT(*) n FROM audit_seals")).toBe(1);
    expect(await checkAuditSeals(await w.ctx(), 1)).toMatchObject({ ok: true, seals: 1 });
  });
});

describe("media lifecycle", () => {
  it("marks unused files, never counts a file used inside a post as unused, and deletes only long-unused ones on request", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const unused = await uploadMedia(await w.ctx(mod), { files: { master: PNG_A }, originalFilename: "a.png" });
    const inPost = await uploadMedia(await w.ctx(mod), { files: { master: PNG_B }, originalFilename: "b.png" });
    w.sqlite.prepare("INSERT INTO posts (id, type, slug, title, body_markdown, status) VALUES ('p1', 'BLOG', 'p1', 'P', ?, 'PUBLISHED')").run(`![photo](${inPost.url})`);

    expect((await runRetention(await w.ctx())).mediaMarkedUnused).toBe(1);
    const since = (id: string) => (w.sqlite.prepare("SELECT unreferenced_since s FROM media WHERE id = ?").get(id) as { s: string | null }).s;
    expect(since(unused.id)).not.toBeNull();
    expect(since(inPost.id)).toBeNull();
    // Archiving a file used inside a post is refused.
    await expect(archiveMedia(await w.ctx(mod), inPost.id, null)).rejects.toMatchObject({ code: "CONFLICT" });

    // Too soon to delete for good.
    await expect(purgeMedia(await w.ctx(mod), unused.id, null)).rejects.toMatchObject({ code: "TOO_SOON" });
    w.sqlite.prepare("UPDATE media SET unreferenced_since = ? WHERE id = ?").run(daysAgo(31), unused.id);
    const keys = Object.values(JSON.parse((w.sqlite.prepare("SELECT variants_json FROM media WHERE id = ?").get(unused.id) as { variants_json: string }).variants_json) as Record<string, { key: string }>).map((v) => v.key);
    expect((await purgeMedia(await w.ctx(mod), unused.id, "clean-up")).message).toMatch(/Deleted permanently/);
    expect(keys.some((k) => w.bucket.objects.has(k))).toBe(false);
    expect(n("SELECT COUNT(*) n FROM audit_logs WHERE action = 'media.purge' AND resource_id = ?", unused.id)).toBe(1);
    await expect(purgeMedia(await w.ctx(mod), unused.id, null)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // A file used again is unmarked.
    w.sqlite.prepare("UPDATE media SET unreferenced_since = ? WHERE id = ?").run(daysAgo(40), inPost.id);
    expect((await runRetention(await w.ctx())).mediaInUseAgain).toBe(1);
    await expect(purgeMedia(await w.ctx(mod), inPost.id, null)).rejects.toMatchObject({ code: "TOO_SOON" });
  });
});
