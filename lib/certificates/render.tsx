/**
 * The seven certificate designs, as SVG: A4 landscape (297 × 210 mm, in tenths of a millimetre:
 * viewBox 0 0 2970 2100). Pure markup, the same on the server (the verification page), in the
 * dashboard's customiser and in downloads. Only what PDF conversion supports: shapes, paths,
 * plain and radial gradients, clip paths, images and text in the certificate fonts (no masks,
 * filters or foreignObject).
 */
import type { ReactNode } from "react";
import { cleanConfig, fillBody, type CertificateData, type DesignConfig, type Signatory, type TemplateKey } from "./config";
import { qrPath } from "./qr";
import { FONT_FACE, fitBody, fitSize, measure, type FontKey } from "./text";

export const PAGE = { w: 2970, h: 2100 } as const;
const CX = PAGE.w / 2;

type Align = "middle" | "start" | "end";

interface Look {
  paper: string;
  ink: string;
  muted: string;
  primary: string;
  accent: string;
  heading: { font: FontKey; size: number; color: string; upper?: boolean; spacing?: number };
  sub: { font: FontKey; size: number; color: string; upper?: boolean; spacing?: number };
  intro: { font: FontKey; size: number; color: string; upper?: boolean; spacing?: number };
  name: { font: FontKey; size: number; color: string };
  body: { font: FontKey; size: number; color: string };
  small: FontKey;
  sigName: FontKey;
  script: FontKey;
  /** Logos on white plates (dark designs). */
  plates?: boolean;
  seal: string;
  watermark: string;
  watermarkOpacity: number;
  /** Where things sit (the defaults suit a centred design). */
  y: { logos: number; org: number; heading: number; sub: number; intro: number; name: number; body: number; sigLine: number; footer: number };
  left?: number;
  /** Behind the content. */
  back: (c: Ctx) => ReactNode;
  /** Under the name (a rule by default). */
  underName?: (c: Ctx, nameWidth: number) => ReactNode;
  /** A medal between two signatures. */
  medal?: (c: Ctx) => ReactNode;
  showOrg?: boolean;
  orgColor?: string;
  /** The "Issued … · Verify at …" line: centred, or from the left edge at this x. */
  footerX?: number;
  /** How far the side logos sit from the edges. */
  logoInset?: number;
  /** Where the faint seal sits (its centre). */
  watermarkX?: number;
  /** The club's seal is the crest already: no seal in the corners. */
  noSealLogos?: boolean;
}

interface Ctx {
  look: Look;
  config: DesignConfig;
  id: string;
  asset: (p: string) => string;
}

const D_Y = { logos: 160, org: 400, heading: 590, sub: 700, intro: 840, name: 1030, body: 1170, sigLine: 1700, footer: 1955 };

function Txt({ x, y, f, size, fill, anchor = "middle", children, spacing, upper, opacity }: {
  x: number; y: number; f: FontKey; size: number; fill: string; anchor?: Align; children: string; spacing?: number; upper?: boolean; opacity?: number;
}) {
  const face = FONT_FACE[f];
  return (
    <text x={x} y={y} fontFamily={face.family} fontWeight={face.weight} fontStyle={face.style} fontSize={size} fill={fill} textAnchor={anchor}
      letterSpacing={spacing || undefined} opacity={opacity}>
      {upper ? children.toUpperCase() : children}
    </text>
  );
}

function Img({ href, x, y, w, h, opacity, cover }: { href: string; x: number; y: number; w: number; h: number; opacity?: number; cover?: boolean }) {
  return <image href={href} xlinkHref={href} x={x} y={y} width={w} height={h} opacity={opacity} preserveAspectRatio={cover ? "xMidYMid slice" : "xMidYMid meet"} />;
}

/** The club's seal in this colour, or the picture that replaces it. */
const sealOf = (c: Ctx, variant: string) => c.config.seal ?? c.asset(variant);

/** A picture behind everything, over the design's paper (its frame stays on top). */
function Backdrop({ c }: { c: Ctx }) {
  const b = c.config.background;
  return b.image ? <Img href={b.image} x={0} y={0} w={PAGE.w} h={PAGE.h} opacity={b.opacity} cover /> : null;
}

