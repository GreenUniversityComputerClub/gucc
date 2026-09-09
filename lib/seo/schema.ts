import {
  ADDRESS,
  PARENT_ORGANIZATION,
  SITE,
  SITE_URL,
  SOCIAL_PROFILES,
  absoluteUrl,
} from "./site";

/** Stable @id values so every graph node points at the same entity. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

type Json = Record<string, unknown>;

/** Drops undefined/null/empty values so the emitted JSON-LD stays valid. */
function clean<T extends Json>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  ) as T;
}

/**
 * The club itself. Emitted on every page so Google can consolidate the entity
 * and build a knowledge panel from `sameAs` + `logo` + `parentOrganization`.
 */
export function organizationSchema(members?: Json[]): Json {
  return clean({
    "@type": ["Organization", "EducationalOrganization"],
    "@id": ORGANIZATION_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    alternateName: [...SITE.alternateNames],
    url: `${SITE_URL}/`,
    description: SITE.description,
    slogan: SITE.tagline,
    foundingDate: SITE.foundingDate,
    email: SITE.email,
    logo: {
      "@type": "ImageObject",
      "@id": `${SITE_URL}/#logo`,
      url: absoluteUrl(SITE.logo),
      contentUrl: absoluteUrl(SITE.logo),
      width: 512,
      height: 512,
      caption: SITE.name,
    },
    image: absoluteUrl(SITE.logo),
    sameAs: [...SOCIAL_PROFILES],
    address: {
      "@type": "PostalAddress",
      streetAddress: ADDRESS.streetAddress,
      addressLocality: ADDRESS.addressLocality,
      addressRegion: ADDRESS.addressRegion,
      postalCode: ADDRESS.postalCode,
      addressCountry: ADDRESS.addressCountry,
    },
    parentOrganization: {
      "@type": "CollegeOrUniversity",
      name: PARENT_ORGANIZATION.name,
      alternateName: PARENT_ORGANIZATION.alternateName,
      url: PARENT_ORGANIZATION.url,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "general enquiries",
      email: SITE.email,
      areaServed: "BD",
      availableLanguage: ["English", "Bengali"],
    },
    member: members,
  });
}

/** The site as a whole — lets Google attribute the domain to the club. */
export function websiteSchema(): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: SITE.name,
    alternateName: SITE.shortName,
    description: SITE.description,
    inLanguage: SITE.language,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export interface PersonInput {
  name: string;
  /** Canonical profile path, e.g. `/executives/232002184`. */
  path?: string;
  position?: string;
  /** Faculty designation, e.g. "Assistant Professor". */
  designation?: string;
  image?: string;
  year?: string;
  sameAs?: (string | null | undefined)[];
  description?: string;
}

/**
 * A single executive. `image` + `jobTitle` + `sameAs` are what surface the
 * person's photo and name in Google's people results.
 */
export function personSchema(person: PersonInput): Json {
  const url = person.path ? absoluteUrl(person.path) : undefined;
  const sameAs = (person.sameAs ?? []).filter(
    (link): link is string => typeof link === "string" && link.startsWith("http")
  );

  return clean({
    "@type": "Person",
    "@id": url ? `${url}#person` : undefined,
    name: person.name,
    url,
    jobTitle: person.position ?? person.designation,
    description:
      person.description ??
      [person.position, person.year && `${person.year} committee`, SITE.name]
        .filter(Boolean)
        .join(" · "),
    image: person.image
      ? {
          "@type": "ImageObject",
          url: absoluteUrl(person.image),
          contentUrl: absoluteUrl(person.image),
          caption: `${person.name}${person.position ? ` — ${person.position}` : ""}, ${SITE.shortName}`,
        }
      : undefined,
    // Deliberately no `email`: Google makes no use of Person.email, and
    // publishing students' personal addresses as machine-readable data only
    // helps scrapers. The club address stays on the Organization node.
    memberOf: { "@id": ORGANIZATION_ID },
    affiliation: {
      "@type": "CollegeOrUniversity",
      name: PARENT_ORGANIZATION.name,
      url: PARENT_ORGANIZATION.url,
    },
    worksFor: { "@id": ORGANIZATION_ID },
    sameAs: sameAs.length ? sameAs : undefined,
  });
}

