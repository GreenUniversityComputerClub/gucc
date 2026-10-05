/**
 * Certificates: saved designs, issued batches (each with its design frozen at issue) and the
 * certificates themselves, each with an unguessable code that a QR code and /c/<code> verify.
 * Anyone with certificates.manage (Moderators, the President, the General Secretary, and whoever
 * they give it to) issues and revokes; the holder decides whether theirs shows on their profile.
 *
 * Rendering happens in the browser (lib/certificates/render.tsx): the API stores data only.
 */
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso, type D1StatementLike } from "../db";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { limit } from "../limits";
import { notifyEachStmts } from "../notifications";
import { EMAIL_RE, Validator } from "../validate";
import { TAGS } from "./cache-tags";
import { campaignStatements, MAX_RECIPIENTS } from "./campaigns";
import { cleanConfig, KINDS, KIND_LABEL, TEMPLATES, type CertificateKind, type DesignConfig, type TemplateKey } from "../../certificates/config";
import { formatCode, newCertificateCode } from "../../certificates/code";
import { mergeServiceLines } from "../../certificates/lines";

/** Recipients one request adds at most (one statement however many). */
export const MAX_PER_REQUEST = 300;
export const SOURCES = ["MEMBERS", "EVENT", "EVENT_PEOPLE", "COMMITTEE", "CSV", "MANUAL"] as const;
export type CertificateSource = (typeof SOURCES)[number];

// ───────────────────────────── designs ─────────────────────────────

export interface DesignRow {
  id: string;
  template: TemplateKey;
  name: string;
  config: DesignConfig;
  isDefault: boolean;
  updatedAt: string;
}

export async function listDesigns(ctx: Ctx): Promise<DesignRow[]> {
  requirePermission(ctx, "certificates.manage");
  const rows = await ctx.db.all<{ id: string; template: string; name: string; config_json: string; is_default: number; updated_at: string }>(
    "SELECT id, template, name, config_json, is_default, updated_at FROM certificate_designs WHERE deleted_at IS NULL ORDER BY is_default DESC, sort_order, name LIMIT 100");
  return rows.map((r) => ({
    id: r.id, template: (TEMPLATES as readonly string[]).includes(r.template) ? (r.template as TemplateKey) : "heritage", name: r.name,
    config: cleanConfig(JSON.parse(r.config_json)), isDefault: r.is_default === 1, updatedAt: r.updated_at,
  }));
}

/** Save a design (the club's version of a template: wording, signatories, logos). */
export async function saveDesign(ctx: Ctx, id: string | null, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "certificates.manage");
  const v = new Validator(input);
  const name = v.string("name", { required: true, max: 80, label: "Name" });
  const template = v.oneOf("template", TEMPLATES, { required: true, label: "Design" });
  v.done();
  const config = cleanConfig(typeof input.config === "string" ? safeJson(input.config) : input.config);
  const json = JSON.stringify(config);
  if (json.length > 20_000) throw new ValidationError("The design is too large. Use smaller logo or signature pictures (uploaded, not pasted).");
  const makeDefault = v.bool("isDefault");
  const now = nowIso();
  if (id) {
    const exists = await ctx.db.value<string>("SELECT id FROM certificate_designs WHERE id = ?1 AND deleted_at IS NULL", id);
    if (!exists) throw new NotFoundError("Design");
  }
  const designId = id ?? newId("cdes");
  await ctx.db.batch([
    ...(makeDefault ? [ctx.db.stmt("UPDATE certificate_designs SET is_default = 0 WHERE is_default = 1 AND id <> ?1", designId)] : []),
    id
      ? ctx.db.stmt("UPDATE certificate_designs SET name = ?2, template = ?3, config_json = ?4, is_default = CASE WHEN ?5 THEN 1 ELSE is_default END, updated_at = ?6, updated_by = ?7 WHERE id = ?1",
        designId, name, template, json, makeDefault ? 1 : 0, now, actor.user.id)
      : ctx.db.stmt("INSERT INTO certificate_designs (id, template, name, config_json, is_default, created_at, created_by, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?7)",
        designId, template, name, json, makeDefault ? 1 : 0, now, actor.user.id),
    auditStmt(ctx, { action: id ? "certificate.design.update" : "certificate.design.create", resourceType: "certificate_design", resourceId: designId, after: { name, template }, decision }),
  ]);
  return { id: designId };
}

