/**
 * The certificate fonts as @font-face rules (the files in public/fonts/certificates), for pages
 * that show certificates on screen. Downloads embed the same files.
 */
import { FONT_FACE, type FontKey } from "./text";

export const fontFile = (key: FontKey) => `/fonts/certificates/${key}.ttf`;

export const CERTIFICATE_FONT_CSS = (Object.keys(FONT_FACE) as FontKey[])
  .map((k) => `@font-face{font-family:'${FONT_FACE[k].family}';font-weight:${FONT_FACE[k].weight};font-style:${FONT_FACE[k].style};font-display:swap;src:url('${fontFile(k)}') format('truetype')}`)
  .join("");

/** Which font file a text element uses (by its family, weight and style). */
export function fontKeyOf(family: string, weight: string | number, style: string): FontKey | null {
  const w = Number(weight) || 400;
  const s = style === "italic" ? "italic" : "normal";
  const keys = (Object.keys(FONT_FACE) as FontKey[]).filter((k) => FONT_FACE[k].family === family.replace(/['"]/g, "").trim());
  return keys.find((k) => FONT_FACE[k].weight === w && FONT_FACE[k].style === s) ?? keys.find((k) => FONT_FACE[k].style === s) ?? keys[0] ?? null;
}
