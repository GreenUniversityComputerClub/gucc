/**
 * Public read models, runtime-neutral (the API Worker serves them; tests and
 * the migration verifier can call them with any D1-compatible Db). Only
 * published, public data is ever selected here.
 */
import { avatarOfProfileSql, avatarUrl } from "../server/avatar";
import type { Db } from "../server/db";
import { buildCommittee, buildContest, buildEvent, mediaUrl, type CommitteeRow, type ContestRow, type ContestTeamRow, type EventRow, type MediaRow, type MemberRow, type PublicCommittee, type PublicContest, type PublicEvent } from "./shapes";
import { COMMITTEES_SQL, CONTEST_IMAGES_SQL, CONTEST_TEAMS_SQL, CONTESTS_SQL, EVENT_BY_SLUG_SQL, EVENTS_SQL, MEMBERS_SQL } from "./queries";

export async function readCommittees(db: Db): Promise<{ committees: PublicCommittee[]; current: string | null }> {
  const [committees, members, current] = await Promise.all([
    db.all<CommitteeRow>(COMMITTEES_SQL),
    db.all<MemberRow>(MEMBERS_SQL),
    db.value<string>("SELECT slug FROM committees WHERE status = 'CURRENT' AND deleted_at IS NULL"),
  ]);
  return { committees: committees.map((c) => buildCommittee(c, members)), current: current ?? null };
}

export async function readEvents(db: Db): Promise<PublicEvent[]> {
  return (await db.all<EventRow>(EVENTS_SQL)).map((r) => buildEvent(r));
}

