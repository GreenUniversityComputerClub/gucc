import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { d1, login, mailLink, memberRow, MODERATOR, openMemberSheet, settle, signUp, acceptConfirms } from "./helpers";

/**
 * One story through the platform, exercising each hierarchy level:
 * public visitor → applicants → Moderator → President → Publication Secretary
 * → new executive (invited) → normal member.
 */
const run = Date.now().toString(36);
const pres = { name: `E2E President ${run}`, email: `pres-${run}@student.green.ac.bd`, password: `Leader-${run}-Secret-9!` };
const pub = { name: `E2E Publisher ${run}`, email: `pub-${run}@student.green.ac.bd`, password: `Writer-${run}-Secret-7!` };
const member = { name: `E2E Member ${run}`, email: `mem-${run}@student.green.ac.bd`, password: `Member-${run}-Secret-5!` };
const newExec = { name: `E2E Sports Lead ${run}`, email: `sports-${run}@green.edu.bd`, password: `Field-Day-${run}-Pass-3!` };
const postTitle = `E2E results post ${run}`;
const eventTitle = `E2E Workshop ${run}`;
const committeeId = () => d1<{ id: string }>("SELECT id FROM committees WHERE status = 'CURRENT'")[0].id;

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await acceptConfirms(page);
  if (process.env.E2E_DEBUG) {
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().includes("Failed to load resource") && console.log("CONSOLE", m.type(), m.text().slice(0, 500)));
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    page.on("response", (r) => r.request().method() === "POST" && console.log("POST", r.status(), r.url().slice(0, 90)));
  }
});

/** Add someone through the committee page's "Add executive" dialog. */
async function addExecutive(page: Page, opts: { search?: string; newName?: string; position: string; inviteEmail?: string }) {
  await page.goto(`/dashboard/committees/${committeeId()}`);
  await settle(page);
  await page.getByRole("button", { name: "Add executive" }).click();
  const dialog = page.getByRole("dialog");
  if (opts.search) {
    await dialog.getByPlaceholder("Search by name, student ID or email").fill(opts.search);
    await dialog.getByRole("option", { name: new RegExp(opts.search) }).first().click();
  } else {
    await dialog.getByRole("radio", { name: "New person" }).click();
    await dialog.getByLabel("Full name").fill(opts.newName!);
  }
  if (opts.inviteEmail) await dialog.getByLabel("Invite by email (optional)").fill(opts.inviteEmail);
  await dialog.getByLabel("Position *").selectOption({ label: opts.position });
  await expect(dialog.getByText(`${opts.position} can:`)).toBeVisible();
  await dialog.getByRole("button", { name: "Add to committee" }).click();
  return dialog;
}

test("public site renders database content; admin needs a session", async ({ page }) => {
  await page.goto("/executives/2026");
  await expect(page.getByRole("heading", { name: "GUCC Executives 2026" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "GUCC" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "CSS" })).toBeVisible();
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "GUCC Events" })).toBeVisible();
  await page.goto("/contests/2");
  await expect(page.getByText("BUET CSE FEST 2022").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fdashboard/);
});

test("applicants register, verify their email and wait for approval", async ({ page }) => {
  for (const u of [pres, pub, member]) {
    await signUp(page, u);
    await page.goto(await mailLink(u.email, "/auth/confirm?token="));
    await expect(page).toHaveURL(/verified=pending/);
  }
  await login(page, member.email, member.password);
  await expect(page).toHaveURL(/\/dashboard\/profile/);
  await expect(page.getByText("awaiting GUCC approval")).toBeVisible();
  // Applicants use the dashboard too, but only their own section.
  await page.goto("/dashboard");
  await expect(page.locator("#admin-main").getByText("Your membership is awaiting approval")).toBeVisible();
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
});

