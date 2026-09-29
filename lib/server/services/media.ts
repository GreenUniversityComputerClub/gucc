/**
 * Media library: validated uploads to R2, metadata in D1.
 *
 * Pipeline (every upload):
 *   browser  → resize to variants, re-encode to WebP (drops EXIF, applies orientation)
 *   Worker   → identify by magic bytes, reject anything unexpected, enforce size
 *              and dimension limits per variant, strip any remaining metadata,
 *              hash for de-duplication, store under a random key, record in D1.
 *
 * Buckets: PUBLIC objects go to the public bucket (cacheable forever, could be
 * fronted by an R2 custom domain); PRIVATE/RESTRICTED objects go to a separate
 * private bucket and are only reachable through short-lived signed links.
 */
import { limit } from "../limits";
import { ensureStoredBytes, release as usageRelease, reserve, usageOf } from "../usage";
import { dimensions, EXTENSION, sniff, stripMetadata, VARIANTS, type SniffedType, type VariantName } from "../../media/bytes";
import { auditStmt } from "../audit";
import { authorize, eventResource, requireActor, requirePermission } from "../authz";
import type { Ctx, MediaBuckets } from "../context";
import { sha256Hex } from "../crypto";
import { newId, nowIso } from "../db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getSetting, getSettings } from "../security";
import { hmac, requireSecret, verificationSecrets, verifyHmac } from "../signing";
import { TAGS } from "./cache-tags";

export type UploadPurpose = "library" | "event" | "lostfound" | "avatar" | "recruitment";

export interface UploadInput {
  files: Partial<Record<VariantName, Uint8Array>>;
  originalFilename: string;
  sourceChecksum?: string | null;
  altText?: string | null;
  visibility?: "PUBLIC" | "PRIVATE" | "RESTRICTED";
  /** Upload into an event's gallery (checked against EVENT:ASSIGNED scopes). */
  eventId?: string | null;
  /**
   * library/event  need media.upload (scoped);
   * lostfound      a university account attaching a photo to their own post;
   * avatar         any signed-in member uploading their own profile photo;
   * recruitment    an applicant's documents (may be anonymous; the Worker has
   *                already verified the upload token that carries uploadSession).
   */
  purpose?: UploadPurpose;
  uploadSession?: string | null;
  /**
   * Replace this existing image with the uploaded one (media.update on it). Every page and
   * record using it shows the new version; the old files are deleted.
   */
  replaceId?: string | null;
}

export interface MediaRecord {
  id: string;
  url: string | null;
  deduplicated: boolean;
}

type Bucket = keyof MediaBuckets;
const IMAGE_TYPES: SniffedType[] = ["image/jpeg", "image/png", "image/webp", "image/avif"];
/** One upload request carries at most the five variants of one file. */
export const MAX_BYTES_PER_REQUEST = 60 * 1024 * 1024;
export const PUBLIC_CACHE = "public, max-age=31536000, immutable";
export const PRIVATE_CACHE = "private, no-store";

const bucketFor = (visibility: string): Bucket => (visibility === "PUBLIC" ? "public" : "private");

/** Quick check before reading an upload's body: are uploads open, and is anything left today? */
export async function uploadsOpen(ctx: Ctx): Promise<void> {
  const cfg = await getSettings(ctx, { "media.uploads_enabled": true, "media.daily_object_writes": 2000 });
  if (!cfg["media.uploads_enabled"]) throw new AppError(503, "UPLOADS_PAUSED", "Uploads are paused by the club's leaders. Try again later.");
  const limit = Number(cfg["media.daily_object_writes"]);
  const used = (await usageOf(ctx, ["r2.objects"]))["r2.objects"];
  if (used >= limit) throw new AppError(429, "DAILY_LIMIT", "Today's upload allowance is used up. Try again after 06:00 Dhaka time.");
}

/**
 * Reserve today's object writes, the anonymous-applicant allowance and the stored bytes, all
 * atomically. Anything reserved is given back when the upload then fails.
 */
async function reserveUploadBudget(ctx: Ctx, n: { objects: number; bytes: number; anonymous: boolean }) {
  const cfg = await getSettings(ctx, { "media.uploads_enabled": true, "media.daily_object_writes": 2000, "media.daily_anonymous_files": 300, "media.storage_limit_bytes": 8 * 1024 ** 3 });
  if (!cfg["media.uploads_enabled"]) throw new AppError(503, "UPLOADS_PAUSED", "Uploads are paused by the club's leaders. Try again later.");
  const dailyObjects = Number(cfg["media.daily_object_writes"]);
  const anonymousFiles = Number(cfg["media.daily_anonymous_files"]);
  const storageLimit = Number(cfg["media.storage_limit_bytes"]);
  const taken: Array<[string, number, string | undefined]> = [];
  const release = async () => {
    for (const [key, amount, day] of taken) await usageRelease(ctx, key, amount, day).catch(() => undefined);
  };
  if (!(await reserve(ctx, "r2.objects", n.objects, dailyObjects))) {
    throw new AppError(429, "DAILY_LIMIT", "Today's upload allowance is used up. Try again after 06:00 Dhaka time.");
  }
  taken.push(["r2.objects", n.objects, undefined]);
  if (n.anonymous) {
    if (!(await reserve(ctx, "r2.anonymous_files", 1, anonymousFiles))) {
      await release();
      throw new AppError(429, "DAILY_LIMIT", "Applications are receiving many files today. Please try again tomorrow, or contact the club.");
    }
    taken.push(["r2.anonymous_files", 1, undefined]);
  }
  await ensureStoredBytes(ctx);
  if (!(await reserve(ctx, "r2.stored_bytes", n.bytes, storageLimit, "total"))) {
    await release();
    throw new AppError(507, "STORAGE_FULL", "Storage is nearly full, so new files can't be added. Please tell a Moderator.");
  }
  taken.push(["r2.stored_bytes", n.bytes, "total"]);
  return { release };
}
export const mediaPath = (key: string) => `/media/${key}`;

