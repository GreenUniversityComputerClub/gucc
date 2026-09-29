/**
 * Executive recruitment on D1 + private R2 (replaces the Google Apps Script
 * form and Drive uploads).
 *
 * Public flow:
 *   1. The form asks for an upload token (rate-limited per IP). It is a signed,
 *      one-hour capability naming a random upload session.
 *   2. The browser uploads the CV (PDF), photo and ID card straight to the API
 *      Worker with that token; files land in the PRIVATE bucket, tagged with
 *      the session.
 *   3. Submitting (Turnstile + rate limit) checks every field and that each
 *      file belongs to this session and is not used by another application.
 *
 * Applications hold personal data (phone, grades, identity documents): only
 * holders of recruitment.manage can read them, documents open through
 * short-lived signed links, and exports are audited.
 */
import { csvCell } from "../csv";
import { avatarOfProfileSql, withAvatars } from "../avatar";
import { decisionEmail } from "../../recruitment/decision-emails";
import { assertStmt, batchTransition } from "../transition";
import { limit } from "../limits";
import { auditStmt } from "../audit";
import { requireActor, requirePermission } from "../authz";
import type { Ctx } from "../context";
import { newId, nowIso } from "../db";
import { notifyStmts, usersWithPermission } from "../notifications";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { deliverEmail, requireRecentAuth, verifyTurnstile } from "../security";
import { requireSecret, signToken, verificationSecrets, verifyToken } from "../signing";
import { EMAIL_RE, STUDENT_ID_RE, Validator } from "../validate";
import { signedMediaUrl } from "./media";
import { triggerStmts } from "../triggers";
import { MAX_APPLICATION_IMPORT } from "../../recruitment/import-fields";

