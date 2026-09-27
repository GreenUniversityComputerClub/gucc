import { describe, expect, it } from "vitest";
import { renderMarkdown, safeUrl } from "@/lib/markdown";
import { dimensions, hasMetadata, sniff, stripMetadata } from "@/lib/media/bytes";

describe("markdown rendering is safe for member-authored content", () => {
  it("renders ordinary markdown", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** and a [link](https://gucc.green.edu.bd).\n\n```js\nlet a = 1 < 2;\n```");
    expect(html).toContain('<h1 id="title">');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://gucc.green.edu.bd/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("let a = 1 &lt; 2;");
  });
  it("never emits raw HTML or scripts", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\nText <b onclick="x()">b</b>');
    expect(html).not.toMatch(/<script|<img src=x|<b onclick/i);
    expect(html).toContain("&lt;script&gt;");
  });
  it("drops dangerous URLs", () => {
    const html = renderMarkdown("[x](javascript:alert(1)) ![y](data:text/html;base64,AAAA) [z](vbscript:msgbox)");
    expect(html).not.toMatch(/javascript:|data:text|vbscript:/i);
    expect(safeUrl("/events/abc")).toBe("/events/abc");
    expect(safeUrl("//evil.com")).toBeNull();
    expect(safeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
});

// Minimal real files built by hand.
function png(width: number, height: number, extra: Uint8Array[] = []): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), ...extra.map((e) => chunk("tEXt", e)), chunk("IDAT", new Uint8Array([0])), chunk("IEND", new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return buf;
}

function jpeg(width: number, height: number, withExif: boolean): Uint8Array {
  const exif = withExif ? [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00] : [];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, ...exif, ...sof, 0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]);
}

describe("upload inspection", () => {
  it("identifies files by signature, not name", () => {
    expect(sniff(png(10, 10))).toBe("image/png");
    expect(sniff(jpeg(10, 10, false))).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("%PDF-1.7 ....."))).toBe("application/pdf");
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>......"))).toBeNull();
    expect(sniff(new TextEncoder().encode("MZ\x90\x00 executable....."))).toBeNull();
  });
  it("reads dimensions from headers", () => {
    expect(dimensions(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(dimensions(jpeg(1920, 1080, true), "image/jpeg")).toEqual({ width: 1920, height: 1080 });
  });
  it("strips EXIF from JPEG and text chunks from PNG", () => {
    const j = jpeg(100, 50, true);
    expect(hasMetadata(j, "image/jpeg")).toBe(true);
    const clean = stripMetadata(j, "image/jpeg");
    expect(hasMetadata(clean, "image/jpeg")).toBe(false);
    expect(dimensions(clean, "image/jpeg")).toEqual({ width: 100, height: 50 });
    const p = png(20, 20, [new TextEncoder().encode("GPS\0lat=23.8")]);
    expect(hasMetadata(p, "image/png")).toBe(true);
    expect(hasMetadata(stripMetadata(p, "image/png"), "image/png")).toBe(false);
  });
});
