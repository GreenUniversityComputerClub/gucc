/**
 * Blog posts, news and announcements.
 *
 * Publishing asks the governance engine:
 *   ALLOW             → published now (or scheduled)
 *   REQUIRE_APPROVAL  → an approval request under the matching rule's policy
 *   DENY but the author may submit (posts.submit on their own post)
 *                     → an approval request under the default content policy
 * Every save writes a revision, so earlier versions can be inspected and
 * restored. Unpublished content is never returned by the public read model.
 */
import { isAffiliateExecutive } from "../../governance/engine";
import { alreadyDone, assertTransition, batchTransition, newTransition, staleAnswer, unchangedSince } from "../transition";
import { auditStmt } from "../audit";
import { authorize, postResource, requireActor, requirePermission, scopesFor } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getSetting } from "../security";
import { toSlug, Validator } from "../validate";
import { registerApprovalHandler, startApproval, WITHDRAWN } from "./approvals";
import { tagsForPost } from "./cache-tags";
import { triggerStmts } from "../triggers";
import { checkMemberCreate, checkMemberSubmit } from "./member-content";

export const POST_TYPES = ["BLOG", "NEWS", "ANNOUNCEMENT"] as const;
export type PostType = (typeof POST_TYPES)[number];

export interface PostRow {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  body_markdown: string | null;
  author_name: string | null;
  category_id: string | null;
  category_slug?: string | null;
  category_name?: string | null;
  featured_media_id: string | null;
  canonical_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_display?: string | null;
}

function readTime(markdown: string | null): number | null {
  if (!markdown) return null;
  return Math.max(1, Math.round(markdown.split(/\s+/).length / 220));
}

async function ensureCategory(ctx: Ctx, name: string | null): Promise<string | null> {
  if (!name) return null;
  const slug = toSlug(name);
  if (!slug) return null;
  const existing = await ctx.db.first<{ id: string }>("SELECT id FROM categories WHERE kind = 'POST' AND slug = ?1", slug);
  if (existing) return existing.id;
  const id = newId("cat");
  await ctx.db.run("INSERT INTO categories (id, kind, slug, name, created_at) VALUES (?1, 'POST', ?2, ?3, ?4) ON CONFLICT(kind, slug) DO NOTHING", id, slug, name, nowIso());
  return (await ctx.db.first<{ id: string }>("SELECT id FROM categories WHERE kind = 'POST' AND slug = ?1", slug))?.id ?? null;
}

/** Three statements whatever the number of tags (the free plan allows 50 per request). */
async function syncTags(ctx: Ctx, postId: string, tags: string[]): Promise<D1StatementLike[]> {
  const bySlug = new Map<string, string>();
  for (const name of [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20)) {
    const slug = toSlug(name);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, name);
  }
  const rows = JSON.stringify([...bySlug].map(([slug, name]) => ({ slug, name })));
  return [
    ctx.db.stmt("DELETE FROM post_tags WHERE post_id = ?1", postId),
    ctx.db.stmt(
      `INSERT INTO tags (id, slug, name, created_at)
       SELECT 'tag_' || json_extract(j.value, '$.slug'), json_extract(j.value, '$.slug'), json_extract(j.value, '$.name'), ?2 FROM json_each(?1) AS j WHERE true
       ON CONFLICT(slug) DO NOTHING`, rows, nowIso()),
    ctx.db.stmt(
      `INSERT INTO post_tags (post_id, tag_id)
       SELECT ?1, t.id FROM tags t WHERE t.slug IN (SELECT json_extract(value, '$.slug') FROM json_each(?2))
       ON CONFLICT DO NOTHING`, postId, rows),
  ];
}

