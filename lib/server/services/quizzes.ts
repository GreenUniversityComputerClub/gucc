/**
 * GUCC Quiz Arena backend service: authoring, question banks, live session lifecycle,
 * student & guest registration, ticket issuance, authoritative finalization into D1,
 * certificate batch issuance, and incident reporting.
 *
 * Security invariants:
 * - Authorization checks run via authorize() / requirePermission() against quizResource()
 *   (never inspecting role or position names directly).
 * - Correct answers live in `quiz_questions.answer_key_json` and NEVER leave for non-hosts
 *   before a question reaches REVEAL or the session reaches FINALIZED.
 * - Live gameplay runs inside a per-session `QuizRoom` Durable Object (`ctx.quizRoom`);
 *   services degrade gracefully to D1 when `ctx.quizRoom` is absent (unit/integration tests).
 */
import { isAffiliateExecutive } from "../../governance/engine";
import { auditStmt } from "../audit";
import { authorize, can, quizResource, requireActor, requirePermission, scopesFor } from "../authz";
import type { Ctx } from "../context";
import { csvCell } from "../csv";
import { newId, nowIso, type D1StatementLike } from "../db";
import { sha256Hex, randomToken } from "../crypto";
import { AppError, AuthRequiredError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { limit } from "../limits";
import { notifyStmts } from "../notifications";
import { signQuizTicket } from "../quiz-live";
import { getSetting, getSettings, verifyTurnstile } from "../security";
import { batchTransition, staleAnswer, unchangedSince } from "../transition";
import { EMAIL_RE, STUDENT_ID_RE, Validator, toSlug } from "../validate";
import { registerApprovalHandler, startApproval } from "./approvals";
import { TAGS } from "./cache-tags";
import { issueBatch, MAX_PER_REQUEST } from "./certificates";
import { checkMemberCreate, checkMemberSubmit } from "./member-content";
import { mediaUrl, type MediaRow } from "../../public/shapes";
import {
  cleanScoringConfig,
  cleanThemeConfig,
  type QuizScoringConfig,
  type QuizThemeConfig,
  QUIZ_ACCESS_MODES,
  QUIZ_INCIDENT_KINDS,
  QUIZ_INCIDENT_STATUSES,
  QUIZ_PARTICIPANT_STATUSES,
  QUIZ_PARTICIPANT_TYPES,
  QUIZ_QUESTION_KINDS,
  QUIZ_SCORING_MODES,
  QUIZ_SESSION_MODES,
  QUIZ_THEME_PRESETS,
  QUIZ_VISIBILITIES,
  rankParticipants,
  type QuizOption,
  type QuizParticipantStatus,
  type QuizQuestionKind,
  type QuizRoomInitPayload,
  type QuizScoringMode,
  type QuizSessionStatus,
  type QuizStateSnapshot,
  type QuizThemePreset,
} from "../../quiz/types";

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newJoinCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += JOIN_ALPHABET[bytes[i]! % JOIN_ALPHABET.length]!;
  return out;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseQuizInput(input: Record<string, unknown>) {
  const v = new Validator(input);
  const title = v.string("title", { required: true, min: 3, max: 150, label: "Title" });
  const slug = v.string("slug", {
    max: 120,
    label: "Slug",
    pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    patternMessage: "Use lowercase letters, digits and hyphens.",
  });
  const description = v.string("description", { max: 4000, label: "Description" });
  const topic = v.string("topic", { max: 60, label: "Topic" });
  const visibility = v.oneOf("visibility", QUIZ_VISIBILITIES, { label: "Visibility" }) ?? "PUBLIC";
  const accessMode = v.oneOf("accessMode", QUIZ_ACCESS_MODES, { label: "Access mode" }) ?? "GUEST";
  const scoringMode = (v.oneOf("scoringMode", QUIZ_SCORING_MODES, { label: "Scoring mode" }) ?? "SPEED_BONUS") as QuizScoringMode;
  const themePreset = (v.oneOf("themePreset", QUIZ_THEME_PRESETS, { label: "Theme preset" }) ?? "CYBER_ARENA") as QuizThemePreset;
  const defaultTimeLimitSec = v.int("defaultTimeLimitSec", { min: 5, max: 300, label: "Default timer" }) ?? 20;
  const eventId = v.string("eventId", { max: 80, label: "Event" });
  const committeeId = v.string("committeeId", { max: 80, label: "Committee" });
  const bannerMediaId = v.string("bannerMediaId", { max: 80, label: "Banner" });
  const logoMediaId = v.string("logoMediaId", { max: 80, label: "Logo" });
  v.done();

  const rawTheme = typeof input.themeConfig === "string" ? safeParseJson(input.themeConfig, {}) : input.themeConfig;
  const rawScoring = typeof input.scoringConfig === "string" ? safeParseJson(input.scoringConfig, {}) : input.scoringConfig;
  const themeConfig = cleanThemeConfig(themePreset, rawTheme);
  const scoringConfig = cleanScoringConfig(rawScoring, scoringMode);

  return {
    title: title!,
    slug,
    description,
    topic,
    visibility,
    accessMode,
    scoringMode,
    scoringConfig,
    themePreset,
    themeConfig,
    defaultTimeLimitSec,
    shuffleQuestions: v.bool("shuffleQuestions"),
    shuffleOptions: v.bool("shuffleOptions"),
    eventId,
    committeeId,
    bannerMediaId,
    logoMediaId,
  };
}

// ───────────────────────────── Admin & Authoring ─────────────────────────────

export async function listQuizzesAdmin(ctx: Ctx, filters: { status?: string; q?: string; page?: number } = {}) {
  const actor = requireActor(ctx);
  requirePermission(ctx, "quizzes.read");
  const scopes = scopesFor(ctx, "quizzes.read");
  const wide = scopes.some((s) => s.scope === "ALL");
  const conds = ["q.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (!wide) {
    params.push(actor.user.id);
    conds.push(`(q.created_by = ?${params.length} OR EXISTS (SELECT 1 FROM quiz_moderators qm WHERE qm.quiz_id = q.id AND qm.user_id = ?${params.length}))`);
  }
  if (filters.status && ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"].includes(filters.status)) {
    params.push(filters.status);
    conds.push(`q.status = ?${params.length}`);
  }
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim().slice(0, 80)}%`);
    conds.push(`(q.title LIKE ?${params.length} OR q.slug LIKE ?${params.length})`);
  }
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * 30;
  params.push(30, offset);
  const rows = await ctx.db.all<Record<string, unknown>>(
    `SELECT q.id, q.slug, q.title, q.topic, q.visibility, q.access_mode, q.scoring_mode, q.theme_preset, q.status,
            q.published_at, q.created_at, q.updated_at,
            (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.deleted_at IS NULL) AS question_count,
            (SELECT COUNT(*) FROM quiz_sessions qs WHERE qs.quiz_id = q.id) AS session_count
     FROM quizzes q WHERE ${conds.join(" AND ")} ORDER BY q.updated_at DESC LIMIT ?${params.length - 1} OFFSET ?${params.length}`,
    ...(params as never[]),
  );
  return { rows, page };
}

export async function getQuizAdmin(ctx: Ctx, id: string) {
  requireActor(ctx);
  const resource = await quizResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Quiz");
  requirePermission(ctx, "quizzes.read", resource);

  const [quiz, questions, moderators, sessions, incidents] = await Promise.all([
    ctx.db.first<Record<string, unknown>>("SELECT * FROM quizzes WHERE id = ?1 AND deleted_at IS NULL", id),
    ctx.db.all<Record<string, unknown>>(
      `SELECT qq.*, m.storage, m.object_key, m.legacy_path, m.external_url, m.variants_json
       FROM quiz_questions qq LEFT JOIN media m ON m.id = qq.media_id AND m.deleted_at IS NULL
       WHERE qq.quiz_id = ?1 AND qq.deleted_at IS NULL ORDER BY qq.sort_order`,
      id,
    ),
    ctx.db.all<{ user_id: string; can_edit: number; can_host: number; name: string | null; email: string }>(
      `SELECT qm.user_id, qm.can_edit, qm.can_host, p.full_name AS name, u.email
       FROM quiz_moderators qm JOIN users u ON u.id = qm.user_id
       LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
       WHERE qm.quiz_id = ?1 ORDER BY qm.created_at`,
      id,
    ),
    ctx.db.all<Record<string, unknown>>(
      "SELECT * FROM quiz_sessions WHERE quiz_id = ?1 ORDER BY created_at DESC LIMIT 30",
      id,
    ),
    ctx.db.all<Record<string, unknown>>(
      `SELECT qi.*, qs.join_code, qp.display_name AS participant_name
       FROM quiz_incidents qi JOIN quiz_sessions qs ON qs.id = qi.session_id
       LEFT JOIN quiz_participants qp ON qp.id = qi.participant_id
       WHERE qs.quiz_id = ?1 ORDER BY CASE WHEN qi.status = 'OPEN' THEN 0 ELSE 1 END, qi.created_at DESC LIMIT 50`,
      id,
    ),
  ]);
  if (!quiz) throw new NotFoundError("Quiz");

  const [bannerRow, logoRow] = await Promise.all([
    quiz.banner_media_id
      ? ctx.db.first<MediaRow>("SELECT id, storage, object_key, legacy_path, external_url, variants_json FROM media WHERE id = ?1 AND deleted_at IS NULL", String(quiz.banner_media_id))
      : null,
    quiz.logo_media_id
      ? ctx.db.first<MediaRow>("SELECT id, storage, object_key, legacy_path, external_url, variants_json FROM media WHERE id = ?1 AND deleted_at IS NULL", String(quiz.logo_media_id))
      : null,
  ]);
  const pubDecision = authorize(ctx, "quizzes.publish", resource);

  return {
    quiz: {
      ...quiz,
      bannerUrl: mediaUrl(bannerRow, "lg") ?? null,
      logoUrl: mediaUrl(logoRow, "sm") ?? null,
      themeConfig: cleanThemeConfig((quiz.theme_preset as QuizThemePreset) ?? "CYBER_ARENA", safeParseJson(quiz.theme_config_json as string | null, {})),
      scoringConfig: cleanScoringConfig(safeParseJson(quiz.scoring_config_json as string | null, {}), quiz.scoring_mode as QuizScoringMode),
    } as Record<string, unknown> & {
      bannerUrl: string | null;
      logoUrl: string | null;
      themeConfig: QuizThemeConfig;
      scoringConfig: QuizScoringConfig;
    },
    questions: questions.map((q) => ({
      id: String(q.id),
      sortOrder: Number(q.sort_order),
      kind: q.kind as QuizQuestionKind,
      promptMarkdown: String(q.prompt_markdown),
      mediaId: (q.media_id as string | null) ?? null,
      mediaUrl: q.media_id && q.storage ? mediaUrl(q as unknown as MediaRow, "lg") ?? null : null,
      options: safeParseJson<QuizOption[]>(q.options_json as string, []),
      answerKey: safeParseJson<string[]>(q.answer_key_json as string, []),
      explanationMarkdown: (q.explanation_markdown as string | null) ?? null,
      timeLimitSec: q.time_limit_sec === null ? null : Number(q.time_limit_sec),
      points: Number(q.points),
      negativePoints: Number(q.negative_points),
    })),
    moderators: moderators.map((m) => ({
      userId: m.user_id,
      canEdit: m.can_edit === 1,
      canHost: m.can_host === 1,
      name: m.name,
      email: m.email,
    })),
    sessions,
    incidents,
    capabilities: {
      edit: can(ctx, "quizzes.update", resource),
      publish: can(ctx, "quizzes.publish", resource),
      publishOutcome: pubDecision.outcome,
      publishExplanation: pubDecision.summary,
      host: can(ctx, "quizzes.host", resource),
      delete: can(ctx, "quizzes.delete", resource),
      moderate: can(ctx, "quizzes.moderate", resource),
    },
  };
}

export async function getQuizFormOptions(ctx: Ctx) {
  requireActor(ctx);
  if (!can(ctx, "quizzes.read") && !can(ctx, "quizzes.create")) requirePermission(ctx, "quizzes.read");
  const [events, committees] = await Promise.all([
    ctx.db.all<{ id: string; title: string; start_at: string | null }>(
      "SELECT id, title, start_at FROM events WHERE deleted_at IS NULL ORDER BY COALESCE(start_at, created_at) DESC LIMIT 100",
    ),
    ctx.db.all<{ id: string; name: string; term_label: string; status: string }>(
      "SELECT id, name, term_label, status FROM committees WHERE deleted_at IS NULL ORDER BY slug DESC LIMIT 40",
    ),
  ]);
  return { events, committees };
}

export async function createQuiz(ctx: Ctx, input: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const actor = requireActor(ctx);
  const d = parseQuizInput(input);
  const decision = requirePermission(ctx, "quizzes.create", {
    type: "quiz",
    category: d.topic,
    createdBy: actor.user.id,
    ownerId: actor.user.id,
    committeeId: d.committeeId,
    eventId: d.eventId,
  });
  await checkMemberCreate(ctx, "event");

  const slug = d.slug || toSlug(d.title) || `quiz-${newId().slice(0, 8)}`;
  if (await ctx.db.first("SELECT id FROM quizzes WHERE slug = ?1", slug)) {
    throw new ValidationError("That URL is taken.", { slug: "Another quiz already uses this URL." });
  }
  const id = newId("qiz");
  const now = nowIso();
  const refs: D1StatementLike[] = [];
  if (d.bannerMediaId) refs.push(ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'quiz', ?2, 'banner') ON CONFLICT DO NOTHING", d.bannerMediaId, id));
  if (d.logoMediaId) refs.push(ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'quiz', ?2, 'logo') ON CONFLICT DO NOTHING", d.logoMediaId, id));

  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO quizzes (id, slug, title, description, topic, visibility, access_mode, event_id, committee_id, banner_media_id, logo_media_id,
                            theme_preset, theme_config_json, scoring_mode, scoring_config_json, default_time_limit_sec, shuffle_questions, shuffle_options,
                            status, created_at, created_by, updated_at, updated_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 'DRAFT', ?19, ?20, ?19, ?20)`,
      id, slug, d.title, d.description, d.topic, d.visibility, d.accessMode, d.eventId, d.committeeId, d.bannerMediaId, d.logoMediaId,
      d.themePreset, JSON.stringify(d.themeConfig), d.scoringMode, JSON.stringify(d.scoringConfig), d.defaultTimeLimitSec,
      d.shuffleQuestions ? 1 : 0, d.shuffleOptions ? 1 : 0, now, actor.user.id,
    ),
    ...refs,
    auditStmt(ctx, { action: "quiz.create", resourceType: "quiz", resourceId: id, after: { slug, title: d.title }, decision }),
  ]);
  return { id, slug };
}

