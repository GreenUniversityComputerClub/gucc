/**
 * Fitting text on a certificate the same way on screen and in the PDF: widths come from the fonts'
 * own glyph advances (font-metrics.json, made from the font files), so a long name shrinks to fit
 * and the body wraps where it will really wrap.
 */
import metrics from "./font-metrics.json";

export type FontKey = keyof typeof metrics;

/** The SVG font-family, weight and style of each font file. */
export const FONT_FACE: Record<FontKey, { family: string; weight: number; style: "normal" | "italic" }> = {
  "Cinzel-600": { family: "Cinzel", weight: 600, style: "normal" },
  "Cinzel-700": { family: "Cinzel", weight: 700, style: "normal" },
  "CormorantGaramond-500": { family: "Cormorant Garamond", weight: 500, style: "normal" },
  "CormorantGaramond-500i": { family: "Cormorant Garamond", weight: 500, style: "italic" },
  "CormorantGaramond-600": { family: "Cormorant Garamond", weight: 600, style: "normal" },
  "EBGaramond-400": { family: "EB Garamond", weight: 400, style: "normal" },
  "EBGaramond-400i": { family: "EB Garamond", weight: 400, style: "italic" },
  "GreatVibes-400": { family: "Great Vibes", weight: 400, style: "normal" },
  "Montserrat-400": { family: "Montserrat", weight: 400, style: "normal" },
  "Montserrat-500": { family: "Montserrat", weight: 500, style: "normal" },
  "Montserrat-600": { family: "Montserrat", weight: 600, style: "normal" },
  "Montserrat-700": { family: "Montserrat", weight: 700, style: "normal" },
  "Orbitron-600": { family: "Orbitron", weight: 600, style: "normal" },
  "Orbitron-700": { family: "Orbitron", weight: 700, style: "normal" },
  "PinyonScript-400": { family: "Pinyon Script", weight: 400, style: "normal" },
  "UnifrakturMaguntia-400": { family: "UnifrakturMaguntia", weight: 400, style: "normal" },
};

/** The text's width at `size` (letter spacing included), in the certificate's units. */
export function measure(text: string, font: FontKey, size: number, letterSpacing = 0): number {
  const m = metrics[font];
  let units = 0;
  for (const ch of text) {
    const i = ch.charCodeAt(0) - 32;
    units += i >= 0 && i < m.a.length ? m.a[i]! : m.avg;
  }
  return (units / 1000) * size + Math.max(0, [...text].length - 1) * letterSpacing;
}

/** The largest size from `max` down to `min` at which the text fits `width`. */
export function fitSize(text: string, font: FontKey, width: number, max: number, min = max * 0.45, letterSpacing = 0): number {
  const w = measure(text, font, max, letterSpacing);
  if (w <= width) return max;
  return Math.max(min, Math.floor((max * width) / w));
}

/** Lines of at most `width`, broken between words (a word longer than a line is kept whole). */
export function wrap(text: string, font: FontKey, size: number, width: number, maxLines = 5): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, font, size) > width) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s+\S*$/, "")}…`;
  return kept;
}

/** A body that fits a box: the size shrinks (down to `min`) until the lines fit `maxLines`. */
export function fitBody(text: string, font: FontKey, width: number, size: number, maxLines: number, min = size * 0.75): { size: number; lines: string[] } {
  for (let s = size; s >= min; s -= 2) {
    const lines = wrap(text, font, s, width, 99);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  return { size: min, lines: wrap(text, font, min, width, maxLines) };
}
