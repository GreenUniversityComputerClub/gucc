/**
 * Events and registrations.
 *
 * Capacity, registration windows and duplicate registration are enforced
 * server-side (and duplicates additionally by unique indexes), so racing
 * clients cannot overbook or double-register.
 */
import { isAffiliateExecutive } from "../../governance/engine";
import { alreadyDone, assertStmt, assertTransition, batchTransition, newTransition, staleAnswer, unchangedSince } from "../transition";
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { authorize, eventResource, requireActor, requirePermission, scopesFor } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { sha256Hex } from "../crypto";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { notifyStmts } from "../notifications";
import { getSetting, requireRecentAuth, verifyTurnstile } from "../security";
import { toSlug, Validator, EMAIL_RE, STUDENT_ID_RE } from "../validate";
import { registerApprovalHandler, startApproval } from "./approvals";
import { csvCell } from "../csv";
import { TAGS } from "./cache-tags";
import { triggerStmts } from "../triggers";
import { checkMemberCreate, checkMemberSubmit } from "./member-content";

export const EVENT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
const PUBLIC = ["PUBLISHED", "ONGOING", "COMPLETED"];

export interface RegistrationField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required?: boolean;
  options?: string[];
}

async function ensureCategory(ctx: Ctx, name: string | null): Promise<{ id: string | null; slug: string | null }> {
  if (!name) return { id: null, slug: null };
  // A name with no Latin letters (e.g. in Bangla) still gets a usable slug.
  const slug = toSlug(name) || `category-${(await sha256Hex(name)).slice(0, 8)}`;
  await ctx.db.run("INSERT INTO categories (id, kind, slug, name, created_at) VALUES (?1, 'EVENT', ?2, ?3, ?4) ON CONFLICT(kind, slug) DO NOTHING", newId("cat"), slug, name, nowIso());
  const row = await ctx.db.first<{ id: string }>("SELECT id FROM categories WHERE kind = 'EVENT' AND slug = ?1", slug);
  return { id: row?.id ?? null, slug };
}

const GOOGLE_FORM = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)[^\s]+$/i;

function parseEvent(input: Record<string, unknown>) {
  const v = new Validator(input);
  const d = {
    title: v.string("title", { required: true, min: 3, max: 200, label: "Title" }),
    slug: v.string("slug", { max: 150, label: "Slug", pattern: /^[a-z0-9_]+(?:-+[a-z0-9_]+)*$/, patternMessage: "Use lowercase letters, digits and hyphens." }),
    description: v.string("description", { max: 20_000, label: "Description" }),
    category: v.string("category", { max: 60, label: "Category" }),
    organizer: v.string("organizer", { max: 120, label: "Organizer" }),
    venue: v.string("venue", { max: 200, label: "Venue" }),
    mode: v.oneOf("mode", ["ONLINE", "OFFLINE", "HYBRID"] as const, { label: "Mode" }),
    startAt: v.datetime("startAt", { required: true, label: "Start" }),
    endAt: v.datetime("endAt", { label: "End" }),
    timeText: v.string("timeText", { max: 120, label: "Schedule text" }),
    externalLink: v.url("externalLink", { label: "External link" }),
    guestsText: v.string("guestsText", { max: 2000, label: "Guests" }),
    judgesText: v.string("judgesText", { max: 2000, label: "Judges" }),
    registrationFormUrl: v.url("registrationFormUrl", { label: "Registration form link" }),
    registrationFormLabel: v.string("registrationFormLabel", { max: 80, label: "Button text" }),
    participants: v.string("participants", { max: 120, label: "Participants" }),
    capacity: v.int("capacity", { min: 1, max: 100_000, label: "Capacity" }),
    registrationEnabled: v.bool("registrationEnabled"),
    registrationOpensAt: v.datetime("registrationOpensAt", { label: "Registration opens" }),
    registrationClosesAt: v.datetime("registrationClosesAt", { label: "Registration closes" }),
    bannerMediaId: v.string("bannerMediaId", { max: 80 }),
    committeeId: v.string("committeeId", { max: 80 }),
    registrationFields: [] as RegistrationField[],
  };
  if (d.startAt && d.endAt) v.check(d.endAt >= d.startAt, "endAt", "The event cannot end before it starts.");
  // Only Google Forms: the link is shown to every visitor as the way to register.
  if (d.registrationFormUrl) v.check(GOOGLE_FORM.test(d.registrationFormUrl), "registrationFormUrl", "Use a Google Forms link (https://forms.gle/… or https://docs.google.com/forms/…).");
  // Attendance, as the legacy events recorded it: a number (e.g. 120) or a phrase.
  const count = d.participants && /^\d{1,6}$/.test(d.participants.replace(/[,\s]/g, "")) ? Number(d.participants.replace(/[,\s]/g, "")) : null;
  const attendance = { participantsReported: count, participantsText: count === null ? d.participants : null };
  if (d.registrationOpensAt && d.registrationClosesAt) v.check(d.registrationClosesAt > d.registrationOpensAt, "registrationClosesAt", "Registration must close after it opens.");
  if (input.registrationFields) {
    try {
      const f = typeof input.registrationFields === "string" ? JSON.parse(input.registrationFields) : input.registrationFields;
      v.check(Array.isArray(f) && f.length <= 20 && f.every((x: RegistrationField) => /^[a-z][a-z0-9_]{0,40}$/.test(x.key) && x.label && ["text", "textarea", "select", "checkbox"].includes(x.type)),
        "registrationFields", "Registration fields are malformed.");
      // A "choose one" question with nothing to choose would block every registration.
      v.check(!Array.isArray(f) || f.every((x: RegistrationField) => x.type !== "select" || (Array.isArray(x.options) && x.options.some((o) => String(o).trim()))),
        "registrationFields", "Give every \"choose one\" question at least one choice.");
      d.registrationFields = f as RegistrationField[];
    } catch {
      v.errors.registrationFields = "Registration fields must be valid JSON.";
    }
  }
  v.done();
  return { ...d, ...attendance };
}