export interface RegistrationFieldPublic {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface EventPersonPublic {
  role: "SPEAKER";
  name: string;
  title: string | null;
}

export async function readEvent(db: Db, slug: string): Promise<{ event: PublicEvent; fields: RegistrationFieldPublic[]; gallery: Array<{ url: string; thumb: string; alt: string | null }>; people: EventPersonPublic[]; attachments: Array<{ url: string; name: string }> } | null> {
  const row = await db.first<EventRow & { id: string; registration_fields_json: string | null }>(
    EVENT_BY_SLUG_SQL, slug);
  if (!row) return null;
  const event = buildEvent(row);
  const gallery = await db.all<MediaRow & { alt_text: string | null }>(
    `SELECT m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json, m.alt_text
     FROM event_media em JOIN media m ON m.id = em.media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC' AND m.status = 'READY' AND m.media_type = 'IMAGE'
     WHERE em.event_id = ?1 AND em.kind = 'GALLERY' ORDER BY em.sort_order LIMIT 200`, row.id);
  // Speakers only: coordinators and photographers are internal, and guests and judges come
  // from the event's text fields (the import's structured copies would repeat them).
  const people = await db.all<EventPersonPublic>(
    "SELECT role, name, title FROM event_people WHERE event_id = ?1 AND role = 'SPEAKER' ORDER BY sort_order LIMIT 50", row.id);
  const files = await db.all<MediaRow & { original_filename: string | null }>(
    `SELECT m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json, m.original_filename
     FROM event_media em JOIN media m ON m.id = em.media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC' AND m.status = 'READY'
     WHERE em.event_id = ?1 AND em.kind = 'ATTACHMENT' ORDER BY em.sort_order LIMIT 20`, row.id);
  return {
    event,
    fields: event.registrationOpen ? (JSON.parse(row.registration_fields_json ?? "[]") as RegistrationFieldPublic[]) : [],
    gallery: gallery.map((g) => ({ url: mediaUrl(g, "lg")!, thumb: mediaUrl(g, "sm")!, alt: g.alt_text })).filter((g) => g.url),
    people,
    attachments: files.map((f) => ({ url: mediaUrl(f)!, name: f.original_filename ?? "Document" })).filter((f) => f.url),
  };
}

export async function readContests(db: Db): Promise<PublicContest[]> {
  const [contests, teams, images] = await Promise.all([
    db.all<ContestRow>(CONTESTS_SQL),
    db.all<ContestTeamRow>(CONTEST_TEAMS_SQL),
    db.all<MediaRow & { contest_id: string }>(CONTEST_IMAGES_SQL),
  ]);
  return contests.map((c) => buildContest(c, teams, images.filter((i) => i.contest_id === c.id).map((i) => mediaUrl(i)!).filter(Boolean)));
}

export interface PublicPost {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  brief: string | null;
  body: string | null;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  readTimeInMinutes: number | null;
  views: number;
  url: string | null;
  coverImage: string | null;
  author: { name: string; url: string | null; avatarUrl?: string | null };
  seoTitle: string | null;
  seoDescription: string | null;
}

const POST_SQL = `
SELECT p.id, p.type, p.slug, p.title, p.subtitle, p.excerpt, p.body_markdown, c.name AS category, p.published_at, p.updated_at, p.read_time_minutes, p.views,
       p.canonical_url, p.seo_title, p.seo_description, COALESCE(pr.full_name, p.author_name, 'Green University Computer Club') AS author_name,
       COALESCE(p.author_url, pr.github_url) AS author_url,
       am.storage AS author_storage, am.object_key AS author_object_key, am.legacy_path AS author_legacy_path, am.external_url AS author_external_url, am.variants_json AS author_variants_json,
       m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json,
       (SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id) AS tags
FROM posts p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN profiles pr ON pr.id = p.author_profile_id AND pr.deleted_at IS NULL
LEFT JOIN media am ON am.id = pr.avatar_media_id AND am.deleted_at IS NULL AND am.visibility = 'PUBLIC' AND am.status = 'READY'
LEFT JOIN media m ON m.id = p.featured_media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC'
WHERE p.deleted_at IS NULL AND p.status = 'PUBLISHED' AND p.published_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

function toPost(r: Record<string, unknown>, withBody: boolean): PublicPost {
  const cover = mediaUrl(r.storage ? { id: "", storage: r.storage as "R2", object_key: r.object_key as string | null, legacy_path: r.legacy_path as string | null, external_url: r.external_url as string | null, variants_json: r.variants_json as string | null } : null, "lg");
  return {
    id: String(r.id), type: String(r.type), slug: String(r.slug), title: String(r.title), subtitle: (r.subtitle as string) ?? null, brief: (r.excerpt as string) ?? null,
    body: withBody ? ((r.body_markdown as string) ?? null) : null, category: (r.category as string) ?? null, tags: r.tags ? String(r.tags).split("|") : [],
    publishedAt: (r.published_at as string) ?? null, updatedAt: (r.updated_at as string) ?? null, readTimeInMinutes: (r.read_time_minutes as number) ?? null,
    views: Number(r.views ?? 0), url: (r.canonical_url as string) ?? null, coverImage: cover ?? null,
    author: {
      name: String(r.author_name), url: (r.author_url as string) ?? null,
      avatarUrl: mediaUrl(r.author_storage ? { id: "", storage: r.author_storage as "R2", object_key: r.author_object_key as string | null, legacy_path: r.author_legacy_path as string | null,
        external_url: r.author_external_url as string | null, variants_json: r.author_variants_json as string | null } : null, "thumb") ?? null,
    },
    seoTitle: (r.seo_title as string) ?? null, seoDescription: (r.seo_description as string) ?? null,
  };
}

export const POST_TYPES = ["BLOG", "NEWS", "ANNOUNCEMENT"];

/** Listing: bodies omitted to keep the payload small. */
export async function readPosts(db: Db, type: string, limit = 50): Promise<PublicPost[]> {
  if (!POST_TYPES.includes(type)) return [];
  const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
  return (await db.all<Record<string, unknown>>(`${POST_SQL} AND p.type = ?1 ORDER BY p.pinned DESC, p.published_at DESC LIMIT ?2`, type, n)).map((r) => toPost(r, false));
}

export async function readPost(db: Db, type: string, slug: string): Promise<PublicPost | null> {
  if (!POST_TYPES.includes(type)) return null;
  const row = await db.first<Record<string, unknown>>(`${POST_SQL} AND p.type = ?1 AND p.slug = ?2`, type, slug);
  return row ? toPost(row, true) : null;
}

function resolvePaths(value: unknown, map: Record<string, string>): unknown {
  if (typeof value === "string") return value.startsWith("/") ? map[value.toLowerCase()] ?? value : value;
  if (Array.isArray(value)) return value.map((v) => resolvePaths(v, map));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolvePaths(v, map)]));
  return value;
}

/**
 * Public page content from organization settings. Image paths written for the
 * old /public folder are resolved to wherever the file lives now (R2 once
 * migrated), so content keeps working before, during and after the move.
 */
export async function readSetting(db: Db, key: string): Promise<unknown> {
  const row = await db.first<{ value_json: string }>("SELECT value_json FROM organization_settings WHERE key = ?1 AND is_public = 1", key);
  if (!row) return null;
  const media = await db.all<MediaRow & { legacy_path: string }>(
    "SELECT id, storage, object_key, legacy_path, external_url, variants_json FROM media WHERE legacy_path IS NOT NULL AND deleted_at IS NULL AND visibility = 'PUBLIC' AND status = 'READY'");
  const map = Object.fromEntries(media.map((r) => [r.legacy_path.toLowerCase(), mediaUrl(r) ?? r.legacy_path]));
  return resolvePaths(JSON.parse(row.value_json), map);
}

export async function readForm(db: Db, slug: string) {
  return db.first<{ slug: string; title: string; url: string }>("SELECT slug, title, url FROM external_forms WHERE slug = ?1 AND status = 'ACTIVE' AND deleted_at IS NULL", slug);
}

/** Everything the sitemap needs, with real last-modified times. */
export async function readSitemap(db: Db) {
  const [events, posts, committees, contests] = await Promise.all([
    db.all<{ slug: string; updated_at: string; start_at: string | null }>("SELECT slug, updated_at, start_at FROM events WHERE deleted_at IS NULL AND status IN ('PUBLISHED','ONGOING','COMPLETED')"),
    db.all<{ type: string; slug: string; updated_at: string; published_at: string | null }>("SELECT type, slug, updated_at, published_at FROM posts WHERE deleted_at IS NULL AND status = 'PUBLISHED' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
    db.all<{ slug: string; updated_at: string; status: string }>("SELECT slug, updated_at, status FROM committees WHERE deleted_at IS NULL AND status <> 'UPCOMING'"),
    db.all<{ legacy_id: number; updated_at: string }>("SELECT legacy_id, updated_at FROM contests WHERE deleted_at IS NULL AND status = 'PUBLISHED'"),
  ]);
  const people = await db.all<{ student_id: string; updated_at: string }>(
    `SELECT DISTINCT p.student_id, MAX(p.updated_at, cm.updated_at) AS updated_at FROM committee_members cm JOIN profiles p ON p.id = cm.profile_id AND p.deleted_at IS NULL
     JOIN committees c ON c.id = cm.committee_id AND c.status <> 'UPCOMING' AND c.deleted_at IS NULL
     WHERE cm.deleted_at IS NULL AND p.student_id IS NOT NULL AND length(p.student_id) = 9`);
  // Member pages their owners made public (approved members, and people who served).
  const members = (await db.all<{ handle: string; updated_at: string; avatar_json: string | null }>(
    `SELECT p.slug AS handle, p.updated_at, ${avatarOfProfileSql("p")} AS avatar_json FROM profiles p LEFT JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     WHERE p.visibility = 'PUBLIC' AND p.slug IS NOT NULL AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
       AND (u.status = 'ACTIVE' OR EXISTS (SELECT 1 FROM committee_members cm JOIN committees c ON c.id = cm.committee_id AND c.status <> 'UPCOMING' AND c.deleted_at IS NULL
                                          WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL))
     ORDER BY p.updated_at DESC LIMIT 2000`,
  )).map(({ avatar_json, ...m }) => ({ ...m, avatar: avatarUrl(avatar_json, "md") }));
  return { events, posts, committees, contests, people, members };
}
