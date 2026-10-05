import { devices, expect, test } from "@playwright/test";
import { acceptConfirms, d1, login, MODERATOR, revalidate, settle } from "./helpers";

/**
 * Forms (round 9): a leader adds a Google Form in the dashboard; it gets a page, shows on /forms
 * while listed, keeps its old addresses (in any spelling), fills a phone's screen exactly, and
 * says so when it closes. The form's own address is never published: not in the page, not in a
 * link, and only handed to the page's own script while the form is open.
 */
const FORM_ID = "1FAIpQLSe2eFormsSpec";
const GOOGLE = "https://docs.google.com/forms/d/e/1FAIpQLSe2eFormsSpec/viewform?usp=sf_link";

test.afterAll(async ({ request }) => {
  d1("UPDATE external_forms SET deleted_at = '2026-01-01', slug = 'deleted-' || id WHERE title LIKE 'E2E %'");
  d1("DELETE FROM external_form_slugs WHERE form_id IN (SELECT id FROM external_forms WHERE title LIKE 'E2E %')");
  await revalidate(request, ["forms"]);
});

test("a leader adds a form; it gets a page and a place on /forms", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await acceptConfirms(page);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/forms/new");
  await page.getByLabel("Form link").fill(GOOGLE);
  await page.getByRole("textbox", { name: /^Title/ }).fill("E2E Club Survey");
  await expect(page.getByText(/\/forms\/e2e-club-survey/)).toBeVisible();
  await page.getByLabel("Description").fill("Tell us which workshops you want next term.");
  await page.getByText(/List it at \/forms/).click();
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/dashboard\/forms\/form_/);
  const id = page.url().split("/").pop()!;
  expect(d1<{ embed_url: string }>(`SELECT embed_url FROM external_forms WHERE id = '${id}'`)[0]?.embed_url).toBe("https://docs.google.com/forms/d/e/1FAIpQLSe2eFormsSpec/viewform?embedded=true");

  // Listed: on /forms, linking to its page.
  await revalidate(page.request, ["forms"]);
  const visitor = await browser.newPage();
  await visitor.goto("/forms");
  await visitor.getByRole("link", { name: /E2E Club Survey/ }).click();
  await expect(visitor).toHaveURL(/\/forms\/e2e-club-survey$/);
  await expect(visitor.getByRole("heading", { level: 1, name: "E2E Club Survey" })).toBeVisible();
  await expect(visitor.locator('iframe[title="E2E Club Survey"]')).toHaveAttribute("src", /embedded=true/);
  // No way to the original: no link or button, and no address anywhere in the page or the list.
  await expect(visitor.getByRole("link", { name: /google forms|open the form|original/i })).toHaveCount(0);
  await expect(visitor.getByText(/open in google/i)).toHaveCount(0);
  for (const path of ["/forms/e2e-club-survey", "/forms"]) {
    const html = await (await visitor.request.get(path)).text();
    expect(html).not.toContain(FORM_ID);
    expect(html).not.toMatch(/forms\.gle|viewform/);
  }
  // The address is handed only to the page's own script: not to a visit, another site or a script that doesn't say who it is.
  const frame = "/api/forms/e2e-club-survey/frame";
  expect((await visitor.request.get(frame)).status()).toBe(403);
  expect((await visitor.request.get(frame, { headers: { "X-Requested-With": "gucc-form", "Sec-Fetch-Site": "cross-site" } })).status()).toBe(403);
  expect((await visitor.request.get(frame, { headers: { "X-Requested-With": "gucc-form", "Sec-Fetch-Dest": "document" } })).status()).toBe(403);
  const given = await visitor.request.get(frame, { headers: { "X-Requested-With": "gucc-form" } });
  expect(given.headers()["cache-control"]).toContain("no-store");
  expect(await given.json()).toMatchObject({ state: "open", src: expect.stringContaining(FORM_ID) });

  // A new address: the old one (in any spelling) still leads here.
  await page.getByLabel("Address").fill("e2e-survey-2026");
  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText("Form saved.").first()).toBeVisible();
  await expect(page.getByText("/forms/e2e-club-survey")).toBeVisible();
  await revalidate(page.request, ["forms"]);
  await visitor.goto("/forms/E2E-Club-Survey");
  await expect(visitor).toHaveURL(/\/forms\/e2e-survey-2026$/);

  // Closed: the page says so instead of showing the form.
  await page.getByText("Taking answers").click();
  await page.getByLabel("Message when closed").fill("Thanks! Results at the next general meeting.");
  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText("Form saved.").first()).toBeVisible();
  await revalidate(page.request, ["forms"]);
  await visitor.goto("/forms/e2e-survey-2026");
  await expect(visitor.getByText("Thanks! Results at the next general meeting.")).toBeVisible();
  await expect(visitor.locator("iframe")).toHaveCount(0);
  // Closed: nothing is handed out either.
  const closed = await visitor.request.get("/api/forms/e2e-survey-2026/frame", { headers: { "X-Requested-With": "gucc-form" } });
  expect(await closed.json()).toEqual({ state: "closed" });
  await visitor.close();
});

