import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { acceptConfirms, d1, ensureMember, login, MODERATOR } from "./helpers";

/**
 * Announcement emails (round 9): a leader writes one with a live audience count and a preview,
 * queues it, pauses, resumes and cancels it; a member's unsubscribe link (the page and the
 * one-click POST mail apps use) switches their "Club announcements" choice off and on.
 * (The local API prints emails instead of sending them, so nothing is delivered here.)
 */
const run = Date.now().toString(36);
const MEMBER = { email: `cmp-${run}@student.green.ac.bd`, name: `Campaign Reader ${run}`, password: "Round-nine-pass-2026!" };

/** A signed unsubscribe link, made the way the API makes them (same secret as the local API). */
function unsubscribeToken(email: string, userId: string): string {
  const secret = readFileSync(".env.local", "utf8").match(/^AUTH_SECRET=(.+)$/m)?.[1]?.trim() ?? "";
  const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const e = createHash("sha256").update(`gucc-unsub:${email.toLowerCase()}`).digest("hex");
  const body = b64(Buffer.from(JSON.stringify({ p: "unsub", e, u: userId, c: "announcements", exp: Math.floor(Date.now() / 1000) + 3600 })));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}
const choice = (userId: string) => d1<{ email: number }>(`SELECT email FROM notification_preferences WHERE user_id = '${userId}' AND category = 'announcements'`)[0]?.email;

test("a leader queues an announcement email, then pauses, resumes and cancels it", async ({ page }) => {
  test.setTimeout(180_000);
  await ensureMember(MEMBER.email, MEMBER.name, MEMBER.password);
  await acceptConfirms(page);
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/email/new");
  await expect(page.getByText(/\d+ people/).first()).toBeVisible();
  await page.getByRole("textbox", { name: /^Subject/ }).fill(`E2E general meeting ${run}`);
  await page.getByRole("textbox", { name: /^Message/ }).fill("Friday at 3 PM in room 402.\n\nBring your ideas.");
  await page.getByRole("textbox", { name: "Button", exact: true }).fill("Details");
  await page.getByRole("textbox", { name: "Button link" }).fill("/events");
  // The preview shows the email as members get it.
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText(`E2E general meeting ${run}`)).toBeVisible();
  await page.getByRole("button", { name: /^Queue email/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/email\/cmp_/);
  await expect(page.getByRole("heading", { level: 1, name: `E2E general meeting ${run}` })).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  // Listed with its progress.
  await page.goto("/dashboard/email");
  await expect(page.getByRole("link", { name: new RegExp(`E2E general meeting ${run}`) })).toBeVisible();
});

test("the unsubscribe link: a confirm button (scanners only open links), resubscribe, and the one-click POST", async ({ page, request }) => {
  const userId = await ensureMember(MEMBER.email, MEMBER.name, MEMBER.password);
  const token = unsubscribeToken(MEMBER.email, userId);
  await page.goto(`/email/unsubscribe?t=${encodeURIComponent(token)}`);
  expect(choice(userId)).not.toBe(0);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
  expect(choice(userId)).toBe(0);
  await page.getByRole("button", { name: "Resubscribe" }).click();
  await expect(page.getByRole("heading", { name: /get club announcements again/ })).toBeVisible();
  expect(choice(userId)).toBe(1);

  const res = await request.post(`/api/email/unsubscribe?t=${encodeURIComponent(token)}`, { form: { "List-Unsubscribe": "One-Click" } });
  expect(res.status()).toBe(200);
  expect(choice(userId)).toBe(0);
  expect((await request.post("/api/email/unsubscribe?t=forged.token", { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(400);
});
