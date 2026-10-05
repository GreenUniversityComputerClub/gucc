/**
 * Every certificate design as PNG pictures, for reviewing a design change:
 *
 *   bun scripts/certificates/preview.tsx <output folder> [kind] [extras]
 *
 * "extras" adds a row of partner logos and a background picture, to check those too.
 *
 * Renders the seven templates with sample data and the certificate fonts, in a headless browser.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { CertificateSvg } from "@/lib/certificates/render";
import { defaultConfig, KINDS, TEMPLATES, type CertificateKind } from "@/lib/certificates/config";
import { FONT_FACE } from "@/lib/certificates/text";

const out = resolve(process.argv[2] ?? "certificate-previews");
const kind = (KINDS as readonly string[]).includes(process.argv[3] ?? "") ? (process.argv[3] as CertificateKind) : "EXECUTIVE";
const root = process.cwd();
mkdirSync(out, { recursive: true });
const fonts = readdirSync(`${root}/public/fonts/certificates`).filter((f) => f.endsWith(".ttf")).map((f) => {
  const face = FONT_FACE[f.replace(/\.ttf$/, "") as keyof typeof FONT_FACE];
  return `@font-face{font-family:'${face.family}';font-weight:${face.weight};font-style:${face.style};src:url('file://${root}/public/fonts/certificates/${f}')}`;
}).join("\n");
const data = {
  name: "Nusrat Jahan Mim", role: "General Secretary", event: "CSE Carnival 2026", rank: "1st place", team: "Null Pointers",
  date: "12 October 2026", code: "GUCC-7K3M-Q9TB-X2HD-PV4E", verifyUrl: "https://gucc.green.edu.bd/c/7K3MQ9TBX2HDPV4E",
};
const extras = process.argv[4] === "extras";
const config = {
  ...defaultConfig(kind),
  ...(extras ? {
    extraLogos: ["/certificates/cse-seal.png", "/certificates/gub-logo.png", "/sponsors/github.png", "/sponsors/google-developers.webp"],
    background: { image: "/events/65.jpg", opacity: 0.12 },
  } : {}),
};
const html = `<!doctype html><html><head><style>${fonts} body{margin:0;background:#ddd} svg{display:block;width:1485px;height:1050px;margin:10px}</style></head><body>${TEMPLATES.map((t, i) =>
  renderToStaticMarkup(<CertificateSvg template={t} config={config} data={data} id={`c${i}`} asset={(p) => `file://${root}/public${p}`} />)).join("\n").replace(/href="\//g, `href="file://${root}/public/`)}</body></html>`;
writeFileSync(`${out}/certificates.html`, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1505, height: 1070 } });
await page.goto(`file://${out}/certificates.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1000);
const svgs = await page.$$("svg");
for (let i = 0; i < svgs.length; i++) await svgs[i]!.screenshot({ path: `${out}/${TEMPLATES[i]}.png` });
await browser.close();
console.log(`${svgs.length} designs in ${out}/`);