test("on a phone the form fills the visible screen under a 48 px bar", async ({ browser }) => {
  d1(`INSERT INTO external_forms (id, slug, title, url, provider, embed_url, open_url, inspected_at, listed)
      VALUES ('form_e2e_phone', 'e2e-phone-form', 'E2E Phone Form', '${GOOGLE}', 'google',
              'https://docs.google.com/forms/d/e/1FAIpQLSe2eFormsSpec/viewform?embedded=true', 'https://docs.google.com/forms/d/e/1FAIpQLSe2eFormsSpec/viewform', '2026-10-01', 0)
      ON CONFLICT (id) DO NOTHING`);
  d1("INSERT INTO external_form_slugs (slug, form_id) VALUES ('e2e-phone-form', 'form_e2e_phone') ON CONFLICT DO NOTHING");
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  await page.goto("/forms/e2e-phone-form");
  await settle(page);
  const frame = page.locator('iframe[title="E2E Phone Form"]');
  await expect(frame).toBeVisible();
  const box = (await frame.boundingBox())!;
  const viewport = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(Math.abs(box.y - 48)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height - viewport)).toBeLessThanOrEqual(1);
  // Unlisted forms are shared by link only.
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await context.close();
});

const signInForm = (id: string, slug: string, title: string) => {
  d1(`INSERT INTO external_forms (id, slug, title, url, provider, embed_url, open_url, requires_sign_in, inspected_at, listed)
      VALUES ('${id}', '${slug}', '${title}', '${GOOGLE}', 'google',
              'https://docs.google.com/forms/d/e/${FORM_ID}/viewform?embedded=true', 'https://docs.google.com/forms/d/e/${FORM_ID}/viewform', 1, '2026-10-01', 0)
      ON CONFLICT (id) DO NOTHING`);
  d1(`INSERT INTO external_form_slugs (slug, form_id) VALUES ('${slug}', '${id}') ON CONFLICT DO NOTHING`);
};

test("a form that needs a Google account says so, and helps without ever showing its link", async ({ browser }) => {
  signInForm("form_e2e_signin", "e2e-signin-form", "E2E Sign-in Form");
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  await page.goto("/forms/e2e-signin-form");
  await settle(page);
  await expect(page.locator('iframe[title="E2E Sign-in Form"]')).toBeVisible();
  await expect(page.getByText("Needs your Google account")).toBeVisible();
  await page.getByRole("button", { name: "Trouble signing in?" }).click();
  const dialog = page.getByRole("dialog", { name: "Can't see the form?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sign in to your Google account in this browser")).toBeVisible();
  await expect(dialog.getByText("Prevent Cross-Site Tracking")).toBeVisible();
  // Only Google's own sign-in page: never the form.
  const links = await dialog.locator("a[href^='http']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(links).toEqual(["https://accounts.google.com/"]);
  expect(await (await page.request.get("/forms/e2e-signin-form")).text()).not.toContain(FORM_ID);
  await dialog.getByRole("button", { name: "Reload the form" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('iframe[title="E2E Sign-in Form"]')).toBeVisible();
  await context.close();
});

test("inside Facebook's browser a sign-in form asks to be opened in a real browser, and can still be tried", async ({ browser }) => {
  signInForm("form_e2e_signin", "e2e-signin-form", "E2E Sign-in Form");
  const context = await browser.newContext({ ...devices["Pixel 7"], userAgent: `${devices["Pixel 7"].userAgent} [FB_IAB/FB4A;FBAV/450.0.0.0;]` });
  const page = await context.newPage();
  await page.goto("/forms/e2e-signin-form");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Open this page in your browser" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in Chrome" })).toHaveAttribute("href", /^intent:\/\/.*e2e-signin-form.*package=com\.android\.chrome/);
  await expect(page.getByRole("button", { name: "Copy link to this page" })).toBeVisible();
  await page.getByRole("button", { name: "Try here anyway" }).click();
  await expect(page.locator('iframe[title="E2E Sign-in Form"]')).toBeVisible();
  await context.close();
});

test("the dashboard no longer offers to show or open the original link", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/forms/new");
  await page.getByLabel("Form link").fill(GOOGLE);
  await expect(page.getByText("Always open at Google")).toHaveCount(0);
  await expect(page.getByText(/never shown, linked or put in the page/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the form" })).toHaveCount(0);
});
