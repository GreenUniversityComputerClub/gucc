/**
 * External forms (Google Forms and the like) shown at /forms/<slug>: the dashboard's list and
 * editor, their schedule and listing, and every address a form ever had (old links keep
 * working, in any spelling). Answers stay with the provider (a Google Sheet); GUCC keeps the
 * page around the form.
 *
 * What the website learned by looking at a form (lib/forms/inspect.ts: where a short link really
 * leads, whether it needs a Google account, how many questions it has) arrives with the save;
 * the API only checks that it belongs to the same form service.
 */
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { toSlug, Validator } from "../validate";
import { TAGS } from "./cache-tags";
import { mediaUrl, type MediaRow } from "../../public/shapes";
import { embedUrlFor, extractFormUrl, formState, openUrlFor, providerOf, type FormDisplay, type FormProvider } from "../../forms/providers";

export const FORM_DISPLAYS = ["AUTO", "EMBED", "LINK"] as const satisfies readonly FormDisplay[];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Addresses the website itself uses under /forms. */
const RESERVED = new Set(["dashboard", "new"]);

/** What the dashboard shows about a form. */
export interface FormAdminRow {
  id: string;
  slug: string;
  title: string;
  url: string;
  status: "ACTIVE" | "ARCHIVED";
  provider: FormProvider | null;
  embedUrl: string | null;
  openUrl: string | null;
  description: string | null;
  questionCount: number | null;
  requiresSignIn: boolean;
  display: FormDisplay;
  listed: boolean;
  accepting: boolean;
  opensAt: string | null;
  closesAt: string | null;
  closedMessage: string | null;
  responsesUrl: string | null;
  category: string | null;
  eventId: string | null;
  event: { id: string; slug: string; title: string } | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  inspectedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  /** open, scheduled or closed by the schedule; archived; "check" when never inspected. */
  state: "open" | "scheduled" | "closed" | "archived";
}

interface FormDbRow {
  id: string; slug: string; title: string; url: string; status: "ACTIVE" | "ARCHIVED";
  provider: string | null; embed_url: string | null; open_url: string | null; description: string | null; question_count: number | null;
  requires_sign_in: number; display_mode: FormDisplay; listed: number; accepting: number; opens_at: string | null; closes_at: string | null;
  closed_message: string | null; responses_url: string | null; category: string | null; event_id: string | null; event_slug: string | null; event_title: string | null;
  cover_media_id: string | null; m_storage: MediaRow["storage"] | null; m_key: string | null; m_legacy: string | null; m_external: string | null; m_variants: string | null;
  inspected_at: string | null; sort_order: number; created_at: string; updated_at: string; updated_by_name: string | null;
}

const SELECT = `SELECT f.id, f.slug, f.title, f.url, f.status, f.provider, f.embed_url, f.open_url, f.description, f.question_count, f.requires_sign_in, f.display_mode,
         f.listed, f.accepting, f.opens_at, f.closes_at, f.closed_message, f.responses_url, f.category, f.event_id, e.slug AS event_slug, e.title AS event_title,
         f.cover_media_id, m.storage AS m_storage, m.object_key AS m_key, m.legacy_path AS m_legacy, m.external_url AS m_external, m.variants_json AS m_variants,
         f.inspected_at, f.sort_order, f.created_at, f.updated_at, COALESCE(p.full_name, u.email) AS updated_by_name
  FROM external_forms f
  LEFT JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL
  LEFT JOIN media m ON m.id = f.cover_media_id AND m.deleted_at IS NULL AND m.purged_at IS NULL
  LEFT JOIN users u ON u.id = f.updated_by
  LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL`;

function cover(r: FormDbRow): string | null {
  if (!r.cover_media_id || !r.m_storage) return null;
  return mediaUrl({ id: r.cover_media_id, storage: r.m_storage, object_key: r.m_key, legacy_path: r.m_legacy, external_url: r.m_external, variants_json: r.m_variants }, "lg") ?? null;
}

function toRow(r: FormDbRow, now = Date.now()): FormAdminRow {
  const accepting = r.accepting === 1;
  return {
    id: r.id, slug: r.slug, title: r.title, url: r.url, status: r.status,
    provider: (r.provider as FormProvider | null) ?? providerOf(r.url),
    embedUrl: r.embed_url, openUrl: r.open_url, description: r.description, questionCount: r.question_count,
    requiresSignIn: r.requires_sign_in === 1, display: r.display_mode, listed: r.listed === 1, accepting,
    opensAt: r.opens_at, closesAt: r.closes_at, closedMessage: r.closed_message, responsesUrl: r.responses_url, category: r.category,
    eventId: r.event_id, event: r.event_id && r.event_slug ? { id: r.event_id, slug: r.event_slug, title: r.event_title ?? r.event_slug } : null,
    coverMediaId: r.cover_media_id, coverUrl: cover(r), inspectedAt: r.inspected_at, sortOrder: r.sort_order,
    createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by_name,
    state: r.status === "ARCHIVED" ? "archived" : formState({ opensAt: r.opens_at, closesAt: r.closes_at, accepting }, now),
  };
}

