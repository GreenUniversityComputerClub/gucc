/**
 * Every certificate design through the real PDF export (jsPDF + svg2pdf.js, fonts embedded), to
 * check that the PDF matches the screen:
 *
 *   bun scripts/certificates/pdf-preview.ts <output folder>
 *
 * Writes designs.pdf (and page PNGs when pdftoppm is installed).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

/** The few Bun APIs this script uses (it runs under Bun; the website's typecheck has no Bun types). */
declare const Bun: {
  build(o: { entrypoints: string[]; target: "browser"; minify: boolean; define: Record<string, string> }): Promise<{ success: boolean; logs: unknown[]; outputs: Array<{ text(): Promise<string> }> }>;
  serve(o: { port: number; fetch(req: Request): Response | Promise<Response> }): { port: number; stop(): void };
  file(path: string): Blob & { exists(): Promise<boolean> };
};

const out = resolve(process.argv[2] ?? "certificate-previews");
mkdirSync(out, { recursive: true });
const built = await Bun.build({ entrypoints: ["scripts/certificates/pdf-entry.tsx"], target: "browser", minify: false, define: { "process.env.NODE_ENV": '"production"' } });
if (!built.success) throw new Error(built.logs.join("\n"));
const bundle = await built.outputs[0]!.text();
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/") return new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body><script>${bundle.replace(/<\/script/g, "<\\/script")}</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    const file = Bun.file(`public${decodeURIComponent(path)}`);
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error(m.text()));
await page.goto(`http://localhost:${server.port}/`);
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.evaluate(() => (window as unknown as { makePdf: () => Promise<void> }).makePdf())]);
await download.saveAs(`${out}/designs.pdf`);
await browser.close();
server.stop();
if (spawnSync("pdftoppm", ["-v"]).status === 0) spawnSync("pdftoppm", ["-png", "-r", "60", `${out}/designs.pdf`, `${out}/pdf-page`]);
writeFileSync(`${out}/.done`, "");
console.log(`PDF in ${out}/designs.pdf`);