export async function updateQuiz(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.update", resource);
  const before = await ctx.db.first<{ slug: string; title: string; status: string }>("SELECT slug, title, status FROM quizzes WHERE id = ?1", id);
  const d = parseQuizInput(input);
  const slug = d.slug ?? before!.slug;
  if (slug !== before!.slug && (await ctx.db.first("SELECT id FROM quizzes WHERE slug = ?1 AND id <> ?2", slug, id))) {
    throw new ValidationError("That URL is taken.", { slug: "Another quiz already uses this URL." });
  }
  const now = nowIso();
  const fresh = await unchangedSince(ctx, "quizzes", id, input.expectedUpdatedAt);
  const refs: D1StatementLike[] = [
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'quiz' AND resource_id = ?1", id),
  ];
  if (d.bannerMediaId) refs.push(ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'quiz', ?2, 'banner') ON CONFLICT DO NOTHING", d.bannerMediaId, id));
  if (d.logoMediaId) refs.push(ctx.db.stmt("INSERT INTO media_references (media_id, resource_type, resource_id, field) VALUES (?1, 'quiz', ?2, 'logo') ON CONFLICT DO NOTHING", d.logoMediaId, id));

  await batchTransition(
    ctx,
    [
      ...fresh,
      ctx.db.stmt(
        `UPDATE quizzes SET slug = ?2, title = ?3, description = ?4, topic = ?5, visibility = ?6, access_mode = ?7,
                            event_id = ?8, committee_id = COALESCE(?9, committee_id), banner_media_id = ?10, logo_media_id = ?11,
                            theme_preset = ?12, theme_config_json = ?13, scoring_mode = ?14, scoring_config_json = ?15,
                            default_time_limit_sec = ?16, shuffle_questions = ?17, shuffle_options = ?18,
                            status = CASE WHEN status = 'PENDING_APPROVAL' THEN 'DRAFT' ELSE status END,
                            updated_at = ?19, updated_by = ?20
         WHERE id = ?1`,
        id, slug, d.title, d.description, d.topic, d.visibility, d.accessMode, d.eventId, d.committeeId, d.bannerMediaId, d.logoMediaId,
        d.themePreset, JSON.stringify(d.themeConfig), d.scoringMode, JSON.stringify(d.scoringConfig), d.defaultTimeLimitSec,
        d.shuffleQuestions ? 1 : 0, d.shuffleOptions ? 1 : 0, now, actor.user.id,
      ),
      ctx.db.stmt("UPDATE approval_requests SET status = 'CANCELLED', resolved_at = ?2, resolution_note = 'Edited after submission', updated_at = ?2 WHERE resource_type = 'quiz' AND resource_id = ?1 AND status = 'PENDING'", id, now),
      ...refs,
      auditStmt(ctx, { action: "quiz.update", resourceType: "quiz", resourceId: id, before, after: { slug, title: d.title }, decision }),
    ],
    () => staleAnswer(ctx, "quizzes", id),
  );
  ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(before!.slug), TAGS.quiz(slug)]);
}

interface NormalizedQuestionRow {
  id: string;
  sortOrder: number;
  kind: QuizQuestionKind;
  promptMarkdown: string;
  mediaId: string | null;
  options: QuizOption[];
  answerKey: string[];
  explanationMarkdown: string | null;
  timeLimitSec: number | null;
  points: number;
  negativePoints: number;
}

