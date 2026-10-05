/**
 * A sponsorship page as an ordered list of sections. The built-in sections show the page's
 * existing lists (packages, programs, partners…); blocks carry their own content (text, figures,
 * questions, a video…). Pages saved before sections existed get the classic order, so they look
 * the same. Pure: the public page, the dashboard builder and the API's check all use it.
 */
import type { SponsorshipContent } from "./content";

export const BUILTIN_SECTIONS = ["recognition", "programs", "why", "achievements", "partners", "packages", "opportunities", "gallery", "contact"] as const;
export const BLOCK_TYPES = ["text", "stats", "faq", "testimonials", "timeline", "video", "cta", "images", "download"] as const;
export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number];
export type BlockType = (typeof BLOCK_TYPES)[number];
export type SectionType = BuiltinSection | BlockType;

export interface BlockData {
  text: { markdown: string };
  stats: { items: Array<{ value: string; label: string }> };
  faq: { items: Array<{ q: string; a: string }> };
  testimonials: { items: Array<{ quote: string; name: string; role?: string }> };
  timeline: { items: Array<{ date: string; title: string; detail?: string }> };
  video: { url: string; caption?: string };
  cta: { text?: string; label: string; href: string };
  images: { items: Array<{ src: string; alt: string }> };
  download: { label: string; href: string; note?: string };
}

export interface SectionEntry<T extends SectionType = SectionType> {
  id: string;
  type: T;
  /** Hidden sections stay in the list (and the builder) but not on the page. */
  visible?: boolean;
  /** Overrides the section's own heading. */
  heading?: string;
  subheading?: string;
  data?: T extends BlockType ? BlockData[T] : undefined;
}

export const ACCENTS = { green: "#16a34a", teal: "#0d9488", blue: "#2563eb", violet: "#7c3aed", amber: "#d97706", rose: "#e11d48" } as const;
export type Accent = keyof typeof ACCENTS;

export interface PageTheme { accent?: Accent; heroImage?: string }
export interface PageSeo { title?: string; description?: string; ogImage?: string; noIndex?: boolean }

/** The fields a page with sections adds to the classic content. */
export interface SectionedContent extends SponsorshipContent {
  sections?: SectionEntry[];
  theme?: PageTheme;
  seo?: PageSeo;
  heroTitle?: string;
  heroStats?: Array<{ value: string; label: string }>;
}

export const SECTION_LABEL: Record<SectionType, string> = {
  recognition: "Recognition", programs: "Programs", why: "Why sponsor", achievements: "Achievements", partners: "Previous partners", packages: "Packages",
  opportunities: "More ways to support", gallery: "Event photos", contact: "Contact",
  text: "Text", stats: "Figures", faq: "Questions", testimonials: "What partners say", timeline: "Timeline", video: "Video", cta: "Call to action", images: "Pictures", download: "Download",
};

export const BLOCK_HINT: Record<BlockType, string> = {
  text: "Paragraphs, lists and links (Markdown).",
  stats: "Up to eight big figures with a label.",
  faq: "Questions sponsors ask, with answers.",
  testimonials: "Quotes from past sponsors.",
  timeline: "Dates leading up to the event.",
  video: "A YouTube or Vimeo video (loads when played).",
  cta: "A line and a button.",
  images: "Your own pictures from the media library.",
  download: "A proposal or brochure (PDF).",
};

/** A new block with something in it to edit. */
export function blankBlock(type: BlockType, id: string): SectionEntry {
  const data: BlockData[BlockType] = {
    text: { markdown: "Write something here." },
    stats: { items: [{ value: "500+", label: "Participants" }, { value: "30+", label: "Universities" }] },
    faq: { items: [{ q: "When should we confirm?", a: "Two weeks before the event, so your logo is on everything." }] },
    testimonials: { items: [{ quote: "", name: "", role: "" }] },
    timeline: { items: [{ date: "", title: "" }] },
    video: { url: "" },
    cta: { text: "Ready to support the next generation of engineers?", label: "Talk to us", href: "#contact" },
    images: { items: [] },
    download: { label: "Download the proposal (PDF)", href: "" },
  }[type];
  return { id, type, visible: true, data } as SectionEntry;
}

