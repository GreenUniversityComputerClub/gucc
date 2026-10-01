/**
 * Sponsorship pages: any number of sponsorship opportunities, each a page at /sponsors/<slug>
 * built from its own content (the same shape as the CSE Carnival page), all active ones listed at
 * /become-a-sponsor. One is the default: the navbar's Sponsors link (and /sponsors) opens it.
 *
 * Changing the default never touches the other pages: they stay active and reachable. The default
 * is always an active page (a database CHECK holds it), so deactivating or deleting it means
 * picking another default first. Managed by people who can manage settings (settings.manage), as
 * the single sponsorship page was before. Every change refreshes the public pages.
 */
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso } from "../db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { staleAnswer, unchangedSince, batchTransition } from "../transition";
import { toSlug, Validator } from "../validate";
import { TAGS } from "./cache-tags";

export interface SponsorshipRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: "ACTIVE" | "INACTIVE";
  is_default: number;
  sort_order: number;
  updated_at: string;
}

/** A row of the dashboard's list: the page plus what it holds and who changed it last. */
export interface SponsorshipListRow extends SponsorshipRow {
  event_name: string | null;
  packages: number;
  contacts: number;
  partners: number;
  price_from: number | null;
  created_at: string;
  updated_by_name: string | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Addresses the site already uses under /sponsors. */
const RESERVED = new Set(["become-a-sponsor", "new", "edit", "preview"]);
const MAX_CONTENT = 200_000;
const ORDERED = "ORDER BY is_default DESC, sort_order, title";

/** Every page for the dashboard, the default first, in the order /become-a-sponsor shows them. */
export async function listSponsorships(ctx: Ctx): Promise<SponsorshipListRow[]> {
  requirePermission(ctx, "settings.manage");
  return ctx.db.all<SponsorshipListRow>(
    `SELECT s.id, s.slug, s.title, s.summary, s.status, s.is_default, s.sort_order, s.created_at, s.updated_at,
            COALESCE(json_extract(s.content_json, '$.event.fullName'), json_extract(s.content_json, '$.event.name')) AS event_name,
            COALESCE(json_array_length(s.content_json, '$.packages'), 0) AS packages,
            COALESCE(json_array_length(s.content_json, '$.contacts'), 0) AS contacts,
            COALESCE(json_array_length(s.content_json, '$.previousPartners'), 0) AS partners,
            (SELECT MIN(CAST(json_extract(p.value, '$.price') AS INTEGER)) FROM json_each(s.content_json, '$.packages') p
              WHERE CAST(json_extract(p.value, '$.price') AS INTEGER) > 0) AS price_from,
            COALESCE(pr.full_name, u.email) AS updated_by_name
     FROM sponsorship_pages s LEFT JOIN users u ON u.id = s.updated_by LEFT JOIN profiles pr ON pr.user_id = s.updated_by AND pr.deleted_at IS NULL
     WHERE s.deleted_at IS NULL ${ORDERED.replace(/(is_default|sort_order|title)/g, "s.$1")}`);
}

/** One page with its content (formatted), for editing. */
export async function getSponsorship(ctx: Ctx, id: string) {
  requirePermission(ctx, "settings.manage");
  const row = await ctx.db.first<SponsorshipRow & { content_json: string }>(
    "SELECT id, slug, title, summary, status, is_default, sort_order, updated_at, content_json FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Sponsorship page");
  return { ...row, content: JSON.stringify(JSON.parse(row.content_json), null, 2) };
}

/**
 * The page's content: a JSON object in the CSE Carnival page's shape. Only what the page can't do
 * without is required (the event's name); every section shows only when its part is there.
 */
function parseContent(raw: unknown): Record<string, unknown> {
  const text = typeof raw === "string" ? raw.trim() : raw && typeof raw === "object" ? JSON.stringify(raw) : "";
  if (!text) throw new ValidationError("Add the page's content (JSON).", { content: "Required." });
  if (text.length > MAX_CONTENT) throw new ValidationError("The content is too long (200 KB at most).", { content: "Too long." });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new ValidationError(`The content isn't valid JSON: ${(e as Error).message.slice(0, 120)}`, { content: "Not valid JSON." });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("The content must be a JSON object ({ … }).", { content: "Must be an object." });
  const event = (value as { event?: { name?: unknown; fullName?: unknown } }).event;
  if (!event || typeof event !== "object" || !(typeof event.fullName === "string" && event.fullName.trim()) && !(typeof event.name === "string" && event.name.trim())) {
    throw new ValidationError("The content needs an event with a name: \"event\": { \"name\": \"…\", \"fullName\": \"…\" }.", { content: "Needs event.name." });
  }
  for (const key of ["packages", "programs", "previousPartners", "contacts", "achievements", "schedule", "otherOpportunities", "comparisonFeatures", "whySponsorReasons"]) {
    const part = (value as Record<string, unknown>)[key];
    if (part !== undefined && !Array.isArray(part)) throw new ValidationError(`"${key}" must be a list ([ … ]).`, { content: `${key} must be a list.` });
  }
  return value as Record<string, unknown>;
}

async function freeSlug(ctx: Ctx, base: string, exceptId: string | null): Promise<string> {
  const taken = new Set((await ctx.db.all<{ slug: string }>(
    "SELECT slug FROM sponsorship_pages WHERE deleted_at IS NULL AND (slug = ?1 OR slug LIKE ?2) AND id IS NOT ?3", base, `${base}-%`, exceptId)).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug) || RESERVED.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Create (id null) or change a page. A new page starts inactive unless it says otherwise. */
export async function saveSponsorship(ctx: Ctx, id: string | null, input: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "settings.manage");
  const v = new Validator(input);
  const title = v.string("title", { required: true, min: 2, max: 120, label: "Title" });
  const summary = v.string("summary", { max: 300, label: "Summary" });
  const rawSlug = v.string("slug", { max: 60, label: "Address", pattern: SLUG_RE, patternMessage: "Use lowercase letters, digits and single hyphens (e.g. hackathon-2027)." });
  const status = (v.oneOf("status", ["ACTIVE", "INACTIVE"] as const, { label: "Status" }) ?? (id ? null : "INACTIVE")) as "ACTIVE" | "INACTIVE" | null;
  const order = input.sortOrder === undefined || input.sortOrder === "" ? null : Number(input.sortOrder);
  if (order !== null) v.check(Number.isInteger(order) && order >= 0 && order <= 999, "sortOrder", "A whole number from 0 to 999.");
  if (rawSlug && RESERVED.has(rawSlug)) v.check(false, "slug", "That address is reserved. Choose another.");
  v.done();
  const content = parseContent(input.content);
  const now = nowIso();

  if (!id) {
    const slug = rawSlug ?? await freeSlug(ctx, toSlug(title!).slice(0, 60) || "sponsorship", null);
    if (await ctx.db.first("SELECT 1 FROM sponsorship_pages WHERE slug = ?1 AND deleted_at IS NULL", slug)) throw new ConflictError("Another sponsorship page uses this address.");
    const newIdValue = newId("spn");
    await ctx.db.batch([
      ctx.db.stmt(
        `INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json, created_at, created_by, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9, ?8, ?9)`,
        newIdValue, slug, title, summary, status ?? "INACTIVE", order ?? 0, JSON.stringify(content), now, actor.user.id),
      auditStmt(ctx, { action: "sponsorship.create", resourceType: "sponsorship_page", resourceId: newIdValue, after: { slug, title, status: status ?? "INACTIVE" }, decision }),
    ]);
    ctx.revalidate?.([TAGS.sponsorships]);
    return { id: newIdValue, slug };
  }

  const before = await ctx.db.first<SponsorshipRow>("SELECT id, slug, title, summary, status, is_default, sort_order, updated_at FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!before) throw new NotFoundError("Sponsorship page");
  const slug = rawSlug ?? before.slug;
  const nextStatus = status ?? before.status;
  if (before.is_default && nextStatus !== "ACTIVE") throw new ConflictError("This is the default page (the navbar's Sponsors link opens it). Make another page the default first, then deactivate this one.");
  if (slug !== before.slug && await ctx.db.first("SELECT 1 FROM sponsorship_pages WHERE slug = ?1 AND deleted_at IS NULL AND id <> ?2", slug, id)) throw new ConflictError("Another sponsorship page uses this address.");
  const fresh = await unchangedSince(ctx, "sponsorship_pages", id, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt(
      `UPDATE sponsorship_pages SET slug = ?2, title = ?3, summary = ?4, status = ?5, sort_order = ?6, content_json = ?7, updated_at = ?8, updated_by = ?9 WHERE id = ?1`,
      id, slug, title, summary, nextStatus, order ?? before.sort_order, JSON.stringify(content), now, actor.user.id),
    auditStmt(ctx, { action: "sponsorship.update", resourceType: "sponsorship_page", resourceId: id, before: { slug: before.slug, title: before.title, status: before.status }, after: { slug, title, status: nextStatus }, decision }),
  ], () => staleAnswer(ctx, "sponsorship_pages", id));
  ctx.revalidate?.([TAGS.sponsorships]);
  return { id, slug };
}

/** Show or hide a page. The default can't be hidden (pick another default first). */
export async function setSponsorshipStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE"): Promise<void> {
  const decision = requirePermission(ctx, "settings.manage");
  if (status !== "ACTIVE" && status !== "INACTIVE") throw new ValidationError("Choose active or inactive.");
  const row = await ctx.db.first<{ is_default: number; status: string }>("SELECT is_default, status FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Sponsorship page");
  if (row.status === status) return;
  if (row.is_default && status === "INACTIVE") throw new ConflictError("This is the default page. Make another page the default first, then deactivate this one.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sponsorship_pages SET status = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", id, status, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: status === "ACTIVE" ? "sponsorship.activate" : "sponsorship.deactivate", resourceType: "sponsorship_page", resourceId: id, decision }),
  ]);
  ctx.revalidate?.([TAGS.sponsorships]);
}

