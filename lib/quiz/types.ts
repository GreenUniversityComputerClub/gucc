/**
 * Shared Quiz Arena types, theme presets, validation helpers, and deterministic
 * server-side scoring engine. Runtime-neutral (imported by Next.js, Worker services,
 * QuizRoom Durable Object, and tests).
 */

export const QUIZ_VISIBILITIES = ["PUBLIC", "MEMBERS", "EVENT"] as const;
export type QuizVisibility = (typeof QUIZ_VISIBILITIES)[number];

export const QUIZ_ACCESS_MODES = ["GUEST", "REGISTERED", "MEMBERS_ONLY"] as const;
export type QuizAccessMode = (typeof QUIZ_ACCESS_MODES)[number];

export const QUIZ_SCORING_MODES = ["FIXED", "SPEED_BONUS"] as const;
export type QuizScoringMode = (typeof QUIZ_SCORING_MODES)[number];

export const QUIZ_STATUSES = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const QUIZ_THEME_PRESETS = ["CYBER_ARENA", "ACADEMIC", "GAME_SHOW", "EVENT_SPECIAL"] as const;
export type QuizThemePreset = (typeof QUIZ_THEME_PRESETS)[number];

export const QUIZ_QUESTION_KINDS = ["MCQ", "MULTI_SELECT", "TRUE_FALSE"] as const;
export type QuizQuestionKind = (typeof QUIZ_QUESTION_KINDS)[number];

export const QUIZ_SESSION_MODES = ["LIVE_HOSTED", "ASYNC_PRACTICE"] as const;
export type QuizSessionMode = (typeof QUIZ_SESSION_MODES)[number];

export const QUIZ_SESSION_STATUSES = [
  "LOBBY",
  "QUESTION",
  "REVEAL",
  "PAUSED",
  "FINALIZING",
  "FINALIZED",
  "CANCELLED",
] as const;
export type QuizSessionStatus = (typeof QUIZ_SESSION_STATUSES)[number];

export const QUIZ_PARTICIPANT_TYPES = ["STUDENT", "GUEST"] as const;
export type QuizParticipantType = (typeof QUIZ_PARTICIPANT_TYPES)[number];

export const QUIZ_PARTICIPANT_STATUSES = ["JOINED", "KICKED", "BANNED", "DISQUALIFIED"] as const;
export type QuizParticipantStatus = (typeof QUIZ_PARTICIPANT_STATUSES)[number];

export const QUIZ_INCIDENT_KINDS = ["DISPUTE", "MISCONDUCT", "BUG", "APPEAL"] as const;
export type QuizIncidentKind = (typeof QUIZ_INCIDENT_KINDS)[number];

export const QUIZ_INCIDENT_STATUSES = ["OPEN", "DISMISSED", "ACTIONED"] as const;
export type QuizIncidentStatus = (typeof QUIZ_INCIDENT_STATUSES)[number];

export interface QuizOption {
  id: string;
  text: string;
  mediaId?: string | null;
}

export interface QuizScoringConfig {
  /** Base penalty subtracted for an incorrect response (default 0). */
  incorrectPenalty: number;
  /** Maximum speed bonus points when scoringMode is SPEED_BONUS (defaults to 50% of question points when omitted or <= 0? Wait: 0 allows opting out explicitly). */
  speedBonusMax: number;
  /** Award fractional credit on MULTI_SELECT answers when partially correct. */
  partialCredit: boolean;
  /** Optional ceiling on points awarded for any single question. */
  maxPointsPerQuestion: number | null;
}

export interface QuizThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceStyle: "dark" | "light" | "vibrant";
  showCountdown: boolean;
  showLiveLeaderboard: boolean;
}