export async function saveQuizQuestions(ctx: Ctx, quizId: string, rawQuestions: unknown): Promise<{ count: number }> {
  requireActor(ctx);
  const resource = await quizResource(ctx.db, quizId);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.update", resource);
  if (!Array.isArray(rawQuestions)) throw new ValidationError("Questions must be an array.");
  if (rawQuestions.length > 100) throw new ValidationError("A quiz may contain at most 100 questions.");

  const errors: Record<string, string> = {};
  const cleaned: NormalizedQuestionRow[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = (rawQuestions[i] && typeof rawQuestions[i] === "object" ? rawQuestions[i] : {}) as Record<string, unknown>;
    const kind = QUIZ_QUESTION_KINDS.includes(q.kind as QuizQuestionKind) ? (q.kind as QuizQuestionKind) : "MCQ";
    const promptMarkdown = typeof q.promptMarkdown === "string" ? q.promptMarkdown.trim() : "";
    if (!promptMarkdown || promptMarkdown.length > 2000) {
      errors[`q_${i}_prompt`] = `Question ${i + 1}: prompt must be 1–2000 characters.`;
      continue;
    }

    const rawOpts = Array.isArray(q.options) ? q.options : [];
    const options: QuizOption[] = [];
    const seenOpt = new Set<string>();
    for (let j = 0; j < Math.min(rawOpts.length, 6); j++) {
      const o = (rawOpts[j] && typeof rawOpts[j] === "object" ? rawOpts[j] : {}) as Record<string, unknown>;
      const optId = typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 32) : `opt_${j + 1}`;
      const text = typeof o.text === "string" ? o.text.trim().slice(0, 400) : "";
      if (!text || seenOpt.has(optId)) continue;
      seenOpt.add(optId);
      options.push({
        id: optId,
        text,
        mediaId: typeof o.mediaId === "string" && o.mediaId.trim() ? o.mediaId.trim().slice(0, 80) : null,
      });
    }
    if (options.length < 2) {
      errors[`q_${i}_options`] = `Question ${i + 1}: provide at least 2 non-empty options.`;
      continue;
    }
    if (kind === "TRUE_FALSE" && options.length !== 2) {
      errors[`q_${i}_options`] = `Question ${i + 1}: True/False questions must have exactly 2 options.`;
      continue;
    }

    const optIds = new Set(options.map((o) => o.id));
    const answerKey = [...new Set((Array.isArray(q.answerKey) ? q.answerKey : []).map((a) => String(a).trim()).filter((a) => optIds.has(a)))];
    if (!answerKey.length) {
      errors[`q_${i}_answerKey`] = `Question ${i + 1}: choose at least one correct option.`;
      continue;
    }
    if ((kind === "MCQ" || kind === "TRUE_FALSE") && answerKey.length !== 1) {
      errors[`q_${i}_answerKey`] = `Question ${i + 1}: single-choice questions must have exactly 1 correct answer.`;
      continue;
    }

    const points = q.points === undefined || q.points === null || q.points === "" ? 1000 : Number(q.points);
    const negativePoints = q.negativePoints === undefined || q.negativePoints === null || q.negativePoints === "" ? 0 : Number(q.negativePoints);
    const timeLimitSec = q.timeLimitSec === undefined || q.timeLimitSec === null || q.timeLimitSec === "" ? null : Number(q.timeLimitSec);
    if (!Number.isInteger(points) || points < 0 || points > 10_000) errors[`q_${i}_points`] = `Question ${i + 1}: points must be 0–10000.`;
    if (!Number.isInteger(negativePoints) || negativePoints < 0 || negativePoints > 10_000) errors[`q_${i}_neg`] = `Question ${i + 1}: penalty must be 0–10000.`;
    if (timeLimitSec !== null && (!Number.isInteger(timeLimitSec) || timeLimitSec < 5 || timeLimitSec > 300)) {
      errors[`q_${i}_time`] = `Question ${i + 1}: timer must be 5–300 seconds.`;
    }

    cleaned.push({
      id: typeof q.id === "string" && /^qq_[a-zA-Z0-9_-]{6,64}$/.test(q.id) ? q.id : newId("qq"),
      sortOrder: i + 1,
      kind,
      promptMarkdown,
      mediaId: typeof q.mediaId === "string" && q.mediaId.trim() ? q.mediaId.trim().slice(0, 80) : null,
      options,
      answerKey,
      explanationMarkdown: typeof q.explanationMarkdown === "string" && q.explanationMarkdown.trim() ? q.explanationMarkdown.trim().slice(0, 2000) : null,
      timeLimitSec,
      points,
      negativePoints,
    });
  }
  if (Object.keys(errors).length) throw new ValidationError("Please fix the highlighted questions.", errors);

  const now = nowIso();
  const payload = cleaned.map((q) => ({
    id: q.id,
    sortOrder: q.sortOrder,
    kind: q.kind,
    promptMarkdown: q.promptMarkdown,
    mediaId: q.mediaId,
    optionsJson: JSON.stringify(q.options),
    answerKeyJson: JSON.stringify(q.answerKey),
    explanationMarkdown: q.explanationMarkdown,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    negativePoints: q.negativePoints,
  }));
  const mediaRefs = cleaned.filter((q) => q.mediaId).map((q) => ({ mid: q.mediaId!, qid: q.id }));

  await ctx.db.batch([
    ctx.db.stmt(
      "UPDATE quiz_questions SET deleted_at = ?2, updated_at = ?2 WHERE quiz_id = ?1 AND deleted_at IS NULL AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?3))",
      quizId,
      now,
      JSON.stringify(payload.map((p) => ({ id: p.id }))),
    ),
    ...(payload.length
      ? [
          ctx.db.stmt(
            `INSERT INTO quiz_questions (id, quiz_id, sort_order, kind, prompt_markdown, media_id, options_json, answer_key_json,
                                         explanation_markdown, time_limit_sec, points, negative_points, created_at, updated_at, deleted_at)
             SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.sortOrder'), json_extract(j.value, '$.kind'),
                    json_extract(j.value, '$.promptMarkdown'), json_extract(j.value, '$.mediaId'), json_extract(j.value, '$.optionsJson'),
                    json_extract(j.value, '$.answerKeyJson'), json_extract(j.value, '$.explanationMarkdown'), json_extract(j.value, '$.timeLimitSec'),
                    json_extract(j.value, '$.points'), json_extract(j.value, '$.negativePoints'), ?3, ?3, NULL
             FROM json_each(?2) AS j WHERE true
             ON CONFLICT(id) DO UPDATE SET
               sort_order = excluded.sort_order, kind = excluded.kind, prompt_markdown = excluded.prompt_markdown,
               media_id = excluded.media_id, options_json = excluded.options_json, answer_key_json = excluded.answer_key_json,
               explanation_markdown = excluded.explanation_markdown, time_limit_sec = excluded.time_limit_sec,
               points = excluded.points, negative_points = excluded.negative_points, updated_at = excluded.updated_at, deleted_at = NULL
             WHERE quiz_questions.quiz_id = ?1`,
            quizId,
            JSON.stringify(payload),
            now,
          ),
        ]
      : []),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'quiz_question' AND resource_id IN (SELECT id FROM quiz_questions WHERE quiz_id = ?1)", quizId),
    ...(mediaRefs.length
      ? [
          ctx.db.stmt(
            `INSERT INTO media_references (media_id, resource_type, resource_id, field)
             SELECT json_extract(j.value, '$.mid'), 'quiz_question', json_extract(j.value, '$.qid'), 'image'
             FROM json_each(?1) AS j WHERE true ON CONFLICT DO NOTHING`,
            JSON.stringify(mediaRefs),
          ),
        ]
      : []),
    auditStmt(ctx, { action: "quiz.questions_save", resourceType: "quiz", resourceId: quizId, after: { count: cleaned.length }, decision }),
  ]);

  const slug = await ctx.db.value<string>("SELECT slug FROM quizzes WHERE id = ?1", quizId);
  if (slug) ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(slug)]);
  return { count: cleaned.length };
}

export async function setQuizModerators(
  ctx: Ctx,
  quizId: string,
  entries: Array<{ userId: string; canEdit?: boolean; canHost?: boolean }>,
): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, quizId);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.update", resource);
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.userId === "string" && e.userId.trim())
    .slice(0, 30)
    .map((e) => ({ userId: e.userId.trim().slice(0, 80), canEdit: e.canEdit ? 1 : 0, canHost: e.canHost !== false ? 1 : 0 }));
  const now = nowIso();

  await ctx.db.batch([
    ctx.db.stmt("DELETE FROM quiz_moderators WHERE quiz_id = ?1", quizId),
    ...(list.length
      ? [
          ctx.db.stmt(
            `INSERT INTO quiz_moderators (quiz_id, user_id, can_edit, can_host, assigned_by, created_at)
             SELECT ?1, u.id, json_extract(j.value, '$.canEdit'), json_extract(j.value, '$.canHost'), ?3, ?4
             FROM json_each(?2) AS j JOIN users u ON u.id = json_extract(j.value, '$.userId') AND u.deleted_at IS NULL
             ON CONFLICT(quiz_id, user_id) DO UPDATE SET can_edit = excluded.can_edit, can_host = excluded.can_host`,
            quizId,
            JSON.stringify(list),
            actor.user.id,
            now,
          ),
        ]
      : []),
    auditStmt(ctx, { action: "quiz.moderators_set", resourceType: "quiz", resourceId: quizId, after: { count: list.length }, decision }),
  ]);
}

export async function publishQuiz(ctx: Ctx, id: string): Promise<{ outcome: string; requestId?: string; message: string }> {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Quiz");
  const q = await ctx.db.first<{ slug: string; title: string; status: string }>("SELECT slug, title, status FROM quizzes WHERE id = ?1", id);
  if (q!.status === "PUBLISHED") throw new AppError(409, "ALREADY_PUBLISHED", "This quiz is already published.");
  const qCount = (await ctx.db.value<number>("SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL", id)) ?? 0;
  if (qCount < 1) throw new ValidationError("Add at least one question before publishing.");

  const decision = authorize(ctx, "quizzes.publish", resource);
  if (decision.outcome === "ALLOW") {
    const now = nowIso();
    await ctx.db.batch([
      ctx.db.stmt("UPDATE quizzes SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?2), updated_at = ?2, updated_by = ?3 WHERE id = ?1 AND deleted_at IS NULL", id, now, actor.user.id),
      auditStmt(ctx, { action: "quiz.publish", resourceType: "quiz", resourceId: id, decision }),
    ]);
    ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(q!.slug)]);
    return { outcome: "PUBLISHED", message: "Published." };
  }

  let policyKey: string | undefined;
  if (decision.outcome === "REQUIRE_APPROVAL") policyKey = decision.approvalPolicyKey;
  else if (authorize(ctx, "quizzes.update", resource).outcome === "ALLOW") {
    await checkMemberSubmit(ctx, "event");
    policyKey = isAffiliateExecutive(actor.subject)
      ? await getSetting(ctx, "content.affiliate_approval_policy", "president-or-gs")
      : await getSetting(ctx, "content.default_approval_policy", "leadership-any");
  } else {
    throw new ForbiddenError(decision.summary, decision);
  }

  const { requestId } = await startApproval(ctx, {
    policyKey: policyKey!,
    ruleId: decision.approvalRuleId ?? null,
    resourceType: "quiz",
    resourceId: id,
    action: "quizzes.publish",
    title: `Publish quiz: ${q!.title}`,
    alongside: [ctx.db.stmt("UPDATE quizzes SET status = 'PENDING_APPROVAL', updated_at = ?2 WHERE id = ?1", id, nowIso())],
  });
  return { outcome: "PENDING_APPROVAL", requestId, message: "Sent for approval." };
}

registerApprovalHandler("quizzes.publish", {
  async onApproved(ctx, req) {
    const now = nowIso();
    return [
      ctx.db.stmt("UPDATE quizzes SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?2), updated_at = ?2 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", req.resource_id, now),
      auditStmt(ctx, { action: "quiz.publish", resourceType: "quiz", resourceId: req.resource_id, reason: `Approved (request ${req.id})` }),
    ];
  },
  async onRejected(ctx, req) {
    return [ctx.db.stmt("UPDATE quizzes SET status = 'DRAFT', updated_at = ?2 WHERE id = ?1 AND status = 'PENDING_APPROVAL'", req.resource_id, nowIso())];
  },
  tags: () => [TAGS.quizzes],
});

export async function archiveQuiz(ctx: Ctx, id: string, status: "DRAFT" | "ARCHIVED"): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, status === "ARCHIVED" ? "quizzes.publish" : "quizzes.update", resource);
  const slug = await ctx.db.value<string>("SELECT slug FROM quizzes WHERE id = ?1", id);
  await ctx.db.batch([
    ctx.db.stmt("UPDATE quizzes SET status = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1 AND deleted_at IS NULL", id, status, nowIso(), actor.user.id),
    auditStmt(ctx, { action: `quiz.set_status_${status.toLowerCase()}`, resourceType: "quiz", resourceId: id, decision }),
  ]);
  if (slug) ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(slug)]);
}