async function allowedEmailDomains(ctx: Ctx): Promise<string[]> {
  const cfg = await ctx.db.first<{ value_json: string }>("SELECT value_json FROM organization_settings WHERE key = 'lostfound.config'");
  return (JSON.parse(cfg?.value_json ?? "{}").allowedStudentDomains as string[] | undefined) ?? ["@green.edu.bd", "@green.ac.bd", "@student.green.ac.bd"];
}

export async function uploadMedia(ctx: Ctx, input: UploadInput): Promise<MediaRecord> {
  if (!ctx.media) throw new AppError(503, "STORAGE_UNAVAILABLE", "Media storage is not configured.");
  const purpose = input.purpose ?? "library";
  let decision;
  let uploaderId: string | null = ctx.actor?.user.id ?? null;
  let visibility = input.visibility;
  let replacing: { id: string; storage: string; bucket: string | null; variants_json: string | null; visibility: string; checksum_sha256: string | null } | null = null;

  if (input.replaceId) {
    const actor = requireActor(ctx);
    await limit(ctx, "media.upload", actor.user.id);
    const m = await ctx.db.first<{ id: string; storage: string; bucket: string | null; variants_json: string | null; visibility: string; media_type: string; uploaded_by: string | null; checksum_sha256: string | null }>(
      "SELECT id, storage, bucket, variants_json, visibility, media_type, uploaded_by, checksum_sha256 FROM media WHERE id = ?1 AND deleted_at IS NULL", input.replaceId);
    if (!m) throw new NotFoundError("Media");
    if (m.media_type !== "IMAGE") throw new ValidationError("Only images can be replaced.");
    decision = requirePermission(ctx, "media.update", { type: "media", id: m.id, ownerId: m.uploaded_by, createdBy: m.uploaded_by });
    replacing = m;
    visibility = m.visibility as "PUBLIC" | "PRIVATE" | "RESTRICTED";
  } else if (purpose === "recruitment") {
    if (!input.uploadSession) throw new ForbiddenError("This upload link is invalid.");
    await limit(ctx, "media.upload.applicant", ctx.meta.ipHash ?? "unknown");
    visibility = "PRIVATE";
  } else {
    const actor = requireActor(ctx);
    uploaderId = actor.user.id;
    await limit(ctx, "media.upload", actor.user.id);
    if (purpose === "lostfound") {
      const domains = await allowedEmailDomains(ctx);
      if (!domains.some((d) => actor.user.email.toLowerCase().endsWith(d))) throw new ForbiddenError("Only university accounts can attach photos.");
      await limit(ctx, "media.upload.lostfound", actor.user.id);
      visibility = "PUBLIC";
    } else if (purpose === "avatar") {
      await limit(ctx, "media.upload.avatar", actor.user.id);
      visibility = "PUBLIC";
    } else {
      // Event photos are judged against the event (its creator, category and assigned
      // coordinators/photographers), not the uploader, so OWN means "my event".
      const event = input.eventId ? await eventResource(ctx.db, input.eventId) : null;
      if (input.eventId && !event) throw new NotFoundError("Event");
      const resource = event ? { ...event, type: "event_media" } : { type: "media", ownerId: actor.user.id, createdBy: actor.user.id };
      decision = requirePermission(ctx, "media.upload", resource);
    }
  }

  const maxBytes = (await getSetting(ctx, "media.max_upload_mb", 10)) * 1024 * 1024;
  const maxDim = await getSetting(ctx, "media.max_dimension", 8000);
  const master = input.files.master;
  if (!master) throw new ValidationError("No file received.");

  const type = sniff(master);
  if (!type) throw new ValidationError("Unsupported file. Upload a JPEG, PNG, WebP or AVIF image, or a PDF.");
  const isImage = IMAGE_TYPES.includes(type);
  if (["lostfound", "avatar"].includes(purpose) && !isImage) throw new ValidationError("Only images are accepted here.");
  visibility = visibility ?? (isImage ? "PUBLIC" : "PRIVATE");
  if (!["PUBLIC", "PRIVATE", "RESTRICTED"].includes(visibility)) throw new ValidationError("Invalid visibility.");

  const cleaned: Partial<Record<VariantName, { bytes: Uint8Array; type: SniffedType; width?: number; height?: number }>> = {};
  for (const [name, bytes] of Object.entries(input.files) as Array<[VariantName, Uint8Array]>) {
    if (!bytes) continue;
    if (!(name in VARIANTS)) throw new ValidationError(`Unknown variant ${name}.`);
    if (bytes.length > maxBytes) throw new ValidationError(`File too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB). The limit is ${maxBytes / 1024 / 1024} MB.`);
    const t = sniff(bytes);
    if (!t) throw new ValidationError(`Variant ${name} is not a recognised file.`);
    if (!isImage) {
      if (name !== "master" || t !== "application/pdf") throw new ValidationError("Documents are uploaded as a single PDF.");
      cleaned.master = { bytes, type: t };
      continue;
    }
    if (!IMAGE_TYPES.includes(t)) throw new ValidationError(`Variant ${name} is not an image.`);
    const dim = dimensions(bytes, t);
    if (!dim || dim.width < 1 || dim.height < 1) throw new ValidationError(`Could not read the dimensions of ${name}; the file may be corrupt.`);
    const limit = name === "master" ? Math.min(maxDim, VARIANTS.master) : VARIANTS[name];
    if (Math.max(dim.width, dim.height) > limit + 1) {
      throw new ValidationError(name === "master" ? `Image is ${dim.width}×${dim.height}px; the largest accepted side is ${limit}px.` : `Variant ${name} exceeds ${limit}px.`);
    }
    cleaned[name] = { bytes: stripMetadata(bytes, t), type: t, ...dim };
  }

  const masterClean = cleaned.master!;
  const checksum = await sha256Hex(masterClean.bytes);
  if (replacing && !isImage) throw new ValidationError("Replace an image with another image.");
  // Applicants' documents are never shared between applications; a replacement is always stored.
  if (purpose !== "recruitment" && !replacing) {
    const existing = await ctx.db.first<{ id: string; object_key: string }>(
      // Only public files are shared; a private file is reused only for the person who uploaded it.
      "SELECT id, object_key FROM media WHERE checksum_sha256 = ?1 AND deleted_at IS NULL AND status = 'READY' AND visibility = ?2 AND (visibility = 'PUBLIC' OR uploaded_by = ?3)",
      checksum, visibility, ctx.actor?.user.id ?? "");
    if (existing) {
      // The same photo may already be in the library: still add it to this event's gallery.
      await ctx.db.batch([
        ...(input.eventId ? eventLinkStmts(ctx, input.eventId, existing.id, isImage) : []),
        auditStmt(ctx, { action: "media.upload_deduplicated", resourceType: "media", resourceId: existing.id, decision }),
      ]);
      if (input.eventId && visibility === "PUBLIC") ctx.revalidate?.([TAGS.events]);
      return { id: existing.id, url: visibility === "PUBLIC" ? mediaPath(existing.object_key) : null, deduplicated: true };
    }
  }

  // Free-tier guards: reserve the writes and bytes first (atomic), so no burst of uploads can
  // pass the club's limits or R2's free allowance.
  const budget = await reserveUploadBudget(ctx, {
    objects: Object.keys(cleaned).length,
    bytes: Object.values(cleaned).reduce((n, v) => n + (v?.bytes.length ?? 0), 0),
    anonymous: purpose === "recruitment",
  });
  const bucket = bucketFor(visibility);
  const store = ctx.media[bucket];
  const id = replacing?.id ?? newId("med");
  const now = new Date();
  // New keys even for a replacement: public files are cached as immutable.
  const base = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}${replacing ? `-${newId().slice(0, 8)}` : ""}`;
  const variants: Record<string, { key: string; width?: number; height?: number; size: number }> = {};
  const cache = bucket === "public" ? PUBLIC_CACHE : PRIVATE_CACHE;
  try {
    for (const [name, v] of Object.entries(cleaned) as Array<[VariantName, NonNullable<(typeof cleaned)[VariantName]>]>) {
      const key = `${base}/${name}.${EXTENSION[v.type]}`;
      await store.put(key, v.bytes, { httpMetadata: { contentType: v.type, cacheControl: cache }, customMetadata: { mediaId: id, variant: name } });
      variants[name] = { key, width: v.width, height: v.height, size: v.bytes.length };
    }
  } catch (e) {
    await store.delete(Object.values(variants).map((v) => v.key)).catch(() => undefined);
    await budget.release();
    throw e;
  }
  const safeName = input.originalFilename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200);
  const masterKey = variants.master.key;
  if (replacing) return finishReplace(ctx, replacing, { bucket, store, variants, masterKey, masterClean, checksum, safeName, decision });
  try {
    await ctx.db.batch([
      ctx.db.stmt(
        `INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, size_bytes, width, height, checksum_sha256, source_checksum, variants_json,
                            alt_text, visibility, status, uploaded_by, upload_session, created_at, updated_at)
         VALUES (?1, 'R2', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'READY', ?15, ?16, ?17, ?17)`,
        id, bucket, masterKey, safeName, masterClean.type, isImage ? "IMAGE" : "DOCUMENT", masterClean.bytes.length, masterClean.width ?? null, masterClean.height ?? null,
        checksum, input.sourceChecksum ?? null, JSON.stringify(variants), input.altText?.slice(0, 300) ?? null, visibility, uploaderId, input.uploadSession ?? null, nowIso(),
      ),
      ...(input.eventId && purpose !== "recruitment" ? eventLinkStmts(ctx, input.eventId, id, isImage) : []),
      auditStmt(ctx, { action: "media.upload", resourceType: "media", resourceId: id, actorLabel: uploaderId ? undefined : "applicant", after: { filename: safeName, type: masterClean.type, size: masterClean.bytes.length, visibility, purpose, variants: Object.keys(variants) }, decision }),
    ]);
  } catch (e) {
    // Never leave orphaned objects behind when the metadata write fails.
    await store.delete(Object.values(variants).map((v) => v.key));
    await budget.release();
    throw e;
  }
  // Event photos show on the public event page: refresh it.
  if (input.eventId && purpose !== "recruitment" && visibility === "PUBLIC") ctx.revalidate?.([TAGS.events]);
  return { id, url: bucket === "public" ? mediaPath(masterKey) : null, deduplicated: false };
}

/** Point an existing media record at freshly uploaded files, then delete the old ones. */
async function finishReplace(
  ctx: Ctx,
  old: { id: string; storage: string; bucket: string | null; variants_json: string | null; checksum_sha256: string | null },
  n: { bucket: Bucket; store: MediaBuckets[Bucket]; variants: Record<string, { key: string; width?: number; height?: number; size: number }>; masterKey: string;
    masterClean: { bytes: Uint8Array; type: SniffedType; width?: number; height?: number }; checksum: string; safeName: string; decision: Parameters<typeof auditStmt>[1]["decision"] },
): Promise<MediaRecord> {
  const actor = requireActor(ctx);
  try {
    await ctx.db.batch([
      ctx.db.stmt(
        `UPDATE media SET storage = 'R2', bucket = ?2, object_key = ?3, original_filename = ?4, mime_type = ?5, size_bytes = ?6, width = ?7, height = ?8, checksum_sha256 = ?9,
                variants_json = ?10, status = 'READY', updated_at = ?11, updated_by = ?12 WHERE id = ?1`,
        old.id, n.bucket, n.masterKey, n.safeName, n.masterClean.type, n.masterClean.bytes.length, n.masterClean.width ?? null, n.masterClean.height ?? null, n.checksum,
        JSON.stringify(n.variants), nowIso(), actor.user.id),
      auditStmt(ctx, { action: "media.replace", resourceType: "media", resourceId: old.id, before: { checksum: old.checksum_sha256 }, after: { checksum: n.checksum, variants: Object.keys(n.variants) }, decision: n.decision }),
    ]);
  } catch (e) {
    await n.store.delete(Object.values(n.variants).map((v) => v.key));
    throw e;
  }
  // The record now points at the new files; the old ones (legacy files stay in the site) go.
  if (old.storage === "R2" && old.variants_json) {
    const oldKeys = Object.values(JSON.parse(old.variants_json) as Record<string, { key: string }>).map((v) => v.key);
    await ctx.media![(old.bucket as Bucket) ?? "public"].delete(oldKeys).catch((e) => console.error(`[${ctx.meta.requestId}] old media cleanup failed`, e));
  }
  // It may appear on any public page.
  ctx.revalidate?.([TAGS.committees, TAGS.events, TAGS.posts, TAGS.contests, TAGS.settings]);
  return { id: old.id, url: n.bucket === "public" ? mediaPath(n.masterKey) : null, deduplicated: false };
}

/** Attach an uploaded file to an event: photos to its gallery, other files as attachments. */
function eventLinkStmts(ctx: Ctx, eventId: string, mediaId: string, isImage: boolean) {
  return [
    ctx.db.stmt("INSERT INTO event_media (event_id, media_id, kind, sort_order) VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM event_media WHERE event_id = ?1)) ON CONFLICT DO NOTHING",
      eventId, mediaId, isImage ? "GALLERY" : "ATTACHMENT"),
    ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'event', ?2, 'gallery') ON CONFLICT DO NOTHING", mediaId, eventId),
  ];
}

export interface MediaListRow {
  id: string;
  storage: string;
  object_key: string | null;
  legacy_path: string | null;
  external_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  media_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  visibility: string;
  alt_text: string | null;
  created_at: string;
  variants_json: string | null;
  refs: number;
  /** When the daily job last found it unused (null while something uses it). */
  unreferenced_since: string | null;
  /** Set when archived (listed only with the "archived" filter). */
  deleted_at: string | null;
}

const REFS_SQL = `(SELECT COUNT(*) FROM media_references r WHERE r.media_id = m.id)
  + (SELECT COUNT(*) FROM profiles p WHERE p.avatar_media_id = m.id AND p.deleted_at IS NULL)
  + (SELECT COUNT(*) FROM committee_members c WHERE c.avatar_media_id = m.id AND c.deleted_at IS NULL)
  + (SELECT COUNT(*) FROM events e WHERE e.banner_media_id = m.id AND e.deleted_at IS NULL)
  + (SELECT COUNT(*) FROM event_media em WHERE em.media_id = m.id)
  + (SELECT COUNT(*) FROM posts po WHERE po.featured_media_id = m.id AND po.deleted_at IS NULL)
  + (SELECT COUNT(*) FROM contest_media cm WHERE cm.media_id = m.id)
  + (SELECT COUNT(*) FROM lost_found_posts lf WHERE lf.image_media_id = m.id AND lf.deleted_at IS NULL)
  + (SELECT COUNT(*) FROM recruitment_applications ra WHERE m.id IN (ra.cv_media_id, ra.photo_media_id, ra.id_card_media_id))
  + (SELECT COUNT(*) FROM posts po WHERE po.deleted_at IS NULL AND instr(po.body_markdown, m.id) > 0)
  + (SELECT COUNT(*) FROM events e WHERE e.deleted_at IS NULL AND instr(e.description, m.id) > 0)
  + (SELECT COUNT(*) FROM organization_settings s WHERE instr(s.value_json, m.id) > 0 OR (m.legacy_path IS NOT NULL AND instr(s.value_json, m.legacy_path) > 0))`;

/** Everywhere a file can be used, as SQL over the media row `m`: images inside post bodies, event descriptions and page content count too. */
export const MEDIA_REFS_SQL = REFS_SQL;

/** Files unused this long may be deleted permanently by a Moderator. */
export const PURGE_AFTER_DAYS = 30;

export async function listMedia(ctx: Ctx, opts: { q?: string; type?: string; visibility?: string; page?: number; unused?: boolean; stale?: boolean; archived?: boolean }) {
  const actor = requireActor(ctx);
  const all = authorize(ctx, "media.read").outcome === "ALLOW";
  if (!all && authorize(ctx, "media.upload", { type: "media", ownerId: actor.user.id }).outcome === "DENY") throw new ForbiddenError("You cannot browse the media library.");
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "")}%` : null;
  return ctx.db.all<MediaListRow>(
    `SELECT * FROM (
       SELECT m.id, m.storage, m.object_key, m.legacy_path, m.external_url, m.original_filename, m.mime_type, m.media_type, m.size_bytes, m.width, m.height, m.visibility,
              m.alt_text, m.created_at, m.variants_json, m.unreferenced_since, m.deleted_at, ${REFS_SQL} AS refs
       FROM media m
       -- Archived files (not yet deleted for good) are listed on request, to delete them permanently.
       WHERE ((?9 = 0 AND m.deleted_at IS NULL) OR (?9 = 1 AND m.deleted_at IS NOT NULL AND m.purged_at IS NULL)) AND (?1 IS NULL OR m.original_filename LIKE ?1 OR m.legacy_path LIKE ?1 OR m.alt_text LIKE ?1)
         AND (?2 IS NULL OR m.media_type = ?2) AND (?3 IS NULL OR m.visibility = ?3) AND (?4 = 1 OR m.uploaded_by = ?5)
         AND (?8 IS NULL OR (m.unreferenced_since IS NOT NULL AND m.unreferenced_since <= ?8))
     ) WHERE (?7 = 0 OR refs = 0)
     ORDER BY created_at DESC LIMIT 48 OFFSET ?6`,
    q, opts.type ?? null, opts.visibility ?? null, all ? 1 : 0, actor.user.id, (page - 1) * 48, opts.unused || opts.stale ? 1 : 0,
    opts.stale ? new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString() : null, opts.archived ? 1 : 0,
  );
}

