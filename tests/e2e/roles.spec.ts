/**
 * Role by role: what each kind of person reaches in the dashboard. Moderator, President, General
 * Secretary, a GUCC executive, a CSS (affiliated committee) executive, a Developer and a member
 * each sign in and open the same pages; allowed ones render, the rest end on the "no access"
 * page. The navigation shows only what they can open.
 */
import { expect, test } from "@playwright/test";
import { d1, ensureMember, login, MODERATOR } from "./helpers";

const PASSWORD = "Role-check-pass-2026!";
const PAGES = {
  members: "/dashboard/members",
  health: "/dashboard/health",
  activity: "/dashboard/activity",
  settings: "/dashboard/settings",
  roles: "/dashboard/roles",
  simulator: "/dashboard/access/simulator",
} as const;
type PageKey = keyof typeof PAGES;

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
function currentCommittee(): string {
  return d1<{ id: string }>("SELECT id FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL LIMIT 1")[0]!.id;
}
function listing(userEmail: string, positionKey: string, unit: string | null) {
  const user = d1<{ id: string }>(`SELECT id FROM users WHERE email = ${q(userEmail)}`)[0]!.id;
  const profile = d1<{ id: string }>(`SELECT id FROM profiles WHERE user_id = ${q(user)}`)[0]!.id;
  const committee = currentCommittee();
  d1(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, unit_key, display_order, is_active, created_at, updated_at)
      SELECT ${q(`cm_role_${positionKey}_${unit ?? "gucc"}`)}, ${q(committee)}, ${q(profile)}, ${q(`pos:${positionKey}`)}, (SELECT name FROM positions WHERE key = ${q(positionKey)}), 'STUDENT', ${unit === null ? "NULL" : q(unit)}, 900, 1, datetime('now'), datetime('now')
      WHERE NOT EXISTS (SELECT 1 FROM committee_members WHERE id = ${q(`cm_role_${positionKey}_${unit ?? "gucc"}`)})`);
}

const PEOPLE: Array<{ who: string; email?: string; setup?: (email: string) => void; allowed: PageKey[] }> = [
  { who: "Moderator", allowed: ["members", "health", "activity", "settings", "roles", "simulator"] },
  { who: "President", email: "role.president@local.test", setup: (e) => listing(e, "president", null), allowed: ["members", "health", "activity", "settings", "roles", "simulator"] },
  { who: "General Secretary", email: "role.gs@local.test", setup: (e) => listing(e, "general-secretary", null), allowed: ["members", "health", "activity", "settings", "roles", "simulator"] },
  // Every current GUCC executive can look members up (the executive baseline); nothing else here.
  { who: "GUCC executive member", email: "role.exec@local.test", setup: (e) => listing(e, "executive-member", null), allowed: ["members"] },
  { who: "CSS executive", email: "role.css@local.test", setup: (e) => listing(e, "general-secretary", "css"), allowed: [] },
  { who: "Developer", email: "role.dev@local.test", setup: (e) => d1(`INSERT INTO user_roles (id, user_id, role_id, granted_at, reason) SELECT 'ur_role_dev', id, 'role:developer', datetime('now'), 'E2E' FROM users WHERE email = ${q(e)} AND NOT EXISTS (SELECT 1 FROM user_roles WHERE id = 'ur_role_dev')`), allowed: ["health", "activity"] },
  { who: "member", email: "role.member@local.test", allowed: [] },
];

for (const person of PEOPLE) {
  test(`${person.who}: reaches exactly the pages their permissions allow`, async ({ page }) => {
    test.setTimeout(180_000);
    if (person.email) {
      await ensureMember(person.email, `Role ${person.who}`, PASSWORD);
      person.setup?.(person.email);
      await login(page, person.email, PASSWORD, "/dashboard");
    } else {
      await login(page, MODERATOR.email, MODERATOR.password, "/dashboard");
    }
    // Everyone signed in has a dashboard home.
    await expect(page).toHaveURL(/\/dashboard$/);
    const noAccess = page.getByRole("heading", { name: "No access" });
    for (const [key, path] of Object.entries(PAGES) as Array<[PageKey, string]>) {
      // Server-rendered: the page (or the "No access" page) is complete when it has loaded.
      await page.goto(path);
      if (person.allowed.includes(key)) {
        expect(page.url(), `${person.who} should open ${path}`).toContain(path);
        await expect(noAccess, `${person.who} should open ${path}`).toHaveCount(0);
      } else {
        await expect(noAccess, `${person.who} should not open ${path}`).toBeVisible();
      }
    }
    // The navigation offers System health exactly to those who can open it (the link may sit in a
    // collapsed group or the phone menu, so this checks it's there, not that it's on screen).
    await page.goto("/dashboard");
    const healthLink = page.locator(`a[href="${PAGES.health}"]`);
    if (person.allowed.includes("health")) await expect(healthLink).not.toHaveCount(0);
    else await expect(healthLink).toHaveCount(0);
  });
}

test("a President giving the Developer role waits for a Moderator's approval (sensitive permissions)", async ({ page }) => {
  await ensureMember("role.president@local.test", "Role President", PASSWORD);
  listing("role.president@local.test", "president", null);
  await ensureMember("role.newdev@local.test", "Role New Developer", PASSWORD);
  const target = d1<{ id: string }>("SELECT id FROM users WHERE email = 'role.newdev@local.test'")[0]!.id;
  d1(`UPDATE user_roles SET revoked_at = datetime('now') WHERE user_id = ${q(target)} AND role_id = 'role:developer' AND revoked_at IS NULL`);
  d1(`UPDATE approval_requests SET status = 'CANCELLED' WHERE status = 'PENDING' AND resource_id LIKE ${q(`${target}%`)}`);
  await login(page, "role.president@local.test", PASSWORD, `/dashboard/access/${target}`);
  const grant = page.locator("section", { hasText: "Give a role" });
  await grant.getByLabel("Role").selectOption({ label: "Developer (a Moderator approves)" });
  await grant.getByRole("button", { name: "Grant role" }).click();
  await expect(page.getByRole("status").filter({ hasText: /approv/i }).first()).toBeVisible();
  const pending = d1<{ n: number }>(`SELECT COUNT(*) AS n FROM approval_requests WHERE status = 'PENDING' AND action = 'governance.sensitive_grant' AND instr(resource_id, ${q(target)}) > 0`)[0]!.n;
  expect(pending).toBe(1);
  expect(d1<{ n: number }>(`SELECT COUNT(*) AS n FROM user_roles WHERE user_id = ${q(target)} AND role_id = 'role:developer' AND revoked_at IS NULL`)[0]!.n).toBe(0);
});