export const THEME_PRESET_DEFAULTS: Record<QuizThemePreset, QuizThemeConfig> = {
  CYBER_ARENA: {
    primaryColor: "#0f172a",
    secondaryColor: "#1e293b",
    accentColor: "#22d3ee",
    surfaceStyle: "dark",
    showCountdown: true,
    showLiveLeaderboard: true,
  },
  ACADEMIC: {
    primaryColor: "#1e3a8a",
    secondaryColor: "#f8fafc",
    accentColor: "#0284c7",
    surfaceStyle: "light",
    showCountdown: true,
    showLiveLeaderboard: true,
  },
  GAME_SHOW: {
    primaryColor: "#4c1d95",
    secondaryColor: "#2e1065",
    accentColor: "#facc15",
    surfaceStyle: "vibrant",
    showCountdown: true,
    showLiveLeaderboard: true,
  },
  EVENT_SPECIAL: {
    primaryColor: "#064e3b",
    secondaryColor: "#022c22",
    accentColor: "#34d399",
    surfaceStyle: "dark",
    showCountdown: true,
    showLiveLeaderboard: true,
  },
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function cleanThemeConfig(preset: QuizThemePreset, raw: unknown): QuizThemeConfig {
  const base = THEME_PRESET_DEFAULTS[preset] ?? THEME_PRESET_DEFAULTS.CYBER_ARENA;
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hex = (k: string, fallback: string) =>
    typeof o[k] === "string" && HEX_COLOR_RE.test(o[k].trim()) ? o[k].trim().toLowerCase() : fallback;
  const surface = o.surfaceStyle === "dark" || o.surfaceStyle === "light" || o.surfaceStyle === "vibrant" ? o.surfaceStyle : base.surfaceStyle;
  return {
    primaryColor: hex("primaryColor", base.primaryColor),
    secondaryColor: hex("secondaryColor", base.secondaryColor),
    accentColor: hex("accentColor", base.accentColor),
    surfaceStyle: surface,
    showCountdown: typeof o.showCountdown === "boolean" ? o.showCountdown : base.showCountdown,
    showLiveLeaderboard: typeof o.showLiveLeaderboard === "boolean" ? o.showLiveLeaderboard : base.showLiveLeaderboard,
  };
}

export function cleanScoringConfig(raw: unknown, scoringMode: QuizScoringMode = "SPEED_BONUS"): QuizScoringConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const num = (k: string, fallback: number, min: number, max: number) => {
    const n = Number(o[k]);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const maxRaw = o.maxPointsPerQuestion;
  const maxPointsPerQuestion =
    maxRaw !== null && maxRaw !== undefined && Number.isInteger(Number(maxRaw)) && Number(maxRaw) >= 1 && Number(maxRaw) <= 20_000
      ? Number(maxRaw)
      : null;
  return {
    incorrectPenalty: num("incorrectPenalty", 0, 0, 10_000),
    speedBonusMax: scoringMode === "SPEED_BONUS" ? num("speedBonusMax", 500, 0, 10_000) : 0,
    partialCredit: Boolean(o.partialCredit),
    maxPointsPerQuestion,
  };
}

export interface ScoreAnswerInput {
  kind: QuizQuestionKind;
  basePoints: number;
  negativePoints?: number;
  scoringMode: QuizScoringMode;
  scoringConfig: QuizScoringConfig;
  timeLimitSec: number;
  responseMs: number;
  selectedIds: string[];
  correctIds: string[];
}

export interface ScoreAnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
}

/**
 * Deterministic, authoritative question scorer.
 *
 * - Single choice (MCQ / TRUE_FALSE): exact match earns `basePoints + speedBonus`; mismatch loses
 *   configured penalty (`negativePoints || scoringConfig.incorrectPenalty`).
 * - Multiple select (MULTI_SELECT): exact match earns full points + speed bonus. Partial match
 *   with `partialCredit: true` scales base points by `max(0, hits / totalCorrect - misses * 0.25)`
 *   (no speed bonus on partial credit). Wrong selection without partial credit loses penalty.
 */
export function scoreQuestionAnswer(input: ScoreAnswerInput): ScoreAnswerResult {
  const selected = [...new Set(input.selectedIds.map((x) => String(x).trim()).filter(Boolean))];
  const correct = [...new Set(input.correctIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!selected.length || !correct.length) return { isCorrect: false, pointsAwarded: 0 };

  const correctSet = new Set(correct);
  const hits = selected.filter((id) => correctSet.has(id)).length;
  const misses = selected.length - hits;
  const exactMatch = hits === correctSet.size && misses === 0;
  const penalty = Math.max(0, input.negativePoints || input.scoringConfig.incorrectPenalty || 0);

  const durationMs = Math.max(1000, input.timeLimitSec * 1000);
  const clampedMs = Math.max(0, Math.min(durationMs, Math.round(input.responseMs)));
  const speedBonusMax = input.scoringMode === "SPEED_BONUS" ? Math.max(0, input.scoringConfig.speedBonusMax) : 0;
  const speedBonus = speedBonusMax > 0 ? Math.floor((speedBonusMax * (durationMs - clampedMs)) / durationMs) : 0;

  const cap = (pts: number) =>
    input.scoringConfig.maxPointsPerQuestion !== null ? Math.min(pts, input.scoringConfig.maxPointsPerQuestion) : pts;

  if (exactMatch) {
    return { isCorrect: true, pointsAwarded: cap(Math.max(0, input.basePoints + speedBonus)) };
  }

  if (input.kind === "MULTI_SELECT" && input.scoringConfig.partialCredit && hits > 0) {
    const ratio = hits / correctSet.size - (misses * 1) / Math.max(2, correctSet.size);
    if (ratio > 0) {
      return { isCorrect: false, pointsAwarded: cap(Math.max(0, Math.round(input.basePoints * ratio))) };
    }
  }

  return { isCorrect: false, pointsAwarded: penalty > 0 ? -penalty : 0 };
}

/** Public-safe standing row (omits email, studentId, phone, tokenHash). */
export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  displayName: string;
  participantType: QuizParticipantType;
  scoreTotal: number;
  correctCount: number;
  avgResponseMs: number;
}

