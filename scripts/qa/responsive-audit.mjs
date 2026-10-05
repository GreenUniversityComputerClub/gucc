// Layout audit at phone, tablet and desktop widths: horizontal overflow (the page scrolls
// sideways), tap targets under 40 px, and text clipped out of its box. Public pages by default;
// dashboard pages too with EMAIL and PASSWORD of a test account (never the live site's data).
// Usage: BASE=http://localhost:3001 node scripts/qa/responsive-audit.mjs [path ...]
import { chromium } from "playwright";

const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1536];
const PUBLIC = ["/", "/events", "/blog", "/executives", "/contests", "/join", "/contact", "/sponsors", "/lost-found", "/recruitment"];
const DASHBOARD = ["/dashboard", "/dashboard/chat", "/dashboard/notifications", "/dashboard/tasks", "/dashboard/meetings", "/dashboard/profile", "/dashboard/events"];
const paths = process.argv.slice(2).length ? process.argv.slice(2) : [...PUBLIC, ...(process.env.EMAIL ? DASHBOARD : [])];

const browser = await chromium.launch();
// Phone widths with a touch screen (so `(hover: none)` layouts show, as on a real phone), the rest with a mouse.
async function open(touch) {
  const context = await browser.newContext(touch ? { isMobile: true, hasTouch: true } : {});
  const page = await context.newPage();
  if (process.env.EMAIL) {
    await page.goto(`${BASE}/auth/login`);
    await page.getByLabel("Email", { exact: true }).fill(process.env.EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(process.env.PASSWORD ?? "");
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"));
  }
  return page;
}
const phone = await open(true);
const computer = await open(false);
const problems = [];
for (const path of paths) {
  for (const width of WIDTHS) {
    const page = width < 768 ? phone : computer;
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    // "load" plus a moment: pages with live connections never go network-idle.
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;
      const small = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, [role=button]")]
        .filter((el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && (b.height < 40 && b.width < 40) && !el.closest("p, li > a:only-child, .sr-only, [aria-hidden=true]") && s.clip !== "rect(0px, 0px, 0px, 0px)"; })
        .slice(0, 5).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"`);
      const clipped = [...document.querySelectorAll("h1, h2, h3, button, a")]
        .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === "hidden" && !getComputedStyle(el).textOverflow.includes("ellipsis"))
        // Text only for screen readers (a "Skip to content" link, a hidden heading) is clipped on purpose.
        .filter((el) => !el.closest(".sr-only") && getComputedStyle(el).clip !== "rect(0px, 0px, 0px, 0px)").length;
      return { overflow, small, clipped };
    });
    if (r.overflow > 1) problems.push(`${path} @${width}px: page is ${r.overflow}px wider than the screen`);
    if (width <= 390 && r.small.length) problems.push(`${path} @${width}px: small tap targets: ${r.small.join(", ")}`);
    if (r.clipped) problems.push(`${path} @${width}px: ${r.clipped} element(s) with clipped text`);
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "Responsive audit: no problems found.");
process.exit(problems.length ? 1 : 0);