export const SEMESTERS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "Others"] as const;
export const GENDERS = ["Male", "Female"] as const;
export const APPLICATION_STATUSES = ["SUBMITTED", "SHORTLISTED", "INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
const PHONE_RE = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const UPLOAD_TOKEN_MINUTES = 60;
export const MAX_UPLOADS_PER_SESSION = 8;

export interface UploadTokenPayload {
  p: "recruitment" | "user";
  /** recruitment: upload session; user: user id */
  s: string;
  c?: string;
  purpose?: string;
  eventId?: string | null;
  /** user uploads: replace this existing image (checked again at upload time). */
  replaceId?: string | null;
  exp: number;
}

interface CampaignRow {
  id: string;
  title: string;
  description: string | null;
  circular_url: string | null;
  committee_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
  positions_json: string;
  created_at: string;
  updated_at: string;
}

async function positionsFor(ctx: Ctx, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await ctx.db.all<{ id: string; name: string; rank: number }>(
    `SELECT id, name, rank FROM positions WHERE deleted_at IS NULL AND is_active = 1 AND id IN (SELECT value FROM json_each(?1)) ORDER BY rank, name`,
    JSON.stringify(ids),
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

const isOpenNow = (c: CampaignRow, now = nowIso()) => c.status === "OPEN" && (!c.opens_at || c.opens_at <= now) && (!c.closes_at || c.closes_at > now);

/** Public: the campaign currently taking applications, or the next scheduled one. */
export async function publicCampaign(ctx: Ctx) {
  const now = nowIso();
  const rows = await ctx.db.all<CampaignRow>(
    "SELECT * FROM recruitment_campaigns WHERE status = 'OPEN' AND (closes_at IS NULL OR closes_at > ?1) ORDER BY COALESCE(opens_at, created_at) LIMIT 5", now);
  const open = rows.find((c) => isOpenNow(c, now)) ?? null;
  const upcoming = open ? null : rows.find((c) => c.opens_at && c.opens_at > now) ?? null;
  const shape = async (c: CampaignRow | null) =>
    c && { id: c.id, title: c.title, description: c.description, circularUrl: c.circular_url, opensAt: c.opens_at, closesAt: c.closes_at, positions: await positionsFor(ctx, JSON.parse(c.positions_json)) };
  return { open: await shape(open), upcoming: await shape(upcoming), semesters: SEMESTERS, genders: GENDERS };
}

/** Public: a one-hour upload capability for an application's documents. */
export async function recruitmentUploadToken(ctx: Ctx, input: { campaignId: string }): Promise<{ token: string; expiresAt: string }> {
  await limit(ctx, "recruitment.token", ctx.meta.ipHash ?? "unknown");
  const c = await ctx.db.first<CampaignRow>("SELECT * FROM recruitment_campaigns WHERE id = ?1", String(input.campaignId ?? ""));
  if (!c || !isOpenNow(c)) throw new AppError(409, "RECRUITMENT_CLOSED", "Applications are not open right now.");
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_MINUTES * 60;
  const payload: UploadTokenPayload = { p: "recruitment", s: `rus_${crypto.randomUUID()}`, c: c.id, exp };
  return { token: await signToken(requireSecret(ctx.env.AUTH_SECRET), payload as never), expiresAt: new Date(exp * 1000).toISOString() };
}

export async function submitApplication(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string; message: string }> {
  await limit(ctx, "recruitment.submit", ctx.meta.ipHash ?? "unknown");
  const v = new Validator(input);
  const d = {
    campaignId: v.string("campaignId", { required: true, max: 80, label: "Campaign" }),
    fullName: v.string("fullName", { required: true, min: 2, max: 100, label: "Full name" }),
    studentId: v.string("studentId", { required: true, max: 9, label: "Student ID", pattern: STUDENT_ID_RE, patternMessage: "Student ID must be exactly 9 digits." }),
    email: v.string("email", { required: true, max: 254, label: "Email", pattern: EMAIL_RE, patternMessage: "Enter a valid email address." })?.toLowerCase() ?? null,
    phone: v.string("phone", { required: true, max: 20, label: "Mobile number" }),
    gender: v.oneOf("gender", GENDERS, { required: true, label: "Gender" }),
    semester: v.oneOf("semester", SEMESTERS, { required: true, label: "Semester" }),
    batch: v.string("batch", { required: true, max: 20, label: "Batch" }),
    cgpa: v.string("cgpa", { required: true, max: 5, label: "CGPA" }),
    completedCredit: v.int("completedCredit", { required: true, min: 0, max: 200, label: "Completed credits" }),
    positionId: v.string("positionId", { required: true, max: 80, label: "Position" }),
    clubWork: v.string("clubWork", { max: 3000, label: "Club work" }),
    cvMediaId: v.string("cvMediaId", { required: true, max: 80, label: "CV" }),
    photoMediaId: v.string("photoMediaId", { required: true, max: 80, label: "Photo" }),
    idCardMediaId: v.string("idCardMediaId", { required: true, max: 80, label: "Student ID card" }),
  };
  const phone = d.phone?.replace(/[\s-]/g, "") ?? "";
  if (d.phone) v.check(PHONE_RE.test(phone), "phone", "Enter a valid Bangladeshi mobile number.");
  const cgpa = d.cgpa ? Number(d.cgpa) : NaN;
  if (d.cgpa) v.check(Number.isFinite(cgpa) && cgpa >= 0 && cgpa <= 4, "cgpa", "CGPA must be between 0.00 and 4.00.");
  v.done();
  await verifyTurnstile(ctx, input.turnstileToken as string | undefined);

  const token = await verifyToken<UploadTokenPayload>(verificationSecrets(ctx.env), input.uploadToken as string);
  // Allow submitting a little after the upload token expired (long forms), but never with a forged one.
  if (!token || token.p !== "recruitment" || token.c !== d.campaignId) {
    throw new ValidationError("Your upload session expired. Re-attach the files and submit again.", { cv: "Please upload again." });
  }
  const c = await ctx.db.first<CampaignRow>("SELECT * FROM recruitment_campaigns WHERE id = ?1", d.campaignId);
  if (!c || !isOpenNow(c)) throw new AppError(409, "RECRUITMENT_CLOSED", "Applications for this recruitment are closed.");
  if (!(JSON.parse(c.positions_json) as string[]).includes(d.positionId!)) throw new ValidationError("Choose one of the listed positions.", { positionId: "Choose one of the listed positions." });

  const dup = await ctx.db.first("SELECT 1 FROM recruitment_applications WHERE campaign_id = ?1 AND (student_id = ?2 OR email = ?3)", d.campaignId, d.studentId, d.email);
  if (dup) throw new ConflictError("An application with this student ID or email has already been submitted.");
  const files = [
    { id: d.cvMediaId!, field: "cv", type: "DOCUMENT", label: "CV (PDF)" },
    { id: d.photoMediaId!, field: "photo", type: "IMAGE", label: "photo" },
    { id: d.idCardMediaId!, field: "idCard", type: "IMAGE", label: "ID card image" },
  ];
  if (new Set(files.map((f) => f.id)).size !== files.length) throw new ValidationError("Each document must be a different file.");
  for (const f of files) {
    const m = await ctx.db.first<{ media_type: string; upload_session: string | null; used: number }>(
      `SELECT media_type, upload_session,
              EXISTS (SELECT 1 FROM recruitment_applications a WHERE ?1 IN (a.cv_media_id, a.photo_media_id, a.id_card_media_id)) AS used
       FROM media WHERE id = ?1 AND deleted_at IS NULL AND status = 'READY'`, f.id);
    if (!m || m.upload_session !== token.s || m.used) throw new ValidationError(`Please upload your ${f.label} again.`, { [f.field]: "Please upload again." });
    if (m.media_type !== f.type) throw new ValidationError(`The ${f.label} has the wrong file type.`, { [f.field]: "Wrong file type." });
  }

  const id = newId("rap");
  const now = nowIso();
  try {
    await ctx.db.batch([
      ctx.db.stmt(
        `INSERT INTO recruitment_applications (id, campaign_id, user_id, full_name, student_id, email, phone, gender, semester, batch, cgpa, completed_credit, position_id, club_work,
                                               cv_media_id, photo_media_id, id_card_media_id, ip_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)`,
        id, d.campaignId, ctx.actor?.user.id ?? null, d.fullName, d.studentId, d.email, phone, d.gender, d.semester, d.batch, Math.round(cgpa * 100) / 100,
        d.completedCredit, d.positionId, d.clubWork, d.cvMediaId, d.photoMediaId, d.idCardMediaId, ctx.meta.ipHash, now,
      ),
      auditStmt(ctx, { action: "recruitment.apply", resourceType: "recruitment_application", resourceId: id, actorLabel: "applicant", after: { campaign: d.campaignId, position: d.positionId } }),
      ...(await triggerStmts(ctx, "application.submitted", { type: "recruitment_application", id }, { title: `${d.fullName} (${c.title})`, link: `/dashboard/recruitment/applications/${id}` })),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) throw new ConflictError("An application with this student ID or email has already been submitted.");
    throw e;
  }
  const positionName = (await ctx.db.value<string>("SELECT name FROM positions WHERE id = ?1", d.positionId)) ?? "the selected position";
  const reference = id.slice(4, 12).toUpperCase();
  const emailed = await deliverEmail(ctx, {
    to: d.email!,
    subject: `We received your application: ${c.title}`,
    text: `Hello ${d.fullName},\n\nThank you for applying for ${positionName} (${c.title}). Your reference is ${id.slice(4, 12).toUpperCase()}.\nThe selection committee will contact shortlisted applicants by email.\n\nGreen University Computer Club`,
  }, { type: "recruitment.receipt" });
  return { id, message: emailed ? `Application submitted (reference ${reference}). A confirmation email is on its way.` : `Application submitted. Your reference is ${reference}; keep it for your records.` };
}

// ───────────────────────────── admin ─────────────────────────────

export async function listCampaigns(ctx: Ctx) {
  requirePermission(ctx, "recruitment.manage");
  const rows = await ctx.db.all<CampaignRow & { total: number; shortlisted: number; accepted: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM recruitment_applications a WHERE a.campaign_id = c.id) AS total,
            (SELECT COUNT(*) FROM recruitment_applications a WHERE a.campaign_id = c.id AND a.status IN ('SHORTLISTED','INTERVIEW')) AS shortlisted,
            (SELECT COUNT(*) FROM recruitment_applications a WHERE a.campaign_id = c.id AND a.status = 'ACCEPTED') AS accepted
     FROM recruitment_campaigns c WHERE c.status <> 'ARCHIVED' OR c.updated_at > date('now', '-2 years') ORDER BY c.created_at DESC`,
  );
  return rows.map((r) => ({ ...r, positionIds: JSON.parse(r.positions_json) as string[], isOpenNow: isOpenNow(r) }));
}

export async function saveCampaign(ctx: Ctx, id: string | null, input: Record<string, unknown>): Promise<{ id: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "recruitment.manage");
  const v = new Validator(input);
  const d = {
    title: v.string("title", { required: true, min: 3, max: 150, label: "Title" }),
    description: v.string("description", { max: 5000, label: "Description" }),
    circularUrl: v.url("circularUrl", { label: "Circular link" }),
    opensAt: v.datetime("opensAt", { label: "Opens" }),
    closesAt: v.datetime("closesAt", { required: true, label: "Closes" }),
    status: v.oneOf("status", ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as const, { required: true, label: "Status" }),
    committeeId: v.string("committeeId", { max: 80, label: "Committee" }),
  };
  const rawPositions = input.positionIds;
  const positionIds = (Array.isArray(rawPositions) ? rawPositions : String(rawPositions ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
  if (d.opensAt && d.closesAt) v.check(d.opensAt < d.closesAt, "closesAt", "Closing time must be after the opening time.");
  v.check(positionIds.length > 0, "positionIds", "Offer at least one position.");
  v.done();
  if (d.status === "OPEN") {
    const other = await ctx.db.first<{ title: string }>("SELECT title FROM recruitment_campaigns WHERE status = 'OPEN' AND id <> ?1 AND (closes_at IS NULL OR closes_at > ?2)", id ?? "", nowIso());
    if (other) throw new ConflictError(`"${other.title}" is still open. Close it before opening another recruitment.`);
  }
  const valid = await positionsFor(ctx, positionIds);
  if (valid.length !== new Set(positionIds).size) throw new ValidationError("One of the positions no longer exists.", { positionIds: "Refresh and choose again." });
  const now = nowIso();
  const cid = id ?? newId("rcp");
  // Checked again inside the transaction: two leaders can't open two recruitments at once.
  const oneOpen = d.status === "OPEN"
    ? [assertStmt(ctx, "NOT EXISTS (SELECT 1 FROM recruitment_campaigns WHERE status = 'OPEN' AND id <> ?1 AND (closes_at IS NULL OR closes_at > ?2))", cid, now)]
    : [];
  const lost = () => new ConflictError("Another recruitment was opened a moment ago. Close it before opening this one.");
  if (id) {
    const before = await ctx.db.first<CampaignRow>("SELECT * FROM recruitment_campaigns WHERE id = ?1", id);
    if (!before) throw new NotFoundError("Recruitment");
    await batchTransition(ctx, [
      ...oneOpen,
      ctx.db.stmt(
        `UPDATE recruitment_campaigns SET title = ?2, description = ?3, circular_url = ?4, opens_at = ?5, closes_at = ?6, status = ?7, committee_id = ?8, positions_json = ?9, updated_at = ?10, updated_by = ?11 WHERE id = ?1`,
        id, d.title, d.description, d.circularUrl, d.opensAt, d.closesAt, d.status, d.committeeId, JSON.stringify(positionIds), now, actor.user.id),
      auditStmt(ctx, { action: "recruitment.update", resourceType: "recruitment_campaign", resourceId: id, before: { status: before.status, closes: before.closes_at }, after: { ...d, positionIds }, decision }),
    ], lost);
  } else {
    await batchTransition(ctx, [
      ...oneOpen,
      ctx.db.stmt(
        `INSERT INTO recruitment_campaigns (id, title, description, circular_url, opens_at, closes_at, status, committee_id, positions_json, created_at, created_by, updated_at, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?10, ?11)`,
        cid, d.title, d.description, d.circularUrl, d.opensAt, d.closesAt, d.status, d.committeeId, JSON.stringify(positionIds), now, actor.user.id),
      auditStmt(ctx, { action: "recruitment.create", resourceType: "recruitment_campaign", resourceId: cid, after: { ...d, positionIds }, decision }),
    ], lost);
  }
  ctx.revalidate?.(["recruitment"]);
  return { id: cid };
}

export interface ApplicationListRow {
  id: string;
  full_name: string;
  student_id: string;
  email: string;
  semester: string | null;
  batch: string | null;
  cgpa: number | null;
  completed_credit: number | null;
  position_name: string;
  status: string;
  created_at: string;
  assigned_name: string | null;
}

export async function listApplications(ctx: Ctx, input: { campaignId: string; status?: string; positionId?: string; q?: string; page?: number; mine?: boolean }) {
  requirePermission(ctx, "recruitment.manage");
  const mine = input.mine ? requireActor(ctx).user.id : null;
  const page = Math.max(1, Number(input.page) || 1);
  const q = input.q ? `%${String(input.q).replace(/[%_]/g, "").slice(0, 60)}%` : null;
  const status = APPLICATION_STATUSES.includes(input.status as never) ? input.status! : null;
  const rows = await ctx.db.all<ApplicationListRow>(
    `SELECT a.id, a.full_name, a.student_id, a.email, a.semester, a.batch, a.cgpa, a.completed_credit, p.name AS position_name, a.status, a.created_at,
            COALESCE(rp.full_name, ru.email) AS assigned_name
     FROM recruitment_applications a JOIN positions p ON p.id = a.position_id
     LEFT JOIN users ru ON ru.id = a.assigned_to LEFT JOIN profiles rp ON rp.user_id = a.assigned_to
     WHERE a.campaign_id = ?1 AND (?2 IS NULL OR a.status = ?2) AND (?3 IS NULL OR a.position_id = ?3)
       AND (?4 IS NULL OR a.full_name LIKE ?4 OR a.student_id LIKE ?4 OR a.email LIKE ?4) AND (?6 IS NULL OR a.assigned_to = ?6)
     ORDER BY p.rank, a.created_at LIMIT 50 OFFSET ?5`,
    String(input.campaignId), status, input.positionId || null, q, (page - 1) * 50, mine,
  );
  const counts = await ctx.db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM recruitment_applications WHERE campaign_id = ?1 GROUP BY status", String(input.campaignId));
  return { rows, page, hasMore: rows.length === 50, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number> };
}

export async function getApplication(ctx: Ctx, id: string) {
  const decision = requirePermission(ctx, "recruitment.manage");
  const a = await ctx.db.first<Record<string, unknown> & { cv_media_id: string | null; photo_media_id: string | null; id_card_media_id: string | null }>(
    `SELECT a.*, p.name AS position_name, c.title AS campaign_title, rv.email AS reviewer_email
     FROM recruitment_applications a JOIN positions p ON p.id = a.position_id JOIN recruitment_campaigns c ON c.id = a.campaign_id
     LEFT JOIN users rv ON rv.id = a.reviewed_by WHERE a.id = ?1`, id);
  if (!a) throw new NotFoundError("Application");
  const link = async (mid: string | null) => (mid ? signedMediaUrl(ctx, mid, 900) : null);
  const [cv, photo, idCard] = await Promise.all([link(a.cv_media_id), link(a.photo_media_id), link(a.id_card_media_id)]);
  // Opening an application reveals personal data: record who looked.
  await auditStmt(ctx, { action: "recruitment.view", resourceType: "recruitment_application", resourceId: id, decision }).run();
  const { ip_hash: _ip, ...application } = a;
  const [notes, reviewers] = await Promise.all([
    ctx.db.all<{ id: string; body: string; created_at: string; author: string | null; avatar_json: string | null }>(
      `SELECT n.id, n.body, n.created_at, COALESCE(p.full_name, u.email) AS author, ${avatarOfProfileSql("p")} AS avatar_json FROM recruitment_notes n
       LEFT JOIN users u ON u.id = n.author_id LEFT JOIN profiles p ON p.user_id = n.author_id AND p.deleted_at IS NULL WHERE n.application_id = ?1 ORDER BY n.created_at`, id).then((r) => withAvatars(r)),
    reviewerChoices(ctx),
  ]);
  return { application: application as Record<string, unknown>, documents: { cv, photo, idCard }, notes, reviewers };
}

/** People who may review applications: active holders of recruitment.manage. */
async function reviewerChoices(ctx: Ctx) {
  const ids = await usersWithPermission(ctx, "recruitment.manage");
  if (!ids.length) return [];
  return ctx.db.all<{ id: string; name: string }>(
    `SELECT u.id, COALESCE(p.full_name, u.email) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id IN (SELECT value FROM json_each(?1)) ORDER BY name`, JSON.stringify(ids));
}

/** Assign (or unassign) the reviewer of an application; they are told in the app. */
export async function assignReviewer(ctx: Ctx, id: string, reviewerId: string | null): Promise<{ message: string }> {
  const decision = requirePermission(ctx, "recruitment.manage");
  const app = await ctx.db.first<{ full_name: string; assigned_to: string | null }>("SELECT full_name, assigned_to FROM recruitment_applications WHERE id = ?1", id);
  if (!app) throw new NotFoundError("Application");
  if (reviewerId && !(await usersWithPermission(ctx, "recruitment.manage")).includes(reviewerId)) {
    throw new ValidationError("Choose someone who can review applications (they need recruitment rights).");
  }
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE recruitment_applications SET assigned_to = ?2, updated_at = ?3 WHERE id = ?1", id, reviewerId, now),
    auditStmt(ctx, { action: "recruitment.assign", resourceType: "recruitment_application", resourceId: id, before: { assignedTo: app.assigned_to }, after: { assignedTo: reviewerId }, decision }),
    ...(reviewerId ? notifyStmts(ctx, [reviewerId], { type: "recruitment.assigned", title: `Review ${app.full_name}'s application`.slice(0, 200), body: "You were asked to review it.", link: `/dashboard/recruitment/applications/${id}`, resourceType: "recruitment_application", resourceId: id }) : []),
  ]);
  return { message: reviewerId ? "Reviewer assigned." : "Reviewer removed." };
}

/** Add a note to an application's history (visible to reviewers only). */
export async function addApplicationNote(ctx: Ctx, id: string, body: string): Promise<void> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "recruitment.manage");
  const text = String(body ?? "").trim().slice(0, 2000);
  if (!text) throw new ValidationError("Write a note first.", { note: "Write a note first." });
  if (!(await ctx.db.first("SELECT id FROM recruitment_applications WHERE id = ?1", id))) throw new NotFoundError("Application");
  await ctx.db.batch([
    ctx.db.stmt("INSERT INTO recruitment_notes (id, application_id, author_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", newId("rnote"), id, actor.user.id, text, nowIso()),
    auditStmt(ctx, { action: "recruitment.note", resourceType: "recruitment_application", resourceId: id, decision }),
  ]);
}