/** Assign competition ranks (1, 1, 3) after deterministic sort by score desc, correct desc, speed asc. */
export function rankParticipants<
  T extends { scoreTotal: number; correctCount: number; avgResponseMs: number; participantId: string },
>(rows: T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort(
    (a, b) =>
      b.scoreTotal - a.scoreTotal ||
      b.correctCount - a.correctCount ||
      a.avgResponseMs - b.avgResponseMs ||
      a.participantId.localeCompare(b.participantId),
  );
  let prevRank = 0;
  return sorted.map((row, idx) => {
    const prev = idx > 0 ? sorted[idx - 1]! : null;
    const tied =
      prev !== null &&
      prev.scoreTotal === row.scoreTotal &&
      prev.correctCount === row.correctCount &&
      prev.avgResponseMs === row.avgResponseMs;
    const rank = tied ? prevRank : idx + 1;
    prevRank = rank;
    return { ...row, rank };
  });
}

/** Room snapshot / wire messages shared between QuizRoom DO and client/BFF. */
export interface QuizQuestionPublic {
  id: string;
  index: number;
  kind: QuizQuestionKind;
  promptMarkdown: string;
  mediaUrl: string | null;
  options: QuizOption[];
  timeLimitSec: number;
  points: number;
}

export interface QuizStateSnapshot {
  sessionId: string;
  quizId: string;
  joinCode: string;
  title: string;
  status: QuizSessionStatus;
  currentQuestionIdx: number;
  totalQuestions: number;
  questionStartedAt: string | null;
  questionEndsAt: string | null;
  participantCount: number;
  question: QuizQuestionPublic | null;
  /** Populated ONLY when status is REVEAL or FINALIZED (or role is host). */
  answerKey: string[] | null;
  explanationMarkdown: string | null;
  optionCounts: Record<string, number> | null;
  answeredCount: number;
  leaderboard: LeaderboardEntry[];
  me: {
    participantId: string;
    displayName: string;
    scoreTotal: number;
    correctCount: number;
    avgResponseMs: number;
    rank: number | null;
    answeredCurrent: boolean;
  } | null;
}

/** Interface implemented by workers/api/src/quiz.ts so services stay decoupled from DurableObject bindings. */
export interface QuizRoomInitPayload {
  sessionId: string;
  quizId: string;
  joinCode: string;
  title: string;
  scoringMode: QuizScoringMode;
  scoringConfig: QuizScoringConfig;
  defaultTimeLimitSec: number;
  maxParticipants: number;
  status: QuizSessionStatus;
  questions: Array<{
    id: string;
    sortOrder: number;
    kind: QuizQuestionKind;
    promptMarkdown: string;
    mediaUrl: string | null;
    options: QuizOption[];
    answerKey: string[];
    explanationMarkdown: string | null;
    timeLimitSec: number;
    points: number;
    negativePoints: number;
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    participantType: QuizParticipantType;
    status: QuizParticipantStatus;
  }>;
}

export interface QuizRoomFinalizeExport {
  sessionId: string;
  status: QuizSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  participants: Array<{
    participantId: string;
    scoreTotal: number;
    correctCount: number;
    avgResponseMs: number;
    rank: number;
  }>;
  answers: Array<{
    id: string;
    participantId: string;
    questionId: string;
    selected: string[];
    isCorrect: boolean;
    pointsAwarded: number;
    responseMs: number;
    answeredAt: string;
  }>;
}

export interface QuizRoomClient {
  ensureInitialized(payload: QuizRoomInitPayload): Promise<void>;
  syncParticipant(sessionId: string, participant: { id: string; displayName: string; participantType: QuizParticipantType; status: QuizParticipantStatus }): Promise<void>;
  hostAction(sessionId: string, action: string, opts?: { questionIdx?: number; participantId?: string; status?: QuizParticipantStatus }): Promise<QuizStateSnapshot>;
  getState(sessionId: string, opts?: { participantId?: string | null; role?: "host" | "player" }): Promise<QuizStateSnapshot | null>;
  finalizeExport(sessionId: string): Promise<QuizRoomFinalizeExport>;
  markFinalized(sessionId: string): Promise<void>;
}
