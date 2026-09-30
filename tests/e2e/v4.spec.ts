import { deflateRawSync, crc32 } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { base32Decode, totpAt } from "../../lib/server/totp";
import { d1, ensureMember, login, MODERATOR, settle } from "./helpers";

/**
 * v4 features end to end: the Services menu, tasks and meetings, two-factor sign-in, "confirm
 * it's you" before an export, the activity log and system health, executives quick edit and
 * export, recruitment import from Excel, and the structured home-page editor.
 */
test.describe.configure({ mode: "serial" });

const MEMBER = { email: "member-v4@local.test", name: "Mina Member", password: "Member-v4-pass-2026!" };
const run = Date.now().toString(36);

async function pickPerson(page: Page, label: string, name: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.fill(name.split(" ")[0]!);
  await page.getByRole("option", { name: new RegExp(name) }).first().dispatchEvent("mousedown");
}

test("the Services menu opens Lost & Found", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByRole("menuitem", { name: /Lost & Found/ }).click();
  await expect(page).toHaveURL(/\/lost-found$/);
});

test("a leader gives a task and schedules a meeting; the member sees both and replies", async ({ page }) => {
  await ensureMember(MEMBER.email, MEMBER.name, MEMBER.password);
  // Earlier runs' items would fill the dashboard's short lists.
  d1("UPDATE tasks SET status = 'DONE' WHERE title LIKE 'Book the seminar hall %'");
  d1("UPDATE meetings SET status = 'CANCELLED' WHERE title LIKE 'Planning meeting %'");
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/tasks");
  const give = page.locator("section", { has: page.getByRole("heading", { name: "Give a task" }) });
  await give.getByLabel("Task").fill(`Book the seminar hall ${run}`);
  await pickPerson(page, "Member", MEMBER.name);
  await give.getByRole("button", { name: "Assign task" }).click();
  await expect(page.getByText(/Task assigned/).filter({ visible: true }).first()).toBeVisible();

  await page.goto("/dashboard/meetings");
  const sched = page.locator("section", { has: page.getByRole("heading", { name: "Schedule a meeting" }) });
  await sched.getByLabel("Title").fill(`Planning meeting ${run}`);
  const start = new Date(Date.now() + 2 * 86400_000 + 6 * 3600_000).toISOString().slice(0, 16);
  await sched.getByLabel("Starts (Dhaka time)").fill(start);
  await sched.getByLabel("Meeting link (optional)").fill("meet.google.com/abc-defg-hij");
  const who = sched.getByLabel("Participants");
  await who.fill("Mina");
  await sched.getByRole("button", { name: new RegExp(MEMBER.name) }).click();
  await sched.getByRole("button", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/\/dashboard\/meetings\/mtg_/);
  await expect(page.getByRole("link", { name: "meet.google.com/abc-defg-hij" })).toBeVisible();

  await login(page, MEMBER.email, MEMBER.password, "/dashboard");
  // Signing in is a client-side navigation; the navbar must notice (no "Sign in" link any more).
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: `Book the seminar hall ${run}`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `Planning meeting ${run}`, exact: true })).toBeVisible();
  await page.getByRole("link", { name: `Book the seminar hall ${run}`, exact: true }).click();
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(page.locator("#admin-main").getByText("done", { exact: true }).first()).toBeVisible();
  await page.goto("/dashboard/meetings");
  await page.getByRole("link", { name: `Planning meeting ${run}`, exact: true }).click();
  await page.getByRole("group", { name: "Your reply" }).getByRole("button", { name: "Going", exact: true }).click();
  await expect(page.getByRole("group", { name: "Your reply" }).getByRole("button", { name: "Going", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Members can't see the leaders' tools.
  await page.goto("/dashboard/health");
  await expect(page).toHaveURL(/\/dashboard\/denied/);
});

test("two-factor sign-in: set up with an authenticator code, then every sign-in asks for one", async ({ page }) => {
  await ensureMember(MEMBER.email, MEMBER.name, MEMBER.password);
  await login(page, MEMBER.email, MEMBER.password, "/dashboard/security");
  await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();
  const key = (await page.locator("code.select-all").innerText()).replace(/\s/g, "");
  const secret = base32Decode(key);
  await page.getByLabel("Code", { exact: true }).fill(await totpAt(secret, Date.now() / 1000));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.locator("#admin-main").getByText(/Save these recovery codes/)).toBeVisible();
  const codes = (await page.locator("ul.font-mono li").allInnerTexts()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.locator("#admin-main").getByText(/On since/)).toBeVisible();

  // Password alone isn't enough now.
  await page.context().clearCookies();
  await page.goto("/auth/login?next=/dashboard");
  await page.getByLabel("Email", { exact: true }).fill(MEMBER.email);
  await page.getByLabel("Password", { exact: true }).fill(MEMBER.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/auth\/two-factor/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.goto("/auth/two-factor?next=/dashboard");
  await page.getByRole("button", { name: /Use a recovery code/ }).click();
  await page.getByLabel("Recovery code").fill(codes[0]!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Clean up so the member can sign in with a password in other tests.
  d1("DELETE FROM user_mfa WHERE user_id = (SELECT id FROM users WHERE email = 'member-v4@local.test')");
});

test("an export asks the leader to confirm it's them when the last password is old", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/members?status=ACTIVE");
  d1(`UPDATE sessions SET reauth_at = '2020-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE email = '${MODERATOR.email}') AND revoked_at IS NULL`);
  await page.getByRole("link", { name: "Download CSV" }).click();
  await expect(page).toHaveURL(/\/dashboard\/confirm/);
  await page.getByLabel("Password or two-factor code").fill(MODERATOR.password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  expect((await download).suggestedFilename()).toMatch(/^gucc-members-active-.*\.csv$/);
});

test("leaders read the activity log and system health", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/activity");
  await expect(page.locator("#admin-main").getByText(/gave the task|scheduled the meeting|exported the member list/).first()).toBeVisible();
  await page.goto("/dashboard/activity?area=Tasks+%26+meetings");
  await expect(page.locator("#admin-main").getByText(/gave the task/).first()).toBeVisible();
  await page.goto("/dashboard/health");
  for (const label of ["API", "Database", "Database structure", "Email"]) await expect(page.locator("#admin-main").getByText(label, { exact: true }).first()).toBeVisible();
  // Round 5: free-plan usage, the switches and the email log are on the same page.
  await expect(page.locator("#admin-main").getByRole("heading", { name: "Free plan usage" })).toBeVisible();
  await expect(page.locator("#admin-main").getByRole("heading", { name: "Switches" })).toBeVisible();
  await expect(page.locator("#admin-main li", { hasText: "Database structure" }).getByText("Healthy", { exact: true })).toBeVisible();
});

test("executives: quick edit saves several rows at once, and the export downloads", async ({ page }) => {
  const committee = d1<{ id: string }>("SELECT id FROM committees WHERE status = 'CURRENT'")[0]!;
  const target = d1<{ id: string; position_title: string; name: string }>(
    `SELECT cm.id, cm.position_title, pr.full_name AS name FROM committee_members cm JOIN positions p ON p.id = cm.position_id JOIN profiles pr ON pr.id = cm.profile_id
     WHERE cm.committee_id = '${committee.id}' AND cm.deleted_at IS NULL AND p.is_protected = 0
       AND (SELECT COUNT(*) FROM committee_members x JOIN profiles y ON y.id = x.profile_id WHERE x.committee_id = cm.committee_id AND x.deleted_at IS NULL AND y.full_name = pr.full_name) = 1
     ORDER BY cm.display_order DESC LIMIT 1`)[0]!;
  await login(page, MODERATOR.email, MODERATOR.password, `/dashboard/committees/${committee.id}`);
  await page.locator("#admin-main").getByText("Quick edit: titles, names and order of everyone at once").click();
  const titleBox = page.getByLabel(`Title for ${target.name}`, { exact: true });
  await titleBox.fill(`${target.position_title} ${run}`);
  await page.getByRole("button", { name: "Save 1 change" }).click();
  await expect(page.getByText("Saved 1 listing.").filter({ visible: true }).first()).toBeVisible();
  expect(d1<{ position_title: string }>(`SELECT position_title FROM committee_members WHERE id = '${target.id}'`)[0]!.position_title).toBe(`${target.position_title} ${run}`);
  d1(`UPDATE committee_members SET position_title = '${target.position_title.replace(/'/g, "''")}' WHERE id = '${target.id}'`);

  await page.locator("#admin-main").getByText("Export", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV spreadsheet (re-importable)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^executives-.*\.csv$/);
});

/** A small real .xlsx (deflate-compressed, shared strings) built in memory. */
function xlsx(rows: string[][]): Buffer {
  const strings: string[] = [];
  const idx = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) =>
    `<row r="${i + 1}">${r.map((c, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="s"><v>${idx(c)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`;
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Form Responses 1" sheetId="1"/></sheets></workbook>`],
    ["xl/sharedStrings.xml", shared],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

test("recruitment: applications imported from an Excel file after a preview", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/recruitment");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Create" }) });
  await form.getByLabel("Title").fill(`E2E Imported call ${run}`);
  await form.getByLabel("Closes (Dhaka time)").fill(new Date(Date.now() + 5 * 86400_000 + 6 * 3600_000).toISOString().slice(0, 16));
  await form.getByLabel("Status").selectOption("CLOSED");
  await form.getByLabel("Executive Member", { exact: true }).check();
  await form.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/dashboard\/recruitment\/rcp_/);
  await page.locator("#admin-main").getByText("Import applications from a spreadsheet").click();
  const sid = (n: number) => String(231000000 + (Date.now() % 900000) + n).slice(0, 9);
  await page.getByLabel("Spreadsheet file").setInputFiles({
    name: "responses.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx([
      ["Timestamp", "Your Name", "Student ID", "Email Address", "Mobile Number", "Position applied for"],
      ["1/1/2026", "Imported One", sid(1), `imp1-${run}@x.bd`, "01711111111", "Executive Member"],
      ["1/1/2026", "Imported Two", sid(2), `imp2-${run}@x.bd`, "01711111112", "Head of Everything"],
    ]),
  });
  await expect(page.locator("#admin-main").getByText(/responses\.xlsx.*2 rows/)).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#admin-main").getByText("1 to add, 0 already there, 1 with problems.")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 application(s)" }).click();
  await expect(page.getByText(/Imported 1 application/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("#admin-main").getByText("Imported One")).toBeVisible();
});

test("the home page's figures are edited in a form and appear on the site", async ({ page }) => {
  await login(page, MODERATOR.email, MODERATOR.password, "/dashboard/settings");
  const block = page.locator("details", { has: page.locator("summary", { hasText: "page.home" }) });
  await block.locator("summary").click();
  await block.locator('input[value="Workshops"]').fill(`Workshops ${run}`);
  await block.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.").filter({ visible: true }).first()).toBeVisible();
  await expect.poll(async () => {
    await page.goto("/");
    await settle(page);
    return page.getByText(`Workshops ${run}`).count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  // Put it back.
  d1(`UPDATE organization_settings SET value_json = json_set(value_json, '$.stats[2].label', 'Workshops') WHERE key = 'page.home'`);
});