export async function reviewApplication(ctx: Ctx, id: string, input: { status: string; note?: string | null; notify?: boolean }): Promise<{ message: string }> {
  const actor = requireActor(ctx);
  const decision = requirePermission(ctx, "recruitment.manage");
  if (!APPLICATION_STATUSES.includes(input.status as never)) throw new ValidationError("Unknown status.");
  const before = await ctx.db.first<{ status: string; email: string; full_name: string; campaign_title: string; position_name: string }>(
    `SELECT a.status, a.email, a.full_name, c.title AS campaign_title, p.name AS position_name FROM recruitment_applications a
     JOIN recruitment_campaigns c ON c.id = a.campaign_id JOIN positions p ON p.id = a.position_id WHERE a.id = ?1`, id);
  if (!before) throw new NotFoundError("Application");
  const note = input.note ? String(input.note).slice(0, 2000) : null;
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE recruitment_applications SET status = ?2, reviewer_note = COALESCE(?3, reviewer_note), reviewed_by = ?4, reviewed_at = ?5, updated_at = ?5 WHERE id = ?1",
      id, input.status, note, actor.user.id, now),
    ...(note ? [ctx.db.stmt("INSERT INTO recruitment_notes (id, application_id, author_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", newId("rnote"), id, actor.user.id, note, now)] : []),
    auditStmt(ctx, { action: "recruitment.review", resourceType: "recruitment_application", resourceId: id, before: { status: before.status }, after: { status: input.status }, decision }),
  ]);
  const email = decisionEmail(input.status, { fullName: before.full_name, campaignTitle: before.campaign_title, positionName: before.position_name });
  if (input.notify && email) {
    const sent = await deliverEmail(ctx, { to: before.email, ...email }, { type: "recruitment.status" });
    return { message: sent ? "Updated, and the applicant was emailed." : "Updated. The applicant was NOT emailed: email isn't available, so tell them another way." };
  }
  return { message: "Updated." };
}


