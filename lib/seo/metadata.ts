import type { Metadata } from "next";
import { SITE, SITE_KEYWORDS, SITE_URL, absoluteUrl } from "./site";

type OgType = "website" | "article" | "profile";

export interface OgImageOptions {
  /** Headline on the generated card. */
  title: string;
  /** Secondary line (role, date, category…). */
  subtitle?: string;
  /** Small label above the headline. */
  eyebrow?: string;
  /** Site-relative path to a portrait/cover to composite into the card. */
  photo?: string;
  /** `portrait` renders a circular avatar beside the text. */
  variant?: "default" | "portrait";
}

/**
 * URL of the on-demand Open Graph card renderer.
 * Absolute, because crawlers never resolve relative og:image values reliably.
 */
export function ogImageUrl(options: OgImageOptions): string {
  const params = new URLSearchParams();
  params.set("title", options.title);
  if (options.subtitle) params.set("subtitle", options.subtitle);
  if (options.eyebrow) params.set("eyebrow", options.eyebrow);
  if (options.photo) params.set("photo", options.photo);
  if (options.variant) params.set("variant", options.variant);
  return `${SITE_URL}/api/og?${params.toString()}`;
}

/** Google shows roughly this much of a title; longer is silently clipped. */
const MAX_TITLE = 70;
/** Descriptions past this are clipped too, and read badly when they are. */
const MAX_DESCRIPTION = 300;

/**
 * Appends the brand to a page title, keeping the whole thing inside Google's
 * display limit. The short "GUCC" suffix is used when the title already says
 * "GUCC"/"Green University" (no point repeating the keyword) or when the full
 * club name would push the title over the limit.
 */
export function brandTitle(title: string): string {
  const short = ` | ${SITE.shortName}`;
  const full = ` | ${SITE.name} (${SITE.shortName})`;
  const suffix =
    /GUCC|Green University/i.test(title) || title.length + full.length > MAX_TITLE
      ? short
      : full;
  return `${truncate(title, MAX_TITLE - suffix.length)}${suffix}`;
}

/** Trims to `max` characters on a word boundary, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export interface BuildMetadataOptions {
  title: string;
  description: string;
  /** Site-relative path, e.g. `/executives/2026`. Used for the canonical URL. */
  path: string;
  keywords?: readonly string[];
  /** Either an explicit image URL/path, or options for the generated card. */
  image?: string | OgImageOptions;
  type?: OgType;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  /** Set for thin/utility pages that should not compete in search results. */
  noIndex?: boolean;
}

/**
 * Builds a complete, crawler-ready `Metadata` object: canonical URL,
 * Open Graph, Twitter card and robots directives in one place.
 */
export function buildMetadata({
  title,
  description,
  path,
  keywords,
  image,
  type = "website",
  publishedTime,
  modifiedTime,
  authors,
  noIndex = false,
}: BuildMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  const summary = truncate(description, MAX_DESCRIPTION);
  const imageUrl =
    typeof image === "string"
      ? absoluteUrl(image)
      : image
        ? ogImageUrl(image)
        : ogImageUrl({ title, subtitle: truncate(description, 120) });

  return {
    // Absolute, so the resolved title never depends on how deeply the route is
    // nested — a parent layout with a plain string title clears the inherited
    // template for its descendants.
    title: { absolute: brandTitle(title) },
    description: summary,
    keywords: [...(keywords ?? SITE_KEYWORDS)],
    alternates: { canonical: url },
    ...(noIndex
      ? { robots: { index: false, follow: true, googleBot: { index: false, follow: true } } }
      : {}),
    openGraph: {
      // Social cards have more room than a SERP, so they keep the full title.
      title,
      description: summary,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      type: type === "profile" ? "profile" : type,
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
      ...(authors ? { authors } : {}),
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: summary,
      images: [imageUrl],
    },
  };
}
