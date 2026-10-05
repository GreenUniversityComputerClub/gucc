/**
 * Certificate designs: one of the built-in templates plus the club's choices (texts with
 * placeholders, colours, logos, signatories, watermark, QR code). Pure and shared: the dashboard's
 * customiser, the API's check and the renderer read the same rules.
 */

export const TEMPLATES = ["heritage", "laurel", "emerald", "navy", "circuit", "minimal", "diamond"] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

export const TEMPLATE_INFO: Record<TemplateKey, { name: string; hint: string }> = {
  heritage: { name: "Heritage", hint: "Cream paper, a brown double frame, blackletter title: the club's classic certificate." },
  laurel: { name: "Laurel Crest", hint: "Ivory with the GUCC seal as a crest, gold laurels and a green ribbon." },
  emerald: { name: "Emerald Prestige", hint: "A deep green band with the GUCC name, gold border and a gold medal." },
  navy: { name: "Royal Navy", hint: "The logo's navy with a gold art-deco frame and engraved capitals." },
  circuit: { name: "Circuit Tech", hint: "Midnight with glowing circuit traces: for contests and hackathons." },
  minimal: { name: "Modern Minimal", hint: "White, hairline rules and a bold green side band." },
  diamond: { name: "Diamond Line", hint: "The logo's orange line and diamond as dividers, clean and modern." },
};

/** What a certificate is for (it picks the default wording). */
export const KINDS = ["PARTICIPATION", "APPRECIATION", "ACHIEVEMENT", "EXECUTIVE", "VOLUNTEER", "SPEAKER", "COMPLETION"] as const;
export type CertificateKind = (typeof KINDS)[number];

export const KIND_LABEL: Record<CertificateKind, string> = {
  PARTICIPATION: "Participation", APPRECIATION: "Appreciation", ACHIEVEMENT: "Achievement", EXECUTIVE: "Executive service",
  VOLUNTEER: "Volunteering", SPEAKER: "Speaker", COMPLETION: "Completion",
};

export interface Signatory {
  name: string;
  title: string;
  org?: string;
  /** A picture of the signature (transparent PNG works best); without one, the name in a script hand. */
  signature?: string | null;
}

export interface DesignConfig {
  heading: string;
  subheading: string;
  intro: string;
  /** Placeholders: {name} {role} {event} {title} {date} {team} {rank} {org}. */
  body: string;
  /** Overrides of the template's colours. */
  palette?: { primary?: string; accent?: string; paper?: string; ink?: string };
  /** Logos in the top corners: a picture's address, "gucc" (the club's seal) or "gub" (the university), or none. */
  logos: { left: string | null; right: string | null };
  /** A picture that replaces the GUCC seal everywhere the design uses it (crest, medal, band, background mark). */
  seal: string | null;
  /** The faint mark behind the text: the seal, a picture of your own, or none. */
  watermark: "seal" | "none";
  watermarkImage: string | null;
  /** A picture behind everything (the design's frame stays on top), and how strongly it shows. */
  background: { image: string | null; opacity: number };
  /** More logos in a row above the signatures (partners, sponsors, co-organisers). */
  extraLogos: string[];
  extraLogosLabel: string;
  signatories: Signatory[];
  showQr: boolean;
  showCode: boolean;
  /** The organisation line under the heading. */
  org: string;
}

const HEADINGS: Record<CertificateKind, [string, string, string]> = {
  PARTICIPATION: ["Certificate", "of Participation", "for taking part in {event}, organized by the Green University Computer Club on {date}."],
  APPRECIATION: ["Certificate", "of Appreciation", "in recognition of valuable contributions to {event} and the Green University Computer Club."],
  ACHIEVEMENT: ["Certificate", "of Achievement", "for securing {rank} in {event}{team}, organized by the Green University Computer Club on {date}."],
  EXECUTIVE: ["Certificate", "of Appreciation", "for outstanding service as {role} of the Green University Computer Club. Your leadership and dedication made a lasting difference."],
  VOLUNTEER: ["Certificate", "of Volunteering", "for dedicated volunteer service at {event}, organized by the Green University Computer Club on {date}."],
  SPEAKER: ["Certificate", "of Appreciation", "for sharing knowledge as {role} at {event}, organized by the Green University Computer Club on {date}."],
  COMPLETION: ["Certificate", "of Completion", "for successfully completing {event}, organized by the Green University Computer Club on {date}."],
};

export const DEFAULT_SIGNATORIES: Signatory[] = [
  { name: "Md. Monirul Islam", title: "Moderator", org: "Green University Computer Club" },
  { name: "Dr. Muhammad Aminur Rahaman", title: "Chairperson, Dept. of CSE", org: "Green University of Bangladesh" },
];