function parseInput(input: Record<string, unknown>) {
  const v = new Validator(input);
  const data = {
    type: v.oneOf("type", POST_TYPES, { required: true, label: "Type" }),
    title: v.string("title", { required: true, min: 3, max: 200, label: "Title" }),
    slug: v.string("slug", { max: 120, label: "Slug", pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: "Use lowercase letters, numbers and single hyphens." }),
    subtitle: v.string("subtitle", { max: 300, label: "Subtitle" }),
    excerpt: v.string("excerpt", { max: 500, label: "Excerpt" }),
    body: v.string("body", { max: 200_000, label: "Body" }),
    category: v.string("category", { max: 60, label: "Category" }),
    tags: String(input.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    featuredMediaId: v.string("featuredMediaId", { max: 80 }),
    canonicalUrl: v.url("canonicalUrl", { label: "Canonical URL" }),
    seoTitle: v.string("seoTitle", { max: 70, label: "SEO title" }),
    seoDescription: v.string("seoDescription", { max: 170, label: "SEO description" }),
    scheduledAt: v.datetime("scheduledAt", { label: "Scheduled time" }),
    changeReason: v.string("changeReason", { max: 300, label: "Change note" }),
  };
  v.done();
  return data;
}

export async function createPost(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const d = parseInput(input);
  const categoryId = await ensureCategory(ctx, d.category);
  const categorySlug = d.category ? toSlug(d.category) : null;
  const decision = requirePermission(ctx, "posts.create", { type: "post", createdBy: actor.user.id, ownerId: actor.user.id, category: categorySlug, meta: { postType: d.type } });
  await checkMemberCreate(ctx, "post", d.type);
  const slug = d.slug ?? toSlug(d.title!);
  if (!slug) throw new ValidationError("Choose a slug.", { slug: "Choose a slug." });
  const clash = await ctx.db.first("SELECT id FROM posts WHERE type = ?1 AND slug = ?2", d.type, slug);
  if (clash) throw new ValidationError("That slug is already used.", { slug: "That slug is already used by another post of this type." });
  const id = newId("post");
  const now = nowIso();
  const snapshot = { ...d, slug };
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO posts (id, type, slug, title, subtitle, excerpt, body_markdown, author_profile_id, category_id, featured_media_id, canonical_url,
                          seo_title, seo_description, status, scheduled_at, read_time_minutes, current_version, source, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'DRAFT', ?14, ?15, 1, 'LOCAL', ?16, ?17, ?16, ?17)`,
      id, d.type, slug, d.title, d.subtitle, d.excerpt, d.body, actor.profile?.id ?? null, categoryId, d.featuredMediaId, d.canonicalUrl,
      d.seoTitle, d.seoDescription, d.scheduledAt, readTime(d.body), now, actor.user.id,
    ),
    ctx.db.stmt("INSERT INTO post_revisions (id, post_id, version, title, excerpt, body_markdown, snapshot_json, changed_by, change_reason, created_at) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      newId("rev"), id, d.title, d.excerpt, d.body, JSON.stringify(snapshot), actor.user.id, d.changeReason ?? "Created", now),
    ...(await syncTags(ctx, id, d.tags)),
    ...(d.featuredMediaId ? [ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'post', ?2, 'featured') ON CONFLICT DO NOTHING", d.featuredMediaId, id)] : []),
    auditStmt(ctx, { action: "post.create", resourceType: "post", resourceId: id, after: { type: d.type, slug, title: d.title }, decision }),
  ]);
  return { id };
}

export async function getPostForEdit(ctx: Ctx, id: string) {
  requireActor(ctx);
  const resource = await postResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Post");
  requirePermission(ctx, "posts.read", resource);
  const post = await ctx.db.first<PostRow & { tags: string | null }>(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name,
            (SELECT group_concat(t.name, ', ') FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id) AS tags
     FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?1`,
    id,
  );
  const revisions = await ctx.db.all<{ id: string; version: number; title: string; change_reason: string | null; created_at: string; changed_by_name: string | null }>(
    `SELECT r.id, r.version, r.title, r.change_reason, r.created_at, COALESCE(pr.full_name, u.email) AS changed_by_name
     FROM post_revisions r LEFT JOIN users u ON u.id = r.changed_by LEFT JOIN profiles pr ON pr.user_id = u.id
     WHERE r.post_id = ?1 ORDER BY r.version DESC LIMIT 50`,
    id,
  );
  const pending = await ctx.db.first<{ id: string }>("SELECT id FROM approval_requests WHERE resource_type = 'post' AND resource_id = ?1 AND status = 'PENDING'", id);
  const publish = authorize(ctx, "posts.publish", resource);
  const submit = authorize(ctx, "posts.submit", resource);
  return {
    post: post!,
    revisions,
    pendingApprovalId: pending?.id ?? null,
    capabilities: {
      edit: authorize(ctx, "posts.update", resource).outcome === "ALLOW",
      publish: publish.outcome,
      publishExplanation: publish.summary,
      submit: submit.outcome === "ALLOW",
      delete: authorize(ctx, "posts.delete", resource).outcome === "ALLOW",
    },
  };
}

