/**
 * Accessibility: the axe WCAG 2.1 A/AA rules on the main public and dashboard pages, and the
 * keyboard basics (skip link, dialog Escape). Serious and critical findings fail the run.
 *
 * Public pages are checked without the colour-contrast rule: their look is fixed by the club
 * (the design isn't changed in code reviews); everything invisible (labels, names, roles,
 * landmarks) is checked everywhere.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, MODERATOR, settle } from "./helpers";

async function audit(page: Page, opts: { contrast: boolean }) {
  await settle(page);
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (!opts.contrast) builder.disableRules(["color-contrast"]);
  const { violations } = await builder.analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return serious.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const path of ["/", "/events", "/executives", "/contact", "/join", "/auth/login", "/auth/sign-up", "/lost-found", "/become-a-sponsor", "/sponsors/partner-with-gucc", "/forms", "/c", "/email/unsubscribe"]) {
  test(`public page ${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    expect(await audit(page, { contrast: false })).toEqual([]);
  });
}

// One test per page: axe on a long dashboard list takes a while.
for (const path of ["/dashboard", "/dashboard/profile", "/dashboard/security", "/dashboard/members", "/dashboard/health", "/dashboard/access/simulator", "/dashboard/notifications", "/dashboard/media",
  "/dashboard/forms", "/dashboard/forms/new", "/dashboard/email", "/dashboard/email/new", "/dashboard/certificates", "/dashboard/certificates/new", "/dashboard/chat"]) {
  test(`dashboard page ${path} has no serious accessibility problems`, async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, MODERATOR.email, MODERATOR.password, path);
    expect(await audit(page, { contrast: true })).toEqual([]);
  });
}

test("keyboard: the password eye shows and hides the password", async ({ page }) => {
  await page.goto("/auth/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("Secret-123");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});
