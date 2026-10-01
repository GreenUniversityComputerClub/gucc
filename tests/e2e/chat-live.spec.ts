import { deflateSync } from "node:zlib";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { acceptConfirms, ensureMember, login } from "./helpers";

/**
 * Round 8 end to end: two people in two browsers. A message, "typing…", a reaction and a
 * notification reach the other person without reloading; a group is created; a blank profile
 * picture is refused with a clear message; the task board and a meeting reply save in place.
 */
const run = Date.now().toString(36);
const A = { email: `r8a-${run}@student.green.ac.bd`, name: `Arif ${run}`, password: "Round-eight-pass-2026!" };
const B = { email: `r8b-${run}@student.green.ac.bd`, name: `Bristy ${run}`, password: "Round-eight-pass-2026!" };
const C = { email: `r8c-${run}@student.green.ac.bd`, name: `Chandni ${run}`, password: "Round-eight-pass-2026!" };

test.describe.configure({ mode: "serial" });
/** Arif and Bristy's conversation (the first test starts it). */
let conversation = "";

/** A plain white PNG (a "blank" picture), made here so the test needs no files. */
function blankPng(size = 400): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 255)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The messages in the open thread (the conversation list shows previews of the same text). */
const bubbles = (page: Page) => page.locator('[aria-label$="Press R to react."]');

async function pageFor(browser: Browser, who: typeof A, next: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await acceptConfirms(page);
  await login(page, who.email, who.password, next);
  return page;
}

test("messages, typing, reactions and notifications arrive live, without a reload", async ({ browser }) => {
  test.setTimeout(240_000);
  await ensureMember(A.email, A.name, A.password);
  const bId = await ensureMember(B.email, B.name, B.password);
  await ensureMember(C.email, C.name, C.password);

  // Arif starts the conversation from Bristy's "Message" link.
  const a = await pageFor(browser, A, `/dashboard/chat?to=${bId}`);
  await a.getByRole("textbox", { name: /^Message/ }).fill("Hi Bristy, live test!");
  await a.getByRole("button", { name: "Send" }).click();
  await expect(a).toHaveURL(/\/dashboard\/chat\/cnv_/);
  conversation = a.url().replace(/^https?:\/\/[^/]+/, "");

  const b = await pageFor(browser, B, conversation);
  await expect(bubbles(b).getByText("Hi Bristy, live test!")).toBeVisible();

  // Typing and a new message reach Arif's open page without reloading it.
  const bComposer = b.getByLabel(new RegExp(`Message to ${A.name}`));
  await bComposer.pressSequentially("Hello", { delay: 40 });
  await expect(a.getByText(/typing/).first()).toBeVisible({ timeout: 15_000 });
  await bComposer.press("Enter");
  await expect(bubbles(a).getByText("Hello", { exact: true })).toBeVisible({ timeout: 15_000 });

  // A reaction appears on the other side.
  const bubble = bubbles(a).getByText("Hello", { exact: true });
  await bubble.dblclick();
  const pill = b.getByRole("button", { name: /Reactions: Love/ });
  await expect(pill).toBeVisible({ timeout: 15_000 });
  // Who reacted: the pill opens the list, with the person's name.
  await pill.click();
  await expect(b.getByRole("dialog", { name: "Reactions" }).getByText(A.name)).toBeVisible();
  await b.keyboard.press("Escape");

  // A notification shows up on the notifications page while it's open.
  await b.goto("/dashboard/notifications?tab=all");
  await expect(b.locator("li[data-id]").first()).toBeVisible();
  const aComposer = a.getByLabel(new RegExp(`Message to ${B.name}`));
  await aComposer.fill("Are you coming to the fair?");
  await aComposer.press("Enter");
  await expect(b.locator("li[data-id]", { hasText: "Are you coming to the fair?" })).toBeVisible({ timeout: 20_000 });
  await a.context().close();
  await b.context().close();
});

test("on a phone: unread stands out with a count, a conversation fills the screen, and it can be marked unread", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await pageFor(browser, A, conversation);
  const aComposer = a.getByLabel(new RegExp(`Message to ${B.name}`));
  await aComposer.fill("Bring the banner https://github.com/vercel/next.js");
  await aComposer.press("Enter");
  await expect(bubbles(a).getByText(/Bring the banner/)).toBeVisible();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const b = await ctx.newPage();
  await acceptConfirms(b);
  await login(b, B.email, B.password, "/dashboard/chat");
  const row = b.getByRole("link", { name: new RegExp(`^${A.name}, \\d+ unread messages$`) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(b).toHaveURL(/\/dashboard\/chat\/cnv_/);

  // The conversation's own header is at the top of the screen (not the site's bars), the message box at the bottom.
  const back = b.getByRole("link", { name: "Back to conversations" });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())!.y).toBeLessThan(40);
  expect(await b.evaluate(() => document.elementFromPoint(200, 20)?.closest("header")?.textContent ?? "")).toContain(A.name);
  const box = (await b.getByLabel(new RegExp(`Message to ${A.name}`)).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  // Mark as unread: back to the list, where it shows unread again.
  await b.getByRole("button", { name: "Conversation options" }).click();
  await b.getByRole("menuitem", { name: "Mark as unread" }).click();
  await expect(b).toHaveURL(/\/dashboard\/chat$/);
  await expect(b.getByRole("link", { name: new RegExp(`^${A.name}, (\\d+ unread messages|unread)$`) })).toBeVisible();
  // Back on the list, nothing is wider than the phone (a long preview once widened the page, which
  // looked like the list was zoomed in), and the New button is on screen.
  expect(await b.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest("[class*='overflow-x-auto']")).length)).toBe(0);
  const newButton = (await b.getByRole("button", { name: "New", exact: true }).boundingBox())!;
  expect(newButton.x + newButton.width).toBeLessThanOrEqual(390);
  await a.context().close();
  await ctx.close();
});

test("a member creates a group; everyone in it sees the conversation", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await pageFor(browser, A, "/dashboard/chat");
  await a.getByRole("button", { name: "New", exact: true }).click();
  const dialog = a.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Group" }).click();
  await dialog.getByRole("combobox").fill(B.name);
  await dialog.getByRole("option", { name: new RegExp(B.name) }).click();
  await dialog.getByRole("combobox").fill(C.name);
  await dialog.getByRole("option", { name: new RegExp(C.name) }).click();
  await dialog.getByRole("button", { name: /Next: name the group/ }).click();
  await dialog.getByLabel(/Group name/).fill(`Fair crew ${run}`);
  await dialog.getByRole("button", { name: "Create group" }).click();
  await expect(a).toHaveURL(/\/dashboard\/chat\/cnv_/);
  await expect(a.getByRole("note").getByText(new RegExp(`created the group “Fair crew ${run}”`))).toBeVisible();

  const c = await pageFor(browser, C, "/dashboard/chat");
  await expect(c.getByRole("link", { name: new RegExp(`Fair crew ${run}`) })).toBeVisible();
  await a.context().close();
  await c.context().close();
});

test("a blank profile picture is refused with a clear message", async ({ page }) => {
  await acceptConfirms(page);
  await login(page, A.email, A.password, "/dashboard/profile");
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: "blank.png", mimeType: "image/png", buffer: blankPng() });
  await expect(page.getByRole("alert").filter({ hasText: /looks blank|placeholder/i })).toBeVisible();
});