export async function createEvent(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const d = parseEvent(input);
  const cat = await ensureCategory(ctx, d.category);
  const decision = requirePermission(ctx, "events.create", { type: "event", category: cat.slug, createdBy: actor.user.id, ownerId: actor.user.id, committeeId: d.committeeId });
  await checkMemberCreate(ctx, "event");
  // A title with no Latin letters (e.g. in Bangla) still gets a working address.
  const slug = d.slug || toSlug(d.title!) || `event-${newId().slice(0, 8)}`;
  if (await ctx.db.first("SELECT id FROM events WHERE slug = ?1", slug)) throw new ValidationError("That URL is taken.", { slug: "Another event already uses this URL." });
  const id = newId("evt");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO events (id, slug, title, description, category_id, organizer, committee_id, venue, mode, start_at, end_at, time_text, external_link, guests_text,
                           capacity, registration_enabled, registration_opens_at, registration_closes_at, registration_fields_json, banner_media_id, status,
                           created_at, created_by, updated_at, updated_by, judges_text, participants_reported, participants_text, registration_form_url, registration_form_label)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, 'DRAFT', ?21, ?22, ?21, ?22, ?23, ?24, ?25, ?26, ?27)`,
      id, slug, d.title, d.description, cat.id, d.organizer ?? "GUCC", d.committeeId, d.venue, d.mode, d.startAt, d.endAt, d.timeText, d.externalLink, d.guestsText,
      d.capacity, d.registrationEnabled ? 1 : 0, d.registrationOpensAt, d.registrationClosesAt, JSON.stringify(d.registrationFields), d.bannerMediaId, now, actor.user.id,
      d.judgesText, d.participantsReported, d.participantsText, d.registrationFormUrl, d.registrationFormLabel,
    ),
    ...(d.bannerMediaId ? [ctx.db.stmt("INSERT INTO event_media (event_id, media_id, kind, sort_order) VALUES (?1, ?2, 'BANNER', 0) ON CONFLICT DO NOTHING", id, d.bannerMediaId),
      ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'event', ?2, 'banner') ON CONFLICT DO NOTHING", d.bannerMediaId, id)] : []),
    auditStmt(ctx, { action: "event.create", resourceType: "event", resourceId: id, after: { slug, title: d.title }, decision }),
  ]);
  return { id };
}

export async function updateEvent(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await eventResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Event");
  const decision = requirePermission(ctx, "events.update", resource);
  const before = await ctx.db.first<{ slug: string; title: string; status: string; start_at: string | null; end_at: string | null; venue: string | null; time_text: string | null }>(
    "SELECT slug, title, status, start_at, end_at, venue, time_text FROM events WHERE id = ?1", id);
  const d = parseEvent(input);
  const cat = await ensureCategory(ctx, d.category);
  if (cat.slug !== (resource.category ?? null)) requirePermission(ctx, "events.update", { ...resource, category: cat.slug });
  const slug = d.slug ?? before!.slug;
  if (slug !== before!.slug && (await ctx.db.first("SELECT id FROM events WHERE slug = ?1 AND id <> ?2", slug, id))) {
    throw new ValidationError("That URL is taken.", { slug: "Another event already uses this URL." });
  }
  // Imported events keep date-only times ("2025-03-01"); the form shows them as 00:00 Dhaka time.
  // Saved unchanged, they stay date-only, so an unrelated edit neither shifts them nor tells
  // registrants the time "changed".
  const dhakaMidnight = (day: string | null) => (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00+06:00`).toISOString() : null);
  if (dhakaMidnight(before!.start_at) === d.startAt) d.startAt = before!.start_at;
  if (dhakaMidnight(before!.end_at) === d.endAt) d.endAt = before!.end_at;
  const now = nowIso();
  // Registered people hear about changes to when or where a public event happens.
  const moved = PUBLIC.includes(before!.status) && (before!.start_at !== d.startAt || before!.end_at !== d.endAt || before!.venue !== d.venue || before!.time_text !== d.timeText);
  const registrants = moved
    ? (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM event_registrations WHERE event_id = ?1 AND user_id IS NOT NULL AND status IN ('REGISTERED','WAITLISTED')", id)).map((r) => r.user_id)
    : [];
  const fresh = await unchangedSince(ctx, "events", id, input.expectedUpdatedAt);
  await batchTransition(ctx, [
    ...fresh,
    ...notifyStmts(ctx, registrants, { type: "event.updated", title: `Changed: ${d.title}`, body: [d.timeText, d.venue].filter(Boolean).join(" · ") || "The date or place changed. Check the event page.", link: `/events/${slug}` }),
    ctx.db.stmt(
      `UPDATE events SET slug = ?2, title = ?3, description = ?4, category_id = ?5, organizer = ?6, committee_id = COALESCE(?7, committee_id), venue = ?8, mode = ?9, start_at = ?10, end_at = ?11,
              time_text = ?12, external_link = ?13, guests_text = ?14, capacity = ?15, registration_enabled = ?16, registration_opens_at = ?17, registration_closes_at = ?18,
              registration_fields_json = ?19, banner_media_id = ?20, updated_at = ?21, updated_by = ?22,
              judges_text = ?23, participants_reported = ?24, participants_text = ?25, registration_form_url = ?26, registration_form_label = ?27,
              status = CASE WHEN status IN ('PENDING_APPROVAL','APPROVED') THEN 'DRAFT'
                            -- Postponed after it started or ended: it's upcoming again, so registration reopens.
                            WHEN status IN ('ONGOING','COMPLETED') AND ?10 IS NOT NULL AND ?10 > ?21 THEN 'PUBLISHED'
                            ELSE status END
       WHERE id = ?1`,
      id, slug, d.title, d.description, cat.id, d.organizer, d.committeeId, d.venue, d.mode, d.startAt, d.endAt, d.timeText, d.externalLink, d.guestsText, d.capacity,
      d.registrationEnabled ? 1 : 0, d.registrationOpensAt, d.registrationClosesAt, JSON.stringify(d.registrationFields), d.bannerMediaId, now, actor.user.id,
      d.judgesText, d.participantsReported, d.participantsText, d.registrationFormUrl, d.registrationFormLabel,
    ),
    ctx.db.stmt("UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, resolution_note = 'Edited after submission', updated_at = ?2 WHERE resource_type = 'event' AND resource_id = ?1 AND status = 'PENDING'", id, now),
    // More seats (or no limit any more): the waitlist moves up.
    ...(await promoteWaitlistStmts(ctx, id, d.title!, slug)),
    ctx.db.stmt("DELETE FROM event_media WHERE event_id = ?1 AND kind = 'BANNER'", id),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'event' AND resource_id = ?1 AND field = 'banner'", id),
    ...(d.bannerMediaId ? [ctx.db.stmt("INSERT INTO event_media (event_id, media_id, kind, sort_order) VALUES (?1, ?2, 'BANNER', 0) ON CONFLICT DO NOTHING", id, d.bannerMediaId),
      ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'event', ?2, 'banner') ON CONFLICT DO NOTHING", d.bannerMediaId, id)] : []),
    auditStmt(ctx, { action: "event.update", resourceType: "event", resourceId: id, before, after: { slug, title: d.title }, decision }),
  ], () => staleAnswer(ctx, "events", id));
  // Contest cards show event names too.
  ctx.revalidate?.([TAGS.events, TAGS.event(before!.slug), TAGS.event(slug), TAGS.contests]);
}

export async function publishEvent(ctx: Ctx, id: string): Promise<{ outcome: string; requestId?: string; message: string }> {
  const actor = requireActor(ctx);
  const resource = await eventResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Event");
  const ev = await ctx.db.first<{ slug: string; title: string; status: string }>("SELECT slug, title, status FROM events WHERE id = ?1", id);
  if (PUBLIC.includes(ev!.status)) throw new AppError(409, "ALREADY_PUBLISHED", "This event is already public.");
  const decision = authorize(ctx, "events.publish", resource);
  if (decision.outcome === "ALLOW") {
    const now = nowIso();
    const token = newTransition();
    await batchTransition(ctx, [
      ctx.db.stmt(`UPDATE events SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?2), updated_at = ?2, updated_by = ?3, last_transition = ?4
                   WHERE id = ?1 AND status NOT IN (${PUBLIC.map((s) => `'${s}'`).join(", ")}) AND deleted_at IS NULL`, id, now, actor.user.id, token),
      assertTransition(ctx, "events", id, token),
      auditStmt(ctx, { action: "event.publish", resourceType: "event", resourceId: id, decision }),
      ...(await triggerStmts(ctx, "event.published", resource, { title: ev!.title, link: `/dashboard/events/${id}` })),
    ], () => alreadyDone(ctx, "events", id, "This event"));
    ctx.revalidate?.([TAGS.events, TAGS.event(ev!.slug)]);
    return { outcome: "PUBLISHED", message: "Published." };
  }
  let policyKey: string | undefined;
  if (decision.outcome === "REQUIRE_APPROVAL") policyKey = decision.approvalPolicyKey;
  else if (authorize(ctx, "events.update", resource).outcome === "ALLOW") {
    await checkMemberSubmit(ctx, "event");
    // Affiliated committees (e.g. CSS) publish after the President or General Secretary approves.
    policyKey = isAffiliateExecutive(actor.subject)
      ? await getSetting(ctx, "content.affiliate_approval_policy", "president-or-gs")
      : await getSetting(ctx, "events.default_approval_policy", "leadership-any");
  }
  else throw new ForbiddenError(decision.summary, decision);
  const { requestId } = await startApproval(ctx, {
    policyKey: policyKey!, ruleId: decision.approvalRuleId ?? null, resourceType: "event", resourceId: id, action: "events.publish", title: `Publish event: ${ev!.title}`,
    alongside: [
      ctx.db.stmt("UPDATE events SET status = 'PENDING_APPROVAL', updated_at = ?2 WHERE id = ?1", id, nowIso()),
      ...(await triggerStmts(ctx, "event.submitted", resource, { title: ev!.title, link: `/dashboard/events/${id}` })),
    ],
  });
  return { outcome: "PENDING_APPROVAL", requestId, message: "Sent for approval." };
}

async function eventPublishedTrigger(ctx: Ctx, id: string) {
  const resource = await eventResource(ctx.db, id);
  const title = await ctx.db.value<string>("SELECT title FROM events WHERE id = ?1", id);
  return resource ? triggerStmts(ctx, "event.published", resource, { title: title ?? "Event", link: `/dashboard/events/${id}` }) : [];
}

registerApprovalHandler("events.publish", {
  async onApproved(ctx, req) {
    const now = nowIso();
    return [
      ctx.db.stmt("UPDATE events SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?2), updated_at = ?2 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", req.resource_id, now),
      auditStmt(ctx, { action: "event.publish", resourceType: "event", resourceId: req.resource_id, reason: `Approved (request ${req.id})` }),
      ...(await eventPublishedTrigger(ctx, req.resource_id)),
    ];
  },
  async onRejected(ctx, req) {
    return [ctx.db.stmt("UPDATE events SET status = 'DRAFT', updated_at = ?2 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", req.resource_id, nowIso())];
  },
  tags: () => [TAGS.events],
});

/** Which statuses each change may start from. Moving into a public status needs the event to be public already. */
const STATUS_FROM: Record<"CANCELLED" | "COMPLETED" | "ONGOING" | "ARCHIVED" | "DRAFT", string[]> = {
  ONGOING: ["PUBLISHED"],
  COMPLETED: ["PUBLISHED", "ONGOING"],
  CANCELLED: ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ONGOING"],
  DRAFT: ["PENDING_APPROVAL", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED", "REJECTED"],
  ARCHIVED: ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ONGOING", "COMPLETED", "CANCELLED", "REJECTED"],
};

const STATUS_WORD: Record<string, string> = { DRAFT: "a draft", PENDING_APPROVAL: "waiting for approval", PUBLISHED: "published", ONGOING: "ongoing", COMPLETED: "completed", CANCELLED: "cancelled", REJECTED: "sent back" };

export async function setEventStatus(ctx: Ctx, id: string, status: "CANCELLED" | "COMPLETED" | "ONGOING" | "ARCHIVED" | "DRAFT", reason: string | null): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await eventResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Event");
  const perm = status === "ARCHIVED" ? "events.delete" : status === "DRAFT" ? "events.publish" : "events.update";
  const decision = requirePermission(ctx, perm, resource);
  const ev = await ctx.db.first<{ slug: string; status: string; title: string }>("SELECT slug, status, title FROM events WHERE id = ?1 AND deleted_at IS NULL", id);
  if (!ev) throw new NotFoundError("Event");
  // Ongoing and completed are public: only an event that is already public can get there, so a
  // draft can never skip approval this way.
  if (!STATUS_FROM[status]?.includes(ev.status)) {
    throw new AppError(409, "BAD_TRANSITION", `This event is ${STATUS_WORD[ev.status] ?? ev.status.toLowerCase()}, so it can't be marked ${status.toLowerCase()}.`);
  }
  const now = nowIso();
  const registrants = status === "CANCELLED"
    ? (await ctx.db.all<{ user_id: string }>("SELECT user_id FROM event_registrations WHERE event_id = ?1 AND user_id IS NOT NULL AND status IN ('REGISTERED','WAITLISTED')", id)).map((r) => r.user_id)
    : [];
  const token = newTransition();
  await batchTransition(ctx, [
    ctx.db.stmt(`UPDATE events SET status = ?2, ${status === "ARCHIVED" ? "deleted_at = ?3," : ""} updated_at = ?3, updated_by = ?4, last_transition = ?6 WHERE id = ?1 AND status = ?5 AND deleted_at IS NULL`,
      id, status, now, actor.user.id, ev.status, token),
    assertTransition(ctx, "events", id, token),
    // A request to publish it can't be approved any more.
    ctx.db.stmt(`UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, updated_at = ?2, resolution_note = 'The event was changed meanwhile.'
                 WHERE resource_type = 'event' AND resource_id = ?1 AND status = 'PENDING'`, id, now),
    auditStmt(ctx, { action: `event.${status.toLowerCase()}`, resourceType: "event", resourceId: id, reason, before: { status: ev.status }, after: { status }, decision }),
    // Cancelled events leave the public site, so the notice points to the events list.
    ...notifyStmts(ctx, registrants, { type: "event.cancelled", title: `Cancelled: ${ev.title}`, body: reason ?? undefined, link: "/events" }),
  ], () => new AppError(409, "STALE", "This event's status changed a moment ago. Reload the page to see it."));
  ctx.revalidate?.([TAGS.events, TAGS.event(ev.slug)]);
}

/** Bring an archived event back as a draft (by whoever may archive it). */
export async function restoreEvent(ctx: Ctx, id: string): Promise<void> {
  const actor = requireActor(ctx);
  const row = await ctx.db.first<{ created_by: string | null; category: string | null; slug: string; committee_id: string | null }>(
    "SELECT e.created_by, c.slug AS category, e.slug, e.committee_id FROM events e LEFT JOIN categories c ON c.id = e.category_id WHERE e.id = ?1 AND e.deleted_at IS NOT NULL AND e.status = 'ARCHIVED'", id);
  if (!row) throw new NotFoundError("Archived event");
  const decision = requirePermission(ctx, "events.delete", { type: "event", id, createdBy: row.created_by, ownerId: row.created_by, category: row.category, committeeId: row.committee_id, status: "ARCHIVED" });
  if (await ctx.db.first("SELECT 1 FROM events WHERE slug = ?1 AND id <> ?2 AND deleted_at IS NULL", row.slug, id)) {
    throw new AppError(409, "SLUG_TAKEN", "Another event now uses this address. Rename that one first, then restore this event.");
  }
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE events SET status = 'DRAFT', deleted_at = NULL, updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    auditStmt(ctx, { action: "event.restore", resourceType: "event", resourceId: id, after: { status: "DRAFT" }, decision }),
  ]);
}