const DEFAULT_ORDER: BuiltinSection[] = ["recognition", "programs", "why", "achievements", "partners", "packages", "opportunities", "gallery", "contact"];
const isType = (t: unknown): t is SectionType => typeof t === "string" && ((BUILTIN_SECTIONS as readonly string[]).includes(t) || (BLOCK_TYPES as readonly string[]).includes(t));
export const isBlock = (t: SectionType): t is BlockType => (BLOCK_TYPES as readonly string[]).includes(t);

/**
 * The sections in order. Without a list, the classic page (every built-in section, in order). A
 * list that misses built-in sections shows only what it names: the builder writes them all.
 */
export function sectionsOf(c: SectionedContent): SectionEntry[] {
  if (!Array.isArray(c.sections)) return DEFAULT_ORDER.map((type) => ({ id: type, type, visible: true }));
  const seen = new Set<string>();
  const out: SectionEntry[] = [];
  for (const s of c.sections) {
    if (!s || typeof s !== "object" || !isType(s.type)) continue;
    const id = typeof s.id === "string" && s.id ? s.id.slice(0, 40) : `${s.type}-${out.length}`;
    if (seen.has(id) || (!isBlock(s.type) && seen.has(`builtin:${s.type}`))) continue;
    seen.add(id);
    if (!isBlock(s.type)) seen.add(`builtin:${s.type}`);
    out.push({ ...s, id });
  }
  return out;
}

/** Only what shows on the page. */
export const visibleSections = (c: SectionedContent) => sectionsOf(c).filter((s) => s.visible !== false);

/** The tiers the comparison table compares: the packages' names (at most four). */
export function comparisonTiers(c: SponsorshipContent): string[] {
  const tiers = (Array.isArray(c.packages) ? c.packages : []).map((p) => p.tier).filter(Boolean);
  return (tiers.length ? tiers : ["Gold Sponsor", "Silver Sponsor", "Bronze Sponsor"]).slice(0, 4);
}

/** Whether a comparison row includes a tier: its own value, or the classic gold/silver/bronze columns. */
export function comparisonValue(row: { values?: Record<string, boolean>; gold?: boolean; silver?: boolean; bronze?: boolean }, tier: string): boolean {
  if (row.values && typeof row.values[tier] === "boolean") return row.values[tier];
  const t = tier.toLowerCase();
  if (t.includes("gold") || t.includes("platinum") || t.includes("title")) return Boolean(row.gold);
  if (t.includes("silver")) return Boolean(row.silver);
  if (t.includes("bronze")) return Boolean(row.bronze);
  return false;
}

/** A YouTube or Vimeo address as its privacy-friendly embed address, or null. */
export function videoEmbed(url: string): { src: string; provider: "youtube" | "vimeo"; id: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,20})/)?.[1] ?? null;
    if (id && /^[\w-]{6,20}$/.test(id)) return { provider: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const v = u.pathname.match(/(\d{6,12})/)?.[1];
      if (v) return { provider: "vimeo", id: v, src: `https://player.vimeo.com/video/${v}?autoplay=1&dnt=1` };
    }
  } catch {
    // not an address
  }
  return null;
}

/** Same-site paths, in-page anchors and https addresses only. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^#[\w-]{1,40}$/.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//") && !/[\s\\]/.test(h)) return h.slice(0, 300);
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(h)) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" ? u.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = <T>(v: unknown, max: number, map: (x: Record<string, unknown>) => T | null): T[] =>
  (Array.isArray(v) ? v : []).slice(0, max).map((x) => (x && typeof x === "object" ? map(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null);

/**
 * The sections, theme and SEO as the API stores them: unknown types dropped, texts trimmed to their
 * limits, links limited to this site, https and in-page anchors. Errors are what can't be fixed
 * by trimming (too many sections).
 */
