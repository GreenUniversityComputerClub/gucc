/**
 * Byte-level file inspection: identify files by signature (never by name or
 * client-declared type), read image dimensions from headers, and strip
 * metadata (EXIF GPS, XMP, comments) from JPEG, PNG and WebP.
 *
 * Pure and dependency-free so it runs inside a Worker without native modules.
 */

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "application/pdf";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));

export function sniff(b: Uint8Array): SniffedType | null {
  if (b.length < 12) return null;
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (ascii(b, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(b, 8, 4))) return "image/avif";
  if (ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export const EXTENSION: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function dimensions(b: Uint8Array, type: SniffedType): { width: number; height: number } | null {
  try {
    if (type === "image/png") return { width: u32be(b, 16), height: u32be(b, 20) };
    if (type === "image/jpeg") {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) return null;
        const marker = b[o + 1];
        const len = u16be(b, o + 2);
        // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
        }
        o += 2 + len;
      }
      return null;
    }
    if (type === "image/webp") {
      const chunk = ascii(b, 12, 4);
      if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
      if (chunk === "VP8L") {
        const bits = u32le(b, 21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
      return null;
    }
    if (type === "image/avif") {
      // Find the 'ispe' box: width/height as 32-bit big-endian after version/flags.
      for (let o = 0; o + 20 < b.length && o < 65536; o++) {
        if (b[o] === 0x69 && ascii(b, o, 4) === "ispe") return { width: u32be(b, o + 8), height: u32be(b, o + 12) };
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Whether an image can have see-through pixels: a WebP with the VP8X alpha flag or a lossless
 * VP8L alpha bit, or a PNG whose colour type has alpha (or a tRNS chunk). A cut-out portrait (the
 * background removed) is mostly transparent and compresses to very little, so the blank-photo
 * size check must not apply to it.
 */
export function hasAlpha(b: Uint8Array, type: SniffedType): boolean {
  try {
    if (type === "image/webp") {
      const chunk = ascii(b, 12, 4);
      if (chunk === "VP8X") return (b[20]! & 0x10) !== 0;
      if (chunk === "VP8L") return ((u32le(b, 21) >>> 28) & 1) === 1;
      return false;
    }
    if (type === "image/png") {
      const colourType = b[25];
      if (colourType === 4 || colourType === 6) return true;
      // A palette or grey image can still carry transparency in a tRNS chunk before the image data.
      for (let o = 8; o + 8 < b.length && o < 65536;) {
        const len = u32be(b, o);
        const name = ascii(b, o + 4, 4);
        if (name === "tRNS") return true;
        if (name === "IDAT") return false;
        o += 12 + len;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/** JPEG: drop APP1 (EXIF/XMP), APP3–APP15 and COM; keep APP0 (JFIF), APP2 (ICC colour) and image data. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) break;
    const marker = b[o + 1];
    if (marker === 0xda) {
      out.push(b.subarray(o));
      return concat(out);
    }
    const len = u16be(b, o + 2);
    const seg = b.subarray(o, o + 2 + len);
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    o += 2 + len;
  }
  out.push(b.subarray(o));
  return concat(out);
}

/** PNG: drop textual, time and EXIF chunks. */
function stripPng(b: Uint8Array): Uint8Array {
  const DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    const end = o + 12 + len;
    if (!DROP.has(type)) out.push(b.subarray(o, end));
    o = end;
    if (type === "IEND") break;
  }
  return concat(out);
}

/** WebP: drop EXIF and XMP chunks and clear their flags in VP8X. */
function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let o = 12;
  while (o + 8 <= b.length) {
    const type = ascii(b, o, 4);
    const size = u32le(b, o + 4);
    const end = o + 8 + size + (size % 2);
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(o, Math.min(end, b.length));
      if (type === "VP8X") chunk[8] &= ~(0x08 | 0x04); // EXIF and XMP flags
      chunks.push(chunk);
    }
    o = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >> 8) & 0xff;
  header[6] = (riffSize >> 16) & 0xff;
  header[7] = (riffSize >> 24) & 0xff;
  return concat([header, body]);
}

export function stripMetadata(b: Uint8Array, type: SniffedType): Uint8Array {
  if (type === "image/jpeg") return stripJpeg(b);
  if (type === "image/png") return stripPng(b);
  if (type === "image/webp") return stripWebp(b);
  return b;
}

/** True if any metadata chunk that could carry location or personal data remains. */
export function hasMetadata(b: Uint8Array, type: SniffedType): boolean {
  if (type === "image/jpeg") {
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1];
      if (m === 0xda) return false;
      if (m === 0xe1 || m === 0xfe) return true;
      o += 2 + u16be(b, o + 2);
    }
    return false;
  }
  if (type === "image/png") return ["tEXt", "zTXt", "iTXt", "eXIf"].some((t) => indexOfAscii(b, t) >= 0);
  if (type === "image/webp") return indexOfAscii(b, "EXIF") >= 12 || indexOfAscii(b, "XMP ") >= 12;
  return false;
}

function indexOfAscii(b: Uint8Array, s: string): number {
  const codes = [...s].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= b.length - codes.length; i++) {
    for (let j = 0; j < codes.length; j++) if (b[i + j] !== codes[j]) continue outer;
    return i;
  }
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Variant names and the longest side each may have. */
export const VARIANTS = { thumb: 400, sm: 800, md: 1280, lg: 1920, master: 2560 } as const;
export type VariantName = keyof typeof VARIANTS;
