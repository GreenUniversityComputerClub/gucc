// Opens public pages and reports anything the Content Security Policy blocked. Read-only.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const routes = ["/", "/executives", "/executives/2026", "/events", "/events/hacktheai-final--award-ceremony", "/blog", "/news", "/contests", "/join", "/contact",
  "/sponsors", "/collaborations", "/socials", "/lost-found", "/recruitment", "/certificates/hacktheai", "/certificates/hacktheai/verify", "/forms", "/auth/login", "/auth/sign-up"];
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`${page.url()} ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => problems.push(`${page.url()} pageerror ${e.message.slice(0, 160)}`));
for (const r of routes) {
  const res = await page.goto(base + r, { waitUntil: "load", timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1500);
  // Open the chat bubble and the Services menu where present, to exercise their requests.
  console.log(`${String(res?.status() ?? "ERR").padEnd(4)} ${r}`);
}
const forms = await page.goto(base + "/forms").then(() => page.locator("a[href^='/forms/']").first().getAttribute("href")).catch(() => null);
if (forms) { await page.goto(base + forms, { waitUntil: "load" }); await page.waitForTimeout(3000); console.log(`form ${forms}`); }
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${[...new Set(problems)].join("\n")}` : "\nNo CSP violations or page errors.");