/**
 * One file's details and everywhere it is used (the same sources REFS_SQL counts), so an
 * administrator can see what archiving or replacing it would affect. Applicants' names are
 * not shown for recruitment documents.
 */
export async function mediaDetails(ctx: Ctx, id: string) {
  requirePermission(ctx, "media.read");
  const file = await ctx.db.first<{ id: string; original_filename: string | null; legacy_path: string | null; mime_type: string | null; media_type: string; size_bytes: number | null;
    width: number | null; height: number | null; visibility: string; storage: string; checksum_sha256: string | null; created_at: string; uploader: string | null }>(
    `SELECT m.id, m.original_filename, m.legacy_path, m.mime_type, m.media_type, m.size_bytes, m.width, m.height, m.visibility, m.storage, m.checksum_sha256, m.created_at,
            COALESCE(p.full_name, u.email) AS uploader
     FROM media m LEFT JOIN users u ON u.id = m.uploaded_by LEFT JOIN profiles p ON p.user_id = m.uploaded_by AND p.deleted_at IS NULL
     WHERE m.id = ?1 AND m.deleted_at IS NULL`, id);
  if (!file) throw new NotFoundError("Media");
  const usage = await ctx.db.all<{ kind: string; label: string; link: string | null }>(
    `SELECT 'Profile photo' AS kind, p.full_name AS label, '/dashboard/people/' || p.id AS link FROM profiles p WHERE p.avatar_media_id = ?1 AND p.deleted_at IS NULL
     UNION ALL SELECT 'Committee portrait', pr.full_name || ' · ' || c.name, '/dashboard/committees/' || c.id FROM committee_members cm
       JOIN profiles pr ON pr.id = cm.profile_id JOIN committees c ON c.id = cm.committee_id WHERE cm.avatar_media_id = ?1 AND cm.deleted_at IS NULL
     UNION ALL SELECT CASE em.kind WHEN 'GALLERY' THEN 'Event photo' WHEN 'ATTACHMENT' THEN 'Event document' ELSE 'Event banner' END, e.title, '/dashboard/events/' || e.id
       FROM event_media em JOIN events e ON e.id = em.event_id WHERE em.media_id = ?1
     UNION ALL SELECT 'Event banner', e.title, '/dashboard/events/' || e.id FROM events e WHERE e.banner_media_id = ?1 AND e.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM event_media em WHERE em.event_id = e.id AND em.media_id = ?1 AND em.kind = 'BANNER')
     UNION ALL SELECT 'Post image', po.title, '/dashboard/posts/' || po.id FROM posts po WHERE po.featured_media_id = ?1 AND po.deleted_at IS NULL
     UNION ALL SELECT 'Contest image', ct.title, '/dashboard/contests' FROM contest_media x JOIN contests ct ON ct.id = x.contest_id WHERE x.media_id = ?1
     UNION ALL SELECT 'Lost & found post', lf.title, '/lost-found' FROM lost_found_posts lf WHERE lf.image_media_id = ?1 AND lf.deleted_at IS NULL
     UNION ALL SELECT 'Recruitment document', 'A recruitment application', NULL FROM recruitment_applications ra WHERE ?1 IN (ra.cv_media_id, ra.photo_media_id, ra.id_card_media_id)
     UNION ALL SELECT 'Linked from ' || r.resource_type, r.field, NULL FROM media_references r WHERE r.media_id = ?1 AND r.resource_type NOT IN ('event', 'post')`,
    id);
  return { file, usage };
}