export async function deleteQuiz(ctx: Ctx, id: string): Promise<void> {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, id);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.delete", resource);
  const slug = await ctx.db.value<string>("SELECT slug FROM quizzes WHERE id = ?1", id);
  const now = nowIso();
  await ctx.db.batch([
    ctx.db.stmt("UPDATE quizzes SET deleted_at = ?2, status = 'ARCHIVED', updated_at = ?2, updated_by = ?3 WHERE id = ?1", id, now, actor.user.id),
    ctx.db.stmt("UPDATE quiz_sessions SET status = 'CANCELLED', updated_at = ?2 WHERE quiz_id = ?1 AND status IN ('LOBBY','QUESTION','REVEAL','PAUSED')", id, now),
    ctx.db.stmt("DELETE FROM media_references WHERE resource_type = 'quiz' AND resource_id = ?1", id),
    auditStmt(ctx, { action: "quiz.delete", resourceType: "quiz", resourceId: id, decision }),
  ]);
  if (slug) ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(slug)]);
}

// ───────────────────────────── Session Creation & DO Sync ─────────────────────────────

export async function createQuizSession(ctx: Ctx, quizId: string, input: Record<string, unknown> = {}) {
  const actor = requireActor(ctx);
  const resource = await quizResource(ctx.db, quizId);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.host", resource);

  const q = await ctx.db.first<{ slug: string; status: string; event_id: string | null }>("SELECT slug, status, event_id FROM quizzes WHERE id = ?1 AND deleted_at IS NULL", quizId);
  if (!q || q.status !== "PUBLISHED") throw new AppError(409, "NOT_PUBLISHED", "Publish the quiz before creating a session.");
  const qCount = (await ctx.db.value<number>("SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL", quizId)) ?? 0;
  if (qCount < 1) throw new ValidationError("Add at least one question before creating a session.");

  const v = new Validator(input);
  const mode = v.oneOf("mode", QUIZ_SESSION_MODES, { label: "Mode" }) ?? "LIVE_HOSTED";
  const defaultCap = Number(await getSetting(ctx, "quiz.max_participants_default", 600)) || 600;
  const maxParticipants = v.int("maxParticipants", { min: 2, max: 2000, label: "Capacity" }) ?? Math.min(2000, Math.max(2, defaultCap));
  const registrationOpensAt = v.datetime("registrationOpensAt", { label: "Registration opens" });
  const registrationClosesAt = v.datetime("registrationClosesAt", { label: "Registration closes" });
  const scheduledStartAt = v.datetime("scheduledStartAt", { label: "Scheduled start" });
  const resultsPublished = input.resultsPublished === undefined ? true : v.bool("resultsPublished");
  if (registrationOpensAt && registrationClosesAt) v.check(registrationClosesAt > registrationOpensAt, "registrationClosesAt", "Registration must close after it opens.");
  v.done();

  let joinCode = newJoinCode(6);
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await ctx.db.first("SELECT 1 FROM quiz_sessions WHERE join_code = ?1", joinCode);
    if (!taken) break;
    joinCode = newJoinCode(attempt >= 2 ? 7 : 6);
  }
  const sessionId = newId("qses");
  const now = nowIso();

  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO quiz_sessions (id, quiz_id, event_id, host_user_id, join_code, mode, status, max_participants,
                                  registration_opens_at, registration_closes_at, scheduled_start_at, results_published, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'LOBBY', ?7, ?8, ?9, ?10, ?11, ?12, ?12)`,
      sessionId, quizId, q.event_id, actor.user.id, joinCode, mode, maxParticipants,
      registrationOpensAt, registrationClosesAt, scheduledStartAt, resultsPublished ? 1 : 0, now,
    ),
    auditStmt(ctx, { action: "quiz.session_create", resourceType: "quiz_session", resourceId: sessionId, after: { quizId, joinCode, maxParticipants }, decision }),
  ]);
  ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(q.slug)]);
  return { sessionId, joinCode, status: "LOBBY" as const };
}

async function buildRoomInitPayload(ctx: Ctx, sessionId: string): Promise<QuizRoomInitPayload> {
  const s = await ctx.db.first<{
    id: string;
    quiz_id: string;
    join_code: string;
    title: string;
    scoring_mode: QuizScoringMode;
    scoring_config_json: string | null;
    default_time_limit_sec: number;
    max_participants: number;
    status: QuizSessionStatus;
  }>(
    `SELECT qs.id, qs.quiz_id, qs.join_code, q.title, q.scoring_mode, q.scoring_config_json, q.default_time_limit_sec, qs.max_participants, qs.status
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id WHERE qs.id = ?1`,
    sessionId,
  );
  if (!s) throw new NotFoundError("Quiz session");
  const [questions, participants] = await Promise.all([
    ctx.db.all<{
      id: string;
      sort_order: number;
      kind: QuizQuestionKind;
      prompt_markdown: string;
      options_json: string;
      answer_key_json: string;
      explanation_markdown: string | null;
      time_limit_sec: number | null;
      points: number;
      negative_points: number;
      m_id: string | null;
      m_storage: MediaRow["storage"] | null;
      m_key: string | null;
      m_legacy: string | null;
      m_ext: string | null;
      m_var: string | null;
    }>(
      `SELECT qq.id, qq.sort_order, qq.kind, qq.prompt_markdown, qq.options_json, qq.answer_key_json, qq.explanation_markdown,
              qq.time_limit_sec, qq.points, qq.negative_points,
              m.id AS m_id, m.storage AS m_storage, m.object_key AS m_key, m.legacy_path AS m_legacy, m.external_url AS m_ext, m.variants_json AS m_var
       FROM quiz_questions qq LEFT JOIN media m ON m.id = qq.media_id AND m.deleted_at IS NULL AND m.visibility = 'PUBLIC'
       WHERE qq.quiz_id = ?1 AND qq.deleted_at IS NULL ORDER BY qq.sort_order`,
      s.quiz_id,
    ),
    ctx.db.all<{ id: string; display_name: string; participant_type: "STUDENT" | "GUEST"; status: QuizParticipantStatus }>(
      "SELECT id, display_name, participant_type, status FROM quiz_participants WHERE session_id = ?1",
      sessionId,
    ),
  ]);
  const scoringConfig = cleanScoringConfig(safeParseJson(s.scoring_config_json, {}), s.scoring_mode);
  return {
    sessionId: s.id,
    quizId: s.quiz_id,
    joinCode: s.join_code,
    title: s.title,
    scoringMode: s.scoring_mode,
    scoringConfig,
    defaultTimeLimitSec: s.default_time_limit_sec,
    maxParticipants: s.max_participants,
    status: s.status,
    questions: questions.map((q) => ({
      id: q.id,
      sortOrder: q.sort_order,
      kind: q.kind,
      promptMarkdown: q.prompt_markdown,
      mediaUrl: q.m_id && q.m_storage
        ? mediaUrl({ id: q.m_id, storage: q.m_storage, object_key: q.m_key, legacy_path: q.m_legacy, external_url: q.m_ext, variants_json: q.m_var }, "lg") ?? null
        : null,
      options: safeParseJson<QuizOption[]>(q.options_json, []),
      answerKey: safeParseJson<string[]>(q.answer_key_json, []),
      explanationMarkdown: q.explanation_markdown,
      timeLimitSec: q.time_limit_sec ?? s.default_time_limit_sec,
      points: q.points,
      negativePoints: q.negative_points,
    })),
    participants: participants.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      participantType: p.participant_type,
      status: p.status,
    })),
  };
}

// ───────────────────────────── Registration & Joining ─────────────────────────────

export async function joinQuiz(ctx: Ctx, input: Record<string, unknown>) {
  const cfg = await getSettings(ctx, { "quiz.enabled": true, "quiz.guest_turnstile_required": true });
  if (cfg["quiz.enabled"] === false) throw new AppError(503, "QUIZ_DISABLED", "Quiz Arena is currently paused by administrators.");

  await limit(ctx, "quizzes.join", ctx.meta.ipHash ?? "unknown");

  const v = new Validator(input);
  const joinCode = v.string("joinCode", { max: 12, label: "Join code" })?.toUpperCase() ?? null;
  const sessionIdArg = v.string("sessionId", { max: 80, label: "Session" });
  const participantTokenIn = v.string("participantToken", { max: 200 });
  const participantType = v.oneOf("participantType", QUIZ_PARTICIPANT_TYPES, { label: "Participant type" }) ?? "GUEST";
  const displayName = v.string("displayName", { min: 2, max: 80, label: "Full name" });
  const email = v.email("email", false);
  const studentId = v.string("studentId", { max: 12, label: "Student ID" });
  const department = v.string("department", { max: 100, label: "Department" });
  const institution = v.string("institution", { max: 120, label: "Institution" });
  const phone = v.string("phone", { max: 30, label: "Phone" });
  const turnstileToken = v.string("turnstileToken", { max: 4000 });
  const acceptRules = input.acceptRules === undefined ? true : v.bool("acceptRules");
  if (!joinCode && !sessionIdArg) v.check(false, "joinCode", "Join code or session is required.");
  if (studentId) v.check(STUDENT_ID_RE.test(studentId), "studentId", "Enter a 9-digit student ID.");
  v.done();

  const session = await ctx.db.first<{
    id: string;
    quiz_id: string;
    join_code: string;
    status: QuizSessionStatus;
    max_participants: number;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
    slug: string;
    quiz_status: string;
    access_mode: string;
    event_id: string | null;
  }>(
    `SELECT qs.id, qs.quiz_id, qs.join_code, qs.status, qs.max_participants, qs.registration_opens_at, qs.registration_closes_at,
            q.slug, q.status AS quiz_status, q.access_mode, q.event_id
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id AND q.deleted_at IS NULL
     WHERE ${joinCode ? "qs.join_code = ?1" : "qs.id = ?1"} LIMIT 1`,
    joinCode ?? sessionIdArg,
  );
  if (!session || session.quiz_status !== "PUBLISHED") throw new NotFoundError("Quiz session");
  if (!["LOBBY", "QUESTION", "REVEAL", "PAUSED"].includes(session.status)) {
    throw new AppError(409, "SESSION_CLOSED", "This quiz session is no longer accepting participants.");
  }

  // Reconnect flow: existing participant cookie or signed-in user already joined this session.
  const actorUserId = ctx.actor?.user.status === "ACTIVE" ? ctx.actor.user.id : null;
  const existingTokenHash = participantTokenIn ? await sha256Hex(participantTokenIn) : null;
  const existing = existingTokenHash || actorUserId
    ? await ctx.db.first<{ id: string; display_name: string; status: QuizParticipantStatus }>(
        `SELECT id, display_name, status FROM quiz_participants
         WHERE session_id = ?1 AND ((?2 IS NOT NULL AND participant_token_hash = ?2) OR (?3 IS NOT NULL AND user_id = ?3))
         LIMIT 1`,
        session.id,
        existingTokenHash,
        actorUserId,
      )
    : null;
  if (existing) {
    if (existing.status === "KICKED" || existing.status === "BANNED") {
      throw new ForbiddenError("You were removed from this quiz session by the host.");
    }
    const freshToken = participantTokenIn && existingTokenHash ? participantTokenIn : randomToken(32);
    if (!participantTokenIn || !existingTokenHash) {
      await ctx.db.run("UPDATE quiz_participants SET participant_token_hash = ?2, last_seen_at = ?3 WHERE id = ?1", existing.id, await sha256Hex(freshToken), nowIso());
    }
    if (ctx.quizRoom) await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
    const ticket = await signQuizTicket(ctx, { sid: session.id, qid: session.quiz_id, pid: existing.id, uid: actorUserId, name: existing.display_name, role: "player" });
    return { sessionId: session.id, slug: session.slug, participantId: existing.id, displayName: existing.display_name, participantToken: freshToken, ticket, role: "player" as const };
  }

  // Fresh join: enforce registration window, access policy, consent, and Turnstile.
  const now = nowIso();
  if (session.registration_opens_at && now < session.registration_opens_at) {
    throw new AppError(409, "REGISTRATION_NOT_OPEN", "Registration for this quiz has not opened yet.");
  }
  if (session.registration_closes_at && now > session.registration_closes_at) {
    throw new AppError(409, "REGISTRATION_CLOSED", "Registration for this quiz has closed.");
  }
  if (!acceptRules) throw new ValidationError("Please accept the competition rules to join.", { acceptRules: "Required." });

  if (session.access_mode === "MEMBERS_ONLY" && !actorUserId) {
    throw new AuthRequiredError("Sign in with an active GUCC member account to join this quiz.");
  }

  let resolvedName = displayName;
  let resolvedEmail = email;
  let resolvedStudentId = studentId;
  let resolvedDepartment = department;
  if (actorUserId) {
    const prof = await ctx.db.first<{ full_name: string; student_id: string | null; department: string | null }>(
      "SELECT full_name, student_id, department FROM profiles WHERE user_id = ?1 AND deleted_at IS NULL",
      actorUserId,
    );
    resolvedName = resolvedName || prof?.full_name || ctx.actor!.profile?.full_name || "Member";
    resolvedEmail = resolvedEmail || ctx.actor!.user.email.toLowerCase();
    resolvedStudentId = resolvedStudentId || prof?.student_id || null;
    resolvedDepartment = resolvedDepartment || prof?.department || null;
  } else {
    const fErrors: Record<string, string> = {};
    if (!resolvedName) fErrors.displayName = "Full name is required.";
    if (!resolvedEmail || !EMAIL_RE.test(resolvedEmail)) fErrors.email = "A valid email address is required.";
    if (participantType === "STUDENT" && !resolvedStudentId) fErrors.studentId = "Student ID is required for Green University students.";
    if (participantType === "GUEST" && !institution) fErrors.institution = "Institution or organization is required for guests.";
    if (Object.keys(fErrors).length) throw new ValidationError("Complete your registration details to join.", fErrors);
    if (cfg["quiz.guest_turnstile_required"] !== false) await verifyTurnstile(ctx, turnstileToken);
  }

  let registrationId: string | null = null;
  if (session.access_mode === "REGISTERED") {
    if (!session.event_id) throw new AppError(409, "EVENT_REQUIRED", "This quiz is misconfigured (missing linked event).");
    const reg = await ctx.db.first<{ id: string; status: string }>(
      `SELECT id, status FROM event_registrations WHERE event_id = ?1 AND status IN ('REGISTERED','ATTENDED')
         AND ((?2 IS NOT NULL AND user_id = ?2) OR (?3 IS NOT NULL AND email = ?3))
       LIMIT 1`,
      session.event_id,
      actorUserId,
      resolvedEmail,
    );
    if (!reg) throw new ForbiddenError("Only registered attendees of the linked event may join this quiz.");
    registrationId = reg.id;
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const participantId = newId("qp");

  let inserted: { id: string } | null = null;
  try {
    inserted = await ctx.db.first<{ id: string }>(
      `INSERT INTO quiz_participants (id, session_id, user_id, registration_id, participant_type, display_name, student_id,
                                      department, institution, email, phone, accepted_rules_at, participant_token_hash, status, joined_at, last_seen_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'JOINED', ?12, ?12
       WHERE (SELECT COUNT(*) FROM quiz_participants WHERE session_id = ?2 AND status = 'JOINED') < ?14
       RETURNING id`,
      participantId, session.id, actorUserId, registrationId, actorUserId ? "STUDENT" : participantType,
      resolvedName!, resolvedStudentId, resolvedDepartment, institution, resolvedEmail, phone, now, tokenHash, session.max_participants,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) {
      throw new ConflictError("A participant with this email address or student ID has already joined this quiz.");
    }
    throw e;
  }
  if (!inserted) throw new ConflictError("This quiz session has reached its maximum capacity.");

  await ctx.db.run("UPDATE quiz_sessions SET participant_count = participant_count + 1, updated_at = ?2 WHERE id = ?1", session.id, now);
  if (ctx.quizRoom) {
    await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
    await ctx.quizRoom.syncParticipant(session.id, {
      id: participantId,
      displayName: resolvedName!,
      participantType: actorUserId ? "STUDENT" : participantType,
      status: "JOINED",
    });
  }
  const ticket = await signQuizTicket(ctx, { sid: session.id, qid: session.quiz_id, pid: participantId, uid: actorUserId, name: resolvedName!, role: "player" });
  return { sessionId: session.id, slug: session.slug, participantId, displayName: resolvedName!, participantToken: rawToken, ticket, role: "player" as const };
}

async function requireHostAuthority(ctx: Ctx, sessionId: string) {
  const actor = requireActor(ctx);
  const s = await ctx.db.first<{ id: string; quiz_id: string; host_user_id: string; status: QuizSessionStatus; slug: string; certificate_batch_id: string | null }>(
    `SELECT qs.id, qs.quiz_id, qs.host_user_id, qs.status, q.slug, qs.certificate_batch_id
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id AND q.deleted_at IS NULL WHERE qs.id = ?1`,
    sessionId,
  );
  if (!s) throw new NotFoundError("Quiz session");
  const resource = await quizResource(ctx.db, s.quiz_id);
  if (!resource) throw new NotFoundError("Quiz");
  const decision = requirePermission(ctx, "quizzes.host", resource);
  return { actor, session: s, resource, decision };
}

export async function issueQuizTicket(ctx: Ctx, input: { sessionId: string; participantToken?: string | null; asHost?: boolean }) {
  const enabled = await getSetting(ctx, "quiz.enabled", true);
  if (enabled === false) return { mode: "poll" as const };
  const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  if (!sessionId) throw new ValidationError("Session is required.");

  if (input.asHost) {
    const { actor, session } = await requireHostAuthority(ctx, sessionId);
    if (ctx.quizRoom) await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
    const displayName = actor.profile?.full_name ?? "Host";
    const ticket = await signQuizTicket(ctx, {
      sid: session.id,
      qid: session.quiz_id,
      pid: `host:${actor.user.id}`,
      uid: actor.user.id,
      name: displayName,
      role: "host",
    });
    return { mode: "live" as const, ticket, participantId: `host:${actor.user.id}`, role: "host" as const };
  }

  const session = await ctx.db.first<{ id: string; quiz_id: string; status: QuizSessionStatus }>("SELECT id, quiz_id, status FROM quiz_sessions WHERE id = ?1", sessionId);
  if (!session) throw new NotFoundError("Quiz session");

  const tokenHash = input.participantToken ? await sha256Hex(input.participantToken) : null;
  const userId = ctx.actor?.user.id ?? null;
  if (!tokenHash && !userId) throw new AuthRequiredError("Join the quiz session first.");

  const p = await ctx.db.first<{ id: string; display_name: string; user_id: string | null; status: QuizParticipantStatus }>(
    `SELECT id, display_name, user_id, status FROM quiz_participants
     WHERE session_id = ?1 AND ((?2 IS NOT NULL AND participant_token_hash = ?2) OR (?3 IS NOT NULL AND user_id = ?3))
     LIMIT 1`,
    session.id,
    tokenHash,
    userId,
  );
  if (!p) throw new AuthRequiredError("Participant registration not found for this session.");
  if (p.status === "KICKED" || p.status === "BANNED") throw new ForbiddenError("You were removed from this quiz session.");

  if (ctx.quizRoom) await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
  const ticket = await signQuizTicket(ctx, { sid: session.id, qid: session.quiz_id, pid: p.id, uid: p.user_id, name: p.display_name, role: "player" });
  return { mode: "live" as const, ticket, participantId: p.id, role: "player" as const };
}

// ───────────────────────────── Live Host Controls & State ─────────────────────────────

export async function hostAction(ctx: Ctx, sessionId: string, input: Record<string, unknown>): Promise<QuizStateSnapshot> {
  const { session, decision } = await requireHostAuthority(ctx, sessionId);
  const action = new Validator(input).oneOf("action", ["start", "next", "reveal", "pause", "resume"] as const, { required: true })!;
  const questionIdx = typeof input.questionIdx === "number" && Number.isInteger(input.questionIdx) ? input.questionIdx : undefined;

  if (ctx.quizRoom) {
    await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
    const snap = await ctx.quizRoom.hostAction(session.id, action, { questionIdx });
    await ctx.db.batch([
      ctx.db.stmt(
        "UPDATE quiz_sessions SET status = ?2, current_question_idx = ?3, question_started_at = ?4, question_ends_at = ?5, started_at = COALESCE(started_at, CASE WHEN ?2 <> 'LOBBY' THEN ?6 END), updated_at = ?6 WHERE id = ?1",
        session.id, snap.status, snap.currentQuestionIdx, snap.questionStartedAt, snap.questionEndsAt, nowIso(),
      ),
      auditStmt(ctx, { action: `quiz.host_${action}`, resourceType: "quiz_session", resourceId: session.id, after: { status: snap.status, idx: snap.currentQuestionIdx }, decision }),
    ]);
    return snap;
  }

  // Test/no-DO fallback: advance session state directly in D1 so RPCs work seamlessly in Vitest.
  const questions = await ctx.db.all<{ id: string; sort_order: number; kind: QuizQuestionKind; prompt_markdown: string; options_json: string; answer_key_json: string; explanation_markdown: string | null; time_limit_sec: number | null; points: number }>(
    "SELECT id, sort_order, kind, prompt_markdown, options_json, answer_key_json, explanation_markdown, time_limit_sec, points FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL ORDER BY sort_order",
    session.quiz_id,
  );
  const qMeta = await ctx.db.first<{ title: string; join_code: string; default_time_limit_sec: number; current_question_idx: number; question_started_at: string | null; question_ends_at: string | null; participant_count: number }>(
    "SELECT q.title, qs.join_code, q.default_time_limit_sec, qs.current_question_idx, qs.question_started_at, qs.question_ends_at, qs.participant_count FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id WHERE qs.id = ?1",
    session.id,
  );
  const now = nowIso();
  let nextStatus: QuizSessionStatus = session.status;
  let nextIdx = qMeta!.current_question_idx;
  let startedAt = qMeta!.question_started_at;
  let endsAt = qMeta!.question_ends_at;

  if (action === "start" || action === "next") {
    nextIdx = questionIdx ?? (action === "start" && nextIdx < 0 ? 0 : nextIdx + 1);
    const targetQ = questions[nextIdx];
    if (!targetQ) throw new ValidationError("No more questions in this quiz.");
    nextStatus = "QUESTION";
    startedAt = now;
    const sec = targetQ.time_limit_sec ?? qMeta!.default_time_limit_sec;
    endsAt = new Date(Date.now() + sec * 1000).toISOString();
  } else if (action === "reveal") {
    nextStatus = "REVEAL";
  } else if (action === "pause") {
    nextStatus = "PAUSED";
  } else if (action === "resume") {
    nextStatus = "QUESTION";
  }

  await ctx.db.batch([
    ctx.db.stmt(
      "UPDATE quiz_sessions SET status = ?2, current_question_idx = ?3, question_started_at = ?4, question_ends_at = ?5, started_at = COALESCE(started_at, ?6), updated_at = ?6 WHERE id = ?1",
      session.id, nextStatus, nextIdx, startedAt, endsAt, now,
    ),
    auditStmt(ctx, { action: `quiz.host_${action}`, resourceType: "quiz_session", resourceId: session.id, after: { status: nextStatus, idx: nextIdx }, decision }),
  ]);

  const activeQ = nextIdx >= 0 ? questions[nextIdx] : null;
  return {
    sessionId: session.id,
    quizId: session.quiz_id,
    joinCode: qMeta!.join_code,
    title: qMeta!.title,
    status: nextStatus,
    currentQuestionIdx: nextIdx,
    totalQuestions: questions.length,
    questionStartedAt: startedAt,
    questionEndsAt: endsAt,
    participantCount: qMeta!.participant_count,
    question: activeQ
      ? {
          id: activeQ.id,
          index: nextIdx,
          kind: activeQ.kind,
          promptMarkdown: activeQ.prompt_markdown,
          mediaUrl: null,
          options: safeParseJson(activeQ.options_json, []),
          timeLimitSec: activeQ.time_limit_sec ?? qMeta!.default_time_limit_sec,
          points: activeQ.points,
        }
      : null,
    answerKey: activeQ ? safeParseJson(activeQ.answer_key_json, []) : null,
    explanationMarkdown: activeQ?.explanation_markdown ?? null,
    optionCounts: null,
    answeredCount: 0,
    leaderboard: [],
    me: null,
  };
}

export async function kickParticipant(ctx: Ctx, sessionId: string, participantId: string, status: QuizParticipantStatus = "KICKED", reason?: string | null): Promise<void> {
  if (!QUIZ_PARTICIPANT_STATUSES.includes(status) || status === "JOINED") throw new ValidationError("Choose KICKED, BANNED, or DISQUALIFIED.");
  const { session, decision } = await requireHostAuthority(ctx, sessionId);
  const exists = await ctx.db.first<{ id: string }>("SELECT id FROM quiz_participants WHERE id = ?1 AND session_id = ?2", participantId, session.id);
  if (!exists) throw new NotFoundError("Participant");
  await ctx.db.batch([
    ctx.db.stmt("UPDATE quiz_participants SET status = ?2 WHERE id = ?1 AND session_id = ?3", participantId, status, session.id),
    ctx.db.stmt("UPDATE quiz_sessions SET participant_count = (SELECT COUNT(*) FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED'), updated_at = ?2 WHERE id = ?1", session.id, nowIso()),
    auditStmt(ctx, { action: "quiz.participant_status", resourceType: "quiz_participant", resourceId: participantId, reason: reason?.slice(0, 300) ?? null, after: { sessionId: session.id, status }, decision }),
  ]);
  if (ctx.quizRoom) await ctx.quizRoom.hostAction(session.id, "kick", { participantId, status });
}

export async function getSessionState(ctx: Ctx, sessionId: string, opts: { participantToken?: string | null; asHost?: boolean } = {}): Promise<QuizStateSnapshot> {
  const s = await ctx.db.first<{
    id: string;
    quiz_id: string;
    join_code: string;
    title: string;
    status: QuizSessionStatus;
    current_question_idx: number;
    question_started_at: string | null;
    question_ends_at: string | null;
    participant_count: number;
    default_time_limit_sec: number;
  }>(
    `SELECT qs.id, qs.quiz_id, qs.join_code, q.title, qs.status, qs.current_question_idx, qs.question_started_at, qs.question_ends_at, qs.participant_count, q.default_time_limit_sec
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id WHERE qs.id = ?1`,
    sessionId,
  );
  if (!s) throw new NotFoundError("Quiz session");

  let role: "host" | "player" = "player";
  let participantId: string | null = null;
  if (opts.asHost) {
    await requireHostAuthority(ctx, sessionId);
    role = "host";
  } else {
    const tokenHash = opts.participantToken ? await sha256Hex(opts.participantToken) : null;
    const uid = ctx.actor?.user.id ?? null;
    if (tokenHash || uid) {
      participantId = await ctx.db.value<string>(
        `SELECT id FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED'
           AND ((?2 IS NOT NULL AND participant_token_hash = ?2) OR (?3 IS NOT NULL AND user_id = ?3))
         LIMIT 1`,
        sessionId, tokenHash, uid,
      );
    }
  }

  if (ctx.quizRoom && !["FINALIZED", "CANCELLED"].includes(s.status)) {
    const liveSnap = await ctx.quizRoom.getState(sessionId, { participantId, role });
    if (liveSnap) return liveSnap;
  }

  // Fallback / finalized D1 snapshot (never exposes answerKey before REVEAL/FINALIZED for players).
  const [questions, leaders, meRow] = await Promise.all([
    ctx.db.all<{ id: string; sort_order: number; kind: QuizQuestionKind; prompt_markdown: string; options_json: string; answer_key_json: string; explanation_markdown: string | null; time_limit_sec: number | null; points: number }>(
      "SELECT id, sort_order, kind, prompt_markdown, options_json, answer_key_json, explanation_markdown, time_limit_sec, points FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL ORDER BY sort_order",
      s.quiz_id,
    ),
    ctx.db.all<{ id: string; display_name: string; participant_type: "STUDENT" | "GUEST"; score_total: number; correct_count: number; avg_response_ms: number; rank: number | null }>(
      "SELECT id, display_name, participant_type, score_total, correct_count, avg_response_ms, rank FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED' ORDER BY score_total DESC, correct_count DESC, avg_response_ms ASC LIMIT 20",
      sessionId,
    ),
    participantId
      ? ctx.db.first<{ id: string; display_name: string; score_total: number; correct_count: number; avg_response_ms: number; rank: number | null }>(
          "SELECT id, display_name, score_total, correct_count, avg_response_ms, rank FROM quiz_participants WHERE id = ?1",
          participantId,
        )
      : null,
  ]);
  const activeQ = s.current_question_idx >= 0 ? questions[s.current_question_idx] ?? null : null;
  const canSeeAnswer = role === "host" || s.status === "REVEAL" || s.status === "FINALIZED";

  return {
    sessionId: s.id,
    quizId: s.quiz_id,
    joinCode: s.join_code,
    title: s.title,
    status: s.status,
    currentQuestionIdx: s.current_question_idx,
    totalQuestions: questions.length,
    questionStartedAt: s.question_started_at,
    questionEndsAt: s.question_ends_at,
    participantCount: s.participant_count,
    question: activeQ
      ? {
          id: activeQ.id,
          index: s.current_question_idx,
          kind: activeQ.kind,
          promptMarkdown: activeQ.prompt_markdown,
          mediaUrl: null,
          options: safeParseJson(activeQ.options_json, []),
          timeLimitSec: activeQ.time_limit_sec ?? s.default_time_limit_sec,
          points: activeQ.points,
        }
      : null,
    answerKey: activeQ && canSeeAnswer ? safeParseJson(activeQ.answer_key_json, []) : null,
    explanationMarkdown: activeQ && canSeeAnswer ? activeQ.explanation_markdown : null,
    optionCounts: null,
    answeredCount: 0,
    leaderboard: leaders.map((p, i) => ({
      rank: p.rank ?? i + 1,
      participantId: p.id,
      displayName: p.display_name,
      participantType: p.participant_type,
      scoreTotal: p.score_total,
      correctCount: p.correct_count,
      avgResponseMs: p.avg_response_ms,
    })),
    me: meRow
      ? {
          participantId: meRow.id,
          displayName: meRow.display_name,
          scoreTotal: meRow.score_total,
          correctCount: meRow.correct_count,
          avgResponseMs: meRow.avg_response_ms,
          rank: meRow.rank,
          answeredCurrent: false,
        }
      : null,
  };
}

// ───────────────────────────── Finalize & Certificates Bridge ─────────────────────────────

export async function finalizeSession(ctx: Ctx, sessionId: string) {
  const { session, decision } = await requireHostAuthority(ctx, sessionId);
  if (session.status === "FINALIZED") return { sessionId, status: "FINALIZED" as const, alreadyFinalized: true };
  if (session.status === "CANCELLED") throw new AppError(409, "CANCELLED", "Cancelled sessions cannot be finalized.");

  const now = nowIso();
  if (ctx.quizRoom) {
    await ctx.quizRoom.ensureInitialized(await buildRoomInitPayload(ctx, session.id));
    const exported = await ctx.quizRoom.finalizeExport(session.id);

    // Flush answers in json_each chunks (500 rows/stmt, max 12 stmts/batch) to stay safely under D1 limits.
    const ANSWER_CHUNK = 500;
    const answerStmts: D1StatementLike[] = [];
    for (let i = 0; i < exported.answers.length; i += ANSWER_CHUNK) {
      const slice = exported.answers.slice(i, i + ANSWER_CHUNK).map((a) => ({
        id: a.id,
        p: a.participantId,
        q: a.questionId,
        s: JSON.stringify(a.selected),
        c: a.isCorrect ? 1 : 0,
        pts: a.pointsAwarded,
        ms: a.responseMs,
        at: a.answeredAt,
      }));
      answerStmts.push(
        ctx.db.stmt(
          `INSERT INTO quiz_answers (id, session_id, participant_id, question_id, selected_json, is_correct, points_awarded, response_ms, answered_at)
           SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.p'), json_extract(j.value, '$.q'),
                  json_extract(j.value, '$.s'), json_extract(j.value, '$.c'), json_extract(j.value, '$.pts'),
                  json_extract(j.value, '$.ms'), json_extract(j.value, '$.at')
           FROM json_each(?2) AS j WHERE true ON CONFLICT(session_id, participant_id, question_id) DO NOTHING`,
          session.id,
          JSON.stringify(slice),
        ),
      );
    }
    for (let i = 0; i < answerStmts.length; i += 12) {
      await ctx.db.batch(answerStmts.slice(i, i + 12));
    }

    // Flush participant scores and computed ranks in 250-row chunks.
    const P_CHUNK = 250;
    const pStmts: D1StatementLike[] = [];
    for (let i = 0; i < exported.participants.length; i += P_CHUNK) {
      const slice = exported.participants.slice(i, i + P_CHUNK).map((p) => ({
        id: p.participantId,
        s: p.scoreTotal,
        c: p.correctCount,
        ms: p.avgResponseMs,
        r: p.rank,
      }));
      pStmts.push(
        ctx.db.stmt(
          `WITH upd AS (
             SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.s') AS s,
                    json_extract(j.value, '$.c') AS c, json_extract(j.value, '$.ms') AS ms, json_extract(j.value, '$.r') AS r
             FROM json_each(?2) AS j
           )
           UPDATE quiz_participants
           SET score_total = COALESCE((SELECT s FROM upd WHERE upd.id = quiz_participants.id), score_total),
               correct_count = COALESCE((SELECT c FROM upd WHERE upd.id = quiz_participants.id), correct_count),
               avg_response_ms = COALESCE((SELECT ms FROM upd WHERE upd.id = quiz_participants.id), avg_response_ms),
               rank = (SELECT r FROM upd WHERE upd.id = quiz_participants.id)
           WHERE session_id = ?1 AND id IN (SELECT id FROM upd)`,
          session.id,
          JSON.stringify(slice),
        ),
      );
    }
    for (let i = 0; i < pStmts.length; i += 12) {
      await ctx.db.batch(pStmts.slice(i, i + 12));
    }

    await ctx.db.batch([
      ctx.db.stmt(
        `UPDATE quiz_sessions SET status = 'FINALIZED', started_at = COALESCE(started_at, ?2), ended_at = COALESCE(ended_at, ?3),
                                  finalized_at = ?3, participant_count = ?4, updated_at = ?3 WHERE id = ?1`,
        session.id, exported.startedAt ?? now, exported.endedAt ?? now, exported.participants.length,
      ),
      auditStmt(ctx, { action: "quiz.session_finalize", resourceType: "quiz_session", resourceId: session.id, after: { participants: exported.participants.length, answers: exported.answers.length }, decision }),
    ]);
    await ctx.quizRoom.markFinalized(session.id);
  } else {
    // D1-only finalization fallback (ranks existing D1 quiz_participants).
    const rows = await ctx.db.all<{ id: string; score_total: number; correct_count: number; avg_response_ms: number }>(
      "SELECT id, score_total, correct_count, avg_response_ms FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED'",
      session.id,
    );
    const ranked = rankParticipants(
      rows.map((r) => ({ participantId: r.id, scoreTotal: r.score_total, correctCount: r.correct_count, avgResponseMs: r.avg_response_ms })),
    );
    const stmts: D1StatementLike[] = [
      ...(ranked.length
        ? [
            ctx.db.stmt(
              `WITH upd AS (SELECT json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.r') AS r FROM json_each(?2) AS j)
               UPDATE quiz_participants SET rank = (SELECT r FROM upd WHERE upd.id = quiz_participants.id)
               WHERE session_id = ?1 AND id IN (SELECT id FROM upd)`,
              session.id,
              JSON.stringify(ranked.map((r) => ({ id: r.participantId, r: r.rank }))),
            ),
          ]
        : []),
      ctx.db.stmt(
        "UPDATE quiz_sessions SET status = 'FINALIZED', started_at = COALESCE(started_at, ?2), ended_at = COALESCE(ended_at, ?2), finalized_at = ?2, updated_at = ?2 WHERE id = ?1",
        session.id, now,
      ),
      auditStmt(ctx, { action: "quiz.session_finalize", resourceType: "quiz_session", resourceId: session.id, after: { participants: ranked.length }, decision }),
    ];
    await ctx.db.batch(stmts);
  }

  ctx.revalidate?.([TAGS.quizzes, TAGS.quiz(session.slug)]);
  return { sessionId: session.id, status: "FINALIZED" as const, alreadyFinalized: false };
}

export async function issueQuizCertificates(ctx: Ctx, sessionId: string, input: Record<string, unknown>) {
  requireActor(ctx);
  const { session, resource } = await requireHostAuthority(ctx, sessionId);
  if (!can(ctx, "quizzes.moderate", resource)) requirePermission(ctx, "certificates.manage");
  if (session.status !== "FINALIZED") throw new AppError(409, "NOT_FINALIZED", "Finalize the quiz session before issuing certificates.");
  if (session.certificate_batch_id && input.allowAdditional !== true) {
    throw new ConflictError("Certificates have already been issued for this quiz session.");
  }

  const topN = typeof input.topN === "number" && Number.isInteger(input.topN) && input.topN >= 1 ? input.topN : null;
  const recipients = await ctx.db.all<{
    id: string;
    display_name: string;
    email: string | null;
    student_id: string | null;
    rank: number | null;
    profile_id: string | null;
    user_id: string | null;
  }>(
    `SELECT qp.id, qp.display_name, COALESCE(u.email, qp.email) AS email, COALESCE(p.student_id, qp.student_id) AS student_id,
            qp.rank, p.id AS profile_id, qp.user_id
     FROM quiz_participants qp
     LEFT JOIN users u ON u.id = qp.user_id AND u.deleted_at IS NULL
     LEFT JOIN profiles p ON p.deleted_at IS NULL AND p.merged_into_id IS NULL
       AND (p.user_id = qp.user_id OR (qp.student_id IS NOT NULL AND p.student_id = qp.student_id))
     WHERE qp.session_id = ?1 AND qp.status = 'JOINED'
       AND (?2 IS NULL OR (qp.rank IS NOT NULL AND qp.rank <= ?2))
       AND EXISTS (SELECT 1 FROM quiz_answers qa WHERE qa.session_id = ?1 AND qa.participant_id = qp.id)
     ORDER BY COALESCE(qp.rank, 999999) ASC, qp.display_name ASC`,
    session.id,
    topN,
  );
  if (!recipients.length) throw new ValidationError("No eligible participants with submitted answers found.");

  const qRow = await ctx.db.first<{ title: string; event_id: string | null }>("SELECT title, event_id FROM quizzes WHERE id = ?1", session.quiz_id);
  const batchIds: string[] = [];
  let totalIssued = 0;

  for (let i = 0; i < recipients.length; i += MAX_PER_REQUEST) {
    const chunk = recipients.slice(i, i + MAX_PER_REQUEST);
    const partLabel = recipients.length > MAX_PER_REQUEST ? ` (Part ${Math.floor(i / MAX_PER_REQUEST) + 1})` : "";
    const out = await issueBatch(ctx, {
      name: `${String(input.name ?? qRow!.title).slice(0, 120)}${partLabel}`,
      kind: topN ? "ACHIEVEMENT" : "PARTICIPATION",
      source: "QUIZ",
      sourceJson: { sessionId: session.id, quizId: session.quiz_id, topN },
      eventId: qRow!.event_id,
      designId: input.designId ?? null,
      template: input.template ?? "heritage",
      config: input.config ?? {},
      issuedOn: typeof input.issuedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn) ? input.issuedOn : nowIso().slice(0, 10),
      notify: input.notify !== false,
      email: false, // Preserve SMTP2GO 1,000/month quota across up to 500 quiz players.
      emailGuests: false,
      recipients: chunk.map((r) => ({
        name: r.display_name,
        email: r.email,
        profileId: r.profile_id,
        userId: r.user_id,
        studentId: r.student_id,
        rank: topN && r.rank ? `#${r.rank}` : null,
        role: topN ? `Rank #${r.rank ?? "-"}` : "Quiz Participant",
      })),
    });
    batchIds.push(out.id);
    totalIssued += out.issued;
  }

  if (batchIds[0] && !session.certificate_batch_id) {
    await ctx.db.run("UPDATE quiz_sessions SET certificate_batch_id = ?2, updated_at = ?3 WHERE id = ?1", session.id, batchIds[0], nowIso());
  }
  return { batchIds, issued: totalIssued };
}

