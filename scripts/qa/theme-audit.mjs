#!/usr/bin/env node
/**
 * Day and night mode audit. For every route × light/dark × phone/desktop:
 *   - axe-core colour-contrast violations (text that's hard to read)
 *   - transparent backgrounds on native <select>/<option>, menus and dialogs
 *   - horizontal scrolling on phones
 * Screenshots go to .e2e/theme/. Read-only: it only opens pages. Uses axe-core from node_modules
 * (installed with the ESLint accessibility plugin).
 *
 *   node scripts/qa/theme-audit.mjs [baseUrl] [--dashboard email password]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:3000").replace(/\/$/, "");
const dashIdx = args.indexOf("--dashboard");
const creds = dashIdx >= 0 ? { email: args[dashIdx + 1], password: args[dashIdx + 2] } : null;

const PUBLIC = ["/", "/executives", "/events", "/blog", "/news", "/announcements", "/contests", "/join", "/contact", "/sponsors", "/collaborations",
  "/socials", "/lost-found", "/recruitment", "/certificates/hacktheai", "/certificates/hacktheai/verify", "/auth/login", "/auth/sign-up"];
const DASHBOARD = ["/dashboard", "/dashboard/profile", "/dashboard/security", "/dashboard/notifications", "/dashboard/chat", "/dashboard/tasks", "/dashboard/meetings",
  "/dashboard/members", "/dashboard/committees", "/dashboard/positions", "/dashboard/access", "/dashboard/roles", "/dashboard/rules", "/dashboard/approvals",
  "/dashboard/events", "/dashboard/posts?type=BLOG", "/dashboard/activity", "/dashboard/health", "/dashboard/settings", "/dashboard/lost-found"];

mkdirSync(".e2e/theme", { recursive: true });
const browser = await chromium.launch();
const results = [];

async function audit(route, theme, width, storage) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, storageState: storage ?? undefined });
  await context.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const page = await context.newPage();
  const res = await page.goto(base + route, { waitUntil: "load", timeout: 60_000 }).catch((e) => ({ status: () => `error ${e.message.slice(0, 60)}` }));
  await page.waitForTimeout(1500);
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const contrast = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: ["color-contrast"], resultTypes: ["violations"] });
    return r.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(-1)[0]?.trim() ?? "" })));
  });
  const surfaces = await page.evaluate(() => {
    const transparent = (el) => { const c = getComputedStyle(el).backgroundColor; return c === "transparent" || /rgba\(.*,\s*0\)$/.test(c); };
    const out = [];
    for (const el of document.querySelectorAll("select, option, [role=menu], [role=dialog], [role=listbox]")) if (transparent(el) && el.offsetParent !== null) out.push(el.tagName.toLowerCase() + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""));
    if (transparent(document.body)) out.push("body");
    return out;
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = `.e2e/theme/${route.replace(/[^a-z0-9]+/gi, "_") || "home"}-${theme}-${width}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  results.push({ route, theme, width, status: typeof res?.status === "function" ? res.status() : "?", contrast: contrast.length, contrastSamples: contrast.slice(0, 5), transparent: surfaces, overflowPx: Math.max(0, overflow) });
  await context.close();
}

let storage = null;
if (creds) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/auth/login?next=/dashboard`);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 30_000 });
  storage = await context.storageState();
  await context.close();
}

for (const route of [...PUBLIC, ...(creds ? DASHBOARD : [])]) {
  for (const theme of ["light", "dark"]) for (const width of [390, 1280]) await audit(route, theme, width, route.startsWith("/dashboard") ? storage : null);
  const r = results.filter((x) => x.route === route);
  console.log(`${route.padEnd(36)} contrast ${r.map((x) => x.contrast).join("/")}  transparent ${r.some((x) => x.transparent.length) ? "YES" : "no"}  overflow ${Math.max(...r.map((x) => x.overflowPx))}px`);
}
writeFileSync(".e2e/theme/report.json", JSON.stringify(results, null, 2));
await browser.close();
console.log("Report: .e2e/theme/report.json (contrast counts are light-390/light-1280/dark-390/dark-1280)");
