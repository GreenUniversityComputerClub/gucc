import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { d1, login, MODERATOR, settle } from "./helpers";

const run = Date.now().toString(36);
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => page.on("dialog", (d) => d.accept()));

test("leadership opens recruitment; an applicant applies with private documents; reviewers shortlist", async ({ page, browser }) => {
  // Only one recruitment can be open at a time; close any left by earlier runs.
  d1("UPDATE recruitment_campaigns SET status = 'CLOSED' WHERE status = 'OPEN'");
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/recruitment");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Create" }) });
  await form.getByLabel("Title").fill(`E2E Call for Executives ${run}`);
  const closes = new Date(Date.now() + 5 * 86400_000 + 6 * 3600_000).toISOString().slice(0, 16);
  await form.getByLabel("Closes (Dhaka time)").fill(closes);
  await form.getByLabel("Status").selectOption("OPEN");
  await form.getByLabel("Executive Member", { exact: true }).check();
  await form.getByLabel("Sports Secretary", { exact: true }).check();
  await form.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/dashboard\/recruitment\/rcp_/);
  const adminUrl = page.url();

  const visitor = await browser.newPage();
  await visitor.goto("/recruitment");
  await expect(visitor.getByRole("heading", { name: `E2E Call for Executives ${run}` })).toBeVisible();
  const img = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 10, g: 99, b: 128 } } }).jpeg().toBuffer();
  await visitor.getByLabel("Full Name").fill("Applicant Example");
  await visitor.getByLabel("Student ID").fill(String(230000000 + (Date.now() % 99999999)).slice(0, 9));
  // The form's own field ("Email *"), not the footer's "Email GUCC" link.
  await visitor.getByLabel(/^Email( \*)?$/).fill(`applicant-${run}@student.green.ac.bd`);
  await visitor.getByLabel("Mobile Number").fill("01712345678");
  await visitor.getByLabel("Male", { exact: true }).check({ force: true });
  await visitor.getByLabel("Current Semester").click();
  await visitor.getByRole("option", { name: "4th" }).click();
  await visitor.getByLabel("Batch").fill("232");
  await visitor.getByLabel("Current CGPA").fill("3.65");
  await visitor.getByLabel("Completed Credits").fill("72");
  await visitor.getByLabel("Your Preferred Position").click();
  await visitor.getByRole("option", { name: "Sports Secretary" }).click();
  const files = visitor.locator('input[type="file"]');
  await files.nth(0).setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
  await files.nth(1).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: img });
  await files.nth(2).setInputFiles({ name: "id.jpg", mimeType: "image/jpeg", buffer: img });
  await expect(visitor.getByRole("button", { name: "Remove" })).toHaveCount(3, { timeout: 45_000 });
  await visitor.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(visitor.getByText("Thank you for applying to GUCC!")).toBeVisible();
  await visitor.close();

  await page.goto(adminUrl);
  await settle(page);
  await page.getByRole("link", { name: /Applicant Example/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/recruitment\/applications\//);
  const cv = page.getByRole("link", { name: "Open CV (PDF)" });
  const href = await cv.getAttribute("href");
  expect(href).toMatch(/\?exp=\d+&sig=/);
  expect((await page.request.get(href!)).status()).toBe(200);
  // Without the signature the private file is not served.
  expect((await page.request.get(href!.split("?")[0])).status()).toBe(404);
  await page.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByText("shortlisted").first()).toBeVisible();
});

test("contact messages land in the admin inbox", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Name").fill(`Visitor ${run}`);
  await page.getByLabel("Email", { exact: true }).fill(`visitor-${run}@example.com`);
  await page.getByLabel("Message").fill("We would like to sponsor your next hackathon. Who should we talk to?");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText(/thanks/i).first()).toBeVisible();
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/messages");
  await expect(page.getByText(`Visitor ${run}`)).toBeVisible();
});