export async function deleteDesign(ctx: Ctx, id: string): Promise<void> {
  const decision = requirePermission(ctx, "certificates.manage");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE certificate_designs SET deleted_at = ?2, is_default = 0 WHERE id = ?1 AND deleted_at IS NULL", id, nowIso()),
    auditStmt(ctx, { action: "certificate.design.delete", resourceType: "certificate_design", resourceId: id, decision }),
  ]);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ───────────────────────────── recipients ─────────────────────────────

export interface RecipientDraft {
  name: string;
  email?: string | null;
  profileId?: string | null;
  userId?: string | null;
  /** The position or part played ("General Secretary", "Speaker"). */
  role?: string | null;
  rank?: string | null;
  team?: string | null;
  /** A sentence of their own instead of the design's. */
  body?: string | null;
  /** Their student ID (CSV rows are matched by it). */
  studentId?: string | null;
}

/** Who the club can issue to, by source (the wizard's lists). */
export async function certificateOptions(ctx: Ctx) {
  requirePermission(ctx, "certificates.manage");
  const [events, committees, groups, designs] = await Promise.all([
    ctx.db.all<{ id: string; title: string; start_at: string | null; registrations: number; people: number }>(
      `SELECT e.id, e.title, e.start_at,
              (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','ATTENDED')) AS registrations,
              (SELECT COUNT(*) FROM event_people p WHERE p.event_id = e.id) AS people
       FROM events e WHERE e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED') ORDER BY COALESCE(e.start_at, e.created_at) DESC LIMIT 60`),
    ctx.db.all<{ id: string; name: string; term_label: string; status: string; members: number }>(
      `SELECT c.id, c.name, c.term_label, c.status, (SELECT COUNT(*) FROM committee_members m WHERE m.committee_id = c.id AND m.deleted_at IS NULL AND m.section = 'STUDENT') AS members
       FROM committees c WHERE c.deleted_at IS NULL AND c.status <> 'UPCOMING' ORDER BY c.slug DESC LIMIT 40`),
    ctx.db.all<{ kind: string; value: string; n: number }>(
      `SELECT 'batch' AS kind, p.batch AS value, COUNT(*) AS n FROM profiles p JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         WHERE p.deleted_at IS NULL AND p.batch IS NOT NULL AND trim(p.batch) <> '' GROUP BY p.batch
       UNION ALL
       SELECT 'department', MIN(p.department), COUNT(*) FROM profiles p JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         WHERE p.deleted_at IS NULL AND p.department IS NOT NULL AND trim(p.department) <> '' GROUP BY lower(p.department)`),
    listDesigns(ctx),
  ]);
  return {
    events: events.map((e) => ({ id: e.id, title: e.title, startAt: e.start_at, registrations: e.registrations, people: e.people })),
    committees: committees.map((c) => ({ id: c.id, name: c.name, term: c.term_label, current: c.status === "CURRENT", members: c.members })),
    batches: groups.filter((g) => g.kind === "batch").sort((a, b) => b.value.localeCompare(a.value)).map((g) => ({ value: g.value, count: g.n })),
    departments: groups.filter((g) => g.kind === "department").sort((a, b) => b.n - a.n).map((g) => ({ value: g.value, count: g.n })),
    designs,
  };
}

const PEOPLE_ROLE: Record<string, string> = {
  SPEAKER: "Speaker", COORDINATOR: "Coordinator", CHIEF_GUEST: "Chief Guest", SPECIAL_GUEST: "Special Guest", GUEST: "Guest", JUDGE: "Judge", PHOTOGRAPHER: "Photographer",
};

/**
 * The people a source gives, ready to review in the wizard: members (all, a batch, a department),
 * an event's registrants or its speakers and judges, one or more committees (one line per person),
 * or rows from a spreadsheet matched to members by email or student ID.
 */