export async function applicationsCsv(ctx: Ctx, campaignId: string): Promise<{ filename: string; csv: string }> {
  const decision = requirePermission(ctx, "recruitment.manage");
  await requireRecentAuth(ctx);
  const c = await ctx.db.first<{ title: string }>("SELECT title FROM recruitment_campaigns WHERE id = ?1", campaignId);
  if (!c) throw new NotFoundError("Recruitment");
  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT a.id, a.created_at, a.full_name, a.student_id, a.email, a.phone, a.gender, a.semester, a.batch, a.cgpa, a.completed_credit, p.name AS position,
            a.status, a.club_work, a.reviewer_note
     FROM recruitment_applications a JOIN positions p ON p.id = a.position_id WHERE a.campaign_id = ?1 ORDER BY p.rank, a.created_at`, campaignId);
  const head = ["Reference", "Submitted", "Name", "Student ID", "Email", "Phone", "Gender", "Semester", "Batch", "CGPA", "Credits", "Position", "Status", "Club work", "Reviewer note"];
  const lines = [head.map(csvCell).join(","), ...rows.map((r) => [String(r.id).slice(4, 12).toUpperCase(), r.created_at, r.full_name, r.student_id, r.email, r.phone, r.gender, r.semester, r.batch, r.cgpa, r.completed_credit, r.position, r.status, r.club_work, r.reviewer_note].map(csvCell).join(","))];
  await auditStmt(ctx, { action: "recruitment.export", resourceType: "recruitment_campaign", resourceId: campaignId, after: { rows: rows.length }, decision }).run();
  return { filename: `applications-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.csv`, csv: `﻿${lines.join("\r\n")}\r\n` };
}

export interface ImportOutcome {
  row: number;
  name: string;
  outcome: "add" | "duplicate" | "error";
  message: string | null;
}

/**
 * Applications from a spreadsheet (e.g. a Google Forms export), already mapped to fields in the
 * browser. Preview first; applying adds the valid, new rows in one statement and skips the rest.
 * Imported applications have no documents attached and are marked so in the activity log.
 */
export async function importApplications(ctx: Ctx, campaignId: string, rawRows: unknown, apply: boolean): Promise<{ rows: ImportOutcome[]; added: number; message: string }> {
  const decision = requirePermission(ctx, "recruitment.manage");
  const c = await ctx.db.first<CampaignRow>("SELECT * FROM recruitment_campaigns WHERE id = ?1", campaignId);
  if (!c) throw new NotFoundError("Recruitment");
  const list = Array.isArray(rawRows) ? rawRows.slice(0, MAX_APPLICATION_IMPORT + 1) : [];
  if (!list.length) throw new ValidationError("The file has no rows to import.");
  if (list.length > MAX_APPLICATION_IMPORT) throw new ValidationError(`Import at most ${MAX_APPLICATION_IMPORT} applications at a time.`);
  const positions = await ctx.db.all<{ id: string; key: string; name: string; aliases_json: string | null }>(
    "SELECT id, key, name, aliases_json FROM positions WHERE id IN (SELECT value FROM json_each(?1))", c.positions_json);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = (json: string | null): string[] => {
    try {
      // Stored as { aliases: [...] } (older rows: a plain list).
      const raw = json ? JSON.parse(json) : [];
      const a = Array.isArray(raw) ? raw : Array.isArray(raw?.aliases) ? raw.aliases : [];
      return a.filter((x: unknown): x is string => typeof x === "string");
    } catch {
      return [];
    }
  };
  const positionOf = (v: string) => positions.find((p) => [p.key, p.name, ...aliases(p.aliases_json)].some((n) => norm(n) === norm(v)));
  const existing = await ctx.db.all<{ student_id: string; email: string }>("SELECT student_id, lower(email) AS email FROM recruitment_applications WHERE campaign_id = ?1", campaignId);
  const seenIds = new Set(existing.map((e) => e.student_id));
  const seenEmails = new Set(existing.map((e) => e.email));
  const outcomes: ImportOutcome[] = [];
  const inserts: Array<Record<string, string | number | null>> = [];
  (list as Array<Record<string, unknown>>).forEach((r, i) => {
    const t = (k: string) => (typeof r?.[k] === "string" ? (r[k] as string).trim() : r?.[k] === undefined || r?.[k] === null ? "" : String(r[k]).trim());
    const name = t("fullName");
    const studentId = t("studentId").replace(/\s/g, "");
    const email = t("email").toLowerCase();
    const phone = t("phone").replace(/[\s-]/g, "");
    const position = positionOf(t("position"));
    const cgpaRaw = t("cgpa");
    const cgpa = cgpaRaw ? Number(cgpaRaw) : null;
    const creditRaw = t("completedCredit");
    const credit = creditRaw ? Number(creditRaw) : null;
    const gender = GENDERS.find((g) => norm(g) === norm(t("gender"))) ?? null;
    const semester = SEMESTERS.find((s2) => norm(s2) === norm(t("semester")) || norm(s2).startsWith(norm(t("semester")) || "-")) ?? null;
    const problem =
      name.length < 2 || name.length > 100 ? "Name is missing."
        : !STUDENT_ID_RE.test(studentId) ? "Student ID must be 9 digits."
          : !EMAIL_RE.test(email) ? "Email isn't valid."
            : !phone || phone.length > 20 ? "Mobile number is missing."
              : !position ? `Position "${t("position") || "(empty)"}" isn't open in this recruitment.`
                : cgpa !== null && !(Number.isFinite(cgpa) && cgpa >= 0 && cgpa <= 4) ? "CGPA must be between 0 and 4."
                  : credit !== null && !(Number.isInteger(credit) && credit >= 0 && credit <= 200) ? "Completed credits must be a whole number up to 200."
                    : null;
    if (problem) return outcomes.push({ row: i + 2, name: name || "(no name)", outcome: "error", message: problem });
    if (seenIds.has(studentId) || seenEmails.has(email)) return outcomes.push({ row: i + 2, name, outcome: "duplicate", message: "Already applied (same student ID or email)." });
    seenIds.add(studentId);
    seenEmails.add(email);
    outcomes.push({ row: i + 2, name, outcome: "add", message: null });
    inserts.push({ id: newId("rap"), full_name: name, student_id: studentId, email, phone, gender, semester, batch: t("batch").slice(0, 20) || null,
      cgpa: cgpa === null ? null : Math.round(cgpa * 100) / 100, completed_credit: credit, position_id: position!.id, club_work: t("clubWork").slice(0, 3000) || null });
  });
  const counts = { add: inserts.length, duplicate: outcomes.filter((o) => o.outcome === "duplicate").length, error: outcomes.filter((o) => o.outcome === "error").length };
  const summary = `${counts.add} to add, ${counts.duplicate} already there, ${counts.error} with problems.`;
  if (!apply) return { rows: outcomes, added: 0, message: summary };
  if (!inserts.length) throw new AppError(400, "NOTHING_TO_IMPORT", "No new valid applications in this file.");
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO recruitment_applications (id, campaign_id, full_name, student_id, email, phone, gender, semester, batch, cgpa, completed_credit, position_id, club_work, created_at, updated_at)
       SELECT json_extract(value, '$.id'), ?2, json_extract(value, '$.full_name'), json_extract(value, '$.student_id'), json_extract(value, '$.email'), json_extract(value, '$.phone'),
              json_extract(value, '$.gender'), json_extract(value, '$.semester'), json_extract(value, '$.batch'), json_extract(value, '$.cgpa'), json_extract(value, '$.completed_credit'),
              json_extract(value, '$.position_id'), json_extract(value, '$.club_work'), ?3, ?3
       FROM json_each(?1) WHERE true
       ON CONFLICT DO NOTHING`, JSON.stringify(inserts), campaignId, now),
    auditStmt(ctx, { action: "recruitment.import", resourceType: "recruitment_campaign", resourceId: campaignId, after: counts, reason: "Imported from a spreadsheet (no documents attached)", decision }),
  ]);
  return { rows: outcomes, added: counts.add, message: `Imported ${counts.add} application${counts.add === 1 ? "" : "s"}. ${counts.duplicate ? `${counts.duplicate} already there. ` : ""}${counts.error ? `${counts.error} skipped for problems.` : ""}`.trim() };
}