/** A logo slot: the club's seal, the university's wordmark, or a picture of your own. */
function Logo({ c, value, side }: { c: Ctx; value: string | null; side: "left" | "right" }) {
  if (!value || (value === "gucc" && c.look.noSealLogos)) return null;
  const h = 190;
  const isGub = value === "gub";
  const w = isGub ? 472 : h;
  const left = c.look.left;
  const inset = c.look.logoInset ?? 230;
  const x = side === "left" ? (left ? left : inset) : PAGE.w - inset - w;
  const y = c.look.y.logos;
  const href = value === "gucc" ? sealOf(c, c.look.seal) : isGub ? c.asset("/certificates/gub-logo.png") : value;
  return (
    <g>
      {c.look.plates && value !== "gucc" && <rect x={x - 24} y={y - 20} width={w + 48} height={h + 40} rx={28} fill="#ffffff" />}
      <Img href={href} x={x} y={y} w={w} h={h} />
    </g>
  );
}

/** One signatory: the signature (or the name in a script hand) over a line, then name and title. */
function Signature({ c, s, x, width }: { c: Ctx; s: Signatory; x: number; width: number }) {
  const { look } = c;
  const line = look.y.sigLine;
  const anchor: Align = "middle";
  return (
    <g>
      {s.signature ? (
        <Img href={s.signature} x={x - width / 2 + 40} y={line - 190} w={width - 80} h={170} />
      ) : (
        <Txt x={x} y={line - 30} f={look.script} size={fitSize(s.name, look.script, width - 40, 92)} fill={look.ink} anchor={anchor} opacity={0.88}>{s.name}</Txt>
      )}
      <line x1={x - width / 2} y1={line} x2={x + width / 2} y2={line} stroke={look.primary} strokeWidth={3} />
      <Txt x={x} y={line + 58} f={look.sigName} size={fitSize(s.name, look.sigName, width, 40, 28)} fill={look.ink} anchor={anchor}>{s.name}</Txt>
      <Txt x={x} y={line + 104} f={look.small} size={fitSize(s.title, look.small, width + 60, 31, 22)} fill={look.muted} anchor={anchor}>{s.title}</Txt>
      {s.org && <Txt x={x} y={line + 145} f={look.small} size={fitSize(s.org, look.small, width + 60, 27, 20)} fill={look.muted} anchor={anchor}>{s.org}</Txt>}
    </g>
  );
}

/** The QR code (leading to the verification page) with the code under it. */
function Qr({ c, data }: { c: Ctx; data: CertificateData }) {
  const size = 200;
  const x = PAGE.w - 205 - size;
  const y = c.look.y.sigLine - 130;
  const q = qrPath(data.verifyUrl);
  const s = (size - 24) / q.size;
  return (
    <g>
      {c.config.showQr && (
        <g>
          <rect x={x} y={y} width={size} height={size} rx={12} fill="#ffffff" stroke={c.look.primary} strokeWidth={2} />
          <path d={q.d} transform={`translate(${x + 12} ${y + 12}) scale(${s})`} fill="#111827" />
        </g>
      )}
      {c.config.showCode && (
        <Txt x={x + size / 2} y={y + size + 44} f={c.look.small} size={22} fill={c.look.muted} spacing={1}>{data.code}</Txt>
      )}
    </g>
  );
}

const rule = (c: Ctx, w: number) => {
  const width = Math.max(900, Math.min(1700, w + 260));
  const x = c.look.left ?? CX - width / 2;
  return <line x1={x} y1={c.look.y.name + 52} x2={x + width} y2={c.look.y.name + 52} stroke={c.look.accent} strokeWidth={4} />;
};

/** A 4-point star (the logo's diamond). */
const star = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

/** The logo's orange connector: a line with dots at the ends and the diamond in the middle. */
function Connector({ y, x1, x2, color, r = 34 }: { y: number; x1: number; x2: number; color: string; r?: number }) {
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <line x1={x1 + 14} y1={y} x2={mid - r * 0.6} y2={y} stroke={color} strokeWidth={8} />
      <line x1={mid + r * 0.6} y1={y} x2={x2 - 14} y2={y} stroke={color} strokeWidth={8} />
      <circle cx={x1} cy={y} r={14} fill="none" stroke={color} strokeWidth={7} />
      <circle cx={x2} cy={y} r={14} fill="none" stroke={color} strokeWidth={7} />
      <path d={star(mid, y, r)} fill={color} />
    </g>
  );
}