export async function importPreview(ctx: Ctx, raw: Record<string, unknown>): Promise<{ rows: RecipientDraft[]; capped: boolean }> {
  requirePermission(ctx, "certificates.manage");
  const kind = String(raw.kind ?? "");
  const value = typeof raw.value === "string" ? raw.value.slice(0, 80) : "";
  const cap = MAX_RECIPIENTS + 1;
  let rows: RecipientDraft[] = [];
  const member = `SELECT p.full_name AS name, u.email, p.id AS profileId, u.id AS userId, p.student_id AS studentId FROM profiles p
    JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL WHERE p.deleted_at IS NULL`;
  switch (kind) {
    case "members":
      rows = await ctx.db.all<RecipientDraft>(
        `${member} AND (?1 = '' OR (?2 = 'batch' AND p.batch = ?1) OR (?2 = 'department' AND lower(p.department) = lower(?1))) ORDER BY p.full_name LIMIT ${cap}`,
        value, String(raw.filter ?? ""));
      break;
    case "event": {
      const statuses = Array.isArray(raw.statuses) ? raw.statuses.filter((x) => ["REGISTERED", "ATTENDED", "WAITLISTED"].includes(String(x))) : ["ATTENDED"];
      rows = await ctx.db.all<RecipientDraft>(
        `SELECT COALESCE(p.full_name, r.name) AS name, COALESCE(u.email, r.email) AS email, p.id AS profileId, u.id AS userId, COALESCE(p.student_id, r.student_id) AS studentId, 'Participant' AS role
         FROM event_registrations r
         LEFT JOIN users u ON u.id = r.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
         WHERE r.event_id = ?1 AND r.status IN (SELECT value FROM json_each(?2)) ORDER BY name LIMIT ${cap}`,
        String(raw.eventId ?? ""), JSON.stringify(statuses.length ? statuses : ["ATTENDED"]));
      break;
    }
    case "event_people": {
      const list = await ctx.db.all<RecipientDraft & { roleKey: string }>(
        `SELECT ep.name, u.email, COALESCE(ep.profile_id, p.id) AS profileId, u.id AS userId, ep.role AS roleKey
         FROM event_people ep LEFT JOIN users u ON u.id = ep.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
         WHERE ep.event_id = ?1 ORDER BY ep.sort_order LIMIT ${cap}`, String(raw.eventId ?? ""));
      rows = list.map(({ roleKey, ...r }) => ({ ...r, role: PEOPLE_ROLE[roleKey] ?? roleKey }));
      break;
    }
    case "committee": {
      const ids = (Array.isArray(raw.committeeIds) ? raw.committeeIds : [raw.committeeId]).filter((x): x is string => typeof x === "string").slice(0, 6);
      const entries = await ctx.db.all<{ cid: string; key: string; name: string; position: string; term: string; profileId: string; userId: string | null; email: string | null }>(
        `SELECT m.committee_id AS cid, m.profile_id AS key, COALESCE(m.display_name, p.full_name) AS name, m.position_title AS position, c.term_label AS term,
                p.id AS profileId, u.id AS userId, u.email
         FROM committee_members m JOIN committees c ON c.id = m.committee_id JOIN profiles p ON p.id = m.profile_id
         LEFT JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
         WHERE m.committee_id IN (SELECT value FROM json_each(?1)) AND m.deleted_at IS NULL AND m.section = 'STUDENT'
         ORDER BY m.display_order`, JSON.stringify(ids));
      // Committees in the order chosen (older first reads "2023–24 and Reformed 2024").
      entries.sort((a, b) => ids.indexOf(a.cid) - ids.indexOf(b.cid));
      rows = mergeServiceLines(entries).map((m) => ({ name: m.name, email: m.email, profileId: m.profileId, userId: m.userId, role: m.role }));
      break;
    }
    case "match": {
      // Spreadsheet rows: matched to members by email, then by student ID (one statement).
      const input = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, cap)
        .map((r) => (r && typeof r === "object" ? r as Record<string, unknown> : {}))
        .map((r, i) => ({ i, name: String(r.name ?? "").trim().slice(0, 120), email: String(r.email ?? "").trim().toLowerCase().slice(0, 254), sid: String(r.studentId ?? "").replace(/\D/g, "").slice(0, 12), role: String(r.role ?? "").trim().slice(0, 200), rank: String(r.rank ?? "").trim().slice(0, 60), team: String(r.team ?? "").trim().slice(0, 80) }))
        .filter((r) => r.name || r.email);
      const found = await ctx.db.all<{ i: number; profileId: string; userId: string | null; name: string; email: string | null }>(
        `SELECT json_extract(j.value, '$.i') AS i, p.id AS profileId, u.id AS userId, p.full_name AS name, u.email
         FROM json_each(?1) j JOIN profiles p ON p.deleted_at IS NULL AND p.merged_into_id IS NULL
           AND p.id = COALESCE(
             (SELECT p2.id FROM users u2 JOIN profiles p2 ON p2.user_id = u2.id AND p2.deleted_at IS NULL WHERE u2.email = json_extract(j.value, '$.email') AND u2.deleted_at IS NULL LIMIT 1),
             (SELECT p3.id FROM profiles p3 WHERE json_extract(j.value, '$.sid') <> '' AND p3.student_id = json_extract(j.value, '$.sid') AND p3.deleted_at IS NULL LIMIT 1))
         LEFT JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`,
        JSON.stringify(input.map((r) => ({ i: r.i, email: r.email, sid: r.sid }))));
      const byRow = new Map(found.map((f) => [f.i, f]));
      rows = input.map((r) => {
        const f = byRow.get(r.i);
        return {
          name: r.name || f?.name || r.email, email: r.email || f?.email || null, profileId: f?.profileId ?? null, userId: f?.userId ?? null,
          studentId: r.sid || null, role: r.role || null, rank: r.rank || null, team: r.team || null,
        };
      });
      break;
    }
    default:
      throw new ValidationError("Choose where the recipients come from.");
  }
  return { rows: rows.slice(0, MAX_RECIPIENTS), capped: rows.length > MAX_RECIPIENTS };
}