/**
 * Speakers and the event team. Coordinators and photographers linked to an account are what
 * the ASSIGNED and EVENT:ASSIGNED scopes match. Guests and judges stay in the event's text
 * fields, as the legacy events store them (the import's structured copies are left untouched).
 */
export const EVENT_PEOPLE_ROLES = ["SPEAKER", "COORDINATOR", "PHOTOGRAPHER"] as const;

export async function setEventPeople(ctx: Ctx, id: string, people: Array<{ role: (typeof EVENT_PEOPLE_ROLES)[number]; name: string; title?: string; userId?: string | null }>): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await eventResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Event");
  const decision = requirePermission(ctx, "events.update", resource);
  if (!Array.isArray(people) || people.some((p) => !EVENT_PEOPLE_ROLES.includes(p?.role))) {
    throw new ValidationError("People can be speakers, coordinators or photographers. Guests and judges go in the event details.");
  }
  // Linking accounts to an event hands them scoped permissions, so changing who is linked (adding
  // or removing anyone) needs event management, not merely being assigned yourself. Saving the
  // list with the same accounts (e.g. adding a speaker) is fine for anyone who may edit the event.
  const current = await ctx.db.all<{ user_id: string; role: string }>(
    "SELECT user_id, role FROM event_people WHERE event_id = ?1 AND user_id IS NOT NULL AND role IN ('SPEAKER','COORDINATOR','PHOTOGRAPHER')", id);
  const key = (p: { user_id?: string | null; userId?: string | null; role: string }) => `${p.role}:${p.userId ?? p.user_id}`;
  const before = new Set(current.map(key));
  const after = new Set(people.filter((p) => p.userId).map(key));
  const added = people.filter((p) => p.userId && !before.has(key(p)));
  const changesAssignments = added.length > 0 || [...before].some((k) => !after.has(k));
  if (changesAssignments) {
    const d = authorize(ctx, "events.manage_registration", { ...resource, assignedUserIds: [] });
    if (d.outcome !== "ALLOW" && !scopesFor(ctx, "events.update").some((s) => s.scope === "ALL" || s.scope === "CATEGORY")) throw new ForbiddenError("Only event managers can change who is linked to an event.", d);
    if (added.some((p) => p.userId === actor.user.id) && !scopesFor(ctx, "events.update").some((s) => s.scope === "ALL")) throw new ForbiddenError("You cannot assign yourself to an event.");
  }
  const clean = people.filter((p) => p.name?.trim()).slice(0, 50);
  await ctx.db.batch([
    ctx.db.stmt("DELETE FROM event_people WHERE event_id = ?1 AND role IN ('SPEAKER','COORDINATOR','PHOTOGRAPHER')", id),
    ...(clean.length
      ? [ctx.db.stmt(
          `INSERT INTO event_people (id, event_id, role, name, title, user_id, profile_id, sort_order)
           SELECT 'ep_' || lower(hex(randomblob(16))), ?1, json_extract(j.value, '$.role'), json_extract(j.value, '$.name'), json_extract(j.value, '$.title'),
                  json_extract(j.value, '$.userId'),
                  -- The person's profile, so their page lists the events they spoke at or organised.
                  (SELECT pr.id FROM profiles pr WHERE pr.user_id = json_extract(j.value, '$.userId') AND pr.deleted_at IS NULL),
                  CAST(j.key AS INTEGER) FROM json_each(?2) AS j`,
          id, JSON.stringify(clean.map((p) => ({ role: p.role, name: p.name.trim().slice(0, 120), title: p.title?.trim().slice(0, 200) || null, userId: p.userId ?? null })))),
        ]
      : []),
    // Only people newly linked hear about it (not everyone, on every save).
    ...(added.length ? notifyStmts(ctx, [...new Set(added.map((p) => p.userId!))], {
      type: "event.assigned",
      title: `You're on the team for ${(await ctx.db.value<string>("SELECT title FROM events WHERE id = ?1", id)) ?? "an event"}`.slice(0, 200),
      body: `As ${added.map((p) => p.role.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(" / ")}. You can now help with this event in the dashboard.`,
      link: `/dashboard/events/${id}`, resourceType: "event", resourceId: id,
    }) : []),
    auditStmt(ctx, { action: "event.people", resourceType: "event", resourceId: id, after: clean.map((p) => ({ role: p.role, name: p.name, userId: p.userId ?? null })), decision }),
  ]);
  // Speakers are shown on the public event page.
  ctx.revalidate?.([TAGS.events]);
}

