/**
 * The blank-photo check, on synthetic pictures: flat colours, transparent images and "person"
 * placeholders are refused; photo-like pictures pass; small or blurry ones get the right message.
 */
import { describe, expect, it } from "vitest";
import { judge, measure, MIN_SIDE, sharpnessOf, type PhotoCheck } from "@/lib/media/photo-quality";

const S = 64;
type Px = (x: number, y: number) => [number, number, number, number?];

function image(size: number, px: Px): Uint8ClampedArray {
  const d = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b, a = 255] = px(x, y);
    d.set([r, g, b, a], (y * size + x) * 4);
  }
  return d;
}

/** Deterministic noise so the tests never flake. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const verdict = (px: Px, extra: Partial<PhotoCheck["metrics"]> = {}, kind?: "profile" | "group", person?: number) => {
  const data = image(S, px);
  const big = image(128, (x, y) => px(Math.floor(x / 2), Math.floor(y / 2)));
  return judge({ width: 800, height: 800, faces: null, ...measure(data, S, S), sharpness: sharpnessOf(big, 128, 128), ...extra }, { kind, person });
};

/** Something like a portrait: a warm oval "face" with shading on a textured background. */
const photo: Px = (() => {
  const r = rng(7);
  const noise = Array.from({ length: S * S }, () => r());
  return (x, y) => {
    const n = noise[y * S + x]! * 40;
    const dx = (x - 32) / 14, dy = (y - 28) / 18;
    if (dx * dx + dy * dy < 1) return [200 - y + n / 2, 150 - y / 2 + n / 3, 120 + n / 4];
    return [40 + x + n, 80 + y / 2 + n, 60 + ((x * y) % 50) + n];
  };
})();

describe("blank and placeholder pictures", () => {
  it("refuses a plain white, black or grey square", () => {
    for (const c of [255, 0, 128]) expect(verdict(() => [c, c, c]).verdict).toBe("block");
  });

  it("refuses a nearly flat picture with a little noise (a scanned blank page)", () => {
    const r = rng(1);
    expect(verdict(() => { const v = 245 + Math.floor(r() * 6); return [v, v, v]; }).verdict).toBe("block");
  });

  it("refuses a mostly transparent picture whose visible part is flat (a coloured strip)", () => {
    expect(verdict((x) => (x < 10 ? [20, 90, 200, 255] : [0, 0, 0, 0])).reasons).toContain("transparent");
  });

  it("refuses an empty, fully transparent picture", () => {
    expect(verdict(() => [0, 0, 0, 0]).verdict).toBe("block");
  });

  it("refuses a default person silhouette (two flat colours)", () => {
    const silhouette: Px = (x, y) => {
      const head = (x - 32) ** 2 + (y - 22) ** 2 < 100;
      const body = y > 36 && Math.abs(x - 32) < 22 - (y - 36) / 3;
      return head || body ? [255, 255, 255] : [200, 200, 205];
    };
    const v = verdict(silhouette);
    expect(v.verdict).toBe("block");
    expect(v.message).toMatch(/upload your real photo/);
  });

  it("accepts a photo-like picture", () => {
    expect(verdict(photo)).toEqual({ verdict: "ok", reasons: [], message: null });
  });

  it("accepts a cut-out portrait (the person on a transparent background)", () => {
    // The photo's person: a shaded face and shoulders; everything else is transparent.
    const cutout: Px = (x, y) => {
      const face = ((x - 32) / 13) ** 2 + ((y - 24) / 16) ** 2 < 1;
      const shoulders = y > 40 && Math.abs(x - 32) < 10 + (y - 40);
      return face || shoulders ? photo(x, y) : [0, 0, 0, 0];
    };
    const v = verdict(cutout);
    expect(v.reasons).not.toContain("transparent");
    expect(v.verdict).not.toBe("block");
  });

  it("accepts a portrait against a plain white wall", () => {
    const onWhite: Px = (x, y) => {
      const face = ((x - 32) / 12) ** 2 + ((y - 26) / 15) ** 2 < 1;
      const shoulders = y > 44 && Math.abs(x - 32) < 8 + (y - 44);
      return face || shoulders ? photo(x, y) : [255, 255, 255];
    };
    expect(verdict(onWhite).verdict).not.toBe("block");
  });

  it("a person found by the person-finder overrides the colour heuristics", () => {
    const silhouette: Px = (x, y) => ((x - 32) ** 2 + (y - 22) ** 2 < 100 ? [255, 255, 255] : [200, 200, 205]);
    expect(verdict(silhouette).verdict).toBe("block");
    expect(verdict(silhouette, {}, "profile", 0.3).verdict).not.toBe("block");
  });

  it("says when a picture is too small, however detailed", () => {
    const v = verdict(photo, { width: 120, height: 150 });
    expect(v.verdict).toBe("block");
    expect(v.message).toContain(`${MIN_SIDE} px`);
  });

  it("warns (without refusing) about a blurry photo or no face found", () => {
    expect(verdict(photo, { sharpness: 3 })).toMatchObject({ verdict: "warn", reasons: ["blurry"] });
    expect(verdict(photo, { faces: 0 })).toMatchObject({ verdict: "warn", reasons: ["no-face"] });
    // Group pictures needn't show a face.
    expect(verdict(photo, { faces: 0 }, "group").verdict).toBe("ok");
  });
});
