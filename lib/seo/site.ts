/**
 * Single source of truth for every SEO / Open Graph / structured-data value.
 * Change it here and it propagates to metadata, JSON-LD, sitemap and OG images.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://gucc.green.edu.bd"
).replace(/\/+$/, "");

/** Absolute URL for any site-relative path. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const SITE = {
  name: "Green University Computer Club",
  shortName: "GUCC",
  legalName: "Green University Computer Club (GUCC)",
  alternateNames: [
    "GUCC",
    "Green University Computer Club (GUCC)",
    "GUB Computer Club",
    "Green University of Bangladesh Computer Club",
    "Computer Club of Green University",
  ],
  tagline: "Bangladesh's leading student-run computer club",
  description:
    "Green University Computer Club (GUCC) is the flagship student-run technology club of Green University of Bangladesh, with 7000+ members. Explore our executives, events, programming contests, hackathons and blog.",
  shortDescription:
    "Official website of Green University Computer Club (GUCC) — executives, events, contests, hackathons and blog.",
  foundingDate: "2013-10-19",
  email: "gucc@green.edu.bd",
  locale: "en_US",
  language: "en",
  logo: "/android-chrome-512x512.png",
  wideLogo: "/gucc-logo.png",
  defaultOgImage: "/opengraph-image",
  themeColor: "#16a34a",
  twitterHandle: "@guccofficial",
} as const;

export const PARENT_ORGANIZATION = {
  name: "Green University of Bangladesh",
  alternateName: "GUB",
  url: "https://green.edu.bd",
  department: "Department of Computer Science and Engineering (CSE)",
  departmentUrl: "https://archive-cse.green.edu.bd/",
} as const;

export const ADDRESS = {
  streetAddress: "Purbachal American City, Kanchan, Rupganj",
  addressLocality: "Narayanganj",
  addressRegion: "Dhaka",
  postalCode: "1461",
  addressCountry: "BD",
  full: "Green University of Bangladesh, Purbachal American City, Kanchan, Rupganj, Narayanganj-1461, Dhaka, Bangladesh",
  latitude: 23.8783,
  longitude: 90.5222,
} as const;

/** Every official profile. Feeds `sameAs`, which is what Google uses to merge entities. */
export const SOCIAL_PROFILES = [
  "https://www.facebook.com/GreenUniversityComputerClub",
  "https://www.facebook.com/groups/1455061688068622",
  "https://www.linkedin.com/company/greenuniversitycomputerclub/",
  "https://www.instagram.com/GreenUniversityComputerClub/",
  "https://www.youtube.com/@GreenUniversityComputerClub",
  "https://github.com/GreenUniversityComputerClub",
] as const;

/** Broad topical keywords used on the home page and as metadata defaults. */
export const SITE_KEYWORDS = [
  "GUCC",
  "Green University Computer Club",
  "Green University of Bangladesh",
  "GUB CSE",
  "computer club Bangladesh",
  "university tech club",
  "programming contest Bangladesh",
  "ICPC Bangladesh",
  "hackathon Bangladesh",
  "HackTheAI",
  "GUCC executives",
  "GUCC committee",
  "student club Dhaka",
  "CSE club",
  "tech community Bangladesh",
] as const;
