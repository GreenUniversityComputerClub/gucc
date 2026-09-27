/**
 * Optimistic locking: an edit form sends the updated_at it loaded; if someone saved in between,
 * nothing is overwritten and the person hears who changed it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createPost, updatePost } from "@/lib/server/services/posts";
import { updateOrgSetting, updateRole, updateSystemSetting } from "@/lib/server/services/governance";
import { quickEditListings } from "@/lib/server/services/executive-bulk";
import { assignExecutive } from "@/lib/server/services/committees";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});
const stampOf = (table: string, id: string, col = "id") => (w.sqlite.prepare(`SELECT updated_at FROM ${table} WHERE ${col} = ?`).get(id) as { updated_at: string }).updated_at;

describe("optimistic locking", () => {
  it("a post saved by someone else since the page loaded isn't overwritten", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"], name: "Rafi President" });
    const gs = await w.user({ email: "gs@x.bd", positions: ["general-secretary"], name: "Nadia Secretary" });
    const { id } = await createPost(await w.ctx(pres), { type: "NEWS", title: "Draft", body: "One.", category: "Club News" });
    const loaded = stampOf("posts", id);
    await new Promise((r) => setTimeout(r, 5));
    await updatePost(await w.ctx(gs), id, { title: "Nadia's edit", body: "Two.", category: "Club News", expectedUpdatedAt: loaded });
    await expect(updatePost(await w.ctx(pres), id, { title: "Rafi's edit", body: "Three.", category: "Club News", expectedUpdatedAt: loaded }))
      .rejects.toMatchObject({ code: "STALE", message: expect.stringMatching(/last saved by Nadia Secretary/) });
    expect((w.sqlite.prepare("SELECT title FROM posts WHERE id = ?").get(id) as { title: string }).title).toBe("Nadia's edit");
    // With the fresh stamp it saves; without one (older pages) it isn't checked.
    await updatePost(await w.ctx(pres), id, { title: "Rafi's edit", body: "Three.", category: "Club News", expectedUpdatedAt: stampOf("posts", id) });
    await updatePost(await w.ctx(pres), id, { title: "Unchecked", body: "Four.", category: "Club News" });
  });

  it("settings and roles refuse stale saves too", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const loaded = stampOf("system_settings", "email.daily_limit", "key");
    await new Promise((r) => setTimeout(r, 5));
    await updateSystemSetting(await w.ctx(mod), "email.daily_limit", "80", loaded);
    await expect(updateSystemSetting(await w.ctx(mod), "email.daily_limit", "70", loaded)).rejects.toMatchObject({ code: "STALE" });

    const orgKey = (w.sqlite.prepare("SELECT key FROM organization_settings WHERE key = 'page.home'").get() as { key: string } | undefined)?.key;
    if (orgKey) {
      const home = w.sqlite.prepare("SELECT value_json, updated_at FROM organization_settings WHERE key = ?").get(orgKey) as { value_json: string; updated_at: string };
      await expect(updateOrgSetting(await w.ctx(mod), orgKey, home.value_json, "2000-01-01T00:00:00.000Z")).rejects.toMatchObject({ code: "STALE" });
    }

    const roleStamp = stampOf("roles", "role:member");
    await new Promise((r) => setTimeout(r, 5));
    await updateRole(await w.ctx(mod), "role:member", { name: "Member", description: "Approved member.", expectedUpdatedAt: roleStamp });
    await expect(updateRole(await w.ctx(mod), "role:member", { name: "Members", expectedUpdatedAt: roleStamp })).rejects.toMatchObject({ code: "STALE" });
  });

  it("quick edit flags the rows someone else changed", async () => {
    const mod = await w.user({ email: "m@x.bd", roles: ["moderator"] });
    const { id } = await assignExecutive(await w.ctx(mod), w.committeeId, { fullName: "Someone", positionId: "pos:treasurer", section: "STUDENT" });
    const loaded = stampOf("committee_members", id);
    await new Promise((r) => setTimeout(r, 5));
    await quickEditListings(await w.ctx(mod), w.committeeId, [{ id, title: "Treasurer (acting)", stamp: loaded }]);
    await expect(quickEditListings(await w.ctx(mod), w.committeeId, [{ id, title: "Treasurer", stamp: loaded }]))
      .rejects.toMatchObject({ code: "VALIDATION", fields: { [id]: expect.stringMatching(/Changed by someone else/) } });
  });
});