/** Copy every variant to the other bucket, then delete the originals. */
async function moveObjects(ctx: Ctx, variantsJson: string | null, from: Bucket, to: Bucket) {
  if (!ctx.media || from === to) return;
  const keys = Object.values(JSON.parse(variantsJson ?? "{}") as Record<string, { key: string }>).map((v) => v.key);
  for (const key of keys) {
    const obj = await ctx.media[from].get(key);
    if (!obj) continue;
    const bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
    await ctx.media[to].put(key, bytes, { httpMetadata: { contentType: obj.httpMetadata?.contentType, cacheControl: to === "public" ? PUBLIC_CACHE : PRIVATE_CACHE } });
  }
  await ctx.media[from].delete(keys);
}

export async function updateMedia(ctx: Ctx, id: string, input: { altText?: string | null; visibility?: string }) {
  const m = await ctx.db.first<{ uploaded_by: string | null; visibility: string; bucket: Bucket; storage: string; variants_json: string | null }>(
    "SELECT uploaded_by, visibility, bucket, storage, variants_json FROM media WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!m) throw new NotFoundError("Media");
  const decision = requirePermission(ctx, "media.update", { type: "media", id, ownerId: m.uploaded_by, createdBy: m.uploaded_by });
  if (input.visibility && !["PUBLIC", "PRIVATE", "RESTRICTED"].includes(input.visibility)) throw new ValidationError("Invalid visibility.");
  const nextBucket = input.visibility ? bucketFor(input.visibility) : m.bucket;
  const moving = nextBucket !== m.bucket && m.storage === "R2";
  if (moving) {
    // Copying to the other bucket writes each object again: it counts against the daily write cap.
    const objects = Object.keys(JSON.parse(m.variants_json ?? "{}")).length;
    const budget = await reserveUploadBudget(ctx, { objects, bytes: 0, anonymous: false });
    try {
      await moveObjects(ctx, m.variants_json, m.bucket, nextBucket);
    } catch (e) {
      await budget.release();
      throw e;
    }
  }
  // "" clears the alt text; leaving the field out keeps it.
  const alt = input.altText === undefined || input.altText === null ? null : input.altText.trim().slice(0, 300);
  await ctx.db.batch([
    ctx.db.stmt(`UPDATE media SET alt_text = CASE WHEN ?2 IS NULL THEN alt_text WHEN ?2 = '' THEN NULL ELSE ?2 END, visibility = COALESCE(?3, visibility), bucket = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?1`,
      id, alt, input.visibility ?? null, nextBucket, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: "media.update", resourceType: "media", resourceId: id, before: { visibility: m.visibility }, after: input, decision }),
  ]);
  // Pages that show this file must drop (or pick up) its public URL.
  if (moving) ctx.revalidate?.([TAGS.committees, TAGS.events, TAGS.posts, TAGS.contests, TAGS.settings]);
}