/** Every form (archived ones last), for the dashboard. The club has tens, not thousands. */
export async function listForms(ctx: Ctx): Promise<FormAdminRow[]> {
  requirePermission(ctx, "forms.manage");
  const rows = await ctx.db.all<FormDbRow>(`${SELECT} WHERE f.deleted_at IS NULL ORDER BY f.status = 'ARCHIVED', f.sort_order, f.updated_at DESC LIMIT 500`);
  const now = Date.now();
  return rows.map((r) => toRow(r, now));
}

/** One form with every address it has had. */
export async function getForm(ctx: Ctx, id: string): Promise<{ form: FormAdminRow; slugs: Array<{ slug: string; createdAt: string }> }> {
  requirePermission(ctx, "forms.manage");
  const [row, slugs] = await Promise.all([
    ctx.db.first<FormDbRow>(`${SELECT} WHERE f.id = ?1 AND f.deleted_at IS NULL`, id),
    ctx.db.all<{ slug: string; created_at: string }>("SELECT slug, created_at FROM external_form_slugs WHERE form_id = ?1 ORDER BY created_at DESC LIMIT 50", id),
  ]);
  if (!row) throw new NotFoundError("Form");
  return { form: toRow(row), slugs: slugs.filter((s) => s.slug !== row.slug).map((s) => ({ slug: s.slug, createdAt: s.created_at })) };
}

/** Events a form can belong to (newest first). */
export async function formOptions(ctx: Ctx): Promise<{ events: Array<{ id: string; title: string; slug: string; status: string; startAt: string | null }> }> {
  requirePermission(ctx, "forms.manage");
  const events = await ctx.db.all<{ id: string; title: string; slug: string; status: string; start_at: string | null }>(
    "SELECT id, title, slug, status, start_at FROM events WHERE deleted_at IS NULL AND status IN ('DRAFT','PUBLISHED','ONGOING','COMPLETED') ORDER BY COALESCE(start_at, created_at) DESC LIMIT 100");
  return { events: events.map((e) => ({ id: e.id, title: e.title, slug: e.slug, status: e.status, startAt: e.start_at })) };
}

/** Who has this address now (its current one, or one it used to have), other than `except`. */
async function slugHolder(ctx: Ctx, slug: string, except: string | null) {
  return ctx.db.first<{ id: string; slug: string; title: string; status: string }>(
    `SELECT f.id, f.slug, f.title, f.status FROM external_forms f
     WHERE f.deleted_at IS NULL AND f.id <> COALESCE(?2, '') AND (f.slug = ?1 COLLATE NOCASE OR f.id IN (SELECT form_id FROM external_form_slugs WHERE slug = ?1))
     ORDER BY f.status = 'ACTIVE' DESC LIMIT 1`, slug, except);
}

/**
 * An address may be taken from an archived form (its page is gone anyway): the archived form
 * gets a new one and the history row moves. An active form's current or old address can't be.
 */
async function claimSlug(ctx: Ctx, slug: string, formId: string | null, field = "slug"): Promise<D1StatementLike[]> {
  const holder = await slugHolder(ctx, slug, formId);
  if (!holder) return [];
  if (holder.status === "ACTIVE") {
    const why = holder.slug.toLowerCase() === slug.toLowerCase()
      ? `“${holder.title}” uses the address /forms/${slug}.`
      : `/forms/${slug} used to lead to “${holder.title}”, and old links still go there.`;
    throw new ValidationError(`${why} Choose another address.`, { [field]: why });
  }
  if (holder.slug.toLowerCase() !== slug.toLowerCase()) return [];
  // The archived form keeps a readable address of its own.
  const renamed = `${holder.slug.toLowerCase()}-archived-${holder.id.slice(-4).toLowerCase()}`;
  return [
    ctx.db.stmt("UPDATE external_forms SET slug = ?2 WHERE id = ?1", holder.id, renamed),
    ctx.db.stmt("INSERT INTO external_form_slugs (slug, form_id) VALUES (?1, ?2) ON CONFLICT (slug) DO UPDATE SET form_id = excluded.form_id", renamed, holder.id),
  ];
}

