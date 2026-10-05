"use client";

/**
 * Downloads, made in the browser (the API never renders): a vector PDF (jsPDF + svg2pdf.js, the
 * certificate fonts embedded, many certificates as pages of one file) and a 300 DPI PNG. Loaded
 * only when someone presses Download.
 */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CertificateSvg, PAGE } from "./render";
import type { CertificateData, DesignConfig, TemplateKey } from "./config";
import { fontFile, fontKeyOf } from "./fonts";
import { FONT_FACE, measure, type FontKey } from "./text";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * PDF conversion ignores letter-spacing: place each letter of a spaced line itself (from the
 * fonts' own widths), keeping its anchor, so spaced capitals look the same as on screen.
 */
function spaceLetters(svg: SVGSVGElement) {
  for (const t of svg.querySelectorAll("text[letter-spacing]")) {
    const spacing = Number(t.getAttribute("letter-spacing"));
    const key = fontKeyOf(t.getAttribute("font-family") ?? "", t.getAttribute("font-weight") ?? "400", t.getAttribute("font-style") ?? "normal");
    const text = t.textContent ?? "";
    if (!spacing || !key || !text) continue;
    const size = Number(t.getAttribute("font-size")) || 40;
    const total = measure(text, key, size, spacing);
    const anchor = t.getAttribute("text-anchor") ?? "start";
    let x = Number(t.getAttribute("x")) - (anchor === "middle" ? total / 2 : anchor === "end" ? total : 0);
    t.setAttribute("text-anchor", "start");
    t.removeAttribute("letter-spacing");
    t.textContent = "";
    for (const ch of text) {
      if (ch.trim()) {
        const span = document.createElementNS(SVG_NS, "tspan");
        span.setAttribute("x", String(x));
        span.textContent = ch;
        t.appendChild(span);
      }
      x += measure(ch, key, size) + spacing;
    }
  }
}

export interface ExportItem {
  template: TemplateKey;
  config: DesignConfig;
  data: CertificateData;
}

const dataUrls = new Map<string, Promise<string>>();
const bytes = new Map<string, Promise<string>>();

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** A picture as a data: address (downloads must not depend on the network later). */
function inline(href: string): Promise<string> {
  if (href.startsWith("data:")) return Promise.resolve(href);
  if (!dataUrls.has(href)) dataUrls.set(href, fetch(href, { mode: "cors" }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status}`)))).then(blobToDataUrl));
  return dataUrls.get(href)!;
}

/** A font file as base64 (jsPDF wants it that way). */
function fontBase64(key: FontKey): Promise<string> {
  if (!bytes.has(key)) bytes.set(key, fetch(fontFile(key)).then((r) => r.blob()).then(blobToDataUrl).then((u) => u.slice(u.indexOf(",") + 1)));
  return bytes.get(key)!;
}

/** The certificate as an SVG element, with its pictures inlined. */
async function svgOf(item: ExportItem, i: number): Promise<SVGSVGElement> {
  const holder = document.createElement("div");
  const root = createRoot(holder);
  flushSync(() => root.render(<CertificateSvg template={item.template} config={item.config} data={item.data} id={`x${i}`} asset={(p) => new URL(p, window.location.origin).href} />));
  const svg = holder.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
  root.unmount();
  await Promise.all([...svg.querySelectorAll("image")].map(async (img) => {
    const href = img.getAttribute("href") ?? img.getAttribute("xlink:href");
    if (!href) return;
    try {
      const url = await inline(href);
      img.setAttribute("href", url);
      img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
    } catch {
      img.remove();
    }
  }));
  return svg;
}

function fontsIn(svg: SVGSVGElement): FontKey[] {
  const keys = new Set<FontKey>();
  for (const t of svg.querySelectorAll("text")) {
    const k = fontKeyOf(t.getAttribute("font-family") ?? "", t.getAttribute("font-weight") ?? "400", t.getAttribute("font-style") ?? "normal");
    if (k) keys.add(k);
  }
  return [...keys];
}

const save = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/**
 * One PDF with a page per certificate (A4 landscape, vector, fonts embedded). `onProgress` gets
 * how many are done; an aborted signal stops between pages.
 */
export async function downloadPdf(items: ExportItem[], fileName: string, opts: { onProgress?: (done: number) => void; signal?: AbortSignal } = {}): Promise<void> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const registered = new Set<FontKey>();
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-10000px;top:0;width:2970px;height:2100px;overflow:hidden";
  document.body.appendChild(stage);
  try {
    for (const [i, item] of items.entries()) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const svg = await svgOf(item, i);
      for (const key of fontsIn(svg)) {
        if (registered.has(key)) continue;
        doc.addFileToVFS(`${key}.ttf`, await fontBase64(key));
        doc.addFont(`${key}.ttf`, key, "normal", "normal", "Identity-H");
        registered.add(key);
      }
      spaceLetters(svg);
      // Each text names its own font file, so weights and styles map exactly.
      for (const t of svg.querySelectorAll("text")) {
        const key = fontKeyOf(t.getAttribute("font-family") ?? "", t.getAttribute("font-weight") ?? "400", t.getAttribute("font-style") ?? "normal");
        if (!key) continue;
        t.setAttribute("font-family", key);
        t.setAttribute("font-weight", "normal");
        t.setAttribute("font-style", "normal");
      }
      stage.replaceChildren(svg);
      if (i > 0) doc.addPage("a4", "landscape");
      await svg2pdf(svg, doc, { x: 0, y: 0, width: 297, height: 210 });
      opts.onProgress?.(i + 1);
      // Let the page breathe between certificates (big batches).
      await new Promise((r) => setTimeout(r, 0));
    }
    save(doc.output("blob"), fileName);
  } finally {
    stage.remove();
  }
}

/** A 300 DPI picture (3508 × 2480) of one certificate. */
export async function downloadPng(item: ExportItem, fileName: string): Promise<void> {
  const svg = await svgOf(item, 0);
  const css = (await Promise.all(fontsIn(svg).map(async (k) =>
    `@font-face{font-family:'${FONT_FACE[k].family}';font-weight:${FONT_FACE[k].weight};font-style:${FONT_FACE[k].style};src:url(data:font/ttf;base64,${await fontBase64(k)}) format('truetype')}`))).join("");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = css;
  svg.insertBefore(style, svg.firstChild);
  const markup = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The picture couldn't be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 3508;
    canvas.height = 2480;
    const c = canvas.getContext("2d")!;
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No picture"))), "image/png"));
    save(blob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const CERT_PAGE = PAGE;
