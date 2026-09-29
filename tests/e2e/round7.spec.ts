import { expect, test } from "@playwright/test";
import { acceptConfirms, d1, ensureMember, login, MODERATOR } from "./helpers";

/**
 * Round 7 end to end: photos everywhere (chat and notifications), reporting and blocking in chat,
 * notifications that clear themselves, member profiles and the directory, member blog posts with
 * reviewer approval, the contact form's "sent" panel, and one menu at a time on phones.
 */
const run = Date.now().toString(36);
const A = { email: `r7a-${run}@student.green.ac.bd`, name: `Anika ${run}`, password: "Round-seven-pass-2026!" };
const B = { email: `r7b-${run}@student.green.ac.bd`, name: `Babul ${run}`, password: "Round-seven-pass-2026!" };

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => acceptConfirms(page));

test("messages: photo, send once, report with a reason, block and unblock", async ({ page }) => {
  test.setTimeout(180_000);
  await ensureMember(A.email, A.name, A.password);
  const bId = await ensureMember(B.email, B.name, B.password);
  // Babul has a photo: it must show in Anika's chat.
  const photo = d1<{ id: string }>("SELECT id FROM media WHERE visibility = 'PUBLIC' AND status = 'READY' AND media_type = 'IMAGE' AND deleted_at IS NULL LIMIT 1")[0]?.id;
  if (photo) d1(`UPDATE profiles SET avatar_media_id = '${photo}' WHERE user_id = '${bId}'`);

  await login(page, A.email, A.password, `/dashboard/chat?to=${bId}`);
  await page.getByRole("textbox", { name: /^Message/ }).fill("Hello from the round 7 test");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/dashboard\/chat\/cnv_/);
  const composer = page.getByLabel(new RegExp(`Message to ${B.name}`));
  await composer.fill("Second message");
  await composer.press("Enter");
  await composer.press("Enter");
  await expect(page.getByText("Second message")).toHaveCount(1);
  if (photo) await expect(page.locator("header img").first()).toBeVisible();
  const conversation = page.url();

  // Babul reports Anika's message with a category; a clear confirmation appears.
  await login(page, B.email, B.password, conversation.replace(/^https?:\/\/[^/]+/, ""));
  await page.getByRole("button", { name: "Message options" }).first().click();
  await page.getByRole("menuitem", { name: "Report" }).click();
  const report = page.getByRole("dialog", { name: "Report this message" });
  await report.getByLabel("Spam").check();
  await report.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thank you for reporting")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  expect(d1<{ n: number }>(`SELECT COUNT(*) n FROM reports WHERE category = 'SPAM' AND reporter_id = '${bId}'`)[0]!.n).toBe(1);

  // Block from the conversation menu; unblock from Message settings.
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Block ${A.name}`) }).click();
  await expect(page.getByText(`You blocked ${A.name}.`)).toBeVisible();
  await page.goto("/dashboard/chat");
  const blocked = page.getByRole("heading", { name: "Blocked people" }).locator("xpath=ancestor::section[1]");
  await expect(blocked.getByText(A.name)).toBeVisible();
  await blocked.getByRole("button", { name: "Unblock" }).click();
  await expect(blocked.getByText(/Unblocked/)).toBeVisible();
});

test("notifications: opening the page they point to clears them; the list marks what you look at", async ({ page }) => {
  await login(page, B.email, B.password, "/dashboard/notifications");
  // Anika's first message left Babul a notice with her name.
  const unread = d1<{ n: number }>(`SELECT COUNT(*) n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = '${B.email}' AND n.read_at IS NULL`)[0]!.n;
  if (unread > 0) {
    await expect.poll(() => d1<{ n: number }>(`SELECT COUNT(*) n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = '${B.email}' AND n.read_at IS NULL`)[0]!.n, { timeout: 10_000 }).toBe(0);
  }
  await expect(page.getByText(/All caught up|You're all caught up/)).toBeVisible();
});

test("profiles: a member's page shows to members, private data never shows, and the directory finds them", async ({ page }) => {
  await login(page, A.email, A.password, "/dashboard/profile");
  await page.getByLabel("About you").fill("I like robots and good coffee.");
  await page.getByRole("button", { name: "Save profile" }).click();
  // The page reloads after saving; the message shows once it has.
  await expect(page.getByText("Profile saved.").first()).toBeVisible();
  await page.getByRole("link", { name: "Your page" }).click();
  await expect(page).toHaveURL(/\/members\/anika-/);
  await expect(page.getByRole("heading", { name: A.name })).toBeVisible();
  await expect(page.getByText("I like robots and good coffee.")).toBeVisible();
  await expect(page.getByText(A.email)).toHaveCount(0);
  const profileUrl = page.url().replace(/^https?:\/\/[^/]+/, "");

  // Signed out: members-only by default.
  await page.context().clearCookies();
  await page.goto(profileUrl);
  await expect(page.getByRole("link", { name: "Sign in to view" })).toBeVisible();

  await login(page, B.email, B.password, `/members?q=${encodeURIComponent(A.name)}`);
  await expect(page.getByRole("link", { name: new RegExp(A.name) })).toBeVisible();
});

test("a public member page is ready for search and link previews", async ({ page }) => {
  d1(`UPDATE profiles SET visibility = 'PUBLIC' WHERE user_id = (SELECT id FROM users WHERE email = '${A.email}')`);
  const handle = d1<{ slug: string }>(`SELECT slug FROM profiles WHERE user_id = (SELECT id FROM users WHERE email = '${A.email}')`)[0]!.slug;
  await page.context().clearCookies();
  await page.goto(`/members/${handle}`);
  await expect(page.getByRole("heading", { name: A.name })).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/api\/og\?/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "profile");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/members/${handle}$`));
  expect(await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "")).not.toContain("noindex");
  expect(await page.locator('script[type="application/ld+json"]').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('"ProfilePage"')]));
});