function cleanRecipients(raw: unknown): { list: RecipientDraft[]; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  const list: RecipientDraft[] = [];
  for (const [i, r] of (Array.isArray(raw) ? raw : []).entries()) {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const name = String(x.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const email = String(x.email ?? "").trim().toLowerCase();
    if (!name) {
      errors.push(`Row ${i + 1} has no name.`);
      continue;
    }
    if (email && !EMAIL_RE.test(email)) errors.push(`Row ${i + 1}: “${email}” isn't an email address.`);
    const profileId = typeof x.profileId === "string" && x.profileId ? x.profileId.slice(0, 80) : null;
    const key = profileId ?? (email || `name:${name.toLowerCase()}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
    list.push({
      name, email: email && EMAIL_RE.test(email) ? email : null, profileId, userId: typeof x.userId === "string" && x.userId ? x.userId.slice(0, 80) : null,
      role: text(x.role, 200), rank: text(x.rank, 60), team: text(x.team, 80), body: text(x.body, 800),
    });
  }
  return { list, errors };
}

// ───────────────────────────── issuing ─────────────────────────────

export interface IssueInput {
  name: string;
  kind: CertificateKind;
  source: CertificateSource;
  sourceJson?: unknown;
  eventId?: string | null;
  committeeId?: string | null;
  designId?: string | null;
  template: TemplateKey;
  config: DesignConfig;
  issuedOn: string;
  recipients: RecipientDraft[];
  notify: boolean;
  email: boolean;
  emailGuests: boolean;
}

function parseIssue(input: Record<string, unknown>): IssueInput {
  const v = new Validator(input);
  const name = v.string("name", { required: true, max: 150, label: "Name of this issue" });
  const kind = v.oneOf("kind", KINDS, { required: true, label: "Kind" });
  const source = v.oneOf("source", SOURCES, { label: "Source" }) ?? "MANUAL";
  const template = v.oneOf("template", TEMPLATES, { required: true, label: "Design" });
  const issuedOn = v.string("issuedOn", { required: true, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: "Use a date (YYYY-MM-DD).", label: "Date" });
  v.done();
  const { list, errors } = cleanRecipients(input.recipients);
  if (errors.length) throw new ValidationError(errors.slice(0, 3).join(" "), { recipients: errors[0]! });
  if (!list.length) throw new ValidationError("Add at least one person.", { recipients: "Nobody to issue to." });
  if (list.length > MAX_PER_REQUEST) throw new ValidationError(`At most ${MAX_PER_REQUEST} people at a time. Issue the rest as a second part.`, { recipients: "Too many." });
  return {
    name: name!, kind: kind!, source, sourceJson: input.sourceJson ?? null,
    eventId: typeof input.eventId === "string" && input.eventId ? input.eventId : null,
    committeeId: typeof input.committeeId === "string" && input.committeeId ? input.committeeId : null,
    designId: typeof input.designId === "string" && input.designId ? input.designId : null,
    template: template!, config: cleanConfig(typeof input.config === "string" ? safeJson(input.config) : input.config, kind!), issuedOn: issuedOn!,
    recipients: list, notify: input.notify !== false && input.notify !== "0", email: input.email === true || input.email === "1" || input.email === "on",
    emailGuests: input.emailGuests === true || input.emailGuests === "1" || input.emailGuests === "on",
  };
}

/**
 * Issue a batch: the design and wording frozen as they are now, one certificate per person (an
 * unguessable code each), a notice to members, and, when asked, an email with their link.
 */
export async function issueBatch(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string; issued: number; emailed: number }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "certificates.manage");
  const d = parseIssue(input);
  await limit(ctx, "certificates.issue", actor.user.id);
  // Links to people and events must be real (one statement).
  const check = await ctx.db.first<{ profiles: string | null; event: number; committee: number }>(
    `SELECT (SELECT json_group_array(p.id || '|' || COALESCE(p.user_id, '')) FROM profiles p WHERE p.id IN (SELECT value FROM json_each(?1)) AND p.deleted_at IS NULL) AS profiles,
            EXISTS (SELECT 1 FROM events WHERE id = ?2 AND deleted_at IS NULL) AS event,
            EXISTS (SELECT 1 FROM committees WHERE id = ?3 AND deleted_at IS NULL) AS committee`,
    JSON.stringify(d.recipients.map((r) => r.profileId).filter(Boolean)), d.eventId, d.committeeId);
  const profiles = new Map((JSON.parse(check?.profiles ?? "[]") as string[]).map((x) => x.split("|") as [string, string]));
  const id = newId("cbat");
  const now = nowIso();
  const certs = d.recipients.map((r) => {
    const profileId = r.profileId && profiles.has(r.profileId) ? r.profileId : null;
    const userId = profileId ? profiles.get(profileId) || null : null;
    const code = newCertificateCode();
    return {
      id: newId("cert"), code, profileId, userId, name: r.name, email: r.email ?? null, role: r.role ?? null, body: r.body ?? null,
      fields: r.rank || r.team ? { rank: r.rank ?? undefined, team: r.team ?? undefined } : null,
    };
  });
  const title = `${KIND_LABEL[d.kind]}: ${d.name}`.slice(0, 150);
  // The email: members who didn't turn off club emails, and (when asked) people without an account.
  const emailed = d.email ? certs.filter((c) => c.email && (c.userId || d.emailGuests)) : [];
  const campaignId = emailed.length ? newId("cmp") : null;
  const stmts: D1StatementLike[] = [
    ctx.db.stmt(
      `INSERT INTO certificate_batches (id, name, title, kind, source, source_json, event_id, committee_id, design_id, template, design_snapshot_json, issued_on, status, recipient_count,
              email_campaign_id, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'ISSUED', ?13, ?14, ?15, ?16, ?15, ?16)`,
      id, d.name, title, d.kind, d.source, d.sourceJson ? JSON.stringify(d.sourceJson).slice(0, 4000) : null, check?.event ? d.eventId : null, check?.committee ? d.committeeId : null,
      d.designId, d.template, JSON.stringify(d.config), d.issuedOn, certs.length, campaignId, now, actor.user.id),
    ctx.db.stmt(
      `INSERT INTO certificates (id, code, batch_id, profile_id, user_id, recipient_name, recipient_email, role_line, body, fields_json, created_at, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.code'), ?1, json_extract(j.value, '$.p'), json_extract(j.value, '$.u'), json_extract(j.value, '$.n'),
              json_extract(j.value, '$.e'), json_extract(j.value, '$.r'), json_extract(j.value, '$.b'), json_extract(j.value, '$.f'), ?3, ?3, ?4
       FROM json_each(?2) AS j WHERE true ON CONFLICT DO NOTHING`,
      id, JSON.stringify(certs.map((c) => ({ id: c.id, code: c.code, p: c.profileId, u: c.userId, n: c.name, e: c.email, r: c.role, b: c.body, f: c.fields }))), now, actor.user.id),
    ...(d.notify ? notifyEachStmts(ctx, certs.filter((c) => c.userId).map((c) => ({
      userId: c.userId!, type: "certificate.issued", title: `You received a certificate: ${d.name}`.slice(0, 200),
      body: `${KIND_LABEL[d.kind]} certificate from the Green University Computer Club. Download it or add it to LinkedIn.`, link: `/c/${c.code}`, resourceType: "certificate", resourceId: c.id,
    }))) : []),
    ...(campaignId ? campaignStatements(ctx, campaignId, {
      kind: "CERTIFICATE", subject: `Your certificate: ${d.name}`.slice(0, 150), preheader: "Download it, print it, or add it to your LinkedIn profile.",
      body: `The Green University Computer Club has issued you a ${KIND_LABEL[d.kind].toLowerCase()} certificate for ${d.name}.\n\nIt has its own page where anyone can check it's real. From there you can download it as a PDF or picture, print it, or add it to your LinkedIn profile.`,
      buttonLabel: "View your certificate", buttonPath: null, audience: { kind: "list", label: d.name.slice(0, 80) }, batchId: id,
      people: emailed.map((c) => ({ user_id: c.userId, email: c.email!, name: c.name, data: { path: `/c/${c.code}` } })),
    }) : []),
    auditStmt(ctx, { action: "certificate.issue", resourceType: "certificate_batch", resourceId: id, after: { name: d.name, kind: d.kind, recipients: certs.length, template: d.template }, decision }),
  ];
  await ctx.db.batch(stmts);
  if (campaignId) ctx.campaignTick = true;
  ctx.revalidate?.([TAGS.certificates]);
  return { id, issued: certs.length, emailed: emailed.length };
}

