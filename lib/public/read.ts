/**
 * Public read models, runtime-neutral (the API Worker serves them; tests and
 * the migration verifier can call them with any D1-compatible Db). Only
 * published, public data is ever selected here.
 */
import { avatarOfProfileSql, avatarUrl } from "../server/avatar";
import type { Db } from "../server/db";
import { providerOf } from "../forms/providers";
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
  const now = new Date();
  return (await db.all<EventRow>(EVENTS_SQL)).map((r) => buildEvent(r, now, { description: false }));
}

export interface EventAgendaItemPublic {
  startsAt: string | null;
  endsAt: string | null;
  title: string;
  speaker: string | null;
  description: string | null;
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

export async function readEvent(db: Db, slug: string): Promise<{ event: PublicEvent; fields: RegistrationFieldPublic[]; gallery: Array<{ url: string; thumb: string; alt: string | null }>; people: EventPersonPublic[]; attachments: Array<{ url: string; name: string }>; agenda: EventAgendaItemPublic[] } | null> {
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
  const agenda = await db.all<{ starts_at: string | null; ends_at: string | null; title: string; speaker: string | null; description: string | null }>(
    "SELECT starts_at, ends_at, title, speaker, description FROM event_agenda_items WHERE event_id = ?1 ORDER BY position LIMIT 50", row.id);
  return {
    event,
    agenda: agenda.map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at, title: a.title, speaker: a.speaker, description: a.description })),
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
  /** Reaction counts by kind (members react when signed in). */
  reactions?: Record<string, number>;
}

