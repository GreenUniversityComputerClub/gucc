/** Which uploads can have see-through pixels (cut-out portraits skip the blank-photo size check). */
import { describe, expect, it } from "vitest";
import { hasAlpha } from "@/lib/media/bytes";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A RIFF/WEBP header followed by one chunk header and payload. */
function webp(chunk: "VP8X" | "VP8L" | "VP8 ", payload: number[]): Uint8Array {
  const body = [...ascii(chunk), payload.length, 0, 0, 0, ...payload];
  return new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...body, ...new Array(16).fill(0)]);
}

/** A PNG signature, IHDR with the given colour type, then optional extra chunk names. */
function png(colourType: number, chunks: string[] = []): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [0, 0, 0, 13, ...ascii("IHDR"), 0, 0, 0, 10, 0, 0, 0, 10, 8, colourType, 0, 0, 0, 0, 0, 0, 0];
  const rest = chunks.flatMap((name) => [0, 0, 0, 0, ...ascii(name), 0, 0, 0, 0]);
  return new Uint8Array([...sig, ...ihdr, ...rest, ...new Array(8).fill(0)]);
}

describe("hasAlpha", () => {
  it("reads the VP8X alpha flag", () => {
    expect(hasAlpha(webp("VP8X", [0x10, 0, 0, 0, 9, 0, 0, 9, 0, 0]), "image/webp")).toBe(true);
    expect(hasAlpha(webp("VP8X", [0x00, 0, 0, 0, 9, 0, 0, 9, 0, 0]), "image/webp")).toBe(false);
  });

  it("reads the lossless (VP8L) alpha bit", () => {
    // Signature byte, then 14 bits width-1, 14 bits height-1, 1 bit alpha, 3 bits version.
    const bits = (9) | (9 << 14) | (1 << 28);
    const withAlpha = webp("VP8L", [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
    expect(hasAlpha(withAlpha, "image/webp")).toBe(true);
    const opaqueBits = (9) | (9 << 14);
    expect(hasAlpha(webp("VP8L", [0x2f, opaqueBits & 255, (opaqueBits >>> 8) & 255, (opaqueBits >>> 16) & 255, (opaqueBits >>> 24) & 255]), "image/webp")).toBe(false);
  });

  it("treats lossy VP8 without VP8X as opaque", () => {
    expect(hasAlpha(webp("VP8 ", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "image/webp")).toBe(false);
  });

  it("reads PNG colour types and tRNS", () => {
    expect(hasAlpha(png(6), "image/png")).toBe(true);
    expect(hasAlpha(png(4), "image/png")).toBe(true);
    expect(hasAlpha(png(2, ["IDAT"]), "image/png")).toBe(false);
    expect(hasAlpha(png(3, ["PLTE", "tRNS", "IDAT"]), "image/png")).toBe(true);
  });

  it("never claims alpha for JPEG", () => {
    expect(hasAlpha(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "image/jpeg")).toBe(false);
  });
});