/** Wraps a Person so Google treats the URL as that person's profile page. */
export function profilePageSchema(person: PersonInput, dateModified?: string): Json {
  const url = person.path ? absoluteUrl(person.path) : `${SITE_URL}/`;
  return clean({
    "@type": "ProfilePage",
    "@id": `${url}#profilepage`,
    url,
    name: `${person.name}${person.position ? ` — ${person.position}` : ""} | ${SITE.shortName}`,
    inLanguage: SITE.language,
    isPartOf: { "@id": WEBSITE_ID },
    dateModified,
    mainEntity: personSchema(person),
    about: { "@id": ORGANIZATION_ID },
  });
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** Renders the breadcrumb trail Google shows in place of the raw URL. */
export function breadcrumbSchema(items: BreadcrumbItem[]): Json {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(items[items.length - 1]?.path ?? "/")}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export interface ListItemInput {
  name: string;
  path?: string;
  image?: string;
  node?: Json;
}

/** An ordered list — used for executive rosters and event/contest indexes. */
export function itemListSchema(name: string, items: ListItemInput[]): Json {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: items.map((item, index) =>
      clean({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: item.path ? absoluteUrl(item.path) : undefined,
        image: item.image ? absoluteUrl(item.image) : undefined,
        item: item.node,
      })
    ),
  };
}

export function collectionPageSchema(options: {
  name: string;
  description: string;
  path: string;
  list?: Json;
}): Json {
  return clean({
    "@type": "CollectionPage",
    "@id": `${absoluteUrl(options.path)}#webpage`,
    url: absoluteUrl(options.path),
    name: options.name,
    description: options.description,
    inLanguage: SITE.language,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
    mainEntity: options.list,
  });
}

export interface EventInput {
  name: string;
  path: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  image?: string;
  organizer?: string;
  attendees?: number;
}

/** Event rich results (date, venue, organiser) for the events section. */
export function eventSchema(event: EventInput): Json {
  const isPast = new Date(event.startDate).getTime() < Date.now();
  return clean({
    "@type": "Event",
    "@id": `${absoluteUrl(event.path)}#event`,
    name: event.name,
    url: absoluteUrl(event.path),
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate ?? event.startDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: event.image ? [absoluteUrl(event.image)] : [absoluteUrl(SITE.logo)],
    location: {
      "@type": "Place",
      name: event.location || PARENT_ORGANIZATION.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: ADDRESS.streetAddress,
        addressLocality: ADDRESS.addressLocality,
        addressRegion: ADDRESS.addressRegion,
        postalCode: ADDRESS.postalCode,
        addressCountry: ADDRESS.addressCountry,
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.organizer || SITE.name,
      url: `${SITE_URL}/`,
    },
    performer: event.organizer ? { "@type": "Organization", name: event.organizer } : undefined,
    isAccessibleForFree: true,
    ...(isPast && event.attendees
      ? { maximumAttendeeCapacity: event.attendees }
      : {}),
  });
}

export interface ArticleInput {
  title: string;
  path: string;
  description?: string;
  image?: string;
  authorName?: string;
  authorUrl?: string;
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  wordCount?: number;
  /** Set when the canonical text lives elsewhere (Hashnode, Substack…). */
  canonicalElsewhere?: string;
}

/** BlogPosting rich results: byline, date and cover image in the SERP. */
export function articleSchema(article: ArticleInput): Json {
  const url = absoluteUrl(article.path);
  return clean({
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: article.title.slice(0, 110),
    name: article.title,
    description: article.description,
    url,
    mainEntityOfPage: article.canonicalElsewhere ?? url,
    image: article.image ? [absoluteUrl(article.image)] : [absoluteUrl(SITE.logo)],
    datePublished: article.publishedTime,
    dateModified: article.modifiedTime ?? article.publishedTime,
    inLanguage: SITE.language,
    keywords: article.tags,
    wordCount: article.wordCount,
    author: article.authorName
      ? clean({
          "@type": "Person",
          name: article.authorName,
          url: article.authorUrl,
        })
      : { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
  });
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** FAQ rich results — extra SERP real estate for brand queries. */
export function faqSchema(items: FaqItem[]): Json {
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function webPageSchema(options: {
  name: string;
  description: string;
  path: string;
  type?: string;
}): Json {
  return {
    "@type": options.type ?? "WebPage",
    "@id": `${absoluteUrl(options.path)}#webpage`,
    url: absoluteUrl(options.path),
    name: options.name,
    description: options.description,
    inLanguage: SITE.language,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };
}

/** Wraps nodes in a single `@graph` document — one script tag per page. */
export function graph(...nodes: (Json | undefined | false | null)[]): Json {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean) as Json[],
  };
}