/**
 * Make this page the default (activating it if needed). Only the default flag moves: every other
 * page keeps its status, so nothing else is hidden or removed.
 */
export async function setDefaultSponsorship(ctx: Ctx, id: string): Promise<void> {
  const decision = requirePermission(ctx, "settings.manage");
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ is_default: number; title: string }>("SELECT is_default, title FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Sponsorship page");
  if (row.is_default) return;
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sponsorship_pages SET is_default = 0, updated_at = ?1 WHERE is_default = 1 AND deleted_at IS NULL", now),
    ctx.db.stmt("UPDATE sponsorship_pages SET is_default = 1, status = 'ACTIVE', updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: "sponsorship.default", resourceType: "sponsorship_page", resourceId: id, after: { title: row.title }, decision }),
  ]);
  ctx.revalidate?.([TAGS.sponsorships]);
}

/** A copy to start a new opportunity from (inactive until it's ready). */
export async function duplicateSponsorship(ctx: Ctx, id: string): Promise<{ id: string; slug: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "settings.manage");
  const src = await ctx.db.first<{ slug: string; title: string; summary: string | null; sort_order: number; content_json: string }>(
    "SELECT slug, title, summary, sort_order, content_json FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!src) throw new NotFoundError("Sponsorship page");
  const slug = await freeSlug(ctx, `${src.slug}-copy`.slice(0, 60), null);
  const copy = newId("spn");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, 'INACTIVE', 0, ?5, ?6, ?7, ?8, ?7, ?8)`,
      copy, slug, `Copy of ${src.title}`.slice(0, 120), src.summary, src.sort_order + 1, src.content_json, now, actor.user.id),
    auditStmt(ctx, { action: "sponsorship.create", resourceType: "sponsorship_page", resourceId: copy, after: { slug, copiedFrom: id }, decision }),
  ]);
  return { id: copy, slug };
}

/**
 * Move a page one place up or down in the list (/become-a-sponsor shows them in this order; the
 * default always comes first there). Renumbers every page in one statement, so equal or missing
 * numbers sort themselves out.
 */
export async function moveSponsorship(ctx: Ctx, id: string, direction: "up" | "down"): Promise<void> {
  const decision = requirePermission(ctx, "settings.manage");
  if (direction !== "up" && direction !== "down") throw new ValidationError("Move up or down.");
  const rows = await ctx.db.all<{ id: string; is_default: number }>(`SELECT id, is_default FROM sponsorship_pages WHERE deleted_at IS NULL ${ORDERED}`);
  // The default leads the public list whatever its number, so it takes no part in the order.
  const ids = rows.filter((r) => !r.is_default).map((r) => r.id);
  const i = ids.indexOf(id);
  if (i < 0) {
    if (rows.some((r) => r.id === id)) throw new ConflictError("The default page always comes first.");
    throw new NotFoundError("Sponsorship page");
  }
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await ctx.db.batch([
    ctx.db.stmt(
      `UPDATE sponsorship_pages SET sort_order = (SELECT CAST(j.key AS INTEGER) + 1 FROM json_each(?1) AS j WHERE j.value = sponsorship_pages.id)
       WHERE id IN (SELECT value FROM json_each(?1))`, JSON.stringify(ids)),
    auditStmt(ctx, { action: "sponsorship.move", resourceType: "sponsorship_page", resourceId: id, after: { direction }, decision }),
  ]);
  ctx.revalidate?.([TAGS.sponsorships]);
}

/** Remove a page for good (from the site and the dashboard). Never the default. */
export async function deleteSponsorship(ctx: Ctx, id: string): Promise<void> {
  const decision = requirePermission(ctx, "settings.manage");
  const row = await ctx.db.first<{ is_default: number; title: string }>("SELECT is_default, title FROM sponsorship_pages WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Sponsorship page");
  if (row.is_default) throw new ConflictError("This is the default page. Make another page the default first, then delete this one.");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE sponsorship_pages SET deleted_at = ?2, status = 'INACTIVE', updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: "sponsorship.delete", resourceType: "sponsorship_page", resourceId: id, before: { title: row.title }, decision }),
  ]);
  ctx.revalidate?.([TAGS.sponsorships]);
}