export function defaultConfig(kind: CertificateKind = "PARTICIPATION"): DesignConfig {
  const [heading, subheading, body] = HEADINGS[kind];
  return {
    heading, subheading, body,
    intro: "This certificate is proudly presented to",
    org: "Green University Computer Club",
    logos: { left: "gucc", right: "gub" },
    seal: null,
    watermark: "seal",
    watermarkImage: null,
    background: { image: null, opacity: 1 },
    extraLogos: [],
    extraLogosLabel: "In collaboration with",
    signatories: DEFAULT_SIGNATORIES.map((s) => ({ ...s })),
    showQr: true,
    showCode: true,
  };
}

/** The default wording for a kind (the wizard swaps it in when the kind changes). */
export const wordingOf = (kind: CertificateKind) => ({ heading: HEADINGS[kind][0], subheading: HEADINGS[kind][1], body: HEADINGS[kind][2] });

const HEX = /^#[0-9a-fA-F]{6}$/;
const text = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fallback);
/** Same-site paths, https addresses, data: images (from the customiser) and the built-in logos. */
const imageRef = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (s === "gucc" || s === "gub") return s;
  if (s.startsWith("/") && !s.startsWith("//") && s.length <= 300) return s;
  if (/^https:\/\/[^\s"'<>]{4,500}$/.test(s)) return s;
  return null;
};

/** A design as stored: every field present, every text within its limit, links checked. */
export function cleanConfig(raw: unknown, kind: CertificateKind = "PARTICIPATION"): DesignConfig {
  const d = defaultConfig(kind);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const palette = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>;
  const logos = (r.logos && typeof r.logos === "object" ? r.logos : {}) as Record<string, unknown>;
  const background = (r.background && typeof r.background === "object" ? r.background : {}) as Record<string, unknown>;
  const opacity = Number(background.opacity);
  const signatories = (Array.isArray(r.signatories) ? r.signatories : d.signatories).slice(0, 3)
    .map((s) => (s && typeof s === "object" ? s as Record<string, unknown> : {}))
    .map((s) => ({ name: text(s.name, 60), title: text(s.title, 80), org: text(s.org, 80) || undefined, signature: imageRef(s.signature) }))
    .filter((s) => s.name);
  return {
    heading: text(r.heading, 40, d.heading) || d.heading,
    subheading: text(r.subheading, 60, d.subheading),
    intro: text(r.intro, 120, d.intro),
    body: text(r.body, 400, d.body) || d.body,
    org: text(r.org, 80, d.org) || d.org,
    palette: Object.fromEntries(["primary", "accent", "paper", "ink"].filter((k) => typeof palette[k] === "string" && HEX.test(palette[k] as string)).map((k) => [k, palette[k] as string])),
    logos: { left: "left" in logos ? imageRef(logos.left) : d.logos.left, right: "right" in logos ? imageRef(logos.right) : d.logos.right },
    seal: ((v) => (v === "gucc" || v === "gub" ? null : v))(imageRef(r.seal)),
    watermark: r.watermark === "none" ? "none" : "seal",
    watermarkImage: imageRef(r.watermarkImage),
    background: { image: imageRef(background.image), opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.1, opacity)) : 1 },
    extraLogos: (Array.isArray(r.extraLogos) ? r.extraLogos : []).map(imageRef).filter((x): x is string => Boolean(x)).slice(0, 6),
    extraLogosLabel: text(r.extraLogosLabel, 60, d.extraLogosLabel),
    signatories: signatories.length ? signatories : d.signatories,
    showQr: r.showQr !== false,
    showCode: r.showCode !== false,
  };
}

export interface CertificateData {
  name: string;
  role?: string | null;
  event?: string | null;
  title?: string | null;
  team?: string | null;
  rank?: string | null;
  /** Issued on, as printed ("12 October 2026"). */
  date: string;
  /** GUCC-XXXX-… */
  code: string;
  /** Where the QR code leads. */
  verifyUrl: string;
  /** A per-person sentence that replaces the body. */
  body?: string | null;
}

/** The body with its placeholders filled ({team} reads " with team X" when there's a team). */
export function fillBody(template: string, d: CertificateData, org: string): string {
  const vars: Record<string, string> = {
    name: d.name, role: d.role || "a member", event: d.event || d.title || "the event", title: d.title || d.event || "",
    date: d.date, team: d.team ? ` with team ${d.team}` : "", rank: d.rank || "a top position", org,
  };
  return template.replace(/\{(name|role|event|title|date|team|rank|org)\}/g, (_, k: string) => vars[k] ?? "").replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim();
}

export const formatIssued = (iso: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00+06:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" });
};