export async function getEventForEdit(ctx: Ctx, id: string) {
  const resource = await eventResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Event");
  requirePermission(ctx, "events.read", resource);
  const event = await ctx.db.first<Record<string, unknown>>(`SELECT e.*, c.name AS category_name FROM events e LEFT JOIN categories c ON c.id = e.category_id WHERE e.id = ?1`, id);
  const people = await ctx.db.all<{ id: string; role: string; name: string; title: string | null; user_id: string | null }>(
    "SELECT id, role, name, title, user_id FROM event_people WHERE event_id = ?1 AND role IN ('SPEAKER','COORDINATOR','PHOTOGRAPHER') ORDER BY sort_order", id);
  const counts = await ctx.db.first<{ registered: number; attended: number; waitlisted: number }>(
    "SELECT SUM(status = 'REGISTERED') AS registered, SUM(status = 'ATTENDED') AS attended, SUM(status = 'WAITLISTED') AS waitlisted FROM event_registrations WHERE event_id = ?1", id);
  const d = (p: string) => authorize(ctx, p, resource);
  return {
    event: event!,
    people,
    counts: { registered: counts?.registered ?? 0, attended: counts?.attended ?? 0, waitlisted: counts?.waitlisted ?? 0 },
    capabilities: { edit: d("events.update").outcome === "ALLOW", publish: d("events.publish").outcome, publishExplanation: d("events.publish").summary, registrations: d("events.manage_registration").outcome === "ALLOW", delete: d("events.delete").outcome === "ALLOW" },
  };
}