/** A laurel wreath around a circle (the crest): leaves in pairs along both sides, tips meeting at the top. */
function Wreath({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const leaves: ReactNode[] = [];
  const n = 11;
  const rad = (d: number) => (d * Math.PI) / 180;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      // From the bottom (90°) round each side to near the top.
      const theta = 90 - side * (12 + i * 13);
      const x = cx + r * Math.cos(rad(theta));
      const y = cy + r * Math.sin(rad(theta));
      const tangent = theta + (side < 0 ? 90 : -90);
      for (const k of [-1, 1]) {
        const nx = Math.cos(rad(theta)) * 16 * k;
        const ny = Math.sin(rad(theta)) * 16 * k;
        leaves.push(<ellipse key={`${side}${i}${k}`} cx={0} cy={0} rx={12} ry={33} fill={color} transform={`translate(${x + nx} ${y + ny}) rotate(${tangent + 90 + k * side * 32})`} />);
      }
    }
    const a0 = 90 - side * 8;
    const a1 = 90 - side * (12 + (n - 1) * 13);
    leaves.push(<path key={`stem${side}`} d={`M${cx + r * Math.cos(rad(a0))} ${cy + r * Math.sin(rad(a0))}A${r} ${r} 0 0 ${side < 0 ? 1 : 0} ${cx + r * Math.cos(rad(a1))} ${cy + r * Math.sin(rad(a1))}`}
      fill="none" stroke={color} strokeWidth={5} />);
  }
  return <g>{leaves}</g>;
}

/** More logos (partners, sponsors) in a row between the text and the signatures, sized to the room left. */
function ExtraLogos({ c, top, x, anchor }: { c: Ctx; top: number; x: number; anchor: Align }) {
  const logos = c.config.extraLogos;
  if (!logos.length) return null;
  const label = c.config.extraLogosLabel;
  const bottom = c.look.y.sigLine - 215;
  const labelH = label ? 46 : 0;
  const h = Math.max(56, Math.min(120, bottom - top - labelH));
  const w = Math.round(h * 2.1);
  const gap = Math.round(h * 0.45);
  const total = logos.length * w + (logos.length - 1) * gap;
  const x0 = anchor === "start" ? x : x - total / 2;
  const y0 = top + labelH;
  return (
    <g>
      {label && <Txt x={anchor === "start" ? x : x} y={top + 30} f={c.look.small} size={28} fill={c.look.muted} anchor={anchor} spacing={3} upper>{label}</Txt>}
      {logos.map((href, i) => (
        <g key={i}>
          {c.look.plates && <rect x={x0 + i * (w + gap) - 14} y={y0 - 10} width={w + 28} height={h + 20} rx={18} fill="#FFFFFF" />}
          <Img href={href} x={x0 + i * (w + gap)} y={y0} w={w} h={h} />
        </g>
      ))}
    </g>
  );
}

// ───────────────────────────── the designs ─────────────────────────────

