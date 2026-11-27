/**
 * Public read models for Quiz Arena. Strictly selects only published public metadata,
 * theme settings, active session summaries, and privacy-safe finalized results.
 * Never selects `answer_key_json` before finalization or any participant PII.
 */
import type { Db } from "../server/db";
import {
  cleanThemeConfig,
  type LeaderboardEntry,
  type QuizAccessMode,
  type QuizOption,
  type QuizQuestionKind,
  type QuizScoringMode,
  type QuizSessionStatus,
  type QuizThemeConfig,
  type QuizThemePreset,
} from "../quiz/types";
import { mediaUrl, type MediaRow } from "./shapes";

export interface PublicQuizSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic: string | null;
  accessMode: QuizAccessMode;
  scoringMode: QuizScoringMode;
  defaultTimeLimitSec: number;
  themePreset: QuizThemePreset;
  themeConfig: QuizThemeConfig;
  bannerUrl: string | null;
  logoUrl: string | null;
  questionCount: number;
  event: { slug: string; title: string } | null;
  activeSession: {
    id: string;
    joinCode: string;
    status: QuizSessionStatus;
    scheduledStartAt: string | null;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    participantCount: number;
    maxParticipants: number;
  } | null;
  latestFinalizedSession: {
    id: string;
    joinCode: string;
    finalizedAt: string | null;
    participantCount: number;
  } | null;
  publishedAt: string | null;
}

interface RawPublicQuizRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic: string | null;
  access_mode: QuizAccessMode;
  scoring_mode: QuizScoringMode;
  default_time_limit_sec: number;
  theme_preset: QuizThemePreset;
  theme_config_json: string | null;
  published_at: string | null;
  question_count: number;
  event_slug: string | null;
  event_title: string | null;
  b_id: string | null;
  b_storage: MediaRow["storage"] | null;
  b_key: string | null;
  b_legacy: string | null;
  b_ext: string | null;
  b_var: string | null;
  l_id: string | null;
  l_storage: MediaRow["storage"] | null;
  l_key: string | null;
  l_legacy: string | null;
  l_ext: string | null;
  l_var: string | null;
  session_id: string | null;
  join_code: string | null;
  session_status: QuizSessionStatus | null;
  scheduled_start_at: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  participant_count: number | null;
  max_participants: number | null;
  fin_session_id: string | null;
  fin_join_code: string | null;
  fin_finalized_at: string | null;
  fin_participant_count: number | null;
}

const PUBLIC_QUIZ_SELECT = `
SELECT q.id, q.slug, q.title, q.description, q.topic, q.access_mode, q.scoring_mode,
       q.default_time_limit_sec, q.theme_preset, q.theme_config_json, q.published_at,
       (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id AND qq.deleted_at IS NULL) AS question_count,
       e.slug AS event_slug, e.title AS event_title,
       bm.id AS b_id, bm.storage AS b_storage, bm.object_key AS b_key, bm.legacy_path AS b_legacy, bm.external_url AS b_ext, bm.variants_json AS b_var,
       lm.id AS l_id, lm.storage AS l_storage, lm.object_key AS l_key, lm.legacy_path AS l_legacy, lm.external_url AS l_ext, lm.variants_json AS l_var,
       (SELECT qs.id FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS session_id,
       (SELECT qs.join_code FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS join_code,
       (SELECT qs.status FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS session_status,
       (SELECT qs.scheduled_start_at FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS scheduled_start_at,
       (SELECT qs.registration_opens_at FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS registration_opens_at,
       (SELECT qs.registration_closes_at FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS registration_closes_at,
       (SELECT qs.participant_count FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS participant_count,
       (SELECT qs.max_participants FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.mode = 'LIVE_HOSTED' AND qs.status IN ('LOBBY','QUESTION','REVEAL','PAUSED') ORDER BY qs.created_at DESC LIMIT 1) AS max_participants,
       (SELECT qs.id FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.status = 'FINALIZED' AND qs.results_published = 1 ORDER BY qs.finalized_at DESC LIMIT 1) AS fin_session_id,
       (SELECT qs.join_code FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.status = 'FINALIZED' AND qs.results_published = 1 ORDER BY qs.finalized_at DESC LIMIT 1) AS fin_join_code,
       (SELECT qs.finalized_at FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.status = 'FINALIZED' AND qs.results_published = 1 ORDER BY qs.finalized_at DESC LIMIT 1) AS fin_finalized_at,
       (SELECT qs.participant_count FROM quiz_sessions qs WHERE qs.quiz_id = q.id AND qs.status = 'FINALIZED' AND qs.results_published = 1 ORDER BY qs.finalized_at DESC LIMIT 1) AS fin_participant_count
FROM quizzes q
LEFT JOIN events e ON e.id = q.event_id AND e.deleted_at IS NULL AND e.status IN ('PUBLISHED','ONGOING','COMPLETED')
LEFT JOIN media bm ON bm.id = q.banner_media_id AND bm.deleted_at IS NULL AND bm.visibility = 'PUBLIC' AND bm.status = 'READY'
LEFT JOIN media lm ON lm.id = q.logo_media_id AND lm.deleted_at IS NULL AND lm.visibility = 'PUBLIC' AND lm.status = 'READY'
WHERE q.deleted_at IS NULL AND q.status = 'PUBLISHED'`;

