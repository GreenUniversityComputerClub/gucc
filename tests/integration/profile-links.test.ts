/**
 * A member's own details show wherever they're listed: the current committee follows the profile,
 * and past years follow it too once the person (or an administrator for them) changes their name,
 * faculty designation or links. Account holders' links show in every year. People without an
 * account, and details nobody changed, keep exactly what their year's listing recorded.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { updateOwnProfile } from "@/lib/server/services/members";
import { updatePerson } from "@/lib/server/services/people";
import { buildCommittee, type CommitteeRow, type MemberRow, type PublicExecutive } from "@/lib/public/shapes";
import { COMMITTEES_SQL, MEMBERS_SQL } from "@/lib/public/queries";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

function roster(committeeId: string): Record<string, PublicExecutive> {
  const c = (w.sqlite.prepare(COMMITTEES_SQL).all() as unknown as CommitteeRow[]).find((x) => x.id === committeeId)!;
  const built = buildCommittee(c, w.sqlite.prepare(MEMBERS_SQL).all() as unknown as MemberRow[]);
  return Object.fromEntries([...((built.facultyMembers as PublicExecutive[]) ?? []), ...((built.studentExecutives as PublicExecutive[]) ?? [])].map((p) => [p.name, p]));
}

describe("profile links everywhere", () => {
  it("an update shows on the current committee and on past years for members with an account", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    // A past year whose listing recorded an old GitHub and a LinkedIn.
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2025', '2025', 'GUCC 2025', '2025', 'ARCHIVED')").run();
    w.sqlite.prepare(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, legacy_json)
      SELECT 'cm_2025', 'cmt_2025', id, 'pos:executive-member', 'Executive Member', 'STUDENT', 0, '{"github":"https://github.com/old-nadia","linkedin":"https://linkedin.com/in/nadia"}' FROM profiles WHERE user_id = ?`).run(exec);
    // Someone without an account in the same year keeps exactly their listing.
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, person_type, visibility) VALUES ('prf_hist', 'Old Timer', 'STUDENT', 'PUBLIC')").run();
    w.sqlite.prepare(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, legacy_json)
      VALUES ('cm_hist', 'cmt_2025', 'prf_hist', 'pos:executive-member', 'Executive Member', 'STUDENT', 1, '{"github":"https://github.com/old-timer"}')`).run();
    w.sqlite.prepare("UPDATE profiles SET github_url = 'https://github.com/someone-else' WHERE id = 'prf_hist'").run();

    w.sqlite.prepare("UPDATE committee_members SET display_name = 'Nadia R.' WHERE id = 'cm_2025'").run();
    await updateOwnProfile(await w.ctx(exec), { fullName: "Nadia Rahman Chowdhury", github: "https://github.com/nadia-new", twitter: "https://x.com/nadia" });

    expect(roster(w.committeeId)["Nadia Rahman Chowdhury"]).toMatchObject({ github: "https://github.com/nadia-new", twitter: "https://x.com/nadia" });
    // The past year: her own name and current links win; the LinkedIn only that year had stays; the post held stays.
    expect(roster("cmt_2025")["Nadia R."]).toBeUndefined();
    expect(roster("cmt_2025")["Nadia Rahman Chowdhury"]).toMatchObject({ position: "Executive Member", github: "https://github.com/nadia-new", twitter: "https://x.com/nadia", linkedin: "https://linkedin.com/in/nadia" });
    // Without an account: exactly as that year recorded (name included).
    w.sqlite.prepare("UPDATE profiles SET full_name = 'Renamed Elsewhere' WHERE id = 'prf_hist'").run();
    w.sqlite.prepare("UPDATE committee_members SET display_name = 'Old Timer' WHERE id = 'cm_hist'").run();
    expect(roster("cmt_2025")["Old Timer"]).toEqual(expect.objectContaining({ github: "https://github.com/old-timer" }));
  });

  it("saving a profile without changing the name keeps the name a listing was given", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2025', '2025', 'GUCC 2025', '2025', 'ARCHIVED')").run();
    w.sqlite.prepare(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, display_name, legacy_json)
      SELECT 'cm_2025', 'cmt_2025', id, 'pos:executive-member', 'Executive Member', 'STUDENT', 0, 'Nadia R.', '{"github":"https://github.com/nadia","facebook":"https://facebook.com/nadia"}' FROM profiles WHERE user_id = ?`).run(exec);
    w.sqlite.prepare("UPDATE profiles SET github_url = 'https://github.com/nadia', facebook_url = 'https://facebook.com/nadia' WHERE user_id = ?").run(exec);

    await updateOwnProfile(await w.ctx(exec), { fullName: "Nadia Rahman", github: "https://github.com/nadia", facebook: "https://facebook.com/nadia", bio: "Hello" });
    expect(roster("cmt_2025")["Nadia R."]).toMatchObject({ github: "https://github.com/nadia", facebook: "https://facebook.com/nadia" });

    // Removing a link removes it from past years too; the others stay.
    await updateOwnProfile(await w.ctx(exec), { fullName: "Nadia Rahman", github: "https://github.com/nadia" });
    const past = roster("cmt_2025")["Nadia R."]!;
    expect(past.github).toBe("https://github.com/nadia");
    expect(past.facebook).toBeUndefined();
    expect(JSON.parse(String((w.sqlite.prepare("SELECT legacy_json FROM committee_members WHERE id = 'cm_2025'").get() as { legacy_json: string }).legacy_json))).not.toHaveProperty("facebook");
  });

  it("an administrator correcting a former faculty advisor's details updates the years they served", async () => {
    const pres = await w.user({ email: "pres@x.bd", name: "Leader", roles: ["member"], positions: ["president"] });
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, person_type, designation, visibility) VALUES ('prf_fac', 'Dr. Karim', 'FACULTY', 'Lecturer', 'PUBLIC')").run();
    w.sqlite.prepare("INSERT INTO committees (id, slug, name, term_label, status) VALUES ('cmt_2024', '2024', 'GUCC 2024', '2024', 'ARCHIVED')").run();
    w.sqlite.prepare(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, display_name, designation)
      VALUES ('cm_fac', 'cmt_2024', 'prf_fac', 'pos:executive-member', 'Advisor', 'FACULTY', 0, 'Dr. Karim', 'Lecturer')`).run();

    await updatePerson(await w.ctx(pres), "prf_fac", { fullName: "Dr. Abdul Karim", personType: "FACULTY", designation: "Assistant Professor" });
    expect(roster("cmt_2024")["Dr. Abdul Karim"]).toMatchObject({ position: "Advisor", designation: "Assistant Professor" });
  });
});