const LOOKS: Record<TemplateKey, Look> = {
  heritage: {
    paper: "#FFF3E1", ink: "#3B2A1A", muted: "#6B4F33", primary: "#7D4109", accent: "#B08430",
    heading: { font: "UnifrakturMaguntia-400", size: 210, color: "#7D4109" },
    sub: { font: "CormorantGaramond-500i", size: 92, color: "#5A3410" },
    intro: { font: "EBGaramond-400i", size: 50, color: "#4A3423" },
    name: { font: "PinyonScript-400", size: 172, color: "#3B1F05" },
    body: { font: "EBGaramond-400", size: 48, color: "#3B2A1A" },
    small: "EBGaramond-400", sigName: "CormorantGaramond-600", script: "PinyonScript-400",
    seal: "/certificates/gucc-seal.png", watermark: "/certificates/gucc-seal-mono.png", watermarkOpacity: 0.045,
    y: { ...D_Y, heading: 610, sub: 730, intro: 860 },
    showOrg: true, orgColor: "#7D4109",
    back: (c) => (
      <g>
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.look.paper} />
        <Backdrop c={c} />
        <rect x={50} y={50} width={PAGE.w - 100} height={PAGE.h - 100} fill="none" stroke="#7D4109" strokeWidth={16} />
        <rect x={92} y={92} width={PAGE.w - 184} height={PAGE.h - 184} fill="none" stroke="#7D4109" strokeWidth={4} />
        <rect x={108} y={108} width={PAGE.w - 216} height={PAGE.h - 216} fill="none" stroke="#B08430" strokeWidth={2} />
        {[[92, 92], [PAGE.w - 92, 92], [92, PAGE.h - 92], [PAGE.w - 92, PAGE.h - 92]].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y - 42}L${x + 42} ${y}L${x} ${y + 42}L${x - 42} ${y}Z`} fill="#7D4109" />
            <path d={`M${x} ${y - 20}L${x + 20} ${y}L${x} ${y + 20}L${x - 20} ${y}Z`} fill="#FFF3E1" />
          </g>
        ))}
      </g>
    ),
  },
  laurel: {
    paper: "#FFFDF6", ink: "#1F2937", muted: "#57534E", primary: "#9A7328", accent: "#166534",
    heading: { font: "Cinzel-700", size: 124, color: "#9A7328", upper: true, spacing: 22 },
    sub: { font: "Cinzel-600", size: 52, color: "#166534", upper: true, spacing: 12 },
    intro: { font: "CormorantGaramond-500i", size: 54, color: "#44403C" },
    name: { font: "GreatVibes-400", size: 168, color: "#14532D" },
    body: { font: "CormorantGaramond-500", size: 50, color: "#292524" },
    small: "CormorantGaramond-500", sigName: "Cinzel-600", script: "PinyonScript-400",
    seal: "/certificates/gucc-seal.png", watermark: "/certificates/gucc-seal-mono.png", watermarkOpacity: 0.05,
    y: { ...D_Y, logos: 170, heading: 640, sub: 730, intro: 870, name: 1060, body: 1200 },
    noSealLogos: true,
    back: (c) => (
      <g>
        <defs>
          <radialGradient id={`${c.id}-paper`} cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#FFFEFA" /><stop offset="100%" stopColor="#F5EEDA" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.config.palette?.paper ?? `url(#${c.id}-paper)`} />
        <Backdrop c={c} />
        <rect x={70} y={70} width={PAGE.w - 140} height={PAGE.h - 140} fill="none" stroke="#B08430" strokeWidth={7} rx={8} />
        <rect x={96} y={96} width={PAGE.w - 192} height={PAGE.h - 192} fill="none" stroke="#B08430" strokeWidth={2} rx={4} />
        {/* The crest: the club's seal at the top. */}
        <Wreath cx={CX} cy={285} r={205} color="#B08430" />
        <Img href={sealOf(c, "/certificates/gucc-seal.png")} x={CX - 150} y={135} w={300} h={300} />
      </g>
    ),
    underName: (c, w) => {
      const width = Math.max(1000, Math.min(1700, w + 300));
      const y = c.look.y.name + 48;
      const x1 = CX - width / 2;
      const x2 = CX + width / 2;
      // A green ribbon with notched ends.
      return (
        <g>
          <path d={`M${x1 - 60} ${y}L${x1} ${y}L${x1} ${y + 34}L${x1 - 60} ${y + 34}L${x1 - 36} ${y + 17}Z`} fill="#14532D" />
          <path d={`M${x2 + 60} ${y}L${x2} ${y}L${x2} ${y + 34}L${x2 + 60} ${y + 34}L${x2 + 36} ${y + 17}Z`} fill="#14532D" />
          <rect x={x1} y={y - 4} width={width} height={42} fill="#166534" />
          <line x1={x1} y1={y + 4} x2={x2} y2={y + 4} stroke="#D4B45A" strokeWidth={3} />
          <line x1={x1} y1={y + 30} x2={x2} y2={y + 30} stroke="#D4B45A" strokeWidth={3} />
        </g>
      );
    },
  },
  emerald: {
    paper: "#FFFFFF", ink: "#0F2E25", muted: "#4B5D57", primary: "#C9A84C", accent: "#C9A84C",
    heading: { font: "Cinzel-700", size: 116, color: "#065F46", upper: true, spacing: 26 },
    sub: { font: "Cinzel-600", size: 50, color: "#A8862F", upper: true, spacing: 14 },
    intro: { font: "EBGaramond-400i", size: 52, color: "#374151" },
    name: { font: "GreatVibes-400", size: 164, color: "#064E3B" },
    body: { font: "EBGaramond-400", size: 48, color: "#1F2937" },
    small: "EBGaramond-400", sigName: "Cinzel-600", script: "PinyonScript-400",
    seal: "/certificates/gucc-seal-white.png", watermark: "/certificates/gucc-seal-mono.png", watermarkOpacity: 0.045,
    y: { ...D_Y, logos: 95, heading: 610, sub: 705, intro: 840, name: 1020, body: 1160, sigLine: 1690 },
    footerX: 130,
    back: (c) => (
      <g>
        <defs>
          <linearGradient id={`${c.id}-band`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#064E3B" /><stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id={`${c.id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E9D18A" /><stop offset="50%" stopColor="#C9A84C" /><stop offset="100%" stopColor="#9C7A2B" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.look.paper} />
        <Backdrop c={c} />
        <rect x={0} y={0} width={PAGE.w} height={380} fill={`url(#${c.id}-band)`} />
        <rect x={0} y={380} width={PAGE.w} height={10} fill={`url(#${c.id}-gold)`} />
        <Txt x={CX} y={190} f="Cinzel-700" size={68} fill="#FFFFFF" spacing={10}>GREEN UNIVERSITY COMPUTER CLUB</Txt>
        <Txt x={CX} y={262} f="Montserrat-500" size={34} fill="#E9D18A" spacing={8}>GREEN UNIVERSITY OF BANGLADESH</Txt>
        <rect x={40} y={420} width={PAGE.w - 80} height={PAGE.h - 460} fill="none" stroke={`url(#${c.id}-gold)`} strokeWidth={8} />
        <rect x={64} y={444} width={PAGE.w - 128} height={PAGE.h - 508} fill="none" stroke="#C9A84C" strokeWidth={2} />
        {/* A guilloché-like edge: small gold rings along the inner border. */}
        {Array.from({ length: 70 }, (_, i) => <circle key={`b${i}`} cx={90 + i * 40.5} cy={PAGE.h - 86} r={9} fill="none" stroke="#C9A84C" strokeWidth={2} />)}
      </g>
    ),
    medal: (c) => (
      <g>
        <path d={`M${CX - 90} 1790L${CX - 150} 2010L${CX - 80} 1975L${CX - 40} 2040L${CX + 10} 1830Z`} fill="#065F46" />
        <path d={`M${CX + 90} 1790L${CX + 150} 2010L${CX + 80} 1975L${CX + 40} 2040L${CX - 10} 1830Z`} fill="#047857" />
        <circle cx={CX} cy={1720} r={150} fill={`url(#${c.id}-gold)`} />
        <circle cx={CX} cy={1720} r={128} fill="none" stroke="#FFF7DA" strokeWidth={4} />
        <Img href={sealOf(c, "/certificates/gucc-seal-gold.png")} x={CX - 112} y={1608} w={224} h={224} />
      </g>
    ),
  },
  navy: {
    paper: "#161743", ink: "#F8FAFC", muted: "#CBD5E1", primary: "#C9A84C", accent: "#C9A84C",
    heading: { font: "Cinzel-700", size: 128, color: "#E5C46B", upper: true, spacing: 26 },
    sub: { font: "Cinzel-600", size: 50, color: "#F8FAFC", upper: true, spacing: 14 },
    intro: { font: "EBGaramond-400i", size: 52, color: "#CBD5E1" },
    name: { font: "GreatVibes-400", size: 168, color: "#F2D27A" },
    body: { font: "EBGaramond-400", size: 48, color: "#E2E8F0" },
    small: "EBGaramond-400", sigName: "Cinzel-600", script: "PinyonScript-400",
    plates: true, seal: "/certificates/gucc-seal-gold.png", watermark: "/certificates/gucc-seal-white.png", watermarkOpacity: 0.045,
    y: { ...D_Y, logos: 190, org: 300, heading: 620, sub: 720, intro: 860 },
    showOrg: true, orgColor: "#E5C46B", logoInset: 330,
    back: (c) => {
      const g = "#C9A84C";
      const corner = (x: number, y: number, sx: number, sy: number, k: number) => (
        <g key={k} transform={`translate(${x} ${y}) scale(${sx} ${sy})`} fill="none" stroke={g}>
          <path d="M0 220L0 0L220 0" strokeWidth={6} />
          <path d="M30 170L30 30L170 30" strokeWidth={3} />
          <path d="M60 120L60 60L120 60" strokeWidth={3} />
          <path d={star(0, 0, 26)} fill={g} stroke="none" />
        </g>
      );
      return (
        <g>
          <defs>
            <radialGradient id={`${c.id}-bg`} cx="50%" cy="42%" r="70%">
              <stop offset="0%" stopColor="#23266B" /><stop offset="100%" stopColor="#121338" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.config.palette?.paper ?? `url(#${c.id}-bg)`} />
          <Backdrop c={c} />
          <rect x={60} y={60} width={PAGE.w - 120} height={PAGE.h - 120} fill="none" stroke={g} strokeWidth={6} />
          <rect x={84} y={84} width={PAGE.w - 168} height={PAGE.h - 168} fill="none" stroke={g} strokeWidth={2} />
          {corner(110, 110, 1, 1, 1)}{corner(PAGE.w - 110, 110, -1, 1, 2)}{corner(110, PAGE.h - 110, 1, -1, 3)}{corner(PAGE.w - 110, PAGE.h - 110, -1, -1, 4)}
          {/* An art-deco fan above the heading. */}
          {[70, 110, 150].map((r) => <path key={r} d={`M${CX - r} 480A${r} ${r} 0 0 1 ${CX + r} 480`} fill="none" stroke={g} strokeWidth={3} opacity={0.7} />)}
        </g>
      );
    },
  },
  circuit: {
    paper: "#0B1220", ink: "#F1F5F9", muted: "#94A3B8", primary: "#22C55E", accent: "#22C55E",
    heading: { font: "Orbitron-700", size: 120, color: "#4ADE80", upper: true, spacing: 20 },
    sub: { font: "Orbitron-600", size: 44, color: "#E2E8F0", upper: true, spacing: 12 },
    intro: { font: "Montserrat-500", size: 34, color: "#94A3B8", upper: true, spacing: 6 },
    name: { font: "Montserrat-700", size: 140, color: "#FFFFFF" },
    body: { font: "Montserrat-400", size: 42, color: "#CBD5E1" },
    small: "Montserrat-400", sigName: "Montserrat-600", script: "PinyonScript-400",
    plates: true, seal: "/certificates/gucc-seal-green.png", watermark: "/certificates/gucc-seal-white.png", watermarkOpacity: 0.035,
    y: { ...D_Y, heading: 600, sub: 700, intro: 840 },
    showOrg: true, orgColor: "#4ADE80",
    back: (c) => {
      const green = "#22C55E";
      // Deterministic traces along both sides: right-angle runs ending in nodes.
      const traces: ReactNode[] = [];
      for (let i = 0; i < 6; i++) {
        const y = 480 + i * 190;
        const run = 140 + ((i * 53) % 4) * 60;
        const drop = (i % 2 ? 1 : -1) * (40 + ((i * 37) % 3) * 30);
        for (const side of [0, 1]) {
          const sx = side ? PAGE.w - 70 : 70;
          const dir = side ? -1 : 1;
          const d = `M${sx} ${y}H${sx + dir * run}L${sx + dir * (run + 50)} ${y + drop}H${sx + dir * (run + 50 + 90 + (i % 3) * 40)}`;
          const ex = sx + dir * (run + 50 + 90 + (i % 3) * 40);
          traces.push(
            <g key={`${i}${side}`}>
              <path d={d} fill="none" stroke={green} strokeWidth={14} opacity={0.08} />
              <path d={d} fill="none" stroke={green} strokeWidth={4} opacity={0.65} />
              <circle cx={ex} cy={y + drop} r={11} fill={c.look.paper} stroke={green} strokeWidth={4} />
            </g>,
          );
        }
      }
      return (
        <g>
          <defs>
            <linearGradient id={`${c.id}-bg`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0B1220" /><stop offset="100%" stopColor="#13213F" />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.config.palette?.paper ?? `url(#${c.id}-bg)`} />
          <Backdrop c={c} />
          <rect x={50} y={50} width={PAGE.w - 100} height={PAGE.h - 100} fill="none" stroke={green} strokeWidth={3} opacity={0.55} rx={18} />
          {[[50, 50, 1, 1], [PAGE.w - 50, 50, -1, 1], [50, PAGE.h - 50, 1, -1], [PAGE.w - 50, PAGE.h - 50, -1, -1]].map(([x, y, sx, sy], i) => (
            <path key={i} d={`M${x} ${y! + sy! * 120}V${y}H${x! + sx! * 120}`} fill="none" stroke={green} strokeWidth={10} />
          ))}
          {traces}
        </g>
      );
    },
  },
  minimal: {
    paper: "#FFFFFF", ink: "#0F172A", muted: "#64748B", primary: "#15803D", accent: "#15803D",
    heading: { font: "Montserrat-700", size: 54, color: "#15803D", upper: true, spacing: 22 },
    sub: { font: "Montserrat-600", size: 124, color: "#0F172A" },
    intro: { font: "Montserrat-500", size: 38, color: "#475569" },
    name: { font: "Montserrat-700", size: 132, color: "#0F172A" },
    body: { font: "Montserrat-400", size: 42, color: "#334155" },
    small: "Montserrat-400", sigName: "Montserrat-600", script: "PinyonScript-400",
    seal: "/certificates/gucc-seal.png", watermark: "/certificates/gucc-seal-mono.png", watermarkOpacity: 0.035,
    left: 480, watermarkX: 2050,
    y: { ...D_Y, logos: 150, heading: 470, sub: 620, intro: 820, name: 1000, body: 1140 },
    back: (c) => (
      <g>
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.look.paper} />
        <Backdrop c={c} />
        <rect x={0} y={0} width={300} height={PAGE.h} fill={c.config.palette?.primary ?? "#15803D"} />
        <rect x={300} y={0} width={16} height={PAGE.h} fill="#BBF7D0" />
        <g transform={`translate(186 ${PAGE.h / 2 - 40}) rotate(-90)`}>
          <Txt x={0} y={0} f="Montserrat-700" size={44} fill="#FFFFFF" spacing={14}>GREEN UNIVERSITY COMPUTER CLUB</Txt>
        </g>
        <Img href={sealOf(c, "/certificates/gucc-seal-white.png")} x={60} y={PAGE.h - 280} w={180} h={180} />
        <line x1={480} y1={680} x2={1500} y2={680} stroke="#15803D" strokeWidth={6} />
        <line x1={480} y1={PAGE.h - 120} x2={PAGE.w - 160} y2={PAGE.h - 120} stroke="#E2E8F0" strokeWidth={3} />
      </g>
    ),
  },
  diamond: {
    paper: "#FFFFFF", ink: "#1B1A4A", muted: "#475569", primary: "#1B1A4A", accent: "#F0A030",
    heading: { font: "Montserrat-700", size: 132, color: "#1B1A4A", upper: true, spacing: 28 },
    sub: { font: "Montserrat-600", size: 46, color: "#0B8A1E", upper: true, spacing: 16 },
    intro: { font: "Montserrat-500", size: 38, color: "#475569" },
    name: { font: "GreatVibes-400", size: 166, color: "#1B1A4A" },
    body: { font: "Montserrat-400", size: 42, color: "#334155" },
    small: "Montserrat-400", sigName: "Montserrat-600", script: "PinyonScript-400",
    seal: "/certificates/gucc-seal.png", watermark: "/certificates/gucc-seal-mono.png", watermarkOpacity: 0.04,
    y: { ...D_Y, heading: 620, sub: 710, intro: 880, name: 1060, body: 1190, sigLine: 1710 },
    footerX: 230,
    back: (c) => (
      <g>
        <defs>
          <linearGradient id={`${c.id}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#F4F7FB" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={PAGE.w} height={PAGE.h} fill={c.config.palette?.paper ?? `url(#${c.id}-bg)`} />
        <Backdrop c={c} />
        <rect x={40} y={40} width={PAGE.w - 80} height={PAGE.h - 80} fill="none" stroke="#1B1A4A" strokeWidth={4} />
        <Connector y={120} x1={220} x2={PAGE.w - 220} color="#F0A030" />
        <Connector y={PAGE.h - 120} x1={220} x2={PAGE.w - 220} color="#F0A030" />
        <Txt x={CX} y={420} f="Montserrat-700" size={52} fill="#0B8A1E" spacing={12}>GREEN UNIVERSITY</Txt>
        <Txt x={CX} y={480} f="Montserrat-700" size={40} fill="#1B1A4A" spacing={18}>COMPUTER CLUB</Txt>
        <Connector y={780} x1={CX - 420} x2={CX + 420} color="#F0A030" r={26} />
      </g>
    ),
    underName: (c, w) => {
      const width = Math.max(900, Math.min(1600, w + 240));
      return <line x1={CX - width / 2} y1={c.look.y.name + 52} x2={CX + width / 2} y2={c.look.y.name + 52} stroke="#1B1A4A" strokeWidth={3} />;
    },
  },
};

export const templateLook = (t: TemplateKey) => LOOKS[t];

/**
 * A certificate. `id` keeps gradient names apart when several are on one page. `asset` turns the
 * built-in pictures' paths into addresses (absolute ones for downloads).
 */
export function CertificateSvg({ template, config: raw, data, id = "cert", asset = (p) => p, className }: {
  template: TemplateKey;
  config: DesignConfig;
  data: CertificateData;
  id?: string;
  asset?: (path: string) => string;
  className?: string;
}) {
  const config = cleanConfig(raw);
  const base = LOOKS[template] ?? LOOKS.heritage;
  const p = config.palette ?? {};
  const look: Look = {
    ...base,
    ...(p.paper ? { paper: p.paper } : {}),
    ...(p.ink ? { ink: p.ink, body: { ...base.body, color: p.ink } } : {}),
    ...(p.primary ? { primary: p.primary, heading: { ...base.heading, color: p.primary } } : {}),
    ...(p.accent ? { accent: p.accent } : {}),
  };
  const c: Ctx = { look, config, id, asset };
  const left = look.left;
  const anchor: Align = left ? "start" : "middle";
  const x = left ?? CX;
  const contentWidth = left ? 1900 : 2150;
  const y = look.y;

  const nameSize = fitSize(data.name, look.name.font, contentWidth - 100, look.name.size, look.name.size * 0.5);
  const nameWidth = measure(data.name, look.name.font, nameSize);
  const bodyText = data.body?.trim() || fillBody(config.body, data, config.org);
  const body = fitBody(bodyText, look.body.font, left ? 1950 : 2050, look.body.size, 4, look.body.size * 0.72);
  const lineHeight = body.size * 1.42;

  const sigs = config.signatories.slice(0, 3);
  const medal = look.medal && sigs.length !== 3;
  const slots = sigs.length === 1 ? [left ? 1100 : 2110] : sigs.length === 2 ? (left ? [820, 1620] : [760, 2110]) : (left ? [760, 1380, 2000] : [620, 1385, 2150]);
  const sigWidth = sigs.length === 3 ? 470 : 540;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} width={PAGE.w} height={PAGE.h}
      className={className} role="img" aria-label={`Certificate: ${config.heading} ${config.subheading}, presented to ${data.name}`}>
      {look.back(c)}
      {config.watermark === "seal" && (
        <Img href={config.watermarkImage ?? (config.seal ? config.seal : asset(look.watermark))} x={(look.watermarkX ?? CX) - 520} y={y.name - 640} w={1040} h={1040}
          opacity={config.watermarkImage || config.seal ? Math.min(0.12, look.watermarkOpacity * 1.6) : look.watermarkOpacity} />
      )}
      {template !== "emerald" && <Logo c={c} value={config.logos.left} side="left" />}
      {template === "emerald" ? (
        <>
          {config.logos.left && <Img href={config.logos.left === "gucc" ? sealOf(c, "/certificates/gucc-seal-white.png") : config.logos.left === "gub" ? asset("/certificates/gub-logo.png") : config.logos.left} x={130} y={70} w={240} h={240} />}
          {config.logos.right && (
            <g>
              <rect x={PAGE.w - 600} y={95} width={470} height={190} rx={22} fill="#FFFFFF" />
              <Img href={config.logos.right === "gucc" ? sealOf(c, "/certificates/gucc-seal.png") : config.logos.right === "gub" ? asset("/certificates/gub-logo.png") : config.logos.right} x={PAGE.w - 580} y={110} w={430} h={160} />
            </g>
          )}
        </>
      ) : <Logo c={c} value={config.logos.right} side="right" />}

      {look.showOrg && (
        <Txt x={x} y={y.org} f={look.sigName} size={40} fill={look.orgColor ?? look.primary} anchor={anchor} spacing={10} upper>{config.org}</Txt>
      )}
      <Txt x={x} y={y.heading} f={look.heading.font} size={fitSize(look.heading.upper ? config.heading.toUpperCase() : config.heading, look.heading.font, contentWidth, look.heading.size, 60, look.heading.spacing)}
        fill={look.heading.color} anchor={anchor} spacing={look.heading.spacing} upper={look.heading.upper}>{config.heading}</Txt>
      {config.subheading && (
        <Txt x={x} y={y.sub} f={look.sub.font} size={fitSize(look.sub.upper ? config.subheading.toUpperCase() : config.subheading, look.sub.font, contentWidth, look.sub.size, 30, look.sub.spacing)}
          fill={look.sub.color} anchor={anchor} spacing={look.sub.spacing} upper={look.sub.upper}>{config.subheading}</Txt>
      )}
      {config.intro && (
        <Txt x={x} y={y.intro} f={look.intro.font} size={fitSize(config.intro, look.intro.font, contentWidth, look.intro.size, 26, look.intro.spacing)}
          fill={look.intro.color} anchor={anchor} spacing={look.intro.spacing} upper={look.intro.upper}>{config.intro}</Txt>
      )}
      <Txt x={x} y={y.name} f={look.name.font} size={nameSize} fill={look.name.color} anchor={anchor}>{data.name}</Txt>
      {(look.underName ?? rule)(c, nameWidth)}
      {body.lines.map((line, i) => (
        <Txt key={i} x={x} y={y.body + (template === "laurel" ? 40 : 0) + i * lineHeight} f={look.body.font} size={body.size} fill={look.body.color} anchor={anchor}>{line}</Txt>
      ))}

      <ExtraLogos c={c} top={y.body + (template === "laurel" ? 40 : 0) + (body.lines.length - 1) * lineHeight + 50} x={x} anchor={anchor} />
      {medal && look.medal!(c)}
      {sigs.map((s, i) => <Signature key={i} c={c} s={s} x={slots[i]!} width={sigWidth} />)}
      {sigs.length === 1 && !left && (
        <g>
          <Txt x={740} y={y.sigLine - 30} f={look.sigName} size={44} fill={look.ink}>{data.date}</Txt>
          <line x1={740 - 270} y1={y.sigLine} x2={740 + 270} y2={y.sigLine} stroke={look.primary} strokeWidth={3} />
          <Txt x={740} y={y.sigLine + 58} f={look.small} size={32} fill={look.muted}>Date</Txt>
        </g>
      )}
      <Qr c={c} data={data} />
      <Txt x={left ?? look.footerX ?? CX} y={y.footer} f={look.small} size={28} fill={look.muted} anchor={left || look.footerX ? "start" : "middle"}>
        {`Issued ${data.date} · Verify at ${data.verifyUrl.replace(/^https?:\/\//, "")}`}
      </Txt>
    </svg>
  );
}
