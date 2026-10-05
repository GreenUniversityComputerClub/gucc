import { expect, test } from "@playwright/test";
import { d1, login, MODERATOR, openMemberSheet, settle, acceptConfirms } from "./helpers";

/**
 * Leadership tools end to end: importing executives from a file (preview, resolve, import,
 * verify, public page), bulk changes with a preview, and administrator-issued reset links.
 */
const run = Date.now().toString(36);
const stamp = String(Date.now()).slice(-6);
const sid = (i: number) => `29${stamp}${i}`;
const one = `Import One ${run}`;
const two = `Import Two ${run}`;
const committeeId = () => d1<{ id: string }>("SELECT id FROM committees WHERE status = 'CURRENT'")[0].id;

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await acceptConfirms(page);
});

test("executives import from JSON: preview, resolve, import, verify, public page", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const file = JSON.stringify([
    { name: one, studentId: sid(1), position: "Executive Member", committee: "2026", unit: "gucc" },
    { name: two, studentId: sid(2), position: "Chief Wizard", committee: "2026", unit: "css" },
    { name: one, studentId: sid(1), position: "Executive Member", committee: "2026", unit: "gucc" },
  ]);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/committees/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "executives.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Positions GUCC doesn't have yet")).toBeVisible();
  await expect(page.getByText("Same person and position as row 1; skipped.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  expect(d1(`SELECT id FROM profiles WHERE full_name = '${one}'`)).toHaveLength(0);

  await page.getByLabel("Position for Chief Wizard").selectOption({ label: "Executive Member" });
  await page.getByRole("button", { name: "Preview again" }).first().click();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Verified: all 2 new listings and 2 new people/)).toBeVisible();
  expect(d1<{ n: number }>(`SELECT COUNT(*) AS n FROM profiles WHERE full_name IN ('${one}', '${two}')`)[0].n).toBe(2);
  expect(d1<{ action: string }>("SELECT action FROM audit_logs WHERE action = 'executives.import' ORDER BY created_at DESC LIMIT 1")).toHaveLength(1);

  // The public committee page refreshes on its own.
  const visitor = await browser.newPage();
  await expect(async () => {
    await visitor.goto("/executives/2026");
    await expect(visitor.getByText(one).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  await visitor.close();
});

test("bulk changes: end two listings after previewing them", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, `/dashboard/committees/${committeeId()}`);
  await page.getByLabel(`Select ${one}`).check();
  await page.getByLabel(`Select ${two}`).check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByLabel("Bulk action").selectOption({ label: "End assignments (kept in history)" });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("End assignments (they stay in the committee's history)")).toBeVisible();
  await page.getByRole("button", { name: "Apply to 2 listings" }).click();
  await expect(page.getByText(/2 listings changed/)).toBeVisible({ timeout: 20_000 });
  const ended = d1<{ n: number }>(`SELECT COUNT(*) AS n FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id WHERE p.full_name IN ('${one}', '${two}') AND cm.end_date IS NOT NULL`);
  expect(ended[0].n).toBe(2);
});

test("an administrator's one-time reset link lets a member set a new password", async ({ page, browser }) => {
  const email = `reset-${run}@student.green.ac.bd`;
  d1(`INSERT INTO users (id, email, status) VALUES ('usr_reset_${run}', '${email}', 'ACTIVE')`);
  d1(`INSERT INTO profiles (id, user_id, full_name) VALUES ('prf_reset_${run}', 'usr_reset_${run}', 'Reset Member ${run}')`);
  await login(page, MODERATOR.email, MODERATOR.password, `/dashboard/members?status=ACTIVE&q=${encodeURIComponent(email)}`);
  const sheet = await openMemberSheet(page, email);
  await sheet.getByRole("button", { name: "Password reset link" }).click();
  const link = await page.locator("code").filter({ hasText: "/auth/update-password?token=" }).innerText();
  const url = new URL(link);

  const member = await browser.newPage();
  await member.goto(`${url.pathname}${url.search}`);
  await settle(member);
  await member.getByLabel("New password", { exact: true }).fill(`Fresh-Start-${run}-4!`);
  const repeat = member.getByLabel(/Repeat|Confirm/);
  if (await repeat.count()) await repeat.first().fill(`Fresh-Start-${run}-4!`);
  await member.getByRole("button", { name: /Save|Update|Set/ }).click();
  await member.waitForURL((u) => !u.pathname.startsWith("/auth/update-password"), { timeout: 20_000 });
  await login(member, email, `Fresh-Start-${run}-4!`);
  await expect(member).not.toHaveURL(/\/auth\/login/);
  // The link works once.
  await member.goto(`${url.pathname}${url.search}`);
  await member.close();
  expect(d1<{ n: number }>(`SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = 'usr_reset_${run}' AND used_at IS NULL`)[0].n).toBe(0);
});
