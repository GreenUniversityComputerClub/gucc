import type { MetadataRoute } from "next";
import {
  getAvailableYears,
  getExecutiveAvatar,
  getRolesByStudentId,
  getLatestExecutiveYear,
  getPrimaryRole,
} from "@/app/executives/util";
import { getPublicContests, getPublicEvents, getPublishedPosts, getSitemapData } from "@/lib/public/data";
import { absoluteUrl } from "@/lib/seo/site";

type Entry = MetadataRoute.Sitemap[number];

// Built from D1 on request (the underlying queries are cached).
export const revalidate = 21600;

const now = new Date();

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
  { path: "/news", priority: 0.75, changeFrequency: "weekly" },
  { path: "/announcements", priority: 0.7, changeFrequency: "weekly" },
  { path: "/contests", priority: 0.8, changeFrequency: "weekly" },
  { path: "/join", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
  { path: "/sponsors", priority: 0.7, changeFrequency: "monthly" },
  { path: "/collaborations", priority: 0.7, changeFrequency: "monthly" },
  { path: "/socials", priority: 0.6, changeFrequency: "monthly" },
  { path: "/lost-found", priority: 0.5, changeFrequency: "weekly" },
  { path: "/recruitment", priority: 0.5, changeFrequency: "monthly" },
  { path: "/recruitment/rules", priority: 0.4, changeFrequency: "yearly" },
  { path: "/certificates/hacktheai", priority: 0.5, changeFrequency: "monthly" },
  { path: "/events/boishakh", priority: 0.4, changeFrequency: "yearly" },
];

/** Published blog posts, news and announcements from D1. */
async function blogEntries(): Promise<Entry[]> {
  const posts = [...(await getPublishedPosts("BLOG", 500)), ...(await getPublishedPosts("NEWS", 500)), ...(await getPublishedPosts("ANNOUNCEMENT", 500))];
  return posts.map((p) => ({
    url: absoluteUrl(p.type === "BLOG" ? `/blog/${p.slug}` : `/${p.type === "NEWS" ? "news" : "announcements"}/${p.slug}`),
    lastModified: p.updatedAt ? new Date(p.updatedAt) : p.publishedAt ? new Date(p.publishedAt) : now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
    ...(p.coverImage ? { images: [absoluteUrl(p.coverImage)] } : {}),
  }));
}

const latest = (...isos: Array<string | null | undefined>) => {
  const t = isos.map((i) => (i ? Date.parse(i) : NaN)).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)) : undefined;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const latestYear = await getLatestExecutiveYear();
  const [events, contests, meta] = await Promise.all([getPublicEvents(), getPublicContests(), getSitemapData()]);
  const eventUpdated = new Map(meta.events.map((e) => [e.slug, e.updated_at]));
  const committeeUpdated = new Map(meta.committees.map((c) => [c.slug, c.updated_at]));
  const personUpdated = new Map(meta.people.map((p) => [p.student_id, p.updated_at]));
  const contestUpdated = new Map(meta.contests.map((c) => [String(c.legacy_id), c.updated_at]));
  /**
   * Newest date present in the content, used as `lastModified` for index pages.
   * Stamping every URL with the build time tells Google the whole site changed
   * on every deploy, which teaches it to ignore our lastmod entirely.
   */
  const times = events.map((event) => new Date(event.date).getTime()).filter((t) => Number.isFinite(t));
  const latestContentDate = times.length ? new Date(Math.max(...times)) : now;

  const staticEntries: Entry[] = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: latestContentDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // One entry per committee year; the current committee outranks the archive.
  const yearEntries: Entry[] = (await getAvailableYears()).map((year) => ({
    url: absoluteUrl(`/executives/${year}`),
    lastModified: latest(committeeUpdated.get(year)) ?? latestContentDate,
    changeFrequency: year === latestYear ? "weekly" : "yearly",
    priority: year === latestYear ? 0.95 : 0.6,
  }));

  // One indexable profile per executive, each carrying its portrait so the
  // photo is eligible for Google Images and people-style results.
  const rolesById = await getRolesByStudentId();
  const ids = [...rolesById.keys()];
  const profileEntries: Entry[] = ids.flatMap((studentId) => {
    const roles = rolesById.get(studentId) ?? [];
    if (roles.length === 0) return [];
    const primary = getPrimaryRole(roles);
    const avatar = getExecutiveAvatar(primary);

    return [
      {
        url: absoluteUrl(`/executives/${studentId}`),
        lastModified: latest(personUpdated.get(studentId)) ?? latestContentDate,
        changeFrequency: "monthly",
        priority: primary.year === latestYear ? 0.9 : 0.65,
        ...(avatar ? { images: [absoluteUrl(avatar)] } : {}),
      },
    ];
  });

  const eventEntries: Entry[] = events.map((event) => ({
    url: absoluteUrl(`/events/${event.slug}`),
    lastModified: latest(eventUpdated.get(event.slug), event.date) ?? now,
    changeFrequency: "yearly",
    priority: 0.7,
    ...(event.image ? { images: [absoluteUrl(event.image)] } : {}),
  }));

  // Only contests with results: a page without teams has nothing to index.
  const contestEntries: Entry[] = contests.filter((contest) => contest.teams.length > 0).map((contest) => ({
    url: absoluteUrl(`/contests/${contest.id}`),
    lastModified: latest(contestUpdated.get(String(contest.id))) ?? latestContentDate,
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