// ───────────────────────────── Results & Incidents ─────────────────────────────

export async function getQuizResults(ctx: Ctx, sessionId: string, participantToken?: string | null) {
  const s = await ctx.db.first<{
    id: string;
    quiz_id: string;
    slug: string;
    title: string;
    status: QuizSessionStatus;
    results_published: number;
    finalized_at: string | null;
    certificate_batch_id: string | null;
    participant_count: number;
  }>(
    `SELECT qs.id, qs.quiz_id, q.slug, q.title, qs.status, qs.results_published, qs.finalized_at, qs.certificate_batch_id, qs.participant_count
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id AND q.deleted_at IS NULL WHERE qs.id = ?1`,
    sessionId,
  );
  if (!s) throw new NotFoundError("Quiz session");

  let isHostOrMod = false;
  if (ctx.actor) {
    const res = await quizResource(ctx.db, s.quiz_id);
    if (res && (can(ctx, "quizzes.host", res) || can(ctx, "quizzes.moderate", res) || can(ctx, "quizzes.read", res))) {
      isHostOrMod = true;
    }
  }
  if (!isHostOrMod && (s.status !== "FINALIZED" || s.results_published !== 1)) {
    throw new ForbiddenError("Results for this session are not published yet.");
  }

  const tokenHash = participantToken ? await sha256Hex(participantToken) : null;
  const uid = ctx.actor?.user.id ?? null;
  const me = tokenHash || uid
    ? await ctx.db.first<{ id: string; display_name: string; score_total: number; correct_count: number; avg_response_ms: number; rank: number | null }>(
        `SELECT id, display_name, score_total, correct_count, avg_response_ms, rank FROM quiz_participants
         WHERE session_id = ?1 AND ((?2 IS NOT NULL AND participant_token_hash = ?2) OR (?3 IS NOT NULL AND user_id = ?3)) LIMIT 1`,
        sessionId, tokenHash, uid,
      )
    : null;

  const [leaders, myAnswers] = await Promise.all([
    ctx.db.all<{ id: string; display_name: string; participant_type: "STUDENT" | "GUEST"; score_total: number; correct_count: number; avg_response_ms: number; rank: number | null }>(
      "SELECT id, display_name, participant_type, score_total, correct_count, avg_response_ms, rank FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED' ORDER BY score_total DESC, correct_count DESC, avg_response_ms ASC LIMIT 100",
      sessionId,
    ),
    me
      ? ctx.db.all<{ question_id: string; selected_json: string; is_correct: number; points_awarded: number; response_ms: number }>(
          "SELECT question_id, selected_json, is_correct, points_awarded, response_ms FROM quiz_answers WHERE session_id = ?1 AND participant_id = ?2",
          sessionId, me.id,
        )
      : [],
  ]);

  return {
    sessionId: s.id,
    quizId: s.quiz_id,
    slug: s.slug,
    title: s.title,
    status: s.status,
    finalizedAt: s.finalized_at,
    participantCount: s.participant_count,
    leaderboard: leaders.map((p, i) => ({
      rank: p.rank ?? i + 1,
      participantId: p.id,
      displayName: p.display_name,
      participantType: p.participant_type,
      scoreTotal: p.score_total,
      correctCount: p.correct_count,
      avgResponseMs: p.avg_response_ms,
    })),
    me: me
      ? {
          participantId: me.id,
          displayName: me.display_name,
          scoreTotal: me.score_total,
          correctCount: me.correct_count,
          avgResponseMs: me.avg_response_ms,
          rank: me.rank,
          answers: myAnswers.map((a) => ({
            questionId: a.question_id,
            selected: safeParseJson<string[]>(a.selected_json, []),
            isCorrect: a.is_correct === 1,
            pointsAwarded: a.points_awarded,
            responseMs: a.response_ms,
          })),
        }
      : null,
  };
}