const historyStmt = (ctx: Ctx, slug: string, formId: string) =>
  ctx.db.stmt("INSERT INTO external_form_slugs (slug, form_id) VALUES (?1, ?2) ON CONFLICT (slug) DO UPDATE SET form_id = excluded.form_id", slug, formId);

const coverStmts = (ctx: Ctx, formId: string, mediaId: string | null) => [
  ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'form' AND resource_id = ?1 AND field = 'cover'", formId),
  ...(mediaId ? [ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'form', ?2, 'cover') ON CONFLICT DO NOTHING", mediaId, formId)] : []),
];

/**
 * Create or edit a form. Fields not sent keep their value on an edit only where noted; the
 * editor always sends the whole form.
 */
export async function saveForm(ctx: Ctx, id: string | null, input: Record<string, unknown>) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "forms.manage");
  const current = id
    ? await ctx.db.first<{ slug: string; url: string; status: string }>("SELECT slug, url, status FROM external_forms WHERE id = ?1 AND deleted_at IS NULL", id)
    : null;
  if (id && !current) throw new NotFoundError("Form");
  // Google's whole embed code (Send → <>) works as the link too.
  const v = new Validator({ ...input, url: typeof input.url === "string" ? extractFormUrl(input.url) : input.url });
  const title = v.string("title", { required: true, max: 120, label: "Title" });
  const url = v.url("url", { required: true, label: "Form link" });
  const provider = url ? providerOf(url) : null;
  if (url) v.check(provider !== null, "url", "Use a Google, Microsoft, Tally or Airtable form link (https).");
  // A form made before addresses had to be lowercase (e.g. "CR") keeps its address when edited.
  const typed = typeof input.slug === "string" ? input.slug.trim() : "";
  const slug = current && typed === current.slug
    ? current.slug
    : v.string("slug", { max: 80, label: "Address", pattern: SLUG_RE, patternMessage: "Use lowercase letters, digits and single hyphens." }) ?? (title ? toSlug(title).slice(0, 80).replace(/-+$/, "") : null);
  const description = v.string("description", { max: 1000, label: "Description" });
  const display = v.oneOf("display", FORM_DISPLAYS, { label: "Display" }) ?? "AUTO";
  const listed = v.bool("listed");
  // The editor sends "accepting" as a checkbox; a request without it (older clients) keeps taking answers.
  const accepting = input.accepting === undefined ? true : v.bool("accepting");
  const opensAt = v.datetime("opensAt", { label: "Opens" });
  const closesAt = v.datetime("closesAt", { label: "Closes" });
  if (opensAt && closesAt) v.check(Date.parse(closesAt) > Date.parse(opensAt), "closesAt", "Closes must be after it opens.");
  const closedMessage = v.string("closedMessage", { max: 500, label: "Closed message" });
  const responsesUrl = v.url("responsesUrl", { label: "Responses sheet" });
  if (responsesUrl) v.check(responsesUrl.startsWith("https://") && responsesUrl.length <= 1000, "responsesUrl", "Use an https link (at most 1,000 characters).");
  const category = v.string("category", { max: 40, label: "Category" });
  const eventId = v.string("eventId", { max: 80 });
  const coverMediaId = v.string("coverMediaId", { max: 80 });
  const sortOrder = v.int("sortOrder", { min: -1000, max: 1000, label: "Order" }) ?? 0;
  // What the website found by looking at the form (sent only when it looked at this link).
  const inspected = v.bool("inspected");
  const resolved = inspected && typeof input.openUrl === "string" && input.openUrl ? input.openUrl.trim() : null;
  if (resolved) v.check(providerOf(resolved) === provider && resolved.startsWith("https://") && resolved.length <= 1000, "url", "The checked link doesn't match this form. Check it again.");
  const questionCount = inspected ? v.int("questionCount", { min: 0, max: 10000 }) : null;
  const requiresSignIn = inspected && v.bool("requiresSignIn");
  v.done();
  if (!slug) throw new ValidationError("Give the form an address.", { slug: "Use lowercase letters, digits and hyphens." });
  if (RESERVED.has(slug.toLowerCase())) throw new ValidationError(`/forms/${slug} is reserved. Choose another address.`, { slug: "This address is reserved." });
  if (!url || !provider) throw new ValidationError("Check the form link.", { url: "Required." });

  const refs = await ctx.db.first<{ event: number; media: number }>(
    `SELECT EXISTS (SELECT 1 FROM events WHERE id = ?1 AND deleted_at IS NULL) AS event,
            EXISTS (SELECT 1 FROM media WHERE id = ?2 AND deleted_at IS NULL AND purged_at IS NULL AND media_type = 'IMAGE') AS media`, eventId, coverMediaId);
  const bad: Record<string, string> = {};
  if (eventId && !refs?.event) bad.eventId = "That event no longer exists.";
  if (coverMediaId && !refs?.media) bad.coverMediaId = "That picture no longer exists. Choose it again.";
  if (Object.keys(bad).length) throw new ValidationError("Please correct the highlighted fields.", bad);

  const claim = await claimSlug(ctx, slug, id);
  const now = nowIso();
  // The page frames the form's embed address; a short link (forms.gle) only has one once checked.
  const source = resolved ?? url;
  const embedUrl = embedUrlFor(source);
  const openUrl = openUrlFor(source);
  const urlChanged = !current || current.url !== url;
  const after = { title, url, slug, listed, accepting, opensAt, closesAt, display, eventId };

  if (id && current) {
    // Unchecked edits of the same link keep what was learned before; a new link starts unchecked.
    const keepInspection = !inspected && !urlChanged;
    await ctx.db.batch([
      ...claim,
      ctx.db.stmt(
        `UPDATE external_forms SET title = ?2, url = ?3, slug = ?4, provider = ?5, description = ?6, display_mode = ?7, listed = ?8, accepting = ?9,
                opens_at = ?10, closes_at = ?11, closed_message = ?12, responses_url = ?13, category = ?14, event_id = ?15, cover_media_id = ?16, sort_order = ?17,
                embed_url = CASE WHEN ?18 THEN embed_url ELSE ?19 END, open_url = CASE WHEN ?18 THEN open_url ELSE ?20 END,
                requires_sign_in = CASE WHEN ?18 THEN requires_sign_in ELSE ?21 END, question_count = CASE WHEN ?18 THEN question_count ELSE ?22 END,
                inspected_at = CASE WHEN ?18 THEN inspected_at ELSE ?23 END, updated_at = ?24, updated_by = ?25
         WHERE id = ?1`,
        id, title, url, slug, provider, description, display, listed ? 1 : 0, accepting ? 1 : 0, opensAt, closesAt, closedMessage, responsesUrl, category, eventId, coverMediaId, sortOrder,
        keepInspection ? 1 : 0, embedUrl, openUrl, requiresSignIn ? 1 : 0, questionCount, inspected ? now : null, now, actor.user.id),
      historyStmt(ctx, slug, id),
      ...coverStmts(ctx, id, coverMediaId),
      auditStmt(ctx, { action: "form.update", resourceType: "form", resourceId: id, after, decision }),
    ]);
  } else {
    id = newId("form");
    await ctx.db.batch([
      ...claim,
      ctx.db.stmt(
        `INSERT INTO external_forms (id, slug, title, url, provider, description, display_mode, listed, accepting, opens_at, closes_at, closed_message, responses_url, category,
                event_id, cover_media_id, sort_order, embed_url, open_url, requires_sign_in, question_count, inspected_at, created_at, created_by, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?23, ?24)`,
        id, slug, title, url, provider, description, display, listed ? 1 : 0, accepting ? 1 : 0, opensAt, closesAt, closedMessage, responsesUrl, category,
        eventId, coverMediaId, sortOrder, embedUrl, openUrl, requiresSignIn ? 1 : 0, questionCount, inspected ? now : null, now, actor.user.id),
      historyStmt(ctx, slug, id),
      ...coverStmts(ctx, id, coverMediaId),
      auditStmt(ctx, { action: "form.create", resourceType: "form", resourceId: id, after, decision }),
    ]);
  }
  ctx.revalidate?.([TAGS.forms]);
  return { id, slug };
}

