import type { MetadataRoute } from "next";
import {
  getAllExecutiveStudentIds,
  getAvailableYears,
  getExecutiveAvatar,
  getExecutivesByStudentId,
  getLatestExecutiveYear,
  getPrimaryRole,
} from "@/app/executives/util";
import contestsData from "@/data/contests.json";
import { eventSlug, getAllEvents } from "@/lib/events";
import { gqlClient, queries } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo/site";

type Entry = MetadataRoute.Sitemap[number];

const now = new Date();

/**
 * Newest date present in the content, used as `lastModified` for index pages
 * that list it. Stamping every URL with the build time tells Google the whole
 * site changed on every deploy, which teaches it to ignore our lastmod
 * entirely — the opposite of what the field is for.
 */
const latestContentDate = (() => {
  const times = getAllEvents()
    .map((event) => new Date(event.date).getTime())
    .filter((time) => Number.isFinite(time));
  return times.length ? new Date(Math.max(...times)) : now;
})();

/** Static, hand-curated routes with the priority we want Google to see. */
const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: Entry["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/executives", priority: 0.95, changeFrequency: "weekly" },
  { path: "/events", priority: 0.9, changeFrequency: "daily" },
  { path: "/blog", priority: 0.85, changeFrequency: "daily" },
  { path: "/contests", priority: 0.8, changeFrequency: "weekly" },
  { path: "/join", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
  { path: "/sponsors", priority: 0.7, changeFrequency: "monthly" },
  { path: "/collaborations", priority: 0.7, changeFrequency: "monthly" },
  { path: "/socials", priority: 0.6, changeFrequency: "monthly" },
  { path: "/scheduler", priority: 0.6, changeFrequency: "monthly" },
  { path: "/lost-found", priority: 0.5, changeFrequency: "weekly" },
  { path: "/recruitment", priority: 0.5, changeFrequency: "monthly" },
  { path: "/recruitment/rules", priority: 0.4, changeFrequency: "yearly" },
  { path: "/certificates/hacktheai", priority: 0.5, changeFrequency: "monthly" },
];

/** Blog slugs come from Hashnode; a failure must never break the sitemap. */
async function blogEntries(): Promise<Entry[]> {
  const entries: Entry[] = [
    {
      url: absoluteUrl("/blog/neurogebra"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const host = process.env.HASHNODE_HOST;
  if (!host) return entries;

  try {
    const response = (await gqlClient(queries.getPosts(host))()) as {
      data?: {
        publication?: {
          posts?: { edges?: { node: { slug: string; publishedAt?: string } }[] };
        };
      };
    };
    for (const edge of response?.data?.publication?.posts?.edges ?? []) {
      entries.push({
        url: absoluteUrl(`/blog/${edge.node.slug}`),
        lastModified: edge.node.publishedAt ? new Date(edge.node.publishedAt) : now,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch (error) {
    console.warn("Sitemap: skipping Hashnode posts —", error);
  }

  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const latestYear = getLatestExecutiveYear();

  const staticEntries: Entry[] = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: latestContentDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // One entry per committee year; the current committee outranks the archive.
  const yearEntries: Entry[] = getAvailableYears().map((year) => ({
    url: absoluteUrl(`/executives/${year}`),
    lastModified: latestContentDate,
    changeFrequency: year === latestYear ? "weekly" : "yearly",
    priority: year === latestYear ? 0.95 : 0.6,
  }));

  // One indexable profile per executive, each carrying its portrait so the
  // photo is eligible for Google Images and people-style results.
  const profileEntries: Entry[] = getAllExecutiveStudentIds().flatMap((studentId) => {
    const roles = getExecutivesByStudentId(studentId);
    if (roles.length === 0) return [];
    const primary = getPrimaryRole(roles);
    const avatar = getExecutiveAvatar(primary);

    return [
      {
        url: absoluteUrl(`/executives/${studentId}`),
        lastModified: latestContentDate,
        changeFrequency: "monthly",
        priority: primary.year === latestYear ? 0.9 : 0.65,
        ...(avatar ? { images: [absoluteUrl(avatar)] } : {}),
      },
    ];
  });

  const eventEntries: Entry[] = getAllEvents().map((event) => ({
    url: absoluteUrl(`/events/${eventSlug(event.name)}`),
    lastModified: event.date ? new Date(event.date) : now,
    changeFrequency: "yearly",
    priority: 0.7,
  }));

  const contestEntries: Entry[] = (
    contestsData.contests as Array<{ id: number }>
  ).map((contest) => ({
    url: absoluteUrl(`/contests/${contest.id}`),
    lastModified: latestContentDate,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  // Two events sharing a name slugify to the same URL, so de-duplicate before
  // emitting: a sitemap must list each URL once.
  const seen = new Set<string>();
  return [
    ...staticEntries,
    ...yearEntries,
    ...profileEntries,
    ...eventEntries,
    ...contestEntries,
    ...(await blogEntries()),
  ].filter((entry) => !seen.has(entry.url) && seen.add(entry.url));
}
