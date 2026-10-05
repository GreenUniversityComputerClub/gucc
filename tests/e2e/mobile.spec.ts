import { expect, test } from "@playwright/test";
import { login, MODERATOR } from "./helpers";

async function noHorizontalOverflow(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

const DASHBOARD_PAGES = [
  "/dashboard", "/dashboard/members", "/dashboard/committees", "/dashboard/events", "/dashboard/media", "/dashboard/roles", "/dashboard/people",
  "/dashboard/approvals", "/dashboard/posts?type=BLOG", "/dashboard/registrations", "/dashboard/tasks", "/dashboard/meetings", "/dashboard/chat",
  "/dashboard/notifications", "/dashboard/profile", "/dashboard/security", "/dashboard/access", "/dashboard/positions", "/dashboard/rules",
  "/dashboard/activity", "/dashboard/health", "/dashboard/settings", "/dashboard/reports", "/dashboard/lost-found", "/dashboard/forms", "/dashboard/contests",
  "/dashboard/forms/new", "/dashboard/email", "/dashboard/email/new", "/dashboard/certificates", "/dashboard/certificates/new", "/dashboard/sponsorships",
];

test("public pages fit a phone screen and the menu works", async ({ page }) => {
  for (const p of ["/", "/executives/2026", "/events", "/events?page=2", "/blog", "/contests", "/recruitment", "/contact", "/join", "/auth/login", "/auth/sign-up",
    "/forms", "/c", "/become-a-sponsor", "/sponsors/partner-with-gucc", "/email/unsubscribe"]) await noHorizontalOverflow(page, p);
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-nav").getByRole("link", { name: "Executives" }).click();
  await expect(page).toHaveURL(/\/executives/);
});

test("events come in numbered pages of 12", async ({ page }) => {
  await page.goto("/events");
  const pager = page.getByRole("navigation", { name: "Events pages" });
  const cards = page.locator("a[href^='/events/'] img");
  test.skip(!(await pager.isVisible()), "Needs more than 12 events in the data");
  await expect(cards).toHaveCount(12);
  await pager.getByRole("link", { name: "Page 2" }).click();
  await expect(page).toHaveURL(/\/events\?page=2$/);
  await expect(pager.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  // Back goes to page 1; a new search starts from page 1 too.
  await page.goBack();
  await expect(pager.getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  await page.goto("/events?page=2");
  await page.getByRole("searchbox", { name: "Search events" }).fill("a");
  // The search is kept in the address (shareable) and starts again from page 1.
  await expect(page).toHaveURL(/\/events\?q=a$/);
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page).toHaveURL(/\/events\?q=a&when=upcoming$/);
});

test("admin pages fit a phone screen, and the menu opens every section", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard");
  for (const p of DASHBOARD_PAGES) await noHorizontalOverflow(page, p);

  await page.goto("/dashboard");
  const menu = page.getByRole("button", { name: /^Dashboard menu/ });
  await expect(menu).toBeVisible();
  // The bar stays under the site header while the page scrolls (within the dashboard, above the footer).
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  await expect(menu).toBeInViewport();
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "GUCC Dashboard" });
  await expect(drawer).toBeVisible();
  await drawer.getByPlaceholder("Find a section…").fill("health");
  await drawer.getByRole("link", { name: "System health" }).click();
  await expect(page).toHaveURL(/\/dashboard\/health/);
  await expect(drawer).toBeHidden();
});

test.describe("small phones (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("the dashboard and public pages still fit", async ({ page }) => {
    test.setTimeout(240_000);
    for (const p of ["/", "/events", "/auth/sign-up"]) await noHorizontalOverflow(page, p);
    await login(page, MODERATOR.email, MODERATOR.password, "/dashboard");
    for (const p of ["/dashboard", "/dashboard/members", "/dashboard/approvals", "/dashboard/health", "/dashboard/settings", "/dashboard/security", "/dashboard/chat"]) await noHorizontalOverflow(page, p);
  });
});