test("Moderator approves members and appoints a new President", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/members?status=PENDING_APPROVAL");
  for (const u of [pres, pub, member]) {
    const sheet = await openMemberSheet(page, u.email);
    await sheet.getByRole("button", { name: "Approve", exact: true }).click();
    await acceptConfirms(page);
    await expect(page.locator("tr, li").filter({ hasText: u.email }).filter({ visible: true })).toHaveCount(0);
  }
  // End the sitting President's assignment (history is kept), then appoint ours.
  await page.goto(`/dashboard/committees/${committeeId()}`);
  await settle(page);
  const sitting = page.locator("li:not(.opacity-60)").filter({ has: page.getByText("President", { exact: true }) });
  for (let i = 0; i < 3 && (await sitting.count()) > 0; i++) {
    const before = await sitting.count();
    const row = sitting.first();
    await row.getByText("More").click();
    await row.getByRole("button", { name: "End assignment" }).click();
    await expect.poll(() => sitting.count(), { timeout: 15_000 }).toBeLessThan(before);
  }
  const dialog = await addExecutive(page, { search: pres.name, position: "President" });
  await expect(dialog).toBeHidden();
  await expect(page.locator("li", { hasText: pres.name })).toBeVisible();
});

test("President adds executives; self-assignment is refused", async ({ page }) => {
  await login(page, pres.email, pres.password, "/dashboard");
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  const own = await addExecutive(page, { search: pres.name, position: "Treasurer" });
  await expect(own.getByRole("alert")).toContainText("own position");
  await page.keyboard.press("Escape");

  await addExecutive(page, { search: pub.name, position: "Publication Secretary" });
  await expect(page.locator("#admin-main li", { hasText: pub.name })).toBeVisible();

  // A brand-new person without an account, invited in the same step.
  await addExecutive(page, { newName: newExec.name, position: "Sports Secretary", inviteEmail: newExec.email });
  const row = page.locator("#admin-main li", { hasText: newExec.name });
  await expect(row).toBeVisible();
  await expect(row.getByText("invited")).toBeVisible();
  // Publicly visible within moments (the cached page is refreshed right after the save).
  await expect.poll(async () => {
    await page.goto("/executives/2026");
    return page.getByText(newExec.name).count();
  }, { timeout: 30_000, intervals: [1000, 2000, 3000] }).toBeGreaterThan(0);
});

test("the invited executive activates their account and gets the position's access", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(await mailLink(newExec.email, "/auth/accept-invite?token="));
  await page.getByLabel("New password", { exact: true }).fill(newExec.password);
  await page.getByLabel("Repeat password").fill(newExec.password);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile\?welcome=1/);
  await expect(page.getByText("Sports Secretary").first()).toBeVisible();
  await page.goto("/dashboard/events/new");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
});

test("Publication Secretary's post needs approval", async ({ page }) => {
  await login(page, pub.email, pub.password, "/dashboard/posts/new?type=BLOG");
  await expect(page.getByRole("link", { name: "Roles & permissions" })).toHaveCount(0);
  await page.getByLabel("Title").first().fill(postTitle);
  await page.getByLabel("Category").fill("Club News");
  await page.getByLabel("Body", { exact: true }).fill("## We did it\n\nGUCC teams placed well. <script>alert(1)</script>");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/posts\/post_/);
  await expect(page.getByText("requires approval under \"Publication Approval\"").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
});