test("a member writes a blog post; a reviewer approves it from the queue", async ({ page }) => {
  test.setTimeout(180_000);
  const title = `A member's post ${run}`;
  await login(page, A.email, A.password, "/dashboard/posts/new?type=BLOG");
  await page.getByRole("textbox", { name: /^Title/ }).fill(title);
  await page.getByLabel("Body").fill("What I learned at the GUCC workshop this week, in a few paragraphs.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/posts\/post_/);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/Waiting for approval/)).toBeVisible();

  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/approvals");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title }).last()).toBeVisible();
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page).toHaveURL(/\/dashboard\/approvals/);
  expect(d1<{ status: string }>(`SELECT status FROM posts WHERE title = '${title.replace(/'/g, "''")}'`)[0]!.status).toBe("PUBLISHED");
});

test("an executive page shows the person's current profile photo, in past years too", async ({ page }) => {
  // Two different public photos: an old copy on a past listing, and the profile's current one.
  const old = { id: `med_e2e_old_${run}`, object_key: `media/e2e/${run}/old.webp` };
  const current = { id: `med_e2e_new_${run}`, object_key: `media/e2e/${run}/new.webp` };
  for (const m of [old, current]) {
    d1(`INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, visibility, status) VALUES ('${m.id}', 'R2', 'public', '${m.object_key}', 'p.webp', 'image/webp', 'IMAGE', 'PUBLIC', 'READY')`);
  }
  const sid = `99${run.replace(/\D/g, "").padEnd(7, "7").slice(0, 7)}`;
  d1(`INSERT INTO profiles (id, full_name, person_type, student_id, avatar_media_id) VALUES ('prf_e2e_${run}', 'Past Executive ${run}', 'STUDENT', '${sid}', '${current.id}')`);
  d1("INSERT OR IGNORE INTO committees (id, slug, name, term_label, status) VALUES ('cmt_e2e_1999', '1999', 'GUCC 1999', '1999', 'ARCHIVED')");
  d1(`INSERT INTO committee_members (id, committee_id, profile_id, position_id, position_title, section, display_order, avatar_media_id)
      VALUES ('cm_e2e_${run}', 'cmt_e2e_1999', 'prf_e2e_${run}', 'pos:executive-member', 'Executive Member', 'STUDENT', 0, '${old.id}')`);
  // Rows written straight to the database don't refresh the cached pages; a profile save does
  // (it refreshes everything that shows people), exactly as a real photo change would.
  await login(page, A.email, A.password, "/dashboard/profile");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.").first()).toBeVisible();
  await expect.poll(async () => (await page.goto(`/executives/${sid}`))?.status(), { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBe(200);
  const portrait = page.getByAltText(new RegExp(`Past Executive ${run}`)).first();
  // (The test files don't exist in storage, so the image itself may not load; its address is what matters.)
  await portrait.waitFor({ state: "attached" });
  // Through the image optimizer the file's address is URL-encoded inside the src.
  const src = (await portrait.getAttribute("src")) ?? "";
  const shows = (key: string) => src.includes(key) || src.includes(encodeURIComponent(key));
  expect(shows(current.object_key)).toBe(true);
  expect(shows(old.object_key)).toBe(false);
});

test("contact: a clear 'Message sent' panel, and another message can follow", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("textbox", { name: "Name" }).fill("Round Seven");
  await page.getByRole("textbox", { name: "Email" }).fill(`visitor-${run}@example.com`);
  await page.getByRole("textbox", { name: "Message" }).fill("Hello GUCC, this is a test message from the browser suite.");
  await page.getByRole("button", { name: "Send Message" }).click();
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  await page.getByRole("button", { name: "Send another message" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
});

test.describe("phones: one menu at a time", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the site menu closes on navigation, and the dashboard shows a single menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#mobile-nav").getByRole("link", { name: "Events" }).click();
    await expect(page).toHaveURL(/\/events/);
    await expect(page.locator("#mobile-nav")).toHaveCount(0);

    await login(page, A.email, A.password, "/dashboard");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
    await page.getByRole("button", { name: /^Dashboard menu/ }).click();
    const drawer = page.getByRole("dialog", { name: "GUCC Dashboard" });
    // The website's pages are in the dashboard menu, since the header shows no menu of its own here.
    await expect(drawer.getByText("Website", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Contact us" })).toBeVisible();
  });
});