// ───────────────────────────── reading (dashboard) ─────────────────────────────

export async function listBatches(ctx: Ctx, opts: { page?: number } = {}) {
  requirePermission(ctx, "certificates.manage");
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const [rows, total] = await Promise.all([
    ctx.db.all<{ id: string; name: string; title: string; kind: string; template: string; issued_on: string; recipient_count: number; revoked: number; created_at: string; created_by_name: string | null; event_title: string | null }>(
      `SELECT b.id, b.name, b.title, b.kind, b.template, b.issued_on, b.recipient_count, b.created_at,
              (SELECT COUNT(*) FROM certificates c WHERE c.batch_id = b.id AND c.status = 'REVOKED') AS revoked,
              COALESCE(p.full_name, u.email) AS created_by_name, e.title AS event_title
       FROM certificate_batches b LEFT JOIN users u ON u.id = b.created_by LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
       LEFT JOIN events e ON e.id = b.event_id
       WHERE b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 25 OFFSET ?1`, (page - 1) * 25),
    ctx.db.value<number>("SELECT COUNT(*) FROM certificate_batches WHERE deleted_at IS NULL"),
  ]);
  return { rows, total: total ?? 0, page, pageSize: 25 };
}

export interface CertificateRow {
  id: string;
  code: string;
  recipient_name: string;
  recipient_email: string | null;
  role_line: string | null;
  body: string | null;
  fields_json: string | null;
  status: "VALID" | "REVOKED";
  visibility: "PUBLIC" | "PRIVATE";
  revoked_at: string | null;
  revoke_reason: string | null;
  profile_id: string | null;
  handle: string | null;
}