/** Archive media. Refused while anything still references it. Objects stay in R2 until the cleanup script runs. */
export async function archiveMedia(ctx: Ctx, id: string, reason: string | null) {
  const m = await ctx.db.first<{ uploaded_by: string | null }>("SELECT uploaded_by FROM media WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!m) throw new NotFoundError("Media");
  const decision = requirePermission(ctx, "media.delete", { type: "media", id, ownerId: m.uploaded_by });
  const refs = await ctx.db.value<number>(`SELECT ${REFS_SQL} FROM media m WHERE m.id = ?1`, id);
  if ((refs ?? 0) > 0) throw new ConflictError(`This file is still used in ${refs} place(s). Remove it from those first.`);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE media SET status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: "media.archive", resourceType: "media", resourceId: id, reason, decision }),
  ]);
}

/**
 * Delete a file for good: its objects leave R2 (freeing storage; deletes are free) and the library
 * keeps the record, marked purged. Only for files nothing has used for PURGE_AFTER_DAYS (the daily
 * job records when a file became unused) or archived that long ago, and only if nothing uses it now.
 */
export async function purgeMedia(ctx: Ctx, id: string, reason: unknown): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  const m = await ctx.db.first<{ uploaded_by: string | null; storage: string; bucket: Bucket; variants_json: string | null; unreferenced_since: string | null; deleted_at: string | null; purged_at: string | null; original_filename: string | null }>(
    "SELECT uploaded_by, storage, bucket, variants_json, unreferenced_since, deleted_at, purged_at, original_filename FROM media WHERE id = ?1", id);
  if (!m || m.purged_at) throw new NotFoundError("Media");
  const decision = requirePermission(ctx, "media.delete", { type: "media", id, ownerId: m.uploaded_by });
  if (m.storage !== "R2") throw new ValidationError("Only files stored in R2 can be deleted here.");
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  const eligible = m.deleted_at ? m.deleted_at <= cutoff : Boolean(m.unreferenced_since && m.unreferenced_since <= cutoff);
  if (!eligible) throw new AppError(409, "TOO_SOON", `Files can be deleted permanently after ${PURGE_AFTER_DAYS} days unused. Archive it now if it's in the way.`);
  const refs = await ctx.db.value<number>(`SELECT ${REFS_SQL} FROM media m WHERE m.id = ?1`, id);
  if ((refs ?? 0) > 0) throw new ConflictError(`This file is used in ${refs} place(s) again, so it stays.`);
  const now = nowIso();
  // Record first, then delete the objects: a failed R2 delete leaves a purged record whose objects the
  // cleanup script can still remove, never a live record pointing at missing objects.
  await ctx.db.batch([
    ctx.db.stmt("UPDATE media SET status = 'ARCHIVED', deleted_at = COALESCE(deleted_at, ?2), purged_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1 AND purged_at IS NULL", id, now, actor.user.id),
    auditStmt(ctx, { action: "media.purge", resourceType: "media", resourceId: id, reason: typeof reason === "string" ? reason.slice(0, 300) : null, before: { file: m.original_filename, unusedSince: m.unreferenced_since }, decision }),
  ]);
  const keys = Object.values(JSON.parse(m.variants_json ?? "{}") as Record<string, { key: string }>).map((v) => v.key);
  if (ctx.media && keys.length) await ctx.media[m.bucket ?? "public"].delete(keys);
  return { message: "Deleted permanently. Its storage is free again." };
}

