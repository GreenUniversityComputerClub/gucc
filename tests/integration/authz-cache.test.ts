/**
 * The rules are kept between requests only while nothing about them changed: any change to a
 * rule, its actions or conditions, or an approval policy bumps a counter in the same transaction
 * (database triggers, 0015), and the next request reads the rules again. Grants are never kept.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/server/authz";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

const stamp = () => (w.sqlite.prepare("SELECT stamp FROM cache_stamps WHERE key = 'rules'").get() as { stamp: number }).stamp;
const ruleNames = async (userId: string) => (await loadActor(w.db, userId))!.rules.map((r) => r.name);

describe("cached authorization rules", () => {
  it("follow every change at the next request", async () => {
    const m = await w.user({ email: "m@x.bd", roles: ["member"] });
    const before = await ruleNames(m);
    const s0 = stamp();

    w.sqlite.prepare("INSERT INTO rules (id, name, permission_key, status) VALUES ('rul_t', 'No posters on Fridays', 'posts.create', 'ACTIVE')").run();
    expect(stamp()).toBeGreaterThan(s0);
    // No action yet: not an authorization rule the engine can use.
    expect(await ruleNames(m)).toEqual(before);
    w.sqlite.prepare("INSERT INTO rule_actions (id, rule_id, action_type) VALUES ('rla_t', 'rul_t', 'DENY')").run();
    expect(await ruleNames(m)).toContain("No posters on Fridays");

    w.sqlite.prepare("INSERT INTO rule_conditions (id, rule_id, field, operator, value_json) VALUES ('rlc_t', 'rul_t', 'actor.role', 'eq', '\"member\"')").run();
    expect((await loadActor(w.db, m))!.rules.find((r) => r.name === "No posters on Fridays")!.conditions).toEqual([{ field: "actor.role", operator: "eq", value: "member", group: 0 }]);

    w.sqlite.prepare("UPDATE rules SET status = 'INACTIVE' WHERE id = 'rul_t'").run();
    expect(await ruleNames(m)).toEqual(before);
    w.sqlite.prepare("UPDATE rules SET status = 'ACTIVE' WHERE id = 'rul_t'").run();
    w.sqlite.prepare("DELETE FROM rule_actions WHERE id = 'rla_t'").run();
    expect(await ruleNames(m)).toEqual(before);
  });

  it("never keep grants: a revoked role is gone at the next request", async () => {
    const m = await w.user({ email: "mod@x.bd", roles: ["moderator"] });
    expect((await loadActor(w.db, m))!.subject.roles).toContain("moderator");
    w.sqlite.prepare("UPDATE user_roles SET revoked_at = '2026-01-01' WHERE user_id = ?").run(m);
    expect((await loadActor(w.db, m))!.subject.roles).not.toContain("moderator");
  });

  // Last in this file: it leaves this test process remembering the table as missing.
  it("never stop anyone signing in when the counter's table isn't there yet (code before migration)", async () => {
    const m = await w.user({ email: "m2@x.bd", roles: ["member"] });
    w.sqlite.exec("ALTER TABLE cache_stamps RENAME TO cache_stamps_later");
    const actor = await loadActor(w.db, m);
    expect(actor?.subject.roles).toContain("member");
    expect(Array.isArray(actor?.rules)).toBe(true);
  });
});
