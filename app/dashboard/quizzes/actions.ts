"use server";

import { runAction } from "@/lib/api/session";
import type { QuizParticipantStatus } from "@/lib/quiz/types";

type Fd = FormData;

const str = (fd: Fd, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const bool = (fd: Fd, k: string) => {
  const v = str(fd, k);
  return v === "on" || v === "true" || v === "1";
};

function quizPayload(fd: Fd) {
  const maxRaw = str(fd, "maxPointsPerQuestion").trim();
  const payload: Record<string, unknown> = {
    title: str(fd, "title"),
    slug: str(fd, "slug") || null,
    topic: str(fd, "topic") || null,
    description: str(fd, "description") || null,
    visibility: str(fd, "visibility") || "PUBLIC",
    accessMode: str(fd, "accessMode") || "GUEST",
    eventId: str(fd, "eventId") || null,
    committeeId: str(fd, "committeeId") || null,
    bannerMediaId: str(fd, "bannerMediaId") || null,
    logoMediaId: str(fd, "logoMediaId") || null,
    themePreset: str(fd, "themePreset") || "CYBER_ARENA",
    themeConfig: {
      primaryColor: str(fd, "primaryColor") || undefined,
      secondaryColor: str(fd, "secondaryColor") || undefined,
      accentColor: str(fd, "accentColor") || undefined,
      surfaceStyle: str(fd, "surfaceStyle") || undefined,
      showCountdown: bool(fd, "showCountdown"),
      showLiveLeaderboard: bool(fd, "showLiveLeaderboard"),
    },
    scoringMode: str(fd, "scoringMode") || "SPEED_BONUS",
    scoringConfig: {
      speedBonusMax: str(fd, "speedBonusMax") !== "" ? Number(str(fd, "speedBonusMax")) : 500,
      incorrectPenalty: str(fd, "incorrectPenalty") !== "" ? Number(str(fd, "incorrectPenalty")) : 0,
      maxPointsPerQuestion: maxRaw ? Number(maxRaw) : null,
      partialCredit: bool(fd, "partialCredit"),
    },
    defaultTimeLimitSec: str(fd, "defaultTimeLimitSec") !== "" ? Number(str(fd, "defaultTimeLimitSec")) : 20,
    shuffleQuestions: bool(fd, "shuffleQuestions"),
    shuffleOptions: bool(fd, "shuffleOptions"),
  };
  const exp = str(fd, "expectedUpdatedAt");
  if (exp) payload.expectedUpdatedAt = exp;
  return payload;
}

export async function createQuizAction(fd: Fd) {
  return runAction<{ id: string; slug: string }>("quizzes.create", { input: quizPayload(fd) }, { message: "Quiz draft created." });
}

export async function updateQuizAction(id: string, fd: Fd) {
  return runAction("quizzes.update", { id, input: quizPayload(fd) }, { message: "Quiz settings saved." });
}

export async function saveQuestionsAction(id: string, fd: Fd) {
  let questions: unknown = [];
  try {
    questions = JSON.parse(str(fd, "questions") || "[]");
  } catch {
    questions = [];
  }
  return runAction<{ count: number }>("quizzes.saveQuestions", { id, questions }, { message: "Question bank saved." });
}

export async function setModeratorsAction(id: string, fd: Fd) {
  const userIds = str(fd, "userIds")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const canEdit = bool(fd, "canEdit");
  return runAction(
    "quizzes.setModerators",
    { id, moderators: userIds.map((userId) => ({ userId, canEdit, canHost: true })) },
    { message: "Quiz moderators updated." },
  );
}

export async function publishQuizAction(id: string, _fd: Fd) {
  return runAction<{ outcome: string; message: string }>("quizzes.publish", { id }, { message: "Quiz published." });
}

export async function setQuizStatusAction(id: string, status: "DRAFT" | "ARCHIVED", _fd: Fd) {
  return runAction("quizzes.setStatus", { id, status }, { message: status === "ARCHIVED" ? "Quiz archived." : "Moved to draft." });
}

export async function deleteQuizAction(id: string, _fd: Fd) {
  return runAction("quizzes.delete", { id }, { message: "Quiz deleted." });
}

export async function createQuizSessionAction(quizId: string, fd: Fd) {
  const r = await runAction<{ sessionId: string; joinCode: string }>(
    "quizzes.createSession",
    {
      quizId,
      input: {
        mode: str(fd, "mode") || "LIVE_HOSTED",
        maxParticipants: str(fd, "maxParticipants") !== "" ? Number(str(fd, "maxParticipants")) : undefined,
        scheduledStartAt: str(fd, "scheduledStartAt") || null,
        registrationOpensAt: str(fd, "registrationOpensAt") || null,
        registrationClosesAt: str(fd, "registrationClosesAt") || null,
        resultsPublished: fd.has("resultsPublished") ? bool(fd, "resultsPublished") : true,
      },
    },
    { message: "Live session created." },
  );
  // Expose `id` so ActionForm's `redirectTo="/dashboard/quizzes/host/{id}"` navigates cleanly.
  return r.ok && r.data ? { ...r, data: { ...r.data, id: r.data.sessionId } } : r;
}

export async function hostQuizAction(sessionId: string, action: "start" | "next" | "reveal" | "pause" | "resume", questionIdx?: number) {
  return runAction("quizzes.hostAction", { sessionId, action, ...(questionIdx !== undefined ? { questionIdx } : {}) });
}

export async function kickParticipantAction(sessionId: string, participantId: string, status: QuizParticipantStatus, reason?: string) {
  return runAction("quizzes.kickParticipant", { sessionId, participantId, status, reason }, { message: `Participant marked ${status.toLowerCase()}.` });
}

export async function finalizeQuizAction(sessionId: string) {
  return runAction<{ sessionId: string; status: string }>("quizzes.finalize", { sessionId }, { message: "Session finalized and saved." });
}

export async function issueQuizCertificatesAction(sessionId: string, fd: Fd) {
  const topRaw = str(fd, "topN").trim();
  return runAction<{ batchIds: string[]; issued: number }>(
    "quizzes.issueCertificates",
    {
      sessionId,
      name: str(fd, "name") || undefined,
      topN: topRaw ? Number(topRaw) : undefined,
      notify: bool(fd, "notify"),
    },
    { message: "Certificates issued." },
  );
}

export async function resolveIncidentAction(id: string, status: "DISMISSED" | "ACTIONED", fd: Fd) {
  return runAction("quizzes.resolveIncident", { id, status, note: str(fd, "note") || null }, { message: "Incident updated." });
}