export async function reportIncident(ctx: Ctx, sessionId: string, input: Record<string, unknown>, participantToken?: string | null) {
  await limit(ctx, "quizzes.incident", ctx.actor?.user.id ?? ctx.meta.ipHash ?? "unknown");
  const v = new Validator(input);
  const kind = v.oneOf("kind", QUIZ_INCIDENT_KINDS, { required: true, label: "Kind" })!;
  const reason = v.string("reason", { required: true, min: 5, max: 1000, label: "Details" })!;
  const questionId = v.string("questionId", { max: 80 });
  v.done();

  const tokenHash = participantToken ? await sha256Hex(participantToken) : null;
  const uid = ctx.actor?.user.id ?? null;
  const participantId = tokenHash || uid
    ? await ctx.db.value<string>(
        `SELECT id FROM quiz_participants WHERE session_id = ?1 AND ((?2 IS NOT NULL AND participant_token_hash = ?2) OR (?3 IS NOT NULL AND user_id = ?3)) LIMIT 1`,
        sessionId, tokenHash, uid,
      )
    : null;
  if (!uid && !participantId) throw new AuthRequiredError("Sign in or join the quiz session to submit a report.");

  const s = await ctx.db.first<{ id: string; host_user_id: string; quiz_id: string }>("SELECT id, host_user_id, quiz_id FROM quiz_sessions WHERE id = ?1", sessionId);
  if (!s) throw new NotFoundError("Quiz session");

  const id = newId("qinc");
  await ctx.db.batch([
    ctx.db.stmt(
      `INSERT INTO quiz_incidents (id, session_id, question_id, participant_id, reporter_user_id, kind, reason, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'OPEN', ?8)`,
      id, s.id, questionId, participantId, uid, kind, reason, nowIso(),
    ),
    ...notifyStmts(ctx, [s.host_user_id], {
      type: "quiz.incident",
      title: `Quiz ${kind.toLowerCase()} reported`,
      body: reason.slice(0, 140),
      link: `/dashboard/quizzes/${s.quiz_id}`,
      resourceType: "quiz_incident",
      resourceId: id,
    }),
  ]);
  return { id };
}