export async function listEventsAdmin(ctx: Ctx, opts: { status?: string; q?: string; category?: string; page?: number }) {
  const actor = requireActor(ctx);
  const scopes = scopesFor(ctx, "events.read");
  if (scopes.length === 0) throw new ForbiddenError("You cannot view events in the admin.");
  // Narrow scopes see only what they may: their own events, or their categories.
  const all = scopes.some((s) => s.scope === "ALL");
  const cats = scopes.filter((s) => s.scope === "CATEGORY").flatMap((s) => s.scopeValue.split(",").map((x) => x.trim().toLowerCase()));
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, "")}%` : null;
  return ctx.db.all<{ id: string; slug: string; title: string; status: string; start_at: string | null; category_name: string | null; registrations: number; capacity: number | null }>(
    `SELECT e.id, e.slug, e.title, e.status, e.start_at, c.name AS category_name, e.capacity,
            (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED')) AS registrations
     FROM events e LEFT JOIN categories c ON c.id = e.category_id
     WHERE (CASE WHEN ?1 = 'ARCHIVED' THEN e.deleted_at IS NOT NULL ELSE e.deleted_at IS NULL END) AND (?1 IS NULL OR e.status = ?1) AND (?2 IS NULL OR e.title LIKE ?2) AND (?3 IS NULL OR c.slug = ?3)
       AND (?5 = 1 OR e.created_by = ?6 OR (?7 <> '' AND instr(',' || ?7 || ',', ',' || c.slug || ',') > 0))
     ORDER BY e.start_at DESC LIMIT 30 OFFSET ?4`,
    opts.status ?? null, q, opts.category ?? null, (page - 1) * 30, all ? 1 : 0, actor.user.id, cats.join(","),
  );
}

// ───────────────────────────── registrations ─────────────────────────────

export async function registerForEvent(ctx: Ctx, eventSlug: string, input: Record<string, unknown>): Promise<{ status: "REGISTERED" | "WAITLISTED"; message: string }> {
  await limit(ctx, "events.register", ctx.meta.ipHash ?? "unknown");
  const ev = await ctx.db.first<{ id: string; title: string; status: string; registration_enabled: number; registration_opens_at: string | null; registration_closes_at: string | null; capacity: number | null; registration_fields_json: string | null }>(
    "SELECT id, title, status, registration_enabled, registration_opens_at, registration_closes_at, capacity, registration_fields_json FROM events WHERE slug = ?1 AND deleted_at IS NULL", eventSlug);
  if (!ev || !PUBLIC.includes(ev.status)) throw new NotFoundError("Event");
  const now = nowIso();
  if (!ev.registration_enabled) throw new AppError(409, "REGISTRATION_CLOSED", "Registration is not open for this event.");
  if (ev.registration_opens_at && now < new Date(ev.registration_opens_at).toISOString()) throw new AppError(409, "REGISTRATION_NOT_OPEN", "Registration has not opened yet.");
  if (ev.registration_closes_at && now >= new Date(ev.registration_closes_at).toISOString()) throw new AppError(409, "REGISTRATION_CLOSED", "Registration has closed.");
  if (ev.status === "COMPLETED") throw new AppError(409, "REGISTRATION_CLOSED", "This event is over.");
  if (!ctx.actor) await verifyTurnstile(ctx, input.turnstileToken as string | undefined);

  const v = new Validator(input);
  const name = v.string("name", { required: true, min: 2, max: 100, label: "Name" });
  const email = (ctx.actor?.user.email ?? v.email("email"))?.toLowerCase() ?? null;
  const studentId = v.string("studentId", { max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be 9 digits." });
  const phone = v.string("phone", { max: 20, label: "Phone", pattern: /^\+?[0-9\s-]{6,20}$/, patternMessage: "Enter a valid phone number." });
  if (email) v.check(EMAIL_RE.test(email), "email", "Enter a valid email address.");
  const fields = JSON.parse(ev.registration_fields_json ?? "[]") as RegistrationField[];
  const answers: Record<string, string | boolean> = {};
  for (const f of fields) {
    const raw = input[`field_${f.key}`];
    if (f.type === "checkbox") {
      answers[f.key] = raw === true || raw === "on" || raw === "true";
      // A required checkbox is a statement to agree to (e.g. the rules): it must be ticked.
      if (f.required && !answers[f.key]) v.errors[`field_${f.key}`] = `Tick "${f.label}" to register.`;
    } else {
      const val = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
      if (f.required && !val) v.errors[`field_${f.key}`] = `${f.label} is required.`;
      if (f.type === "select" && val && !(f.options ?? []).includes(val)) v.errors[`field_${f.key}`] = `${f.label} has an invalid choice.`;
      answers[f.key] = val;
    }
  }
  v.done();

  const duplicate = await ctx.db.first<{ status: string }>(
    "SELECT status FROM event_registrations WHERE event_id = ?1 AND (email = ?2 OR (?3 IS NOT NULL AND user_id = ?3))", ev.id, email, ctx.actor?.user.id ?? null);
  if (duplicate && duplicate.status !== "CANCELLED") throw new ConflictError("You are already registered for this event.");

  const id = newId("reg");
  // Capacity is decided inside the INSERT itself, so two concurrent requests
  // cannot both take the last seat.
  const res = await ctx.db.first<{ status: string }>(
    `INSERT INTO event_registrations (id, event_id, user_id, name, email, student_id, phone, answers_json, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
             CASE WHEN ?9 IS NULL OR (SELECT COUNT(*) FROM event_registrations WHERE event_id = ?2 AND status IN ('REGISTERED','ATTENDED')) < ?9 THEN 'REGISTERED' ELSE 'WAITLISTED' END,
             ?10, ?10)
     ON CONFLICT(event_id, email) DO UPDATE SET status = CASE WHEN ?9 IS NULL OR (SELECT COUNT(*) FROM event_registrations WHERE event_id = ?2 AND status IN ('REGISTERED','ATTENDED')) < ?9 THEN 'REGISTERED' ELSE 'WAITLISTED' END,
             -- Coming back after cancelling: today's details, and the back of the queue.
             name = excluded.name, answers_json = excluded.answers_json, student_id = excluded.student_id, phone = excluded.phone,
             user_id = COALESCE(excluded.user_id, event_registrations.user_id), created_at = excluded.created_at, updated_at = excluded.updated_at
       WHERE event_registrations.status = 'CANCELLED'
     RETURNING status`,
    id, ev.id, ctx.actor?.user.id ?? null, name, email, studentId, phone, JSON.stringify(answers), ev.capacity, now,
  );
  if (!res) throw new ConflictError("You are already registered for this event.");
  const status = res.status as "REGISTERED" | "WAITLISTED";
  await ctx.db.batch([
    auditStmt(ctx, { action: "event.registration", resourceType: "event", resourceId: ev.id, after: { status } }),
    ...(ctx.actor ? notifyStmts(ctx, [ctx.actor.user.id], { type: "event.registered", title: status === "REGISTERED" ? `Registered: ${ev.title}` : `Waitlisted: ${ev.title}`, link: `/events/${eventSlug}` }) : []),
  ]);
  // The page shows seats left: refresh it.
  ctx.revalidate?.([TAGS.event(eventSlug)]);
  return { status, message: status === "REGISTERED" ? "You're registered. See you there!" : "The event is full; you're on the waitlist." };
}

/**
 * Cancel my own registration before the event starts. A freed seat goes to the first person
 * on the waitlist, who is notified.
 */
/** Oldest waitlisted people for the event while seats are free (all of them without a capacity). */
const WAITLIST_TO_PROMOTE = `SELECT id FROM event_registrations WHERE event_id = ?1 AND status = 'WAITLISTED' ORDER BY created_at
  LIMIT (SELECT CASE WHEN e.capacity IS NULL THEN -1
                     ELSE MAX(0, e.capacity - (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED'))) END
         FROM events e WHERE e.id = ?1)`;

/**
 * Fill free seats from the waitlist, oldest first, and tell each person (in the dashboard).
 * Two statements whatever the number; run after anything that can free seats or add capacity.
 */
export async function promoteWaitlistStmts(ctx: Ctx, eventId: string, title: string, slug: string): Promise<D1StatementLike[]> {
  const now = nowIso();
  // Each notice gets an id we can predict, so its email copy goes out like any other (the outbox
  // sends only the ones that were really written: people who actually moved up).
  const nonce = newId("p").slice(-10);
  const waiting = await ctx.db.all<{ id: string }>("SELECT id FROM event_registrations WHERE event_id = ?1 AND status = 'WAITLISTED' AND user_id IS NOT NULL LIMIT 200", eventId);
  ctx.outbox?.push(...waiting.map((w) => `ntf_prm_${w.id}_${nonce}`));
  return [
    ctx.db.stmt(
      `INSERT INTO notifications (id, user_id, type, title, body, link, resource_type, resource_id, channel, created_at, actor_user_id)
       SELECT 'ntf_prm_' || r.id || '_' || ?5, r.user_id, 'event.promoted', ?2, 'You''re off the waitlist and registered.', ?3, 'event', ?1, 'IN_APP', ?4, ?6
       FROM event_registrations r WHERE r.user_id IS NOT NULL AND r.id IN (${WAITLIST_TO_PROMOTE})`,
      eventId, `A seat opened up: ${title}`.slice(0, 200), `/events/${slug}`, now, nonce, ctx.actor?.user.id ?? null),
    ctx.db.stmt(`UPDATE event_registrations SET status = 'REGISTERED', updated_at = ?2 WHERE id IN (${WAITLIST_TO_PROMOTE})`, eventId, now),
  ];
}

export async function cancelMyRegistration(ctx: Ctx, registrationId: string): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  const reg = await ctx.db.first<{ id: string; status: string; event_id: string; title: string; slug: string; start_at: string | null }>(
    `SELECT r.id, r.status, r.event_id, e.title, e.slug, e.start_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE r.id = ?1 AND r.user_id = ?2`, registrationId, actor.user.id);
  if (!reg) throw new NotFoundError("Registration");
  if (!["REGISTERED", "WAITLISTED"].includes(reg.status)) throw new AppError(409, "NOT_ACTIVE", "This registration is no longer active.");
  if (reg.start_at && reg.start_at <= nowIso()) throw new AppError(409, "STARTED", "The event has started; ask the organisers if you can't attend.");
  const now = nowIso();
  const next = reg.status === "REGISTERED"
    ? await ctx.db.first<{ id: string; user_id: string | null }>(
        "SELECT id, user_id FROM event_registrations WHERE event_id = ?1 AND status = 'WAITLISTED' ORDER BY created_at LIMIT 1", reg.event_id)
    : null;
  await batchTransition(ctx, [
    // Once: two cancels at the same moment can't both hand the seat on.
    ctx.db.stmt("UPDATE event_registrations SET status = 'CANCELLED', updated_at = ?2 WHERE id = ?1 AND status IN ('REGISTERED','WAITLISTED')", reg.id, now),
    assertStmt(ctx, "EXISTS (SELECT 1 FROM event_registrations WHERE id = ?1 AND status = 'CANCELLED' AND updated_at = ?2)", reg.id, now),
    ...(next ? [ctx.db.stmt("UPDATE event_registrations SET status = 'REGISTERED', updated_at = ?2 WHERE id = ?1 AND status = 'WAITLISTED'", next.id, now)] : []),
    ...(next?.user_id ? notifyStmts(ctx, [next.user_id], { type: "event.promoted", title: `A seat opened up: ${reg.title}`, body: "You're off the waitlist and registered.", link: `/events/${reg.slug}` }) : []),
    auditStmt(ctx, { action: "event.registration_cancel", resourceType: "event", resourceId: reg.event_id, after: { promoted: Boolean(next) } }),
  ], () => new AppError(409, "NOT_ACTIVE", "This registration was already cancelled."));
  ctx.revalidate?.([TAGS.event(reg.slug)]);
  return { message: "Your registration is cancelled." };
}

export async function listRegistrations(ctx: Ctx, eventId: string) {
  const resource = await eventResource(ctx.db, eventId);
  if (!resource) throw new NotFoundError("Event");
  requirePermission(ctx, "events.manage_registration", resource);
  return ctx.db.all<{ id: string; name: string; email: string; student_id: string | null; phone: string | null; answers_json: string | null; status: string; created_at: string }>(
    "SELECT id, name, email, student_id, phone, answers_json, status, created_at FROM event_registrations WHERE event_id = ?1 ORDER BY created_at", eventId);
}

/**
 * Registrations across all events, for people who manage registrations club-wide. Anyone
 * with narrower (per-event or per-category) rights works from each event's page, so this
 * list can never show more than they could see there.
 */
export async function listAllRegistrations(ctx: Ctx, opts: { q?: string; status?: string; eventId?: string; page?: number }) {
  requireActor(ctx);
  if (!scopesFor(ctx, "events.manage_registration").some((s) => s.scope === "ALL")) {
    throw new ForbiddenError("You manage registrations from each event's page.");
  }
  const page = Math.max(1, Number(opts.page) || 1);
  const q = opts.q ? `%${String(opts.q).replace(/[%_]/g, "").slice(0, 60)}%` : null;
  const status = ["REGISTERED", "WAITLISTED", "CANCELLED", "ATTENDED", "REJECTED"].includes(String(opts.status)) ? String(opts.status) : null;
  const rows = await ctx.db.all<{ id: string; name: string; email: string; student_id: string | null; status: string; created_at: string; event_id: string; event_title: string; start_at: string | null }>(
    `SELECT r.id, r.name, r.email, r.student_id, r.status, r.created_at, e.id AS event_id, e.title AS event_title, e.start_at
     FROM event_registrations r JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL
     WHERE (?1 IS NULL OR r.name LIKE ?1 OR r.email LIKE ?1 OR r.student_id LIKE ?1) AND (?2 IS NULL OR r.status = ?2) AND (?3 IS NULL OR r.event_id = ?3)
     ORDER BY r.created_at DESC LIMIT 50 OFFSET ?4`,
    q, status, opts.eventId || null, (page - 1) * 50);
  const events = await ctx.db.all<{ id: string; title: string; n: number }>(
    `SELECT e.id, e.title, COUNT(r.id) AS n FROM events e JOIN event_registrations r ON r.event_id = e.id WHERE e.deleted_at IS NULL GROUP BY e.id ORDER BY MAX(r.created_at) DESC LIMIT 100`);
  return { rows, events, page, hasMore: rows.length === 50 };
}

export async function setRegistrationStatus(ctx: Ctx, registrationId: string, status: "REGISTERED" | "WAITLISTED" | "CANCELLED" | "ATTENDED" | "REJECTED"): Promise<void> {
  const reg = await ctx.db.first<{ event_id: string; status: string; title: string; slug: string; capacity: number | null; user_id: string | null }>(
    `SELECT r.event_id, r.status, e.title, e.slug, e.capacity, r.user_id FROM event_registrations r JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL WHERE r.id = ?1`, registrationId);
  if (!reg) throw new NotFoundError("Registration");
  const resource = await eventResource(ctx.db, reg.event_id);
  if (!resource) throw new NotFoundError("Event");
  const decision = requirePermission(ctx, "events.manage_registration", resource);
  // Admitting someone takes a seat: not past the capacity (the waitlist is for that).
  // People marked attended keep their seat.
  const seated = (s: string) => s === "REGISTERED" || s === "ATTENDED";
  if (seated(status) && !seated(reg.status) && reg.capacity !== null) {
    const taken = (await ctx.db.value<number>("SELECT COUNT(*) FROM event_registrations WHERE event_id = ?1 AND status IN ('REGISTERED','ATTENDED')", reg.event_id)) ?? 0;
    if (taken >= reg.capacity) throw new AppError(409, "FULL", `The event is full (${reg.capacity} seats). Raise the capacity first, or keep them on the waitlist.`);
  }
  await ctx.db.batch([
    ctx.db.stmt("UPDATE event_registrations SET status = ?2, updated_at = ?3 WHERE id = ?1", registrationId, status, nowIso()),
    // A freed seat goes to the next person on the waitlist.
    ...(seated(reg.status) && !seated(status) ? await promoteWaitlistStmts(ctx, reg.event_id, reg.title, reg.slug) : []),
    auditStmt(ctx, { action: "event.registration_status", resourceType: "event", resourceId: reg.event_id, before: { status: reg.status }, after: { status, registrationId }, decision }),
    // The person hears when organisers cancel, reject or admit them (checking in needs no notice).
    ...(reg.user_id && reg.status !== status && ["CANCELLED", "REJECTED", "REGISTERED"].includes(status) && reg.status !== "ATTENDED"
      ? notifyStmts(ctx, [reg.user_id], {
          type: status === "REGISTERED" ? "event.promoted" : "event.registration_cancelled",
          title: status === "REGISTERED" ? `You're registered: ${reg.title}` : `Your registration was cancelled: ${reg.title}`,
          body: status === "REGISTERED" ? "The organisers gave you a seat." : "The organisers cancelled it. Contact them if you think this is a mistake.",
          link: `/events/${reg.slug}`, resourceType: "event", resourceId: reg.event_id,
        })
      : []),
  ]);
  ctx.revalidate?.([TAGS.event(reg.slug)]);
}

