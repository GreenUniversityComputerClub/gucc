import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { acceptConfirms, d1, ensureMember, login, MODERATOR, revalidate } from "./helpers";

/**
 * Certificates (round 9): a leader issues certificates from typed names (a member is matched by
 * email), with a design and a live preview; each gets a page with its own code that says it's
 * genuine, downloads as a real PDF, and says so when revoked. Codes typed loosely still work.
 */
const run = Date.now().toString(36);
const HOLDER = { email: `cert-${run}@student.green.ac.bd`, name: `Certified Person ${run}`, password: "Round-nine-pass-2026!" };

test("issue → verify → download a PDF → revoke", async ({ page, context }) => {
  test.setTimeout(240_000);
  await ensureMember(HOLDER.email, HOLDER.name, HOLDER.password);
  await acceptConfirms(page);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/certificates/new");

  await page.getByRole("radio", { name: "Type names" }).click();
  await page.getByLabel("People, one per line").fill(`${HOLDER.name}, ${HOLDER.email}, Volunteer\nE2E Guest ${run}, guest-${run}@mail.com`);
  await page.getByRole("button", { name: "Check names" }).click();
  await expect(page.getByText("Linked to a member profile")).toBeVisible();
  await page.getByLabel(/What it's for/).fill(`E2E Workshop ${run}`);
  await page.getByRole("button", { name: /Emerald Prestige/ }).click();
  // The preview shows the first person.
  await expect(page.getByRole("img", { name: new RegExp(`presented to ${HOLDER.name}`) }).last()).toBeVisible();
  await page.getByRole("button", { name: "Issue 2 certificates" }).click();
  await expect(page).toHaveURL(/\/dashboard\/certificates\/batches\/cbat_/);

  const code = d1<{ code: string }>(`SELECT code FROM certificates WHERE recipient_name = '${HOLDER.name}'`)[0]!.code;
  // A typo is explained; a loosely typed code finds it.
  await page.goto("/c");
  await page.getByLabel("Certificate code").fill("GUCC-1234");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#code-error")).toContainText("isn't a certificate code");
  await page.getByLabel("Certificate code").fill(`gucc-${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${code}$`));
  // Without JavaScript the form goes through /c/go.
  expect((await page.request.get(`/c/go?code=${code.toLowerCase()}`, { maxRedirects: 0 })).headers().location).toMatch(new RegExp(`/c/${code}$`));
  await expect(page.getByText("Verified: a genuine GUCC certificate")).toBeVisible();
  await expect(page.getByRole("img", { name: new RegExp(`presented to ${HOLDER.name}`) })).toBeVisible();
  // The member's notice links here.
  expect(d1<{ link: string }>(`SELECT n.link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = '${HOLDER.email}' AND n.type = 'certificate.issued'`)[0]?.link).toBe(`/c/${code}`);

  // A real PDF, made in the browser.
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByRole("button", { name: "PDF" }).click()]);
  const file = await download.path();
  expect(readFileSync(file!).subarray(0, 4).toString()).toBe("%PDF");
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  // Revoked: its page says so.
  const certId = d1<{ id: string }>(`SELECT id FROM certificates WHERE code = '${code}'`)[0]!.id;
  const batch = page.url();
  await page.goto(batch.includes("/batches/") ? batch : `/dashboard/certificates`);
  await page.goto(`/dashboard/certificates/batches/${d1<{ batch_id: string }>(`SELECT batch_id FROM certificates WHERE id = '${certId}'`)[0]!.batch_id}`);
  const row = page.getByRole("listitem").filter({ hasText: HOLDER.name });
  await row.getByText("Correct or revoke").click();
  await row.getByLabel(/Why/).fill("Issued by mistake");
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoked: Issued by mistake")).toBeVisible();
  await revalidate(page.request, ["certificates", `cert:${code}`]);
  const visitor = await context.browser()!.newPage();
  await visitor.goto(`/c/${code}`);
  await expect(visitor.getByText("This certificate was revoked")).toBeVisible();
  await visitor.close();
});

test("old certificate links go to the executive page when there's no certificate", async ({ request }) => {
  const res = await request.get("/executives/certs/999999999", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toBe("/executives/999999999");
});