export async function updatePost(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await postResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Post");
  const decision = requirePermission(ctx, "posts.update", resource);
  const before = await ctx.db.first<PostRow>("SELECT * FROM posts WHERE id = ?1", id);
  const d = parseInput({ ...input, type: input.type ?? before!.type });
  const categoryId = await ensureCategory(ctx, d.category);
  const newCategory = d.category ? toSlug(d.category) : null;
  // Moving a post into a category you have no rights over is an escalation.
  if (newCategory !== (resource.category ?? null)) requirePermission(ctx, "posts.update", { ...resource, category: newCategory });
  const slug = d.slug ?? before!.slug;
  if (slug !== before!.slug) {
    const clash = await ctx.db.first("SELECT id FROM posts WHERE type = ?1 AND slug = ?2 AND id <> ?3", before!.type, slug, id);
    if (clash) throw new ValidationError("That slug is already used.", { slug: "That slug is already used by another post of this type." });
  }
  const version = before!.current_version + 1;
  const now = nowIso();
  // Editing published content keeps it live; editing something awaiting
  // approval withdraws the request so approvers never approve stale text.
  const wasPending = before!.status === "PENDING_APPROVAL";
  const fresh = await unchangedSince(ctx, "posts", id, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ctx.db.stmt(
      `UPDATE posts SET slug = ?2, title = ?3, subtitle = ?4, excerpt = ?5, body_markdown = ?6, category_id = ?7, featured_media_id = ?8, canonical_url = ?9,
              seo_title = ?10, seo_description = ?11, scheduled_at = ?12, read_time_minutes = ?13, current_version = ?14, updated_at = ?15, updated_by = ?16,
              status = CASE WHEN status IN ('PENDING_APPROVAL','REJECTED','APPROVED') THEN 'DRAFT' ELSE status END,
              -- A post scheduled for later follows its new publish time (cleared: it goes out now).
              published_at = CASE WHEN status = 'PUBLISHED' AND published_at > ?15 THEN MAX(COALESCE(?12, ?15), ?15) ELSE published_at END
       WHERE id = ?1`,
      id, slug, d.title, d.subtitle, d.excerpt, d.body, categoryId, d.featuredMediaId, d.canonicalUrl, d.seoTitle, d.seoDescription, d.scheduledAt,
      readTime(d.body), version, now, actor.user.id,
    ),
    ctx.db.stmt("INSERT INTO post_revisions (id, post_id, version, title, excerpt, body_markdown, snapshot_json, changed_by, change_reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      newId("rev"), id, version, d.title, d.excerpt, d.body, JSON.stringify({ ...d, slug }), actor.user.id, d.changeReason, now),
    ...(wasPending ? [ctx.db.stmt("UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, resolution_note = 'Edited after submission', updated_at = ?2 WHERE resource_type = 'post' AND resource_id = ?1 AND status = 'PENDING'", id, now)] : []),
    ...(await syncTags(ctx, id, d.tags)),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'post' AND resource_id = ?1 AND field = 'featured'", id),
    ...(d.featuredMediaId ? [ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'post', ?2, 'featured') ON CONFLICT DO NOTHING", d.featuredMediaId, id)] : []),
    auditStmt(ctx, { action: "post.update", resourceType: "post", resourceId: id, reason: d.changeReason, before: { title: before!.title, slug: before!.slug, version: before!.current_version }, after: { title: d.title, slug, version }, decision }),
  ], () => staleAnswer(ctx, "posts", id));
  ctx.revalidate?.(tagsForPost(before!.type, before!.slug, slug));
}

export type PublishResult = { outcome: "PUBLISHED" | "SCHEDULED" | "PENDING_APPROVAL"; requestId?: string; message: string };

export async function publishPost(ctx: Ctx, id: string): Promise<PublishResult> {
  const actor = requireActor(ctx);
  const resource = await postResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Post");
  const post = await ctx.db.first<PostRow>("SELECT * FROM posts WHERE id = ?1", id);
  if (post!.status === "PUBLISHED") throw new AppError(409, "ALREADY_PUBLISHED", "This post is already published.");
  if (!post!.body_markdown && !post!.canonical_url) throw new ValidationError("Add a body (or a canonical link) before publishing.");

  const decision = authorize(ctx, "posts.publish", resource);
  if (decision.outcome === "ALLOW") {
    const now = nowIso();
    const scheduled = post!.scheduled_at && post!.scheduled_at > now;
    const token = newTransition();
    await batchTransition(ctx, [
      ctx.db.stmt("UPDATE posts SET status = 'PUBLISHED', published_at = ?2, updated_at = ?3, updated_by = ?4, last_transition = ?5 WHERE id = ?1 AND status <> 'PUBLISHED' AND deleted_at IS NULL",
        id, scheduled ? post!.scheduled_at : now, now, actor.user.id, token),
      assertTransition(ctx, "posts", id, token),
      auditStmt(ctx, { action: "post.publish", resourceType: "post", resourceId: id, decision, after: { publishedAt: scheduled ? post!.scheduled_at : now } }),
      ...(await triggerStmts(ctx, "post.published", resource, { title: post!.title, link: `/dashboard/posts/${id}` })),
    ], () => alreadyDone(ctx, "posts", id, "This post"));
    ctx.revalidate?.(tagsForPost(post!.type, post!.slug));
    return scheduled
      ? { outcome: "SCHEDULED", message: `Scheduled for ${post!.scheduled_at}. It appears publicly from then.` }
      : { outcome: "PUBLISHED", message: "Published." };
  }

  let policyKey: string | undefined;
  let ruleId: string | null = null;
  if (decision.outcome === "REQUIRE_APPROVAL") {
    policyKey = decision.approvalPolicyKey;
    ruleId = decision.approvalRuleId ?? null;
  } else if (authorize(ctx, "posts.submit", resource).outcome === "ALLOW") {
    await checkMemberSubmit(ctx, "post");
    // Affiliated committees (e.g. CSS) publish after the President or General Secretary approves.
    policyKey = isAffiliateExecutive(actor.subject)
      ? await getSetting(ctx, "content.affiliate_approval_policy", "president-or-gs")
      : await getSetting(ctx, "content.default_approval_policy", "leadership-any");
  } else {
    throw new ForbiddenError(decision.summary, decision);
  }
  if (!policyKey) throw new AppError(500, "POLICY_MISSING", "The approval rule names no policy.");
  const { requestId, created } = await startApproval(ctx, {
    policyKey, ruleId, resourceType: "post", resourceId: id, action: "posts.publish", title: `Publish ${post!.type.toLowerCase()}: ${post!.title}`,
    payload: { version: post!.current_version },
    alongside: [
      ctx.db.stmt("UPDATE posts SET status = 'PENDING_APPROVAL', updated_at = ?2 WHERE id = ?1", id, nowIso()),
      ...(await triggerStmts(ctx, "post.submitted", resource, { title: post!.title, link: `/dashboard/posts/${id}` })),
    ],
  });
  return { outcome: "PENDING_APPROVAL", requestId, message: created ? `Sent for approval. ${decision.outcome === "REQUIRE_APPROVAL" ? decision.summary : ""}`.trim() : "Already waiting for approval." };
}

async function publishedTrigger(ctx: Ctx, id: string) {
  const resource = await postResource(ctx.db, id);
  const title = await ctx.db.value<string>("SELECT title FROM posts WHERE id = ?1", id);
  return resource ? triggerStmts(ctx, "post.published", resource, { title: title ?? "Post", link: `/dashboard/posts/${id}` }) : [];
}

registerApprovalHandler("posts.publish", {
  async onApproved(ctx, req) {
    const now = nowIso();
    return [
      ctx.db.stmt(
        `UPDATE posts SET status = 'PUBLISHED', published_at = CASE WHEN scheduled_at IS NOT NULL AND scheduled_at > ?2 THEN scheduled_at ELSE ?2 END, updated_at = ?2
         WHERE id = ?1 AND status = 'PENDING_APPROVAL'`,
        req.resource_id, now,
      ),
      auditStmt(ctx, { action: "post.publish", resourceType: "post", resourceId: req.resource_id, reason: `Approved (request ${req.id})` }),
      ...(await publishedTrigger(ctx, req.resource_id)),
    ];
  },
  async onRejected(ctx, req, note) {
    // Withdrawn by the author: back to a draft to keep working on, not "sent back".
    const status = note === WITHDRAWN ? "DRAFT" : "REJECTED";
    return [ctx.db.stmt("UPDATE posts SET status = ?3, updated_at = ?2 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", req.resource_id, nowIso(), status)];
  },
  tags: () => ["posts"],
});

export async function unpublishPost(ctx: Ctx, id: string, reason: string | null): Promise<void> {
  const resource = await postResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Post");
  const decision = requirePermission(ctx, "posts.publish", resource);
  const post = await ctx.db.first<PostRow>("SELECT type, slug FROM posts WHERE id = ?1", id);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE posts SET status = 'DRAFT', updated_at = ?2, updated_by = ?3 WHERE id = ?1 AND status = 'PUBLISHED'", id, nowIso(), requireActor(ctx).user.id),
    auditStmt(ctx, { action: "post.unpublish", resourceType: "post", resourceId: id, reason, decision }),
  ]);
  ctx.revalidate?.(tagsForPost(post!.type, post!.slug));
}