export function cleanSections(c: SectionedContent): { content: SectionedContent; errors: string[] } {
  const errors: string[] = [];
  const out: SectionedContent = { ...c };
  if (c.sections !== undefined) {
    if (!Array.isArray(c.sections)) errors.push("\"sections\" must be a list.");
    else if (c.sections.length > 30) errors.push("At most 30 sections on a page.");
    else {
      out.sections = sectionsOf(c).map((s) => {
        const base = { id: s.id.replace(/[^\w-]/g, "").slice(0, 40) || s.type, type: s.type, visible: s.visible !== false, ...(s.heading ? { heading: str(s.heading, 120) } : {}), ...(s.subheading ? { subheading: str(s.subheading, 300) } : {}) };
        if (!isBlock(s.type)) return base as SectionEntry;
        const d = (s.data ?? {}) as unknown as Record<string, unknown>;
        let data: unknown;
        switch (s.type) {
          case "text": data = { markdown: str(d.markdown, 8000) }; break;
          case "stats": data = { items: list(d.items, 8, (x) => ({ value: str(x.value, 20), label: str(x.label, 60) })) }; break;
          case "faq": data = { items: list(d.items, 20, (x) => (str(x.q, 200) ? { q: str(x.q, 200), a: str(x.a, 1500) } : null)) }; break;
          case "testimonials": data = { items: list(d.items, 12, (x) => (str(x.quote, 600) ? { quote: str(x.quote, 600), name: str(x.name, 80), role: str(x.role, 120) } : null)) }; break;
          case "timeline": data = { items: list(d.items, 20, (x) => (str(x.title, 120) ? { date: str(x.date, 40), title: str(x.title, 120), detail: str(x.detail, 300) } : null)) }; break;
          case "video": data = { url: videoEmbed(str(d.url, 300)) ? str(d.url, 300) : "", caption: str(d.caption, 200) }; break;
          case "cta": data = { text: str(d.text, 300), label: str(d.label, 40) || "Talk to us", href: safeHref(str(d.href, 500)) ?? "#contact" }; break;
          case "images": data = { items: list(d.items, 24, (x) => { const src = safeHref(str(x.src, 500)); return src && !src.startsWith("#") && !src.startsWith("mailto:") ? { src, alt: str(x.alt, 200) } : null; }) }; break;
          case "download": data = { label: str(d.label, 80) || "Download", href: safeHref(str(d.href, 500)) ?? "", note: str(d.note, 200) }; break;
        }
        return { ...base, data } as SectionEntry;
      });
    }
  }
  if (c.theme !== undefined) {
    const t = (c.theme && typeof c.theme === "object" ? c.theme : {}) as Record<string, unknown>;
    const hero = safeHref(str(t.heroImage, 500));
    out.theme = { ...(typeof t.accent === "string" && t.accent in ACCENTS ? { accent: t.accent as Accent } : {}), ...(hero && !hero.startsWith("#") ? { heroImage: hero } : {}) };
  }
  if (c.seo !== undefined) {
    const s = (c.seo && typeof c.seo === "object" ? c.seo : {}) as Record<string, unknown>;
    const og = safeHref(str(s.ogImage, 500));
    out.seo = {
      ...(str(s.title, 70) ? { title: str(s.title, 70) } : {}),
      ...(str(s.description, 200) ? { description: str(s.description, 200) } : {}),
      ...(og && !og.startsWith("#") ? { ogImage: og } : {}),
      ...(s.noIndex === true ? { noIndex: true } : {}),
    };
  }
  if (c.heroTitle !== undefined) out.heroTitle = str(c.heroTitle, 80) || undefined;
  if (c.heroStats !== undefined) out.heroStats = list(c.heroStats, 4, (x) => (str(x.value, 20) ? { value: str(x.value, 20), label: str(x.label, 60) } : null));
  return { content: out, errors };
}
