/**
 * The website and the API Worker ship from one repository but can briefly run different
 * releases. The Worker must send every field the website reads, and the website must survive
 * an older API that doesn't.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { HOME_LISTS, normalizeHome, normalizeNotifications, normalizeSession, SESSION_FIELDS } from "@/lib/api/contracts";
import { myNotifications } from "@/lib/server/services/community";
import { sessionMe } from "@/lib/server/views/admin";
import { homeView } from "@/lib/server/views/home";
import { API_VERSION } from "@/lib/version";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

describe("API contract", () => {
  it("session.me sends every field the website reads, with this release's version", async () => {
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    const s = (await sessionMe(await w.ctx(pres)))!;
    for (const f of SESSION_FIELDS) expect(s, f).toHaveProperty(f);
    expect(s.apiVersion).toBe(API_VERSION);
    expect(Object.keys(s.security).sort()).toEqual(["mfaBlocked", "mfaDeadline", "mfaEnabled", "mfaRequired"]);
    expect(normalizeSession(s)).toEqual(s);
  });

  it("views.home and notifications.list send every list the dashboard reads", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const h = await homeView(await w.ctx(m));
    for (const f of HOME_LISTS) expect(Array.isArray((h as Record<string, unknown>)[f]), f).toBe(true);
    const n = await myNotifications(await w.ctx(m), 10);
    expect(n).toMatchObject({ rows: [], unread: 0, next: null });
  });

  it("an older API's payloads are filled in instead of crashing", () => {
    const old = normalizeSession({ user: { id: "usr_1", email: "a@x.bd", status: "ACTIVE" }, profile: null, roles: ["member"], positions: [], isModerator: false, adminAccess: false, caps: {}, unread: 2 })!;
    expect(old.security).toEqual({ mfaEnabled: false, mfaRequired: false, mfaDeadline: null, mfaBlocked: false });
    expect(old).toMatchObject({ openTasks: 0, unreadMessages: 0, apiVersion: null, unread: 2 });
    expect(normalizeSession(null)).toBeNull();
    expect(normalizeSession({ user: {} })).toBeNull();
    expect(normalizeHome({ attention: [] })).toMatchObject({ tasks: [], meetings: [], recentActivity: [], health: null, unread: 0 });
    expect(normalizeNotifications({ rows: [{ id: "n" }] })).toMatchObject({ unread: 0, next: null });
  });
});