export async function archivePost(ctx: Ctx, id: string, reason: string | null): Promise<void> {
  const resource = await postResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Post");
  const decision = requirePermission(ctx, "posts.delete", resource);
  const post = await ctx.db.first<PostRow>("SELECT type, slug, status FROM posts WHERE id = ?1", id);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE posts SET status = 'ARCHIVED', deleted_at = ?2, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, requireActor(ctx).user.id),
    ctx.db.stmt("UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, resolution_note = 'Post archived', updated_at = ?2 WHERE resource_type = 'post' AND resource_id = ?1 AND status = 'PENDING'", id, now),
    auditStmt(ctx, { action: "post.archive", resourceType: "post", resourceId: id, reason, before: { status: post!.status }, decision }),
  ]);
  ctx.revalidate?.(tagsForPost(post!.type, post!.slug));
}

/** Bring an archived post back as a draft (by whoever may archive it). */
export async function restorePost(ctx: Ctx, id: string): Promise<void> {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ id: string; created_by: string | null; category: string | null; type: string; slug: string }>(
    "SELECT p.id, p.created_by, c.slug AS category, p.type, p.slug FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?1 AND p.deleted_at IS NOT NULL AND p.status = 'ARCHIVED'", id);
  if (!row) throw new NotFoundError("Archived post");
  const decision = requirePermission(ctx, "posts.delete", { type: "post", id, createdBy: row.created_by, ownerId: row.created_by, category: row.category, status: "ARCHIVED", meta: { postType: row.type } });
  if (await ctx.db.first("SELECT 1 FROM posts WHERE type = ?1 AND slug = ?2 AND id <> ?3 AND deleted_at IS NULL", row.type, row.slug, id)) {
    throw new AppError(409, "SLUG_TAKEN", "Another post now uses this address. Rename that one first, then restore this post.");
  }
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE posts SET status = 'DRAFT', deleted_at = NULL, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: "post.restore", resourceType: "post", resourceId: id, after: { status: "DRAFT" }, decision }),
  ]);
}

