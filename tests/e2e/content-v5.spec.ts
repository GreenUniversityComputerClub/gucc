import { expect, test } from "@playwright/test";

test("the Services menu lists Lost & Found only, and the pages it dropped still open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Services/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("Lost & Found")).toBeVisible();
  await expect(menu.getByText("Class Scheduler")).toHaveCount(0);
  await expect(menu.getByText("Certificate Verification")).toHaveCount(0);
  for (const p of ["/scheduler", "/certificates/hacktheai/verify"]) expect((await page.goto(p))?.status(), p).toBe(200);
});

test("the home page shows Sagufta Sabah Nakshi among the Deputy Moderators", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Sagufta Sabah Nakshi")).toBeVisible();
  await expect(page.getByText("Feroza Naznin")).toHaveCount(0);
});