function shapePublicQuiz(r: RawPublicQuizRow): PublicQuizSummary {
  let rawTheme: unknown = {};
  try {
    rawTheme = r.theme_config_json ? JSON.parse(r.theme_config_json) : {};
  } catch {
    rawTheme = {};
  }
  const banner = r.b_id && r.b_storage
    ? mediaUrl({ id: r.b_id, storage: r.b_storage, object_key: r.b_key, legacy_path: r.b_legacy, external_url: r.b_ext, variants_json: r.b_var }, "lg") ?? null
    : null;
  const logo = r.l_id && r.l_storage
    ? mediaUrl({ id: r.l_id, storage: r.l_storage, object_key: r.l_key, legacy_path: r.l_legacy, external_url: r.l_ext, variants_json: r.l_var }, "sm") ?? null
    : null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    topic: r.topic,
    accessMode: r.access_mode,
    scoringMode: r.scoring_mode,
    defaultTimeLimitSec: r.default_time_limit_sec,
    themePreset: r.theme_preset,
    themeConfig: cleanThemeConfig(r.theme_preset, rawTheme),
    bannerUrl: banner,
    logoUrl: logo,
    questionCount: Number(r.question_count ?? 0),
    event: r.event_slug ? { slug: r.event_slug, title: r.event_title ?? r.event_slug } : null,
    activeSession: r.session_id && r.join_code && r.session_status
      ? {
          id: r.session_id,
          joinCode: r.join_code,
          status: r.session_status,
          scheduledStartAt: r.scheduled_start_at,
          registrationOpensAt: r.registration_opens_at,
          registrationClosesAt: r.registration_closes_at,
          participantCount: Number(r.participant_count ?? 0),
          maxParticipants: Number(r.max_participants ?? 600),
        }
      : null,
    latestFinalizedSession: r.fin_session_id && r.fin_join_code
      ? {
          id: r.fin_session_id,
          joinCode: r.fin_join_code,
          finalizedAt: r.fin_finalized_at,
          participantCount: Number(r.fin_participant_count ?? 0),
        }
      : null,
    publishedAt: r.published_at,
  };
}

export async function readPublicQuizzes(db: Db, limit = 50): Promise<PublicQuizSummary[]> {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await db.all<RawPublicQuizRow>(
    `${PUBLIC_QUIZ_SELECT} AND q.visibility = 'PUBLIC' ORDER BY q.published_at DESC LIMIT ?1`,
    n,
  );
  return rows.map(shapePublicQuiz);
}

export async function readPublicQuizBySlug(db: Db, slug: string): Promise<PublicQuizSummary | null> {
  const row = await db.first<RawPublicQuizRow>(`${PUBLIC_QUIZ_SELECT} AND q.slug = ?1 LIMIT 1`, slug);
  return row ? shapePublicQuiz(row) : null;
}