/**
 * Take a file offline at once because of what it shows (a moderator removed it): once nothing
 * uses it any more, it becomes private and archived, and its stored objects are deleted, so the
 * old public URL stops working. Nothing happens while another post or page still uses it.
 */
export async function takeDownIfUnused(ctx: Ctx, mediaId: string | null | undefined, reason: string): Promise<boolean> {
  if (!mediaId) return false;
  const m = await ctx.db.first<{ storage: string; bucket: Bucket | null; variants_json: string | null; refs: number }>(
    `SELECT m.storage, m.bucket, m.variants_json, ${REFS_SQL} AS refs FROM media m WHERE m.id = ?1 AND m.purged_at IS NULL`, mediaId);
  if (!m || m.refs > 0) return false;
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE media SET visibility = 'PRIVATE', status = 'ARCHIVED', deleted_at = COALESCE(deleted_at, ?2), purged_at = ?2, updated_at = ?2 WHERE id = ?1 AND purged_at IS NULL", mediaId, now),
    auditStmt(ctx, { action: "media.taken_down", resourceType: "media", resourceId: mediaId, reason }),
  ]);
  // This isolate's remembered public lookups for the file go too (other isolates' expire within minutes,
  // and the objects are gone anyway).
  for (const requested of [...publicLookups.keys()]) if (requested.includes(`/${mediaId}`)) publicLookups.delete(requested);
  const keys = Object.values(JSON.parse(m.variants_json ?? "{}") as Record<string, { key: string }>).map((v) => v.key);
  if (m.storage === "R2" && ctx.media && keys.length) {
    await ctx.media[m.bucket ?? "public"].delete(keys).catch((e) => console.error(`[${ctx.meta.requestId}] take-down delete failed`, e));
  }
  return true;
}

