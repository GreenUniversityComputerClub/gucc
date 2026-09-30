import "server-only";
/**
 * Public read models for pages, fetched from the API Worker.
 *
 * Every call is cached in Next's data cache under a tag; admin actions
 * revalidate those tags (the Worker reports which ones), so pages are static
 * and fast yet show edits on the next request. React cache() dedupes calls
 * within one render. Only published, public data is ever returned.
 */
import { cache } from "react";
import { publicGet } from "@/lib/api/client";
import { TAGS } from "@/lib/server/services/cache-tags";
import type { PublicPost, RegistrationFieldPublic } from "./read";
import type { PublicCommittee, PublicContest, PublicEvent } from "./shapes";

export type { PublicPost } from "./read";

const HOUR = 3600;

const getCommitteeData = cache(async () =>
  (await publicGet<{ committees: PublicCommittee[]; current: string | null }>("committees", { tags: [TAGS.committees], revalidate: 6 * HOUR, fallback: { committees: [], current: null } })) ?? { committees: [], current: null });

export const getCommittees = cache(async (): Promise<PublicCommittee[]> => (await getCommitteeData()).committees);
export const getCurrentCommitteeSlug = cache(async (): Promise<string | null> => (await getCommitteeData()).current);

export const getPublicEvents = cache(async (): Promise<PublicEvent[]> =>
  (await publicGet<PublicEvent[]>("events", { tags: [TAGS.events], revalidate: HOUR, fallback: [] })) ?? []);

export interface PublicEventDetail {
  event: PublicEvent;
  fields: RegistrationFieldPublic[];
  gallery: Array<{ url: string; thumb: string; alt: string | null }>;
  people?: Array<{ role: "SPEAKER"; name: string; title: string | null }>;
  attachments?: Array<{ url: string; name: string }>;
  /** The programme, when the organisers added one (missing from an older API). */
  agenda?: Array<{ startsAt: string | null; endsAt: string | null; title: string; speaker: string | null; description: string | null }>;
}

export const getPublicEventDetail = cache(async (slug: string): Promise<PublicEventDetail | null> =>
  publicGet<PublicEventDetail>(`events/${encodeURIComponent(slug)}`, { tags: [TAGS.events], revalidate: HOUR, fallback: null }));

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | undefined> {
  return (await getPublicEventDetail(slug))?.event;
}

export const getPublicContests = cache(async (): Promise<PublicContest[]> =>
  (await publicGet<PublicContest[]>("contests", { tags: [TAGS.contests], revalidate: 6 * HOUR, fallback: [] })) ?? []);

export const getPublishedPosts = cache(async (type: string = "BLOG", limit = 50): Promise<PublicPost[]> =>
  (await publicGet<PublicPost[]>(`posts?type=${encodeURIComponent(type)}&limit=${limit}`, { tags: [TAGS.posts], revalidate: HOUR, fallback: [] })) ?? []);

export const getPublishedPost = cache(async (type: string, slug: string): Promise<PublicPost | null> =>
  publicGet<PublicPost>(`posts/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`, { tags: [TAGS.posts], revalidate: HOUR, fallback: null }));

/**
 * Page content from organization settings, with legacy /public image paths
 * already resolved to wherever each file lives now (R2 once migrated).
 */
export const getPublicSetting = cache(async <T,>(key: string): Promise<T | null> =>
  publicGet<T>(`settings/${encodeURIComponent(key)}`, { tags: [TAGS.settings], revalidate: 6 * HOUR, fallback: null }));

export const getPublicForm = cache(async (slug: string) =>
  publicGet<{ slug: string; title: string; url: string }>(`forms/${encodeURIComponent(slug)}`, { tags: [TAGS.forms], revalidate: 6 * HOUR, fallback: null }));

export interface SitemapData {
  events: Array<{ slug: string; updated_at: string; start_at: string | null }>;
  posts: Array<{ type: string; slug: string; updated_at: string; published_at: string | null }>;
  committees: Array<{ slug: string; updated_at: string; status: string }>;
  contests: Array<{ legacy_id: number; updated_at: string }>;
  people: Array<{ student_id: string; updated_at: string }>;
  /** Public member pages (missing from an older API). */
  members?: Array<{ handle: string; updated_at: string; avatar: string | null }>;
}

export const getSitemapData = cache(async (): Promise<SitemapData> =>
  (await publicGet<SitemapData>("sitemap", { tags: [TAGS.events, TAGS.posts, TAGS.committees, TAGS.contests], revalidate: 6 * HOUR, fallback: { events: [], posts: [], committees: [], contests: [], people: [] } })) ?? { events: [], posts: [], committees: [], contests: [], people: [] });

export interface PublicCampaign {
  open: { id: string; title: string; description: string | null; circularUrl: string | null; opensAt: string | null; closesAt: string | null; positions: Array<{ id: string; name: string }> } | null;
  upcoming: PublicCampaign["open"];
  semesters: readonly string[];
  genders: readonly string[];
}

export const getRecruitment = cache(async (): Promise<PublicCampaign> =>
  (await publicGet<PublicCampaign>("recruitment", { tags: ["recruitment"], revalidate: 300, fallback: { open: null, upcoming: null, semesters: [], genders: [] } })) ?? { open: null, upcoming: null, semesters: [], genders: [] });