/** CSV for spreadsheets: UTF-8 with a BOM (Bangla names open correctly in Excel), CRLF lines, formula-safe cells. */
export function registrationsCsv(rows: Awaited<ReturnType<typeof listRegistrations>>): string {
  const answers = (r: { answers_json: string | null }) => {
    try {
      return JSON.parse(r.answers_json ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const keys = [...new Set(rows.flatMap((r) => Object.keys(answers(r))))];
  const head = ["name", "email", "student_id", "phone", "status", "registered_at", ...keys];
  const lines = rows.map((r) => {
    const a = answers(r);
    return [r.name, r.email, r.student_id, r.phone, r.status, r.created_at, ...keys.map((k) => a[k])].map(csvCell).join(",");
  });
  return `\uFEFF${[head.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}

/** Take a photo or file out of an event's gallery (the file stays in the media library). */
export async function removeEventMedia(ctx: Ctx, eventId: string, mediaId: string): Promise<void> {
  const resource = await eventResource(ctx.db, eventId);
  if (!resource) throw new NotFoundError("Event");
  const m = await ctx.db.first<{ uploaded_by: string | null }>("SELECT uploaded_by FROM media WHERE id = ?1", mediaId);
  if (!m) throw new NotFoundError("File");
  // Event editors may curate the gallery; uploaders may remove their own photos.
  const decision = authorize(ctx, "events.update", resource).outcome === "ALLOW"
    ? requirePermission(ctx, "events.update", resource)
    : requirePermission(ctx, "media.update", { type: "media", id: mediaId, ownerId: m.uploaded_by, createdBy: m.uploaded_by });
  await ctx.db.batch([
    ctx.db.stmt("DELETE FROM event_media WHERE event_id = ?1 AND media_id = ?2 AND kind <> 'BANNER'", eventId, mediaId),
    ctx.db.stmt("DELETE FROM media_references WHERE media_id = ?1 AND resource_type = 'event' AND resource_id = ?2 AND field = 'gallery'", mediaId, eventId),
    auditStmt(ctx, { action: "event.gallery_remove", resourceType: "event", resourceId: eventId, after: { mediaId }, decision }),
  ]);
  ctx.revalidate?.(["events"]);
}

/** Event registrations as CSV (events.manage_registration). Exports are audited. */
export async function exportRegistrations(ctx: Ctx, eventId: string): Promise<{ filename: string; csv: string }> {
  const rows = await listRegistrations(ctx, eventId);
  await requireRecentAuth(ctx);
  const slug = (await ctx.db.value<string>("SELECT slug FROM events WHERE id = ?1", eventId)) ?? eventId;
  await auditStmt(ctx, { action: "event.registrations_export", resourceType: "event", resourceId: eventId, after: { rows: rows.length } }).run();
  return { filename: `registrations-${slug}.csv`, csv: registrationsCsv(rows) };
}