/** Save what a fresh look at the form found (the "Recheck" button), nothing else. */
export async function recordInspection(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const decision = requirePermission(ctx, "forms.manage");
  const row = await ctx.db.first<{ url: string; provider: string | null }>("SELECT url, provider FROM external_forms WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Form");
  const v = new Validator(input);
  const resolved = typeof input.openUrl === "string" && input.openUrl ? input.openUrl.trim() : row.url;
  v.check(providerOf(resolved) === providerOf(row.url) && resolved.startsWith("https://") && resolved.length <= 1000, "openUrl", "The checked link doesn't match this form.");
  const questionCount = v.int("questionCount", { min: 0, max: 10000 });
  const requiresSignIn = v.bool("requiresSignIn");
  const closed = v.bool("closed");
  v.done();
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `UPDATE external_forms SET embed_url = ?2, open_url = ?3, requires_sign_in = ?4, question_count = COALESCE(?5, question_count), provider = COALESCE(provider, ?6),
              accepting = CASE WHEN ?7 THEN 0 ELSE accepting END, inspected_at = ?8, updated_at = ?8 WHERE id = ?1`,
      id, embedUrlFor(resolved), openUrlFor(resolved), requiresSignIn ? 1 : 0, questionCount, providerOf(row.url), closed ? 1 : 0, now),
    auditStmt(ctx, { action: "form.inspect", resourceType: "form", resourceId: id, after: { requiresSignIn, questionCount, closed }, decision }),
  ]);
  ctx.revalidate?.([TAGS.forms]);
  return { id };
}

