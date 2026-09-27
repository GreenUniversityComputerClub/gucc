import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkContentSetting } from "@/lib/governance/content-settings";

const seeded = (key: string) => {
  const sql = readFileSync("migrations/0007_platform_v4.sql", "utf8");
  const m = sql.match(new RegExp(`\\('${key.replace(".", "\\.")}', '((?:[^']|'')*)'`));
  return JSON.parse(m![1]!.replace(/''/g, "'"));
};

describe("content settings shape checks", () => {
  it("accepts the seeded home page and services exactly as they are", () => {
    for (const key of ["page.home", "nav.services"]) {
      const v = seeded(key);
      expect(checkContentSetting(key, v)).toEqual(v);
    }
  });

  it("refuses a home page that would break rendering", () => {
    const v = seeded("page.home");
    expect(() => checkContentSetting("page.home", { ...v, stats: "many" })).toThrow(/Figures must be a list/);
    expect(() => checkContentSetting("page.home", { ...v, stats: [{ value: -1, label: "x" }] })).toThrow(/number from 0/);
    expect(() => checkContentSetting("page.home", { ...v, chairperson: { ...v.chairperson, person: { ...v.chairperson.person, name: " " } } })).toThrow(/Chairperson: name is required/);
    expect(() => checkContentSetting("page.home", { ...v, moderators: { ...v.moderators, people: [{ ...v.moderators.people[0], photo: "javascript:alert(1)" }] } })).toThrow(/photo must be/);
  });

  it("keeps Services links on this site and fills in initials", () => {
    expect(() => checkContentSetting("nav.services", { items: [{ label: "X", href: "https://evil.example" }] })).toThrow(/page on this site/);
    expect(() => checkContentSetting("nav.services", { items: [{ label: "X", href: "//evil.example" }] })).toThrow(/page on this site/);
    expect(checkContentSetting("nav.services", { items: [{ label: " Lost ", href: "/lost-found" }] })).toEqual({ items: [{ label: "Lost", href: "/lost-found", description: "", visible: true }] });
    const v = seeded("page.home");
    const out = checkContentSetting("page.home", { ...v, chairperson: { ...v.chairperson, person: { ...v.chairperson.person, initials: "" } } }) as typeof v;
    expect(out.chairperson.person.initials).toBe("MS");
  });

  it("checks partner clubs and leaves other settings alone", () => {
    expect(() => checkContentSetting("page.collaborations", { partners: [{ name: "A", image: "", description: "" }] })).toThrow(/logo is required/);
    expect(checkContentSetting("page.collaborations", { partners: [{ name: "A", image: "/collaborations/a.png", description: "d" }] })).toEqual({ partners: [{ name: "A", image: "/collaborations/a.png", description: "d" }] });
    expect(checkContentSetting("chatbot.knowledge", { anything: 1 })).toEqual({ anything: 1 });
  });
});
