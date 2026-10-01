import { expect, test } from "@playwright/test";
import { d1, revalidate } from "./helpers";

/**
 * Where people's pages live: /executives opens the latest committee; an executive with an account
 * is at their member page (their executive page and their student ID both lead there); a profile
 * that doesn't exist answers 404 (not a page that says so with 200).
 */

test("/executives opens the latest committee", async ({ page }) => {
  const latest = d1<{ slug: string }>("SELECT slug FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL")[0]?.slug;
  await page.goto("/executives");
  await expect(page).toHaveURL(latest ? new RegExp(`/executives/${latest}$`) : /\/executives\/\d{4}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("GUCC Executives");
});

test("an executive with an account is at their member page", async ({ page, request }) => {
  const person = d1<{ id: string; student_id: string; full_name: string }>(
    `SELECT p.id, p.student_id, p.full_name FROM profiles p JOIN committee_members cm ON cm.profile_id = p.id AND cm.deleted_at IS NULL
     WHERE p.student_id IS NOT NULL AND p.user_id IS NULL AND p.deleted_at IS NULL AND p.merged_into_id IS NULL ORDER BY p.student_id LIMIT 1`)[0];
  test.skip(!person, "No imported executive with a student ID in this database.");
  const userId = `usr_e2e_profile_${person!.student_id}`;
  const now = new Date().toISOString();
  d1(`INSERT INTO users (id, email, password_hash, status, email_verified_at, approved_at, created_at, updated_at)
      VALUES ('${userId}', 'exec-${person!.student_id}@student.green.ac.bd', 'x', 'ACTIVE', '${now}', '${now}', '${now}', '${now}') ON CONFLICT(id) DO NOTHING`);
  d1(`UPDATE profiles SET user_id = '${userId}' WHERE id = '${person!.id}'`);
  try {
    await revalidate(request, ["committees"]);
    // Their executive page leads to their member page, with their name and roles.
    await page.goto(`/executives/${person!.student_id}`);
    await expect(page).toHaveURL(/\/members\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(person!.full_name);
    await expect(page.getByRole("heading", { name: "Club journey" })).toBeVisible();
    const memberUrl = new URL(page.url()).pathname;
    // Their student ID finds them too (imported executives' addresses are their student IDs;
    // others get a permanent redirect to their readable address).
    const byId = await request.get(`/members/${person!.student_id}`);
    expect(byId.status()).toBe(200);
    expect(new URL(byId.url()).pathname).toBe(memberUrl);
  } finally {
    d1(`UPDATE profiles SET user_id = NULL WHERE id = '${person!.id}'`);
    d1(`DELETE FROM users WHERE id = '${userId}'`);
    await revalidate(request, ["committees"]);
  }
});

test("a profile that doesn't exist is a real 404", async ({ request }) => {
  expect((await request.get("/members/no-such-person-anywhere")).status()).toBe(404);
  // An ordinary member's student ID never finds them (only executives are public by student ID).
  expect((await request.get("/members/239999999")).status()).toBe(404);
});