/** Archive (its page stops working; restorable) or restore a form. */
export async function setFormArchived(ctx: Ctx, id: string, archived: boolean) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "forms.manage");
  const row = await ctx.db.first<{ slug: string; status: string }>("SELECT slug, status FROM external_forms WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Form");
  // Restoring needs its address back: another form may have taken it meanwhile.
  if (!archived) await claimSlug(ctx, row.slug, id, "id");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE external_forms SET status = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1", id, archived ? "ARCHIVED" : "ACTIVE", now, actor.user.id),
    auditStmt(ctx, { action: archived ? "form.archive" : "form.restore", resourceType: "form", resourceId: id, decision }),
  ]);
  ctx.revalidate?.([TAGS.forms]);
  return { id, status: archived ? "ARCHIVED" : "ACTIVE" };
}

/**
 * Remove an archived form for good: its addresses are freed and it leaves the dashboard. The
 * answers are untouched (they live in the provider's sheet).
 */
export async function deleteForm(ctx: Ctx, id: string) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "forms.manage");
  const row = await ctx.db.first<{ status: string; cover_media_id: string | null }>("SELECT status, cover_media_id FROM external_forms WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!row) throw new NotFoundError("Form");
  if (row.status !== "ARCHIVED") throw new ValidationError("Archive the form first.", { id: "Only archived forms can be deleted." });
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE external_forms SET deleted_at = ?2, slug = 'deleted-' || id, listed = 0, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    ctx.db.stmt("DELETE FROM external_form_slugs WHERE form_id = ?1", id),
    ...coverStmts(ctx, id, null),
    auditStmt(ctx, { action: "form.delete", resourceType: "form", resourceId: id, decision }),
  ]);
  ctx.revalidate?.([TAGS.forms]);
  return { id };
}

/**
 * A copy for the next round ("CR Information Spring 2027"): same link, display and cover,
 * unlisted, without a schedule, under a free address.
 */
export async function duplicateForm(ctx: Ctx, id: string, input: Record<string, unknown> = {}) {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "forms.manage");
  const src = await ctx.db.first<FormDbRow>(`${SELECT} WHERE f.id = ?1 AND f.deleted_at IS NULL`, id);
  if (!src) throw new NotFoundError("Form");
  const v = new Validator(input);
  const title = v.string("title", { max: 120, label: "Title" }) ?? `${src.title} (copy)`.slice(0, 120);
  v.done();
  const base = `${src.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "form"}-copy`;
  const taken = new Set((await ctx.db.all<{ slug: string }>(
    `SELECT lower(slug) AS slug FROM external_form_slugs WHERE slug LIKE ?1 ESCAPE '\\'
     UNION SELECT lower(slug) FROM external_forms WHERE slug LIKE ?1 ESCAPE '\\'`, `${base.replace(/[\\%_]/g, "\\$&")}%`)).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const newIdValue = newId("form");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO external_forms (id, slug, title, url, provider, description, display_mode, listed, accepting, closed_message, responses_url, category, event_id,
              cover_media_id, sort_order, embed_url, open_url, requires_sign_in, question_count, inspected_at, created_at, created_by, updated_at, updated_by)
       SELECT ?2, ?3, ?4, url, provider, description, display_mode, 0, 1, closed_message, responses_url, category, event_id,
              cover_media_id, sort_order, embed_url, open_url, requires_sign_in, question_count, inspected_at, ?5, ?6, ?5, ?6
       FROM external_forms WHERE id = ?1`, id, newIdValue, slug, title, now, actor.user.id),
    historyStmt(ctx, slug, newIdValue),
    ...coverStmts(ctx, newIdValue, src.cover_media_id),
    auditStmt(ctx, { action: "form.create", resourceType: "form", resourceId: newIdValue, after: { title, slug, copiedFrom: id }, decision }),
  ]);
  return { id: newIdValue, slug };
}
