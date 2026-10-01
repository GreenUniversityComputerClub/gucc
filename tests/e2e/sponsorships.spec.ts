import { expect, test } from "@playwright/test";
import { acceptConfirms, d1, login, MODERATOR, revalidate } from "./helpers";

/**
 * Sponsorship pages: the navbar's Sponsors link opens the default one (chosen in the dashboard);
 * /become-a-sponsor lists every active one with the default featured; changing the default
 * keeps the others public.
 */
const defaultSlug = () => d1<{ slug: string }>("SELECT slug FROM sponsorship_pages WHERE is_default = 1 AND deleted_at IS NULL")[0]?.slug;

test("the navbar's Sponsors link opens the default page; the overview features it", async ({ page }) => {
  const slug = defaultSlug();
  expect(slug).toBeTruthy();
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Sponsors" }).click();
  await expect(page).toHaveURL(new RegExp(`/sponsors/${slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Become");
  // Old links still work.
  await page.goto("/sponsors");
  await expect(page).toHaveURL(new RegExp(`/sponsors/${slug}$`));
  await page.goto("/become-a-sponsor");
  await expect(page.getByRole("heading", { level: 1, name: "Become a sponsor" })).toBeVisible();
  await expect(page.getByText("Featured")).toBeVisible();
});

test("a leader makes another page the default; the old one stays public", async ({ page }) => {
  test.setTimeout(180_000);
  const before = defaultSlug()!;
  await acceptConfirms(page);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/sponsorships");
  // A copy to promote (it starts hidden).
  await page.getByRole("button", { name: /^Duplicate / }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/sponsorships\/spn_/);
  const id = page.url().split("/").pop()!;
  await page.getByLabel("Title").fill("E2E Hackathon");
  await page.getByLabel("Address").fill("e2e-hackathon");
  await page.getByRole("button", { name: "Save page" }).click();
  await expect(page.getByText("Sponsorship page saved.").first()).toBeVisible();
  try {
    await page.goto("/dashboard/sponsorships");
    await page.getByRole("button", { name: "Make E2E Hackathon the default" }).click();
    await expect(page.getByText(/Default changed/).first()).toBeVisible();
    // At once, on every page: the navbar links to /sponsors, which follows the default per request
    // (a cached page's navbar can't point at the old default).
    expect((await page.request.get("/sponsors", { maxRedirects: 0 })).headers()["location"]).toBe("/sponsors/e2e-hackathon");
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Sponsors" }).click();
    await expect(page).toHaveURL(/\/sponsors\/e2e-hackathon$/);
    // The previous default is still public, and listed.
    expect((await page.goto(`/sponsors/${before}`))?.status()).toBe(200);
    await page.goto("/become-a-sponsor");
    await expect(page.getByRole("link", { name: /View opportunity/ }).first()).toBeVisible();
  } finally {
    d1(`UPDATE sponsorship_pages SET is_default = 0 WHERE id = '${id}'`);
    d1(`UPDATE sponsorship_pages SET is_default = 1, status = 'ACTIVE' WHERE slug = '${before}' AND deleted_at IS NULL`);
    d1(`UPDATE sponsorship_pages SET deleted_at = '2026-01-01', status = 'INACTIVE' WHERE id = '${id}'`);
    await revalidate(page.request, ["sponsorships"]);
  }
});

test("the general page names no event and asks for prices on request", async ({ page }) => {
  await page.goto("/sponsors/partner-with-gucc");
  await expect(page).toHaveTitle(/Partner with GUCC/);
  await expect(page.getByText("GUCC PARTNERSHIP").first()).toBeVisible();
  await expect(page.getByText("On request").first()).toBeAttached();
  await page.goto("/become-a-sponsor");
  await expect(page.getByRole("link", { name: /GUCC Partnership Program/ })).toBeVisible();
});

test("the editor edits sections without JSON and the preview follows unsaved edits", async ({ page, context }) => {
  test.setTimeout(180_000);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/sponsorships/spn_gucc_partnership");
  await expect(page.getByRole("heading", { name: "Checklist" })).toBeVisible();
  const preview = await context.newPage();
  await preview.goto("/sponsors/preview/spn_gucc_partnership");
  await expect(preview.getByRole("status").first()).toContainText("showing the saved page");

  await page.getByLabel("Short name (badge)").fill("E2E PARTNERS");
  await expect(preview.getByText("E2E PARTNERS").first()).toBeVisible({ timeout: 10_000 });
  await expect(preview.getByRole("status").first()).toContainText("showing unsaved edits");

  // A package with a duplicate tier shows up in the checklist straight away.
  await page.getByRole("tab", { name: /^Packages/ }).click();
  await page.getByRole("button", { name: "Add a package" }).click();
  await page.getByRole("combobox", { name: "Tier" }).last().fill("Gold Sponsor");
  await expect(page.getByText("Two packages share a tier name.")).toBeVisible();
  // Leaving without saving: nothing changed on the site.
  await page.goto("/sponsors/partner-with-gucc");
  await expect(page.getByText("E2E PARTNERS")).toHaveCount(0);
});
