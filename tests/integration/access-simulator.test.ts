/**
 * The access simulator runs the real engine for someone else and explains each step: account,
 * where the permission comes from, scope, rules, approval and approvers, two-factor.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { simulateAccess, simulatorOptions } from "@/lib/server/services/access";
import { createPost } from "@/lib/server/services/posts";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

describe("access simulator", () => {
  it("shows who would have to approve a post, and why a member can't publish at all", async () => {
    const mod = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    const pub = await w.user({ email: "pub@x.bd", positions: ["publication-secretary"], name: "Pub Sec" });
    await w.user({ email: "gs@x.bd", positions: ["general-secretary"], name: "Gen Sec" });
    const member = await w.user({ email: "m@x.bd", roles: ["member"] });
    const { id } = await createPost(await w.ctx(pub), { type: "NEWS", title: "Results", body: "We won.", category: "Club News" });

    const options = await simulatorOptions(await w.ctx(mod));
    expect(options.posts.map((p) => p.id)).toContain(id);
    expect(options.permissions.some((p) => p.key === "posts.publish")).toBe(true);

    const needs = await simulateAccess(await w.ctx(mod), { userId: pub, permission: "posts.publish", resourceType: "post", resourceId: id });
    expect(needs.outcome).toBe("REQUIRE_APPROVAL");
    expect(needs.approvers).toContain("Gen Sec");
    expect(needs.approvers).not.toContain("Pub Sec");
    expect(needs.steps.map((s) => s.label)).toEqual(expect.arrayContaining(["Account", "Holds the permission through", "Approval"]));
    expect(needs.resource).toBe("post “Results”");

    const no = await simulateAccess(await w.ctx(mod), { userId: member, permission: "posts.publish" });
    expect(no.outcome).toBe("DENY");
    expect(no.steps.find((s) => s.label === "Holds the permission through")).toMatchObject({ status: "fail" });

    await expect(simulateAccess(await w.ctx(member), { userId: pub, permission: "posts.publish" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(simulateAccess(await w.ctx(mod), { userId: pub, permission: "no.such" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
