import { expect, test } from "@playwright/test";
import { login, MODERATOR } from "./helpers";

async function noHorizontalOverflow(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test("public pages fit a phone screen and the menu works", async ({ page }) => {
  for (const p of ["/", "/executives/2026", "/events", "/blog", "/contests", "/recruitment", "/contact", "/join", "/auth/login", "/auth/sign-up"]) await noHorizontalOverflow(page, p);
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-nav").getByRole("link", { name: "Executives" }).click();
  await expect(page).toHaveURL(/\/executives/);
});

test("admin pages fit a phone screen", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard");
  for (const p of ["/dashboard", "/dashboard/members", "/dashboard/committees", "/dashboard/events", "/dashboard/media", "/dashboard/roles", "/dashboard/people"]) await noHorizontalOverflow(page, p);
});