export async function readPublicQuizByJoinCode(
  db: Db,
  joinCode: string,
): Promise<{
  quiz: PublicQuizSummary;
  session: {
    id: string;
    joinCode: string;
    status: QuizSessionStatus;
    scheduledStartAt: string | null;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    participantCount: number;
    maxParticipants: number;
  };
} | null> {
  const code = joinCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return null;
  const sess = await db.first<{
    id: string;
    quiz_id: string;
    join_code: string;
    status: QuizSessionStatus;
    scheduled_start_at: string | null;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
    participant_count: number;
    max_participants: number;
  }>(
    `SELECT id, quiz_id, join_code, status, scheduled_start_at, registration_opens_at, registration_closes_at, participant_count, max_participants
     FROM quiz_sessions WHERE join_code = ?1 LIMIT 1`,
    code,
  );
  if (!sess) return null;
  const quizRow = await db.first<RawPublicQuizRow>(`${PUBLIC_QUIZ_SELECT} AND q.id = ?1 LIMIT 1`, sess.quiz_id);
  if (!quizRow) return null;
  return {
    quiz: shapePublicQuiz(quizRow),
    session: {
      id: sess.id,
      joinCode: sess.join_code,
      status: sess.status,
      scheduledStartAt: sess.scheduled_start_at,
      registrationOpensAt: sess.registration_opens_at,
      registrationClosesAt: sess.registration_closes_at,
      participantCount: Number(sess.participant_count ?? 0),
      maxParticipants: Number(sess.max_participants ?? 600),
    },
  };
}

export interface PublicQuizResultView {
  sessionId: string;
  quizId: string;
  slug: string;
  title: string;
  status: QuizSessionStatus;
  finalizedAt: string | null;
  participantCount: number;
  leaderboard: LeaderboardEntry[];
  questions: Array<{
    id: string;
    sortOrder: number;
    kind: QuizQuestionKind;
    promptMarkdown: string;
    options: QuizOption[];
    answerKey: string[];
    explanationMarkdown: string | null;
    points: number;
  }>;
}

export async function readPublicQuizResults(db: Db, idOrSlug: string): Promise<PublicQuizResultView | null> {
  const s = await db.first<{
    id: string;
    quiz_id: string;
    slug: string;
    title: string;
    status: QuizSessionStatus;
    finalized_at: string | null;
    results_published: number;
    participant_count: number;
  }>(
    `SELECT qs.id, qs.quiz_id, q.slug, q.title, qs.status, qs.finalized_at, qs.results_published, qs.participant_count
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id AND q.deleted_at IS NULL AND q.status = 'PUBLISHED'
     WHERE qs.id = ?1 OR (q.slug = ?1 AND qs.status = 'FINALIZED' AND qs.results_published = 1)
     ORDER BY qs.finalized_at DESC LIMIT 1`,
    idOrSlug,
  );
  if (!s || s.status !== "FINALIZED" || s.results_published !== 1) return null;

  const [leaders, questions] = await Promise.all([
    db.all<{
      id: string;
      display_name: string;
      participant_type: "STUDENT" | "GUEST";
      score_total: number;
      correct_count: number;
      avg_response_ms: number;
      rank: number | null;
    }>(
      `SELECT id, display_name, participant_type, score_total, correct_count, avg_response_ms, rank
       FROM quiz_participants WHERE session_id = ?1 AND status = 'JOINED'
       ORDER BY score_total DESC, correct_count DESC, avg_response_ms ASC LIMIT 100`,
      s.id,
    ),
    db.all<{
      id: string;
      sort_order: number;
      kind: QuizQuestionKind;
      prompt_markdown: string;
      options_json: string;
      answer_key_json: string;
      explanation_markdown: string | null;
      points: number;
    }>(
      `SELECT id, sort_order, kind, prompt_markdown, options_json, answer_key_json, explanation_markdown, points
       FROM quiz_questions WHERE quiz_id = ?1 AND deleted_at IS NULL ORDER BY sort_order LIMIT 200`,
      s.quiz_id,
    ),
  ]);

  return {
    sessionId: s.id,
    quizId: s.quiz_id,
    slug: s.slug,
    title: s.title,
    status: s.status,
    finalizedAt: s.finalized_at,
    participantCount: Number(s.participant_count ?? 0),
    leaderboard: leaders.map((p, idx) => ({
      rank: p.rank ?? idx + 1,
      participantId: p.id,
      displayName: p.display_name,
      participantType: p.participant_type,
      scoreTotal: p.score_total,
      correctCount: p.correct_count,
      avgResponseMs: p.avg_response_ms,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      sortOrder: q.sort_order,
      kind: q.kind,
      promptMarkdown: q.prompt_markdown,
      options: JSON.parse(q.options_json) as QuizOption[],
      answerKey: JSON.parse(q.answer_key_json) as string[],
      explanationMarkdown: q.explanation_markdown,
      points: q.points,
    })),
  };
}
