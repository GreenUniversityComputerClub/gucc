/**
 * Read a spreadsheet in the browser into a header row and data rows: CSV, JSON (a list of
 * objects) or Excel .xlsx (first sheet). The .xlsx reader is deliberately small: it unzips with
 * the browser's DecompressionStream and reads the sheet XML, which covers exports from Google
 * Forms, Google Sheets and Excel. Nothing is uploaded until the mapped rows are previewed.
 */
import { csvRecords } from "../executive-import/parse";

export interface Sheet {
  headers: string[];
  rows: string[][];
}

export async function readSpreadsheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("Old .xls files aren't supported. Save it as .xlsx or CSV first.");
  const text = (await file.text()).replace(/^﻿/, "");
  if (name.endsWith(".json") || /^\s*[[{]/.test(text)) return readJson(text);
  const records = csvRecords(text);
  if (records.length < 2) throw new Error("The file needs a header row and at least one row of data.");
  return { headers: records[0]!.cells.map((h) => h.trim()), rows: records.slice(1).map((r) => r.cells) };
}

function readJson(text: string): Sheet {
  let data: unknown = JSON.parse(text);
  if (data && typeof data === "object" && !Array.isArray(data)) data = Object.values(data as Record<string, unknown>).find(Array.isArray) ?? [];
  const list = (data as unknown[]).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  if (!list.length) throw new Error("The JSON needs a list of objects, one per application.");
  const headers = [...new Set(list.flatMap((o) => Object.keys(o)))];
  return { headers, rows: list.map((o) => headers.map((h) => (o[h] === null || o[h] === undefined ? "" : String(o[h])))) };
}

// ── .xlsx ─────────────────────────────────────────────────────────────────────

async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const view = new DataView(buf);
  // End of central directory: signature 0x06054b50, searched from the end.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This doesn't look like an .xlsx file.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const fileName = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const bytes = new Uint8Array(buf, dataStart, size);
    files.set(fileName, async () => {
      if (method === 0) return decoder.decode(bytes);
      if (method !== 8) throw new Error("Unsupported compression in this .xlsx file.");
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    });
  }
  return files;
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(buf: ArrayBuffer): Promise<Sheet> {
  const files = await unzip(buf);
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const shared: string[] = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(xml(await ss()).getElementsByTagName("si"))) shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw new Error("No worksheet found in this .xlsx file.");
  const doc = xml(await files.get(sheetName)!());
  const grid: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("") : v;
      cells[colIndex(c.getAttribute("r") ?? "A")] = value;
    }
    grid.push(Array.from(cells, (x) => x ?? ""));
  }
  const nonEmpty = grid.filter((r) => r.some((x) => x.trim()));
  if (nonEmpty.length < 2) throw new Error("The sheet needs a header row and at least one row of data.");
  return { headers: nonEmpty[0]!.map((h) => h.trim()), rows: nonEmpty.slice(1) };
}