/**
 * A link to open a media file. Public files get their permanent URL; private
 * ones a signed link that expires (default 10 minutes), issued only to the
 * uploader, holders of media.read, or recruitment reviewers for applicants'
 * documents.
 */
export async function signedMediaUrl(ctx: Ctx, mediaId: string, ttlSeconds = 600): Promise<string> {
  const actor = requireActor(ctx);
  const m = await ctx.db.first<{ object_key: string | null; visibility: string; uploaded_by: string | null; storage: string; legacy_path: string | null; external_url: string | null }>(
    "SELECT object_key, visibility, uploaded_by, storage, legacy_path, external_url FROM media WHERE id = ?1 AND deleted_at IS NULL", mediaId);
  if (!m) throw new NotFoundError("File");
  if (m.storage === "STATIC") return m.legacy_path ?? "";
  if (m.storage === "EXTERNAL") return m.external_url ?? "";
  if (!m.object_key) throw new NotFoundError("File");
  if (m.visibility === "PUBLIC") return mediaPath(m.object_key);
  const isRecruitmentDoc = Boolean(
    await ctx.db.first("SELECT 1 FROM recruitment_applications WHERE ?1 IN (cv_media_id, photo_media_id, id_card_media_id)", mediaId),
  );
  const allowed =
    actor.user.id === m.uploaded_by ||
    authorize(ctx, "media.read", { type: "media", id: mediaId, ownerId: m.uploaded_by }).outcome === "ALLOW" ||
    (isRecruitmentDoc && authorize(ctx, "recruitment.manage").outcome === "ALLOW");
  if (!allowed) throw new ForbiddenError("You cannot open this file.");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmac(requireSecret(ctx.env.AUTH_SECRET), `${m.object_key}|${exp}`);
  return `${mediaPath(m.object_key)}?exp=${exp}&sig=${sig}`;
}