test("President approves; the post goes live and is safely rendered", async ({ page }) => {
  await login(page, pres.email, pres.password, "/dashboard/approvals");
  await page.getByRole("link", { name: new RegExp(postTitle) }).click();
  await expect(page).toHaveURL(/\/dashboard\/approvals\/apr_/);
  // The post is shown inline; approving publishes it and moves on to the next request.
  await expect(page.getByRole("heading", { name: "The post, as it will appear" })).toBeVisible();
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByText("Request approved.")).toBeVisible();
  await expect.poll(() => d1<{ status: string }>(`SELECT status FROM posts WHERE title = '${postTitle}'`)[0].status).toBe("PUBLISHED");
  const slug = d1<{ slug: string }>(`SELECT slug FROM posts WHERE title = '${postTitle}'`)[0].slug;
  const response = await page.goto(`/blog/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: postTitle })).toBeVisible();
  expect(await page.content()).not.toContain("<script>alert(1)</script>");
});

test("President creates and activates a governance rule", async ({ page }) => {
  await login(page, pres.email, pres.password, "/dashboard/rules");
  const builder = page.locator("form", { has: page.getByRole("button", { name: "Create draft rule" }) });
  await builder.getByLabel("Rule name").fill(`E2E sports approval ${run}`);
  await builder.getByLabel("Value").first().fill("sports-secretary");
  await builder.locator("#effect").selectOption("REQUIRE_APPROVAL");
  await builder.getByLabel("Permission").selectOption("events.publish");
  await builder.getByRole("button", { name: "Create draft rule" }).click();
  const card = page.locator("div.rounded-xl", { hasText: `E2E sports approval ${run}` }).last();
  await expect(card.getByText("draft", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Activate" }).click();
  await expect(page.locator("div.rounded-xl", { hasText: `E2E sports approval ${run}` }).last().getByText("active", { exact: true })).toBeVisible();
});

test("media upload goes straight to the API Worker and into R2", async ({ page }) => {
  await login(page, pres.email, pres.password, "/dashboard/media");
  const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: Date.now() % 256, g: 163, b: (Date.now() >> 8) % 256 } } })
    .withMetadata({ exif: { IFD0: { Copyright: "E2E", Artist: "GPS test" } } })
    .jpeg()
    .toBuffer();
  await page.getByLabel("choose files").setInputFiles({ name: `e2e-${run}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  await expect(page.locator("li", { hasText: `e2e-${run}.jpg` }).getByText("✓ done")).toBeVisible({ timeout: 45_000 });
  const row = d1<{ storage: string; mime_type: string; variants_json: string; width: number; object_key: string; bucket: string }>(`SELECT storage, mime_type, variants_json, width, object_key, bucket FROM media WHERE original_filename = 'e2e-${run}.jpg'`)[0];
  expect(row.storage).toBe("R2");
  expect(row.bucket).toBe("public");
  expect(row.mime_type).toBe("image/webp");
  // Library photos keep 400/800/1280 px and a 1920 px master (the site never shows wider).
  expect(row.width).toBeLessThanOrEqual(1920);
  expect(Object.keys(JSON.parse(row.variants_json)).sort()).toEqual(["master", "md", "sm", "thumb"]);
  const res = await page.request.get(`/media/${row.object_key}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("immutable");
  expect((await res.body()).includes(Buffer.from("GPS test"))).toBe(false);
  await page.getByLabel("choose files").setInputFiles({ name: `again-${run}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  await expect(page.locator("li", { hasText: `again-${run}.jpg` }).getByText("already in the library")).toBeVisible({ timeout: 45_000 });
});

test("an event posted from the dashboard (banner, guests, judges, photos) shows like the old ones; registration enforces capacity", async ({ page, browser }) => {
  await login(page, pres.email, pres.password, "/dashboard/events/new");
  const photo = (seed: number) => sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: seed % 256, g: 90, b: (seed >> 3) % 256 } } }).jpeg().toBuffer();
  await page.getByLabel("Title").first().fill(eventTitle);
  await page.getByLabel("Category").fill("Workshop");
  await page.getByLabel("Starts").fill("2030-01-15T10:00");
  await page.getByLabel("Schedule text").fill("10:00 AM - 1:00 PM");
  await page.getByLabel("Venue").fill("GUB Auditorium");
  await page.getByLabel("Participants").fill("120");
  await page.getByLabel("Description").fill("First paragraph.\nSecond paragraph.");
  await page.getByLabel("Guests", { exact: true }).fill("Chief Guest: Prof. E2E Chief, Vice Chancellor, GUB\nSpecial Guest: Dr. E2E Special, Dean, FSE");
  await page.getByLabel("Judges", { exact: true }).fill("Dr. E2E Judge - Professor, SUST");
  await page.locator('input[type="file"]').first().setInputFiles({ name: `banner-${run}.jpg`, mimeType: "image/jpeg", buffer: await photo(Date.now()) });
  await expect(page.locator('img[src*="/media/"]').first()).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Accept registrations on the site").check();
  await page.getByLabel("Capacity").fill("1");
  await page.getByLabel("Google Form (optional)").fill("https://forms.gle/e2eWorkshopForm");
  await page.getByLabel("Button text").fill("Register your team");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events\/evt_/);
  const slug = d1<{ slug: string }>(`SELECT slug FROM events WHERE title = '${eventTitle}'`)[0].slug;
  const visitor = await browser.newPage();
  expect((await visitor.goto(`/events/${slug}`))?.status()).toBe(404);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("published").first()).toBeVisible();

  // The public page shows it in the same layout as the migrated events.
  await visitor.goto(`/events/${slug}`);
  await expect(visitor.getByRole("heading", { name: eventTitle })).toBeVisible();
  await expect(visitor.getByAltText(eventTitle, { exact: true })).toHaveAttribute("src", /\/media\//);
  await expect(visitor.getByText("Prof. E2E Chief, Vice Chancellor, GUB")).toBeVisible();
  await expect(visitor.getByText("Special Guest")).toBeVisible();
  // As on the original site, judges stay on record only. With registration on, the real seats show
  // (they replaced the old invented "N / N+50" bar).
  await expect(visitor.getByRole("heading", { name: "Judges" })).toHaveCount(0);
  await expect(visitor.getByRole("img", { name: "0 of 1 seats taken" })).toBeVisible();
  await expect(visitor.getByText("GUB Auditorium", { exact: true }).first()).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Register your team" })).toHaveAttribute("href", "https://forms.gle/e2eWorkshopForm");

  // Gallery photos uploaded from the event page appear publicly without waiting for the cache.
  await page.getByLabel("choose photos or PDFs").setInputFiles([
    { name: `stage-${run}.jpg`, mimeType: "image/jpeg", buffer: await photo(Date.now() + 7) },
    { name: `crowd-${run}.jpg`, mimeType: "image/jpeg", buffer: await photo(Date.now() + 13) },
  ]);
  await expect(page.getByText("Gallery (2)")).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    await visitor.goto(`/events/${slug}`);
    await expect(visitor.getByRole("heading", { name: "Photos" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const register = async (name: string, email: string) => {
    await visitor.goto(`/events/${slug}`);
    await visitor.getByLabel("Full name").fill(name);
    await visitor.getByLabel("Email", { exact: true }).fill(email);
    await visitor.getByRole("button", { name: "Register now" }).click();
  };
  await register("First Visitor", `v1-${run}@example.com`);
  await expect(visitor.getByText("You're in")).toBeVisible();
  await register("Second Visitor", `v2-${run}@example.com`);
  await expect(visitor.getByRole("heading", { name: "You're on the waitlist" })).toBeVisible();
  await register("First Again", `v1-${run}@example.com`);
  await expect(visitor.locator("form").getByText(/already registered/i)).toBeVisible();
  await visitor.close();
});

test("a normal member can edit their profile but not reach admin tools", async ({ page }) => {
  await login(page, member.email, member.password, "/dashboard/profile");
  await expect(page.getByText("Your GUCC membership is approved").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Batch" }).fill("232");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.").first()).toBeVisible();
  await page.goto("/dashboard/members");
  await expect(page).toHaveURL(/\/dashboard\/denied/);
  // Moderation endpoint: refused for a plain member (unknown ids are indistinguishable from forbidden).
  const mod = await page.request.patch("/api/lost-found/admin", { headers: { Origin: "http://localhost:3001" }, data: { id: "x", status: "active" } });
  expect([403, 404]).toContain(mod.status());
});

test("Moderator sees the audit trail and suspends an account", async ({ page, browser }) => {
  const other = await browser.newPage();
  await login(other, pub.email, pub.password, "/dashboard");
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/activity?area=Content");
  await expect(page.locator("#admin-main").getByText(/ published /).first()).toBeVisible();
  await page.goto("/dashboard/audit?tab=signins");
  await expect(page.getByText("LOGIN_SUCCESS").first()).toBeVisible();

  await page.goto(`/dashboard/members?status=ACTIVE&q=${encodeURIComponent(pub.email)}`);
  const sheet = await openMemberSheet(page, pub.email);
  await sheet.locator("summary", { hasText: "Suspend" }).click();
  await sheet.getByPlaceholder("Reason").fill("E2E suspension test");
  await sheet.getByRole("button", { name: "Suspend" }).click();
  await acceptConfirms(page);
  // The list refreshes after the action; the account leaves the ACTIVE list.
  await expect(page.locator("tr, li").filter({ hasText: pub.email }).filter({ visible: true })).toHaveCount(0);
  await page.goto(`/dashboard/members?status=SUSPENDED&q=${encodeURIComponent(pub.email)}`);
  await expect(memberRow(page, pub.email).getByText("suspended", { exact: true }).first()).toBeVisible();
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/auth\/login/);
  await other.close();
});