export async function restoreRevision(ctx: Ctx, postId: string, revisionId: string): Promise<void> {
  const rev = await ctx.db.first<{ snapshot_json: string; version: number }>("SELECT snapshot_json, version FROM post_revisions WHERE id = ?1 AND post_id = ?2", revisionId, postId);
  if (!rev) throw new NotFoundError("Revision");
  // The address stays as it is now: restoring old text must not break links to a live post.
  const { slug: _oldSlug, ...snap } = JSON.parse(rev.snapshot_json) as Record<string, unknown>;
  await updatePost(ctx, postId, { ...snap, tags: Array.isArray(snap.tags) ? (snap.tags as string[]).join(", ") : snap.tags, changeReason: `Restored version ${rev.version}` });
}

/** One saved version of a post, to read before restoring it. */
export async function getRevision(ctx: Ctx, postId: string, revisionId: string) {
  const resource = await postResource(ctx.db, postId);
  if (!resource) throw new NotFoundError("Post");
  requirePermission(ctx, "posts.read", resource);
  const rev = await ctx.db.first<{ id: string; version: number; title: string; excerpt: string | null; body_markdown: string | null; change_reason: string | null; created_at: string; changed_by_name: string | null; current_version: number }>(
    `SELECT r.id, r.version, r.title, r.excerpt, r.body_markdown, r.change_reason, r.created_at, COALESCE(pr.full_name, u.email) AS changed_by_name, p.current_version
     FROM post_revisions r JOIN posts p ON p.id = r.post_id LEFT JOIN users u ON u.id = r.changed_by LEFT JOIN profiles pr ON pr.user_id = u.id AND pr.deleted_at IS NULL
     WHERE r.id = ?1 AND r.post_id = ?2`,
    revisionId, postId,
  );
  if (!rev) throw new NotFoundError("Version");
  return rev;
}