const POST_SQL = `
SELECT p.id, p.type, p.slug, p.title, p.subtitle, p.excerpt, p.body_markdown, c.name AS category, p.published_at, p.updated_at, p.read_time_minutes, p.views,
       p.canonical_url, p.seo_title, p.seo_description, COALESCE(pr.full_name, p.author_name, 'Green University Computer Club') AS author_name,
       COALESCE(p.author_url, pr.github_url) AS author_url,
       am.storage AS author_storage, am.object_key AS author_object_key, am.legacy_path AS author_legacy_path, am.external_url AS author_external_url, am.variants_json AS author_variants_json,
       m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json,
       (SELECT group_concat(t.name, '|') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id) AS tags,
       (SELECT json_group_object(x.emoji, x.n) FROM (SELECT emoji, COUNT(*) AS n FROM post_reactions WHERE post_id = p.id GROUP BY emoji) x) AS reactions
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
    reactions: typeof r.reactions === "string" ? (JSON.parse(r.reactions) as Record<string, number>) : {},
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
/** Legacy /public image paths → wherever each file lives now (R2 once migrated). */
async function legacyMediaMap(db: Db): Promise<Record<string, string>> {
  const media = await db.all<MediaRow & { legacy_path: string }>(
    "SELECT id, storage, object_key, legacy_path, external_url, variants_json FROM media WHERE legacy_path IS NOT NULL AND deleted_at IS NULL AND visibility = 'PUBLIC' AND status = 'READY'");
  return Object.fromEntries(media.map((r) => [r.legacy_path.toLowerCase(), mediaUrl(r) ?? r.legacy_path]));
}

export async function readSetting(db: Db, key: string): Promise<unknown> {
  const row = await db.first<{ value_json: string }>("SELECT value_json FROM organization_settings WHERE key = ?1 AND is_public = 1", key);
  if (!row) return null;
  return resolvePaths(JSON.parse(row.value_json), await legacyMediaMap(db));
}

export interface PublicSponsorship {
  slug: string;
  title: string;
  summary: string | null;
  isDefault: boolean;
  /** From the page's content, for the cards on /become-a-sponsor. */
  event: { name?: string; fullName?: string; tagline?: string; organizer?: string } | null;
  packages: number;
  /** The lowest priced package (missing from an older API; null when all are "on request"). */
  priceFrom?: { amount: number; currency: string } | null;
  updatedAt: string;
}

/** The active sponsorship pages, the default first (/become-a-sponsor, the navbar, the sitemap). */
export async function readSponsorships(db: Db): Promise<PublicSponsorship[]> {
  const rows = await db.all<{ slug: string; title: string; summary: string | null; is_default: number; updated_at: string; event_json: string | null; packages: number | null; price_from: number | null; currency: string | null }>(
    `SELECT slug, title, summary, is_default, updated_at, json_extract(content_json, '$.event') AS event_json,
            json_array_length(content_json, '$.packages') AS packages,
            (SELECT MIN(CAST(json_extract(p.value, '$.price') AS INTEGER)) FROM json_each(content_json, '$.packages') p WHERE CAST(json_extract(p.value, '$.price') AS INTEGER) > 0) AS price_from,
            (SELECT json_extract(p.value, '$.currency') FROM json_each(content_json, '$.packages') p WHERE CAST(json_extract(p.value, '$.price') AS INTEGER) > 0
               ORDER BY CAST(json_extract(p.value, '$.price') AS INTEGER) LIMIT 1) AS currency
     FROM sponsorship_pages WHERE deleted_at IS NULL AND status = 'ACTIVE' ORDER BY is_default DESC, sort_order, title`);
  return rows.map((r) => ({
    slug: r.slug, title: r.title, summary: r.summary, isDefault: Boolean(r.is_default), updatedAt: r.updated_at, packages: Number(r.packages ?? 0),
    priceFrom: r.price_from ? { amount: Number(r.price_from), currency: r.currency || "BDT" } : null,
    event: (() => {
      try {
        return r.event_json ? (JSON.parse(r.event_json) as PublicSponsorship["event"]) : null;
      } catch {
        return null;
      }
    })(),
  }));
}

/** One active sponsorship page with its content (image paths resolved), or null. */
export async function readSponsorship(db: Db, slug: string): Promise<{ slug: string; title: string; summary: string | null; isDefault: boolean; updatedAt: string; content: unknown } | null> {
  const row = await db.first<{ slug: string; title: string; summary: string | null; is_default: number; updated_at: string; content_json: string }>(
    "SELECT slug, title, summary, is_default, updated_at, content_json FROM sponsorship_pages WHERE slug = ?1 AND deleted_at IS NULL AND status = 'ACTIVE'", slug);
  if (!row) return null;
  return {
    slug: row.slug, title: row.title, summary: row.summary, isDefault: Boolean(row.is_default), updatedAt: row.updated_at,
    content: resolvePaths(JSON.parse(row.content_json), await legacyMediaMap(db)),
  };
}

interface PublicFormRow {
  slug: string; title: string; url: string; description: string | null; provider: string | null;
  requires_sign_in: number; listed: number; accepting: number; opens_at: string | null; closes_at: string | null; closed_message: string | null;
  question_count: number | null; category: string | null; inspected_at: string | null; updated_at: string; event_slug: string | null; event_title: string | null;
  m_id: string | null; m_storage: MediaRow["storage"] | null; m_key: string | null; m_legacy: string | null; m_external: string | null; m_variants: string | null;
}

// Never the responses sheet (for the club's leaders) and never the form's own address: the page shows
// the form inside itself, and its address only leaves the API through `readFormSource`, to the server.
const PUBLIC_FORM_SELECT = `SELECT f.slug, f.title, f.url, f.description, f.provider, f.requires_sign_in, f.listed, f.accepting,
         f.opens_at, f.closes_at, f.closed_message, f.question_count, f.category, f.inspected_at, f.updated_at, e.slug AS event_slug, e.title AS event_title,
         m.id AS m_id, m.storage AS m_storage, m.object_key AS m_key, m.legacy_path AS m_legacy, m.external_url AS m_external, m.variants_json AS m_variants
  FROM external_forms f
  LEFT JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED')
  LEFT JOIN media m ON m.id = f.cover_media_id AND m.deleted_at IS NULL AND m.purged_at IS NULL AND m.visibility = 'PUBLIC'`;

function publicForm(r: PublicFormRow) {
  return {
    slug: r.slug, title: r.title, description: r.description, provider: r.provider ?? providerOf(r.url),
    requiresSignIn: r.requires_sign_in === 1, listed: r.listed === 1, accepting: r.accepting === 1,
    opensAt: r.opens_at, closesAt: r.closes_at, closedMessage: r.closed_message, questionCount: r.question_count, category: r.category,
    inspectedAt: r.inspected_at, updatedAt: r.updated_at,
    event: r.event_slug ? { slug: r.event_slug, title: r.event_title ?? r.event_slug } : null,
    coverUrl: r.m_id && r.m_storage ? mediaUrl({ id: r.m_id, storage: r.m_storage, object_key: r.m_key, legacy_path: r.m_legacy, external_url: r.m_external, variants_json: r.m_variants }, "lg") ?? null : null,
  };
}

/**
 * A form by any address it has had, in any spelling (/forms/CR, /forms/cr, last term's
 * /forms/cr-fall-2026 after a rename): one indexed lookup. The page redirects to `slug`.
 */
export async function readForm(db: Db, slug: string) {
  const row = await db.first<PublicFormRow>(
    `${PUBLIC_FORM_SELECT} JOIN external_form_slugs s ON s.form_id = f.id WHERE s.slug = ?1 AND f.status = 'ACTIVE' AND f.deleted_at IS NULL LIMIT 1`, slug);
  return row ? publicForm(row) : null;
}

/**
 * Where a form really is: its address and schedule, for the website's server only (the page's
 * frame route). Never part of the public read model, so it isn't in the cached pages or the lists.
 */
export async function readFormSource(db: Db, slug: string) {
  const r = await db.first<{ url: string; embed_url: string | null; requires_sign_in: number; inspected_at: string | null; accepting: number; opens_at: string | null; closes_at: string | null }>(
    `SELECT f.url, f.embed_url, f.requires_sign_in, f.inspected_at, f.accepting, f.opens_at, f.closes_at
     FROM external_forms f JOIN external_form_slugs s ON s.form_id = f.id
     WHERE s.slug = ?1 AND f.status = 'ACTIVE' AND f.deleted_at IS NULL LIMIT 1`, slug);
  return r ? { url: r.url, embedUrl: r.embed_url, requiresSignIn: r.requires_sign_in === 1, inspectedAt: r.inspected_at, accepting: r.accepting === 1, opensAt: r.opens_at, closesAt: r.closes_at } : null;
}

/** Forms the club lists at /forms: open ones, upcoming ones, and those closed in the last 30 days. */
export async function readForms(db: Db) {
  const rows = await db.all<PublicFormRow>(
    `${PUBLIC_FORM_SELECT} WHERE f.listed = 1 AND f.status = 'ACTIVE' AND f.deleted_at IS NULL
       AND (f.closes_at IS NULL OR f.closes_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'))
     ORDER BY f.sort_order, COALESCE(f.closes_at, '9999'), f.updated_at DESC LIMIT 100`);
  return rows.map(publicForm);
}

/** Everything the sitemap needs, with real last-modified times. */
export async function readSitemap(db: Db) {
  const [events, posts, committees, contests] = await Promise.all([
    db.all<{ slug: string; updated_at: string; start_at: string | null }>("SELECT slug, updated_at, start_at FROM events WHERE deleted_at IS NULL AND status IN ('PUBLISHED','ONGOING','COMPLETED')"),
    db.all<{ type: string; slug: string; updated_at: string; published_at: string | null }>("SELECT type, slug, updated_at, published_at FROM posts WHERE deleted_at IS NULL AND status = 'PUBLISHED' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
    db.all<{ slug: string; updated_at: string; status: string }>("SELECT slug, updated_at, status FROM committees WHERE deleted_at IS NULL AND status <> 'UPCOMING'"),
    db.all<{ legacy_id: number; updated_at: string }>("SELECT legacy_id, updated_at FROM contests WHERE deleted_at IS NULL AND status = 'PUBLISHED'"),
  ]);
  // Listed forms that still take answers (closed ones say "noindex").
  const forms = await db.all<{ slug: string; updated_at: string }>(
    `SELECT slug, updated_at FROM external_forms WHERE listed = 1 AND accepting = 1 AND status = 'ACTIVE' AND deleted_at IS NULL
       AND (closes_at IS NULL OR closes_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (opens_at IS NULL OR opens_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
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
  return { events, posts, committees, contests, people, members, forms };
}

// ───────────────────────────── certificates ─────────────────────────────

export interface PublicCertificate {
  code: string;
  status: "VALID" | "REVOKED";
  revokedAt: string | null;
  revokeReason: string | null;
  recipientName: string;
  roleLine: string | null;
  body: string | null;
  rank: string | null;
  team: string | null;
  issuedOn: string;
  name: string;
  title: string;
  kind: string;
  template: string;
  /** The design as it was when issued. */
  design: unknown;
  event: { slug: string; title: string } | null;
  /** The holder's public card: only for people who served on a committee or made their profile public. */
  holder: { name: string; handle: string; avatar: string | null; position: string | null; department: string | null } | null;
}

/**
 * A certificate by its code, for the verification page: issued batches only, never the
 * recipient's email. The holder's card only when they're publicly listed anyway.
 */
export async function readCertificate(db: Db, code: string): Promise<PublicCertificate | null> {
  const r = await db.first<{
    code: string; status: "VALID" | "REVOKED"; revoked_at: string | null; revoke_reason: string | null; recipient_name: string; role_line: string | null; body: string | null; fields_json: string | null;
    issued_on: string; name: string; title: string; kind: string; template: string; design: string; event_slug: string | null; event_title: string | null;
    holder_name: string | null; handle: string | null; avatar_json: string | null; position: string | null; department: string | null; holder_public: number;
  }>(
    `SELECT c.code, c.status, c.revoked_at, c.revoke_reason, c.recipient_name, c.role_line, c.body, c.fields_json,
            b.issued_on, b.name, b.title, b.kind, b.template, b.design_snapshot_json AS design, e.slug AS event_slug, e.title AS event_title,
            p.full_name AS holder_name, COALESCE(p.slug, p.id) AS handle, ${avatarOfProfileSql("p")} AS avatar_json, p.department,
            (SELECT cm.position_title FROM committee_members cm JOIN committees cc ON cc.id = cm.committee_id AND cc.deleted_at IS NULL AND cc.status <> 'UPCOMING'
               WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL ORDER BY cc.slug DESC LIMIT 1) AS position,
            (p.id IS NOT NULL AND c.visibility = 'PUBLIC' AND (p.visibility = 'PUBLIC' OR EXISTS (SELECT 1 FROM committee_members cm WHERE cm.profile_id = p.id AND cm.deleted_at IS NULL))) AS holder_public
     FROM certificates c
     JOIN certificate_batches b ON b.id = c.batch_id AND b.deleted_at IS NULL AND b.status = 'ISSUED'
     LEFT JOIN events e ON e.id = b.event_id AND e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED')
     LEFT JOIN profiles p ON p.id = c.profile_id AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
     WHERE c.code = ?1`, code);
  if (!r) return null;
  let fields: { rank?: string; team?: string } = {};
  let design: unknown = {};
  try {
    fields = r.fields_json ? JSON.parse(r.fields_json) : {};
    design = JSON.parse(r.design);
  } catch {
    // keep the defaults
  }
  return {
    code: r.code, status: r.status, revokedAt: r.revoked_at, revokeReason: r.revoke_reason, recipientName: r.recipient_name, roleLine: r.role_line, body: r.body,
    rank: fields.rank ?? null, team: fields.team ?? null, issuedOn: r.issued_on, name: r.name, title: r.title, kind: r.kind, template: r.template, design,
    event: r.event_slug ? { slug: r.event_slug, title: r.event_title ?? r.event_slug } : null,
    holder: r.holder_public && r.holder_name && r.handle ? { name: r.holder_name, handle: r.handle, avatar: avatarUrl(r.avatar_json, "md"), position: r.position, department: r.department } : null,
  };
}

/** The newest executive certificate of a student ID (old /executives/certs/<id> links). */
export async function readCertificateByStudent(db: Db, studentId: string): Promise<{ code: string } | null> {
  if (!/^\d{6,12}$/.test(studentId)) return null;
  return db.first<{ code: string }>(
    `SELECT c.code FROM certificates c JOIN certificate_batches b ON b.id = c.batch_id AND b.deleted_at IS NULL AND b.status = 'ISSUED' AND b.kind = 'EXECUTIVE'
     JOIN profiles p ON p.id = c.profile_id AND p.student_id = ?1 AND p.deleted_at IS NULL
     WHERE c.status = 'VALID' ORDER BY b.issued_on DESC LIMIT 1`, studentId);
}

/** A member's certificates for their public profile (the ones they show). */
export async function readProfileCertificates(db: Db, handle: string): Promise<Array<{ code: string; name: string; kind: string; issuedOn: string; roleLine: string | null }>> {
  const rows = await db.all<{ code: string; name: string; kind: string; issued_on: string; role_line: string | null }>(
    `SELECT c.code, b.name, b.kind, b.issued_on, c.role_line FROM profiles p
     JOIN certificates c ON c.profile_id = p.id AND c.status = 'VALID' AND c.visibility = 'PUBLIC'
     JOIN certificate_batches b ON b.id = c.batch_id AND b.deleted_at IS NULL AND b.status = 'ISSUED'
     WHERE (p.slug = ?1 OR p.id = ?1) AND p.deleted_at IS NULL ORDER BY b.issued_on DESC LIMIT 30`, handle);
  return rows.map((r) => ({ code: r.code, name: r.name, kind: r.kind, issuedOn: r.issued_on, roleLine: r.role_line }));
}