export async function resolveIncident(ctx: Ctx, incidentId: string, input: Record<string, unknown>): Promise<void> {
  const actor = requireActor(ctx);
  const inc = await ctx.db.first<{ id: string; session_id: string; quiz_id: string; status: string }>(
    `SELECT qi.id, qi.session_id, qs.quiz_id, qi.status FROM quiz_incidents qi JOIN quiz_sessions qs ON qs.id = qi.session_id WHERE qi.id = ?1`,
    incidentId,
  );
  if (!inc) throw new NotFoundError("Quiz incident");
  const res = await quizResource(ctx.db, inc.quiz_id);
  if (!res) throw new NotFoundError("Quiz");
  const decision = can(ctx, "quizzes.moderate", res)
    ? authorize(ctx, "quizzes.moderate", res)
    : requirePermission(ctx, "quizzes.host", res);

  const v = new Validator(input);
  const status = v.oneOf("status", QUIZ_INCIDENT_STATUSES, { required: true, label: "Status" })!;
  const note = v.string("note", { max: 1000, label: "Note" });
  v.done();

  await ctx.db.batch([
    ctx.db.stmt("UPDATE quiz_incidents SET status = ?2, handled_by = ?3, handled_at = ?4, note = ?5 WHERE id = ?1", inc.id, status, actor.user.id, nowIso(), note),
    auditStmt(ctx, { action: "quiz.incident_resolve", resourceType: "quiz_incident", resourceId: inc.id, before: { status: inc.status }, after: { status }, reason: note, decision }),
  ]);
}

