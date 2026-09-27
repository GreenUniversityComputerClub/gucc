// Compare rendered pages on the live original site with the local build:
// visible text of header / main / footer, link targets in main, and main height at two widths.
// Usage: node scripts/qa/compare.mjs [path ...]
import { chromium } from "playwright";

const LIVE = process.env.LIVE ?? "https://gucc.green.edu.bd";
const LOCAL = process.env.LOCAL ?? "http://localhost:3000";
const DEFAULT_PATHS = [
  "/", "/events", "/executives", "/executives/2026", "/executives/2025", "/executives/2019",
  "/events/hacktheai-final--award-ceremony", "/events/formation-of-gucc-virtual-gaming-society", "/events/the-first-meet-up-of-gucc-executive-committee-2023-2024", "/events/cse-freshers-orientation-summer-2026",
  "/events/gucc-12th-anniversary-celebration", "/events/cse-freshers-orientation-summer-2025",
  "/blog", "/contests", "/sponsors", "/collaborations", "/contact", "/join", "/recruitment/rules",
  "/socials", "/certificates/hacktheai/verify", "/lost-found",
];
const paths = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS;

async function grab(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 }).catch((e) => ({ status: () => `ERR ${e.message.split("\n")[0]}` }));
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const norm = (s) => (s ?? "").replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
    const main = document.querySelector("main");
    return {
      header: norm(document.querySelector("header")?.innerText),
      main: norm(main?.innerText),
      footer: norm(document.querySelector("footer")?.innerText),
      links: [...(main?.querySelectorAll("a[href]") ?? [])].map((a) => a.getAttribute("href")).filter((h) => h && !h.startsWith("#")),
      height: Math.round(main?.getBoundingClientRect().height ?? 0),
      title: document.title,
    };
  }).then((d) => ({ ...d, status: res?.status?.() }));
}

function diffLines(a, b) {
  const sa = new Map(); for (const l of a) sa.set(l, (sa.get(l) ?? 0) + 1);
  const sb = new Map(); for (const l of b) sb.set(l, (sb.get(l) ?? 0) + 1);
  const onlyA = [], onlyB = [];
  for (const [l, n] of sa) for (let i = (sb.get(l) ?? 0); i < n; i++) onlyA.push(l);
  for (const [l, n] of sb) for (let i = (sa.get(l) ?? 0); i < n; i++) onlyB.push(l);
  const orderSame = onlyA.length === 0 && onlyB.length === 0 && a.join("\n") === b.join("\n");
  return { onlyA, onlyB, orderSame };
}

const browser = await chromium.launch();
let problems = 0;
for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const p of paths) {
    const [live, local] = [await grab(page, LIVE + p), await grab(page, LOCAL + p)];
    const out = [];
    if (String(live.status) !== String(local.status)) out.push(`status live=${live.status} local=${local.status}`);
    if (width === 1280) {
      for (const part of ["header", "main", "footer"]) {
        const d = diffLines(live[part], local[part]);
        if (d.onlyA.length || d.onlyB.length) out.push(`${part}: only live ${JSON.stringify(d.onlyA.slice(0, 8))} | only local ${JSON.stringify(d.onlyB.slice(0, 8))}`);
        else if (!d.orderSame) out.push(`${part}: same lines, different order`);
      }
      const dl = diffLines(live.links, local.links.map((h) => h.replace(/^https?:\/\/[^/]*\/media\//, "/media/")));
      const linkNote = [];
      if (dl.onlyA.length) linkNote.push(`only live ${JSON.stringify(dl.onlyA.slice(0, 6))}`);
      if (dl.onlyB.length) linkNote.push(`only local ${JSON.stringify(dl.onlyB.slice(0, 6))}`);
      if (linkNote.length) out.push(`links (${dl.onlyA.length}/${dl.onlyB.length}): ${linkNote.join(" | ")}`);
      if (live.title !== local.title) out.push(`title: "${live.title}" vs "${local.title}"`);
    }
    if (Math.abs(live.height - local.height) > 2) out.push(`main height @${width}: live ${live.height} local ${local.height}`);
    problems += out.length;
    console.log(`${out.length ? "✗" : "✓"} ${p} @${width}${out.length ? "\n    " + out.join("\n    ") : ""}`);
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} difference(s)` : "\nIdentical.");
