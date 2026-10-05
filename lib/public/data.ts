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
import type { PublicForm } from "@/lib/forms/types";
import type { PublicCertificate } from "@/lib/public/read";
import { ApiUnavailableError, publicGet } from "@/lib/api/client";
import { TAGS } from "@/lib/server/services/cache-tags";
import type { PublicPost, PublicSponsorship, RegistrationFieldPublic } from "./read";
import type { PublicCommittee, PublicContest, PublicEvent } from "./shapes";

export type { PublicPost, PublicSponsorship } from "./read";

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

/** The CSE Carnival page's address (also used while the API is older than sponsorship pages). */
export const LEGACY_SPONSORSHIP_SLUG = "cse-carnival-2026";

type LegacySponsorship = { event?: PublicSponsorship["event"]; packages?: unknown[] };

/**
 * The active sponsorship pages, the default first. An API from before sponsorship pages gives the
 * single Carnival page from its setting, so the site works whichever is released first. That API
 * answers 404 (no route) or 5xx (a Worker released ahead of its database migration, so the table
 * is missing); a current one always answers with a list.
 */
const getSponsorshipState = cache(async (): Promise<{ list: PublicSponsorship[]; legacy: boolean; failed: boolean }> => {
  let list: PublicSponsorship[] | null = null;
  let failed = false;
  try {
    list = await publicGet<PublicSponsorship[]>("sponsorships", { tags: [TAGS.sponsorships], revalidate: 6 * HOUR, fallback: null });
  } catch (e) {
    if (!(e instanceof ApiUnavailableError)) throw e;
    failed = true;
  }
  if (list) return { list, legacy: false, failed };
  const old = await getPublicSetting<LegacySponsorship>("page.sponsorship");
  if (!old) return { list: [], legacy: true, failed };
  return {
    legacy: true,
    failed,
    list: [{ slug: LEGACY_SPONSORSHIP_SLUG, title: old.event?.fullName ?? old.event?.name ?? "Sponsorship", summary: null, isDefault: true, event: old.event ?? null, packages: old.packages?.length ?? 0, updatedAt: "" }],
  };
});

export const getSponsorships = cache(async (): Promise<PublicSponsorship[]> => (await getSponsorshipState()).list);

/** Where the navbar's Sponsors link goes: the default sponsorship page, else the overview. */
export const getSponsorshipHref = cache(async (): Promise<string> => {
  const def = (await getSponsorships()).find((p) => p.isDefault);
  return def ? `/sponsors/${def.slug}` : "/become-a-sponsor";
});

export interface PublicSponsorshipPage {
  slug: string;
  title: string;
  summary: string | null;
  isDefault: boolean;
  updatedAt: string;
  content: unknown;
}

/** One active sponsorship page with its content, or null. */
export const getSponsorship = cache(async (slug: string): Promise<PublicSponsorshipPage | null> => {
  const state = await getSponsorshipState();
  if (state.legacy) {
    if (slug !== LEGACY_SPONSORSHIP_SLUG) {
      // After a failed list call the API may only be briefly unwell: ask for the page itself
      // (an error is not cached) instead of caching a 404 for a page that exists.
      return state.failed ? publicGet<PublicSponsorshipPage>(`sponsorships/${encodeURIComponent(slug)}`, { tags: [TAGS.sponsorships], revalidate: 6 * HOUR, fallback: null }) : null;
    }
    const content = await getPublicSetting<LegacySponsorship>("page.sponsorship");
    const first = state.list[0];
    return content && first ? { slug, title: first.title, summary: null, isDefault: true, updatedAt: "", content } : null;
  }
  return publicGet<PublicSponsorshipPage>(`sponsorships/${encodeURIComponent(slug)}`, { tags: [TAGS.sponsorships], revalidate: 6 * HOUR, fallback: null });
});

export const getPublicForm = cache(async (slug: string) =>
  publicGet<PublicForm>(`forms/${encodeURIComponent(slug)}`, { tags: [TAGS.forms], revalidate: 6 * HOUR, fallback: null }));

/** Forms listed at /forms (an API older than round 9 has no list: empty). */
export const getPublicForms = cache(async () =>
  (await publicGet<PublicForm[]>("forms", { tags: [TAGS.forms], revalidate: 6 * HOUR, fallback: [] })) ?? []);

/** A certificate for its verification page (never the recipient's email). */
export const getCertificate = cache(async (code: string) =>
  publicGet<PublicCertificate>(`certificates/${encodeURIComponent(code)}`, { tags: [TAGS.certificates, TAGS.certificate(code)], revalidate: 6 * HOUR, fallback: null }));

/** The executive certificate of a student ID (old /executives/certs/<id> links), or null. */
export const getCertificateByStudent = cache(async (studentId: string) =>
  publicGet<{ code: string }>(`certificates/by-student/${encodeURIComponent(studentId)}`, { tags: [TAGS.certificates], revalidate: 6 * HOUR, fallback: null }));

/** A member's certificates they show on their profile (an API older than round 9 has none). */
export const getProfileCertificates = cache(async (handle: string) =>
  (await publicGet<Array<{ code: string; name: string; kind: string; issuedOn: string; roleLine: string | null }>>(`certificates/of/${encodeURIComponent(handle)}`,
    { tags: [TAGS.certificates], revalidate: 6 * HOUR, fallback: [] }).catch(() => [])) ?? []);

export interface SitemapData {
  events: Array<{ slug: string; updated_at: string; start_at: string | null }>;
  posts: Array<{ type: string; slug: string; updated_at: string; published_at: string | null }>;
  committees: Array<{ slug: string; updated_at: string; status: string }>;
  contests: Array<{ legacy_id: number; updated_at: string }>;
  people: Array<{ student_id: string; updated_at: string }>;
  /** Public member pages (missing from an older API). */
  members?: Array<{ handle: string; updated_at: string; avatar: string | null }>;
  /** Listed forms taking answers (missing from an API older than round 9). */
  forms?: Array<{ slug: string; updated_at: string }>;
}

export const getSitemapData = cache(async (): Promise<SitemapData> =>
  (await publicGet<SitemapData>("sitemap", { tags: [TAGS.events, TAGS.posts, TAGS.committees, TAGS.contests, TAGS.forms], revalidate: 6 * HOUR, fallback: { events: [], posts: [], committees: [], contests: [], people: [] } })) ?? { events: [], posts: [], committees: [], contests: [], people: [] });

export interface PublicCampaign {
  open: { id: string; title: string; description: string | null; circularUrl: string | null; opensAt: string | null; closesAt: string | null; positions: Array<{ id: string; name: string }> } | null;
  upcoming: PublicCampaign["open"];
  semesters: readonly string[];
  genders: readonly string[];
}

export const getRecruitment = cache(async (): Promise<PublicCampaign> =>
  (await publicGet<PublicCampaign>("recruitment", { tags: ["recruitment"], revalidate: 300, fallback: { open: null, upcoming: null, semesters: [], genders: [] } })) ?? { open: null, upcoming: null, semesters: [], genders: [] });