/**
 * Resolve a /media/<key> request. Public objects are served to anyone.
 * Private objects need a valid, unexpired signature for exactly this key.
 * Requests for a size that a small image doesn't have fall back to the next
 * larger variant (nothing is ever upscaled).
 */
/**
 * Public files resolved recently, per Worker isolate: repeat requests for the same image cost no
 * D1 read. Small and short-lived; a file deleted or made private stops resolving from R2 anyway.
 */
const publicLookups = new Map<string, { at: number; value: { key: string; bucket: Bucket; cacheControl: string } }>();
const LOOKUP_TTL_MS = 10 * 60_000;
const LOOKUP_MAX = 500;

/** Drop a remembered lookup (the object wasn't where it said: moved, replaced or deleted). */
export function forgetMediaLookup(requestedKey: string): void {
  publicLookups.delete(requestedKey);
}

export async function resolveMediaAccess(
  ctx: Ctx,
  requestedKey: string,
  signature?: { exp?: string | null; sig?: string | null },
): Promise<{ key: string; bucket: Bucket; cacheControl: string; cached?: boolean } | null> {
  // Uploads: media/<yyyy>/<mm>/med_<uuid>/<variant>.<ext>, and a replaced file's new keys add
  // -<8 hex> to the folder (public files are cached as immutable); migrated legacy files:
  // media/legacy/media_<hash>/<variant>.<ext>. The database decides which object is served.
  const m = requestedKey.match(/^media\/(?:\d{4}\/\d{2}|legacy)\/(med_[0-9a-f-]{36}|media_[0-9a-f]{24})(?:-[0-9a-f]{8})?\/(thumb|sm|md|lg|master)\.(webp|jpg|png|avif|pdf)$/);
  if (!m) return null;
  // Signed (private) links are always checked against the database.
  const hit = signature?.sig ? undefined : publicLookups.get(requestedKey);
  if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return { ...hit.value, cached: true };
  if (hit) publicLookups.delete(requestedKey);
  const row = await ctx.db.first<{ visibility: string; bucket: Bucket; variants_json: string | null; status: string }>(
    "SELECT visibility, bucket, variants_json, status FROM media WHERE id = ?1 AND deleted_at IS NULL", m[1]);
  if (!row || row.status !== "READY") return null;
  const variants = JSON.parse(row.variants_json ?? "{}") as Record<string, { key: string }>;
  const ORDER = ["thumb", "sm", "md", "lg", "master"];
  const chosen = ORDER.slice(ORDER.indexOf(m[2])).map((v) => variants[v]).find(Boolean) ?? variants.master;
  if (!chosen) return null;
  if (row.visibility === "PUBLIC") {
    const value = { key: chosen.key, bucket: "public" as Bucket, cacheControl: PUBLIC_CACHE };
    if (publicLookups.size >= LOOKUP_MAX) publicLookups.delete(publicLookups.keys().next().value!);
    publicLookups.set(requestedKey, { at: Date.now(), value });
    return value;
  }
  // Private: the signature must be for the requested key and still valid.
  const exp = Number(signature?.exp);
  if (!signature?.sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (!(await verifyHmac(verificationSecrets(ctx.env), `${requestedKey}|${exp}`, signature.sig))) return null;
  return { key: chosen.key, bucket: row.bucket, cacheControl: PRIVATE_CACHE };
}