export async function listPostsAdmin(ctx: Ctx, opts: { type?: string; status?: string; q?: string; category?: string; page?: number }) {
  const actor = requireActor(ctx);
  const scopes = scopesFor(ctx, "posts.read");
  if (scopes.length === 0) throw new ForbiddenError("You cannot view posts in the admin.");
  const all = scopes.some((s) => s.scope === "ALL");
  const cats = scopes.filter((s) => s.scope === "CATEGORY").flatMap((s) => s.scopeValue.split(",").map((x) => x.trim().toLowerCase()));
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "")}%` : null;
  const rows = await ctx.db.all<PostRow & { author_display: string | null }>(
    `SELECT p.id, p.type, p.slug, p.title, p.status, p.published_at, p.updated_at, p.created_by, c.name AS category_name, c.slug AS category_slug,
            COALESCE(pr.full_name, p.author_name) AS author_display
     FROM posts p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN profiles pr ON pr.id = p.author_profile_id
     WHERE (CASE WHEN ?2 = 'ARCHIVED' THEN p.deleted_at IS NOT NULL ELSE p.deleted_at IS NULL END)
       AND (?1 IS NULL OR p.type = ?1) AND (?2 IS NULL OR p.status = ?2) AND (?3 IS NULL OR p.title LIKE ?3) AND (?4 IS NULL OR c.slug = ?4)
       AND (?5 = 1 OR p.created_by = ?6 OR (?7 <> '' AND instr(',' || ?7 || ',', ',' || c.slug || ',') > 0))
     ORDER BY p.updated_at DESC LIMIT 30 OFFSET ?8`,
    opts.type ?? null, opts.status ?? null, q, opts.category ?? null, all ? 1 : 0, actor.user.id, cats.join(","), (page - 1) * 30,
  );
  return rows;
}