export async function getQuizHostView(ctx: Ctx, sessionId: string) {
  const { session, resource } = await requireHostAuthority(ctx, sessionId);
  const [state, quizRow, questions, participants, incidents] = await Promise.all([
    getSessionState(ctx, session.id, { asHost: true }),
    ctx.db.first<Record<string, unknown>>("SELECT id, slug, title, access_mode, scoring_mode, theme_preset, theme_config_json, default_time_limit_sec FROM quizzes WHERE id = ?1", session.quiz_id),
    ctx.db.all<{ id: string; sort_order: number; kind: QuizQuestionKind; prompt_markdown: string; points: number; time_limit_sec: number | null }>(
      "SELECT id, sort_order, kind, prompt_markdown, points, time_limit_sec FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL ORDER BY sort_order",
      session.quiz_id,
    ),
    ctx.db.all<{
      id: string;
      display_name: string;
      participant_type: string;
      student_id: string | null;
      department: string | null;
      institution: string | null;
      status: string;
      score_total: number;
      correct_count: number;
      avg_response_ms: number;
      rank: number | null;
      joined_at: string;
    }>(
      `SELECT id, display_name, participant_type, student_id, department, institution, status, score_total, correct_count, avg_response_ms, rank, joined_at
       FROM quiz_participants WHERE session_id = ?1 ORDER BY score_total DESC, correct_count DESC, avg_response_ms ASC, joined_at ASC LIMIT 600`,
      session.id,
    ),
    ctx.db.all<Record<string, unknown>>(
      `SELECT qi.*, qp.display_name AS participant_name FROM quiz_incidents qi LEFT JOIN quiz_participants qp ON qp.id = qi.participant_id
       WHERE qi.session_id = ?1 ORDER BY CASE WHEN qi.status = 'OPEN' THEN 0 ELSE 1 END, qi.created_at DESC LIMIT 50`,
      session.id,
    ),
  ]);
  const sRow = await ctx.db.first<Record<string, unknown>>("SELECT * FROM quiz_sessions WHERE id = ?1", session.id);
  return {
    session: sRow,
    quiz: quizRow,
    questions,
    participants,
    incidents,
    state,
    capabilities: {
      moderate: can(ctx, "quizzes.moderate", resource),
      issueCertificates: can(ctx, "quizzes.moderate", resource) || can(ctx, "certificates.manage"),
    },
  };
}

export async function exportQuizCsv(ctx: Ctx, sessionId: string): Promise<{ filename: string; csv: string }> {
  const { session, decision } = await requireHostAuthority(ctx, sessionId);
  const rows = await ctx.db.all<{
    rank: number | null;
    display_name: string;
    participant_type: string;
    student_id: string | null;
    department: string | null;
    institution: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    score_total: number;
    correct_count: number;
    avg_response_ms: number;
    joined_at: string;
  }>(
    `SELECT rank, display_name, participant_type, student_id, department, institution, email, phone, status, score_total, correct_count, avg_response_ms, joined_at
     FROM quiz_participants WHERE session_id = ?1 ORDER BY CASE WHEN status = 'JOINED' THEN 0 ELSE 1 END, score_total DESC, correct_count DESC, avg_response_ms ASC`,
    session.id,
  );
  const header = ["Rank", "Display Name", "Type", "Student ID", "Department", "Institution", "Email", "Phone", "Status", "Score", "Correct", "Avg Response (ms)", "Joined At"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r, i) =>
      [
        r.rank ?? i + 1,
        r.display_name,
        r.participant_type,
        r.student_id ?? "",
        r.department ?? "",
        r.institution ?? "",
        r.email ?? "",
        r.phone ?? "",
        r.status,
        r.score_total,
        r.correct_count,
        r.avg_response_ms,
        r.joined_at,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  await auditStmt(ctx, { action: "quiz.export_csv", resourceType: "quiz_session", resourceId: session.id, after: { rows: rows.length }, decision }).run();
  return { filename: `quiz-${session.slug}-${session.id.slice(-6)}.csv`, csv: lines.join("\n") };
}