export async function getBatch(ctx: Ctx, id: string, opts: { q?: string; page?: number } = {}) {
  requirePermission(ctx, "certificates.manage");
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const q = typeof opts.q === "string" && opts.q.trim() ? `%${opts.q.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const [batch, rows, total] = await Promise.all([
    ctx.db.first<{ id: string; name: string; title: string; kind: CertificateKind; template: TemplateKey; design_snapshot_json: string; issued_on: string; recipient_count: number;
      email_campaign_id: string | null; created_at: string; event_title: string | null; event_slug: string | null }>(
      `SELECT b.id, b.name, b.title, b.kind, b.template, b.design_snapshot_json, b.issued_on, b.recipient_count, b.email_campaign_id, b.created_at, e.title AS event_title, e.slug AS event_slug
       FROM certificate_batches b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = ?1 AND b.deleted_at IS NULL`, id),
    ctx.db.all<CertificateRow>(
      `SELECT c.id, c.code, c.recipient_name, c.recipient_email, c.role_line, c.body, c.fields_json, c.status, c.visibility, c.revoked_at, c.revoke_reason, c.profile_id,
              CASE WHEN c.profile_id IS NOT NULL THEN (SELECT COALESCE(p.slug, p.id) FROM profiles p WHERE p.id = c.profile_id) END AS handle
       FROM certificates c WHERE c.batch_id = ?1 AND (?2 IS NULL OR c.recipient_name LIKE ?2 ESCAPE '\\' OR c.recipient_email LIKE ?2 ESCAPE '\\' OR c.code LIKE ?2 ESCAPE '\\')
       ORDER BY c.recipient_name LIMIT 100 OFFSET ?3`, id, q, (page - 1) * 100),
    ctx.db.value<number>(`SELECT COUNT(*) FROM certificates c WHERE c.batch_id = ?1 AND (?2 IS NULL OR c.recipient_name LIKE ?2 ESCAPE '\\' OR c.recipient_email LIKE ?2 ESCAPE '\\' OR c.code LIKE ?2 ESCAPE '\\')`, id, q),
  ]);
  if (!batch) throw new NotFoundError("Certificates");
  return {
    batch: { ...batch, config: cleanConfig(safeJson(batch.design_snapshot_json), batch.kind) },
    rows, total: total ?? 0, page, pageSize: 100,
  };
}

/** Add people to an issued batch (someone was missed), with the same design. */
export async function addRecipients(ctx: Ctx, batchId: string, raw: unknown): Promise<{ added: number }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "certificates.manage");
  const { list, errors } = cleanRecipients(raw);
  if (errors.length) throw new ValidationError(errors.slice(0, 3).join(" "));
  if (!list.length) throw new ValidationError("Add at least one person.");
  if (list.length > MAX_PER_REQUEST) throw new ValidationError(`At most ${MAX_PER_REQUEST} people at a time.`);
  const batch = await ctx.db.first<{ id: string; profiles: string | null }>(
    `SELECT b.id, (SELECT json_group_array(p.id || '|' || COALESCE(p.user_id, '')) FROM profiles p WHERE p.id IN (SELECT value FROM json_each(?2)) AND p.deleted_at IS NULL) AS profiles
     FROM certificate_batches b WHERE b.id = ?1 AND b.deleted_at IS NULL`, batchId, JSON.stringify(list.map((r) => r.profileId).filter(Boolean)));
  if (!batch) throw new NotFoundError("Certificates");
  const profiles = new Map((JSON.parse(batch.profiles ?? "[]") as string[]).map((x) => x.split("|") as [string, string]));
  const now = nowIso();
  const certs = list.map((r) => {
    const profileId = r.profileId && profiles.has(r.profileId) ? r.profileId : null;
    return { id: newId("cert"), code: newCertificateCode(), p: profileId, u: profileId ? profiles.get(profileId) || null : null, n: r.name, e: r.email ?? null, r: r.role ?? null, b: r.body ?? null,
      f: r.rank || r.team ? { rank: r.rank ?? undefined, team: r.team ?? undefined } : null };
  });
  const inserted = await ctx.db.batchAll([
    ctx.db.stmt(
      `INSERT INTO certificates (id, code, batch_id, profile_id, user_id, recipient_name, recipient_email, role_line, body, fields_json, created_at, updated_at, updated_by)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.code'), ?1, json_extract(j.value, '$.p'), json_extract(j.value, '$.u'), json_extract(j.value, '$.n'),
              json_extract(j.value, '$.e'), json_extract(j.value, '$.r'), json_extract(j.value, '$.b'), json_extract(j.value, '$.f'), ?3, ?3, ?4
       FROM json_each(?2) AS j WHERE true ON CONFLICT DO NOTHING RETURNING id`, batchId, JSON.stringify(certs), now, actor.user.id),
    ctx.db.stmt("UPDATE certificate_batches SET recipient_count = (SELECT COUNT(*) FROM certificates WHERE batch_id = ?1), updated_at = ?2, updated_by = ?3 WHERE id = ?1", batchId, now, actor.user.id),
    auditStmt(ctx, { action: "certificate.add", resourceType: "certificate_batch", resourceId: batchId, after: { added: certs.length }, decision }),
  ]);
  const added = inserted[0]?.results?.length ?? 0;
  const addedIds = new Set((inserted[0]?.results as Array<{ id: string }> | undefined)?.map((r) => r.id) ?? []);
  const notices = certs.filter((c) => c.u && addedIds.has(c.id));
  if (notices.length) {
    const name = await ctx.db.value<string>("SELECT name FROM certificate_batches WHERE id = ?1", batchId);
    await ctx.db.batch(notifyEachStmts(ctx, notices.map((c) => ({ userId: c.u!, type: "certificate.issued", title: `You received a certificate: ${name ?? "GUCC"}`.slice(0, 200), link: `/c/${c.code}`, resourceType: "certificate", resourceId: c.id }))));
  }
  ctx.revalidate?.([TAGS.certificates]);
  return { added };
}

/** Correct a certificate (a misspelt name, a role line). The code stays the same. */
export async function updateCertificate(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "certificates.manage");
  const v = new Validator(input);
  const name = v.string("name", { required: true, max: 120, label: "Name" });
  const role = v.string("role", { max: 200, label: "Role" });
  const body = v.string("body", { max: 800, label: "Sentence" });
  v.done();
  const row = await ctx.db.first<{ code: string }>(
    "UPDATE certificates SET recipient_name = ?2, role_line = ?3, body = ?4, updated_at = ?5, updated_by = ?6 WHERE id = ?1 RETURNING code", id, name, role, body, nowIso(), actor.user.id);
  if (!row) throw new NotFoundError("Certificate");
  await ctx.db.batch([auditStmt(ctx, { action: "certificate.update", resourceType: "certificate", resourceId: id, after: { name, role }, decision })]);
  ctx.revalidate?.([TAGS.certificate(row.code)]);
}

/** Revoke (the verification page then says so) or restore. */
export async function setCertificateStatus(ctx: Ctx, id: string, revoke: boolean, reason?: unknown): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "certificates.manage");
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (revoke && why.length < 3) throw new ValidationError("Say why it's revoked (people who check it see this).", { reason: "Give a reason." });
  const now = nowIso();
  const row = await ctx.db.first<{ code: string }>(
    `UPDATE certificates SET status = ?2, revoked_at = CASE WHEN ?2 = 'REVOKED' THEN ?3 END, revoked_by = CASE WHEN ?2 = 'REVOKED' THEN ?4 END,
            revoke_reason = CASE WHEN ?2 = 'REVOKED' THEN ?5 END, updated_at = ?3, updated_by = ?4 WHERE id = ?1 RETURNING code`,
    id, revoke ? "REVOKED" : "VALID", now, actor.user.id, revoke ? why : null);
  if (!row) throw new NotFoundError("Certificate");
  await ctx.db.batch([auditStmt(ctx, { action: revoke ? "certificate.revoke" : "certificate.restore", resourceType: "certificate", resourceId: id, reason: why || undefined, decision })]);
  ctx.revalidate?.([TAGS.certificate(row.code), TAGS.certificates]);
}

// ───────────────────────────── the holder ─────────────────────────────

/** My certificates (by my account, or the profile I claimed). */
export async function myCertificates(ctx: Ctx) {
  const actor = requireActor(ctx);
  const rows = await ctx.db.all<{ id: string; code: string; recipient_name: string; role_line: string | null; status: string; visibility: string; issued_on: string; name: string; title: string; kind: string; template: string }>(
    `SELECT c.id, c.code, c.recipient_name, c.role_line, c.status, c.visibility, b.issued_on, b.name, b.title, b.kind, b.template
     FROM certificates c JOIN certificate_batches b ON b.id = c.batch_id AND b.deleted_at IS NULL AND b.status = 'ISSUED'
     WHERE c.user_id = ?1 OR (c.profile_id IS NOT NULL AND c.profile_id = ?2)
     ORDER BY b.issued_on DESC, c.created_at DESC LIMIT 200`, actor.user.id, actor.profile?.id ?? "");
  return rows.map((r) => ({ ...r, display: formatCode(r.code) }));
}

/** Show or hide one of my certificates on my profile (its link still verifies). */
export async function setCertificateVisibility(ctx: Ctx, id: string, visibility: "PUBLIC" | "PRIVATE"): Promise<void> {
  const actor = requireActor(ctx);
  if (visibility !== "PUBLIC" && visibility !== "PRIVATE") throw new ValidationError("Choose public or private.");
  const row = await ctx.db.first<{ code: string }>(
    "UPDATE certificates SET visibility = ?3, updated_at = ?4 WHERE id = ?1 AND (user_id = ?2 OR (profile_id IS NOT NULL AND profile_id = ?5)) RETURNING code",
    id, actor.user.id, visibility, nowIso(), actor.profile?.id ?? "");
  if (!row) throw new NotFoundError("Certificate");
  ctx.revalidate?.([TAGS.certificate(row.code)]);
}

export function assertTemplate(t: string): asserts t is TemplateKey {
  if (!(TEMPLATES as readonly string[]).includes(t)) throw new AppError(400, "BAD_TEMPLATE", "Unknown design.");
}
