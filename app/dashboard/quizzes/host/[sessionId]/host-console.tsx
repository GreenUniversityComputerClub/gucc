"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Award,
  Ban,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipForward,
  Sparkles,
  UserX,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { ActionForm, Field, Section } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { API_PUBLIC_BASE_URL, MEDIA_BASE_URL } from "@/lib/api/config";
import {
  sanitizeQuizSnapshot,
  type LeaderboardEntry,
  type QuizParticipantStatus,
  type QuizSessionStatus,
  type QuizStateSnapshot,
} from "@/lib/quiz/types";
import { safeMediaSrc } from "@/lib/safe-path";
import type { quizHostView } from "@/lib/server/views/admin";
import {
  finalizeQuizAction,
  hostQuizAction,
  issueQuizCertificatesAction,
  kickParticipantAction,
} from "../../actions";
import { JoinQrButton } from "../../[id]/join-qr-button";

type HostViewData = Awaited<ReturnType<typeof quizHostView>>;

const STATUS_STYLE: Record<QuizSessionStatus, string> = {
  LOBBY: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  QUESTION: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  REVEAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  PAUSED: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  FINALIZING: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  FINALIZED: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  CANCELLED: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

function fallbackSnapshot(initial: HostViewData): QuizStateSnapshot {
  const s = initial.session ?? {};
  const q = initial.quiz ?? {};
  return {
    sessionId: String(s.id ?? ""),
    quizId: String(s.quiz_id ?? q.id ?? ""),
    joinCode: String(s.join_code ?? ""),
    title: String(q.title ?? "Quiz Session"),
    status: (String(s.status ?? "LOBBY") as QuizSessionStatus) || "LOBBY",
    currentQuestionIdx: Number(s.current_question_idx ?? 0),
    totalQuestions: initial.questions.length,
    questionStartedAt: s.question_started_at ? String(s.question_started_at) : null,
    questionEndsAt: s.question_ends_at ? String(s.question_ends_at) : null,
    participantCount: initial.participants.filter((p) => p.status === "JOINED").length,
    question: null,
    answerKey: null,
    explanationMarkdown: null,
    optionCounts: null,
    answeredCount: 0,
    leaderboard: initial.participants
      .filter((p) => p.status === "JOINED")
      .slice(0, 20)
      .map((p, i) => ({
        rank: p.rank ?? i + 1,
        participantId: p.id,
        displayName: p.display_name,
        participantType: p.participant_type === "STUDENT" ? "STUDENT" : "GUEST",
        scoreTotal: p.score_total,
        correctCount: p.correct_count,
        avgResponseMs: p.avg_response_ms,
      })),
    me: null,
  };
}

export function HostConsole({ initial }: { initial: HostViewData }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [snap, setSnap] = useState<QuizStateSnapshot>(() => initial.state ?? fallbackSnapshot(initial));
  const [connMode, setConnMode] = useState<"connecting" | "live" | "poll" | "closed">("connecting");
  const [actionError, setActionError] = useState<string | null>(null);
  const [projectorMode, setProjectorMode] = useState(false);
  const [search, setSearch] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, startTransition] = useTransition();

  const sessionId = snap.sessionId;
  const quizId = snap.quizId;
  const quizSlug = String(initial.quiz?.slug ?? "");
  const isTerminal = snap.status === "FINALIZED" || snap.status === "CANCELLED";

  const wsRef = useRef<WebSocket | null>(null);

  const pollSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${encodeURIComponent(sessionId)}?asHost=1`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; data?: QuizStateSnapshot | null };
      if (body.ok && body.data) {
        setSnap(sanitizeQuizSnapshot(body.data, MEDIA_BASE_URL, API_PUBLIC_BASE_URL));
      }
    } catch {
      // ignore transient network errors during poll
    }
  }, [sessionId]);

  useEffect(() => {
    if (isTerminal) {
      setConnMode("closed");
      wsRef.current?.close(1000, "Session ended");
      wsRef.current = null;
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const clearTimers = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const startFallbackPoll = () => {
      if (pollTimer || cancelled) return;
      setConnMode("poll");
      void pollSnapshot();
      pollTimer = setInterval(() => {
        void pollSnapshot();
      }, 2500);
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        setConnMode((prev) => (prev === "poll" ? "poll" : "connecting"));
        const res = await fetch("/api/quiz/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ticket", sessionId, asHost: true }),
        });
        if (!res.ok) {
          startFallbackPoll();
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          mode?: "live" | "poll";
          wsUrl?: string;
          ticket?: string;
        };
        if (cancelled) return;
        if (!data.ok || data.mode !== "live" || !data.wsUrl) {
          startFallbackPoll();
          return;
        }

        const ws = new WebSocket(data.wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) {
            ws.close(1000);
            return;
          }
          attempt = 0;
          setConnMode("live");
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send("ping");
          }, 45_000);
        };

        ws.onmessage = (ev) => {
          if (cancelled || typeof ev.data !== "string" || ev.data === "pong") return;
          try {
            const msg = JSON.parse(ev.data) as
              | { t: "state" | "question" | "reveal"; data: QuizStateSnapshot }
              | { t: "participants"; count: number }
              | { t: "progress"; qIdx: number; answeredCount: number; participantCount: number }
              | { t: "paused"; remainingMs: number }
              | { t: "resumed"; questionEndsAt: string }
              | { t: "finalized"; leaderboard: LeaderboardEntry[] };

            if (msg.t === "state" || msg.t === "question" || msg.t === "reveal") {
              setSnap(sanitizeQuizSnapshot(msg.data, MEDIA_BASE_URL, API_PUBLIC_BASE_URL));
            } else if (msg.t === "participants") {
              setSnap((prev) => ({ ...prev, participantCount: msg.count }));
            } else if (msg.t === "progress") {
              setSnap((prev) =>
                prev.currentQuestionIdx === msg.qIdx
                  ? { ...prev, answeredCount: msg.answeredCount, participantCount: msg.participantCount }
                  : prev,
              );
            } else if (msg.t === "paused") {
              setSnap((prev) => ({ ...prev, status: "PAUSED" }));
            } else if (msg.t === "resumed") {
              setSnap((prev) => ({ ...prev, status: "QUESTION", questionEndsAt: msg.questionEndsAt }));
            } else if (msg.t === "finalized") {
              setSnap((prev) => ({ ...prev, status: "FINALIZED", leaderboard: msg.leaderboard }));
              router.refresh();
            }
          } catch {
            // ignore non-JSON frame
          }
        };

        ws.onclose = () => {
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          if (cancelled) return;
          startFallbackPoll();
          const backoff = Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4)) + Math.round(Math.random() * 600);
          attempt += 1;
          retryTimer = setTimeout(() => {
            void connect();
          }, backoff);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        startFallbackPoll();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimers();
      wsRef.current?.close(1000, "Component unmounted");
      wsRef.current = null;
    };
  }, [sessionId, isTerminal, pollSnapshot, router]);

  useEffect(() => {
    if (snap.status !== "QUESTION" || !snap.questionEndsAt) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [snap.status, snap.questionEndsAt]);

  const runHost = (action: "start" | "next" | "reveal" | "pause" | "resume", questionIdx?: number) => {
    setActionError(null);
    startTransition(async () => {
      const res = await hostQuizAction(sessionId, action, questionIdx);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      if (connMode !== "live") {
        await pollSnapshot();
      }
    });
  };

  const handleFinalize = async () => {
    const ok = await confirm({
      title: "Finalize quiz session?",
      description:
        "This saves final scores, computes tie-broken rankings in the database, locks the room permanently, and unlocks CSV export & certificates.",
      confirmLabel: "Finalize & save results",
    });
    if (!ok) return;
    setActionError(null);
    startTransition(async () => {
      const res = await finalizeQuizAction(sessionId);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      await pollSnapshot();
      router.refresh();
    });
  };

  const handleKick = async (p: HostViewData["participants"][number], targetStatus: QuizParticipantStatus) => {
    const label = targetStatus === "KICKED" ? "Kick" : targetStatus === "DISQUALIFIED" ? "Disqualify" : "Ban";
    const ok = await confirm({
      title: `${label} ${p.display_name}?`,
      description:
        targetStatus === "KICKED"
          ? "Disconnects this participant from the active room."
          : "Removes this participant from the live room and excludes them from final leaderboard standings.",
      confirmLabel: `${label} participant`,
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    startTransition(async () => {
      const res = await kickParticipantAction(sessionId, p.id, targetStatus, `Host action: ${targetStatus}`);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const endsMs = snap.questionEndsAt ? Date.parse(snap.questionEndsAt) : null;
  const startsMs = snap.questionStartedAt ? Date.parse(snap.questionStartedAt) : null;
  const totalQuestionMs = snap.question ? Math.max(1000, snap.question.timeLimitSec * 1000) : endsMs && startsMs ? Math.max(1000, endsMs - startsMs) : 20_000;
  const remainingMs = endsMs ? Math.max(0, endsMs - nowMs) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const timerPct = snap.status === "QUESTION" && endsMs ? Math.min(100, Math.max(0, (remainingMs / totalQuestionMs) * 100)) : 0;

  const questionMediaSrc = safeMediaSrc(snap.question?.mediaUrl, MEDIA_BASE_URL, API_PUBLIC_BASE_URL);
  const hasMoreQuestions = snap.currentQuestionIdx + 1 < snap.totalQuestions;
  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initial.participants;
    return initial.participants.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.student_id ?? "").toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q) ||
        (p.institution ?? "").toLowerCase().includes(q),
    );
  }, [initial.participants, search]);

  const totalVotes = useMemo(() => {
    if (!snap.optionCounts) return 0;
    return Object.values(snap.optionCounts).reduce((sum, n) => sum + n, 0);
  }, [snap.optionCounts]);

  const openIncidents = useMemo(
    () => initial.incidents.filter((i) => String(i.status ?? "") === "OPEN"),
    [initial.incidents],
  );

  return (
    <div className="space-y-6">
      {confirmDialog}

      {/* Top Status & Projector Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Join Code</span>
            <div className="font-mono text-3xl font-extrabold tracking-[0.22em] text-primary sm:text-4xl">
              {snap.joinCode}
            </div>
          </div>
          <div className="h-10 w-px bg-border" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[snap.status]}`}>
              {snap.status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {snap.participantCount} joined
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
              {connMode === "live" ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  <span className="text-emerald-700 dark:text-emerald-400">Live WebSocket</span>
                </>
              ) : connMode === "closed" ? (
                <span className="text-muted-foreground">Session closed</span>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                  <span className="text-amber-700 dark:text-amber-400">
                    {connMode === "connecting" ? "Connecting…" : "HTTP fallback polling"}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <JoinQrButton joinCode={snap.joinCode} title={snap.title} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setProjectorMode((v) => !v)}
            className="min-h-9 gap-1.5"
          >
            {projectorMode ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
            {projectorMode ? "Admin view" : "Projector view"}
          </Button>
          {quizSlug && snap.status === "FINALIZED" && (
            <Link
              prefetch={false}
              href={`/quizzes/${quizSlug}/results`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Public results
            </Link>
          )}
        </div>
      </div>

      {/* Host Control Bar */}
      {!isTerminal && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {snap.status === "LOBBY" && (
              <Button
                type="button"
                disabled={busy || snap.totalQuestions === 0}
                onClick={() => runHost("start")}
                className="min-h-10 gap-2"
              >
                <Play className="h-4 w-4" aria-hidden />
                Start Quiz (Q1)
              </Button>
            )}

            {snap.status === "QUESTION" && (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => runHost("pause")} className="min-h-10 gap-2">
                  <Pause className="h-4 w-4" aria-hidden />
                  Pause Timer
                </Button>
                <Button type="button" disabled={busy} onClick={() => runHost("reveal")} className="min-h-10 gap-2">
                  <Eye className="h-4 w-4" aria-hidden />
                  Reveal Answer
                </Button>
              </>
            )}

            {snap.status === "PAUSED" && (
              <>
                <Button type="button" disabled={busy} onClick={() => runHost("resume")} className="min-h-10 gap-2">
                  <Play className="h-4 w-4" aria-hidden />
                  Resume Timer
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => runHost("reveal")} className="min-h-10 gap-2">
                  <Eye className="h-4 w-4" aria-hidden />
                  Reveal Answer
                </Button>
              </>
            )}

            {snap.status === "REVEAL" && hasMoreQuestions && (
              <Button type="button" disabled={busy} onClick={() => runHost("next")} className="min-h-10 gap-2">
                <SkipForward className="h-4 w-4" aria-hidden />
                Next Question (Q{snap.currentQuestionIdx + 2})
              </Button>
            )}

            {(snap.status === "REVEAL" || snap.status === "FINALIZING") && (
              <Button
                type="button"
                variant={hasMoreQuestions ? "outline" : "default"}
                disabled={busy}
                onClick={() => void handleFinalize()}
                className="min-h-10 gap-2"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {hasMoreQuestions ? "Finish & Finalize Early" : "Finalize & Save Results"}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {snap.totalQuestions > 0 && (
              <label className="flex items-center gap-2">
                <span>Jump to:</span>
                <select
                  aria-label="Jump to question"
                  className="h-9 rounded-md border bg-background px-2 text-xs text-foreground"
                  value={String(snap.currentQuestionIdx)}
                  disabled={busy}
                  onChange={(e) => runHost("next", Number(e.target.value))}
                >
                  {initial.questions.map((q, idx) => (
                    <option key={q.id} value={String(idx)}>
                      Q{idx + 1}: {q.prompt_markdown.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Main Live Stage + Leaderboard Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        {/* Question / Lobby Stage */}
        <section className="space-y-4 rounded-xl border bg-card p-5">
          {snap.status === "LOBBY" ? (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                Lobby Open — Waiting for Players
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{snap.title}</h2>
              <p className="text-sm text-muted-foreground">
                Ask students and guests to visit <strong className="font-mono text-foreground">/q/{snap.joinCode}</strong> or enter code{" "}
                <strong className="font-mono text-foreground">{snap.joinCode}</strong>.
              </p>
              <div className="mx-auto inline-block rounded-xl border bg-muted/40 px-8 py-4 font-mono text-4xl font-black tracking-[0.25em] sm:text-5xl">
                {snap.joinCode}
              </div>
              <p className="text-xs text-muted-foreground">
                {snap.totalQuestions} question{snap.totalQuestions === 1 ? "" : "s"} queued · {snap.participantCount} player
                {snap.participantCount === 1 ? "" : "s"} connected
              </p>
            </div>
          ) : snap.status === "FINALIZED" ? (
            <div className="space-y-3 py-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Session Finalized
              </div>
              <h2 className="text-xl font-bold">{snap.title}</h2>
              <p className="text-sm text-muted-foreground">
                All answers and rankings have been written to permanent records. You can download the full CSV report or issue verifiable certificates below.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={`/api/admin/quizzes/${encodeURIComponent(sessionId)}/export`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download Results CSV
                </a>
                {quizSlug && (
                  <Link
                    prefetch={false}
                    href={`/quizzes/${quizSlug}/results`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Open Public Standings
                  </Link>
                )}
              </div>
            </div>
          ) : snap.question ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Question {snap.currentQuestionIdx + 1} of {snap.totalQuestions} · {snap.question.kind.replace("_", " ")} ·{" "}
                  {snap.question.points} pts
                </span>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <span>
                    {snap.answeredCount}/{snap.participantCount} answered
                  </span>
                  {snap.status === "QUESTION" && snap.questionEndsAt && (
                    <span className={`font-mono text-base font-bold ${remainingSec <= 5 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                      {remainingSec}s
                    </span>
                  )}
                </div>
              </div>

              {snap.status === "QUESTION" && snap.questionEndsAt && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-label="Question countdown">
                  <div
                    className={`h-full transition-[width] duration-200 ${remainingSec <= 5 ? "bg-rose-500" : "bg-primary"}`}
                    style={{ width: `${timerPct}%` }}
                  />
                </div>
              )}

              <div className="whitespace-pre-wrap text-lg font-semibold leading-snug sm:text-xl">
                {snap.question.promptMarkdown}
              </div>

              {questionMediaSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={questionMediaSrc}
                  alt={`Illustration for question ${snap.currentQuestionIdx + 1}`}
                  className="max-h-64 rounded-lg border object-contain"
                />
              )}

              <div className="grid gap-2.5 sm:grid-cols-2">
                {snap.question.options.map((opt, idx) => {
                  const isCorrect = snap.answerKey?.includes(opt.id) ?? false;
                  const count = snap.optionCounts?.[opt.id] ?? 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const revealCorrect = (snap.status === "REVEAL" || snap.answerKey !== null) && isCorrect;
                  return (
                    <div
                      key={opt.id}
                      className={`relative overflow-hidden rounded-lg border p-3 ${
                        revealCorrect
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border bg-background"
                      }`}
                    >
                      {snap.optionCounts && (
                        <div
                          className={`pointer-events-none absolute inset-y-0 left-0 opacity-20 transition-all ${
                            revealCorrect ? "bg-emerald-500" : "bg-primary"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <div className="relative flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-muted font-mono text-xs font-bold">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-sm font-medium">{opt.text}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                          {revealCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}
                          {snap.optionCounts && <span className="tabular-nums text-muted-foreground">{count} ({pct}%)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {snap.status === "REVEAL" && snap.explanationMarkdown && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <span className="font-semibold">Explanation: </span>
                  <span className="whitespace-pre-wrap text-muted-foreground">{snap.explanationMarkdown}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No active question loaded yet.</p>
          )}
        </section>

        {/* Live Leaderboard */}
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Live Leaderboard (Top 20)</h2>
            <span className="text-xs text-muted-foreground">{snap.leaderboard.length} ranked</span>
          </div>
          {snap.leaderboard.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No scores yet. Leaderboard updates on each reveal.</p>
          ) : (
            <ol className="divide-y">
              {snap.leaderboard.slice(0, 20).map((entry) => (
                <li key={entry.participantId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                        entry.rank === 1
                          ? "bg-amber-400/25 text-amber-700 dark:text-amber-300"
                          : entry.rank === 2
                            ? "bg-slate-400/25 text-slate-700 dark:text-slate-300"
                            : entry.rank === 3
                              ? "bg-orange-400/25 text-orange-700 dark:text-orange-300"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <span className="truncate font-medium">{entry.displayName}</span>
                    {entry.participantType === "GUEST" && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Guest</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs">
                    <span className="text-sm font-bold text-foreground">{entry.scoreTotal}</span>{" "}
                    <span className="text-muted-foreground">pts · {entry.correctCount}✓</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Post-Finalization Certificates Bridge (hidden in Projector View) */}
      {!projectorMode && snap.status === "FINALIZED" && initial.capabilities.issueCertificates && (
        <Section
          title="Issue Participation & Achievement Certificates"
          description="One-click batch issuance for this session. Notifications are delivered in-dashboard (zero email quota spent)."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <ActionForm action={issueQuizCertificatesAction.bind(null, sessionId)} submitLabel="Issue Quiz Certificates" className="grid gap-3 sm:grid-cols-3">
              <Field name="name" label="Certificate title / occasion" defaultValue={snap.title} />
              <Field name="topN" label="Top N winners (blank = all)" type="number" placeholder="e.g. 3 for podium, blank for all" />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="notify" defaultChecked className="h-4 w-4" />
                  Notify members in dashboard
                </label>
              </div>
            </ActionForm>
            <Link
              prefetch={false}
              href="/dashboard/certificates/new"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <Award className="h-4 w-4" aria-hidden />
              Open full certificate wizard
            </Link>
          </div>
        </Section>
      )}

      {/* Participant Moderation Table & Incidents (hidden in Projector View) */}
      {!projectorMode && (
        <>
          {openIncidents.length > 0 && (
            <Section
              title={`Open Incidents (${openIncidents.length})`}
              description="Reported during this session. Dismiss or action from the main quiz management page."
            >
              <ul className="divide-y text-sm">
                {openIncidents.map((inc) => (
                  <li key={String(inc.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <span className="mr-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Flag className="h-3 w-3" aria-hidden />
                        {String(inc.kind)}
                      </span>
                      <span>{String(inc.reason)}</span>
                      {inc.participant_name ? (
                        <span className="ml-2 text-xs text-muted-foreground">by {String(inc.participant_name)}</span>
                      ) : null}
                    </div>
                    <Link prefetch={false} href={`/dashboard/quizzes/${quizId}`} className="text-xs font-medium text-primary hover:underline">
                      Resolve on quiz page
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Participants (${initial.participants.length})`}
            description="Monitor room roster, scores, and kick/disqualify disruptive accounts."
            actions={
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, ID, dept…"
                aria-label="Filter participants"
                className="h-9 w-56 rounded-md border bg-background px-3 text-xs"
              />
            }
          >
            {filteredParticipants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching participants in this session yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Rank</th>
                      <th className="px-3 py-2 font-medium">Participant</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      {!isTerminal && <th className="px-3 py-2 text-right font-medium">Moderation</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredParticipants.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono text-xs">{p.rank ?? "—"}</td>
                        <td className="px-3 py-2 font-medium">
                          {p.display_name}
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            {p.participant_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {[p.student_id, p.department, p.institution].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.score_total} ({p.correct_count}✓ · {p.avg_response_ms}ms)
                        </td>
                        <td className="px-3 py-2 text-xs">{p.status}</td>
                        {!isTerminal && (
                          <td className="px-3 py-2 text-right">
                            {p.status === "JOINED" && (
                              <div className="inline-flex gap-1">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleKick(p, "KICKED")}
                                  title="Kick"
                                  className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs hover:bg-muted"
                                >
                                  <UserX className="h-3.5 w-3.5" aria-hidden />
                                  Kick
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleKick(p, "DISQUALIFIED")}
                                  title="Disqualify"
                                  className="inline-flex h-8 items-center gap-1 rounded border border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10"
                                >
                                  <Ban className="h-3.5 w-3.5" aria-hidden />
                                  DQ
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
