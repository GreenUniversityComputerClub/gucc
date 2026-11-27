"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Loader2,
  PauseCircle,
  Send,
  Sparkles,
  Trophy,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LeaderboardEntry, QuizIncidentKind, QuizStateSnapshot, QuizThemeConfig } from "@/lib/quiz/types";

interface PlayerArenaProps {
  initial: QuizStateSnapshot;
  slug: string;
  theme: QuizThemeConfig;
}

interface ScoreFeedback {
  qIdx: number;
  isCorrect: boolean;
  pointsAwarded: number;
  scoreTotal: number;
  rank: number;
}

export function PlayerArena({ initial, slug, theme }: PlayerArenaProps) {
  const router = useRouter();
  const [snap, setSnap] = useState<QuizStateSnapshot>(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ackState, setAckState] = useState<{ qIdx: number; ok: boolean; text: string } | null>(null);
  const [scoreFeedback, setScoreFeedback] = useState<ScoreFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connMode, setConnMode] = useState<"connecting" | "live" | "poll" | "closed">("connecting");
  const [removedReason, setRemovedReason] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [reportOpen, setReportOpen] = useState(false);
  const [reportKind, setReportKind] = useState<QuizIncidentKind>("DISPUTE");
  const [reportText, setReportText] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionId = snap.sessionId;
  const isTerminal = snap.status === "FINALIZED" || snap.status === "CANCELLED" || removedReason !== null;

  const pollSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; data?: QuizStateSnapshot };
      if (body.ok && body.data) {
        setSnap((prev) => ({
          ...body.data!,
          me: body.data!.me ?? prev.me,
        }));
      }
    } catch {
      // ignore transient network errors
    }
  }, [sessionId]);

  useEffect(() => {
    if (isTerminal) {
      setConnMode("closed");
      wsRef.current?.close(1000, "Session finished");
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

    const startPoll = () => {
      if (pollTimer || cancelled) return;
      setConnMode("poll");
      void pollSnapshot();
      pollTimer = setInterval(() => void pollSnapshot(), 2500);
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        setConnMode((prev) => (prev === "poll" ? "poll" : "connecting"));
        const res = await fetch("/api/quiz/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ticket", sessionId }),
        });
        if (res.status === 401 || res.status === 403) {
          setRemovedReason("Your session seat is no longer active. Please rejoin from the quiz page.");
          return;
        }
        if (!res.ok) {
          startPoll();
          return;
        }
        const data = (await res.json()) as { ok?: boolean; mode?: "live" | "poll"; wsUrl?: string; ticket?: string };
        if (cancelled) return;
        if (!data.ok || data.mode !== "live" || !data.wsUrl) {
          startPoll();
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
              | { t: "paused"; remainingMs: number }
              | { t: "resumed"; questionEndsAt: string }
              | { t: "ack"; ok: boolean; code?: string; qIdx: number }
              | { t: "score"; qIdx: number; isCorrect: boolean; pointsAwarded: number; scoreTotal: number; rank: number }
              | { t: "finalized"; leaderboard: LeaderboardEntry[] };

            if (msg.t === "state") {
              setSnap((prev) => ({
                ...msg.data,
                me: msg.data.me ?? prev.me,
              }));
            } else if (msg.t === "question") {
              setSelectedIds([]);
              setAckState(null);
              setScoreFeedback(null);
              setSubmitting(false);
              setSnap((prev) => ({
                ...msg.data,
                me: msg.data.me ?? (prev.me ? { ...prev.me, answeredCurrent: false } : null),
              }));
            } else if (msg.t === "reveal") {
              setSubmitting(false);
              setSnap((prev) => ({
                ...msg.data,
                me: msg.data.me ?? prev.me,
              }));
            } else if (msg.t === "paused") {
              setSnap((prev) => ({ ...prev, status: "PAUSED" }));
            } else if (msg.t === "resumed") {
              setSnap((prev) => ({ ...prev, status: "QUESTION", questionEndsAt: msg.questionEndsAt }));
            } else if (msg.t === "ack") {
              setSubmitting(false);
              if (msg.ok) {
                setAckState({ qIdx: msg.qIdx, ok: true, text: "Answer locked in! Waiting for host reveal…" });
                setSnap((prev) => (prev.me ? { ...prev, me: { ...prev.me, answeredCurrent: true } } : prev));
              } else {
                const human =
                  msg.code === "TOO_LATE"
                    ? "Time expired right before your answer arrived."
                    : msg.code === "ALREADY_ANSWERED"
                      ? "Your answer for this question is already locked."
                      : "This question is no longer accepting answers.";
                setAckState({ qIdx: msg.qIdx, ok: false, text: human });
              }
            } else if (msg.t === "score") {
              setScoreFeedback({
                qIdx: msg.qIdx,
                isCorrect: msg.isCorrect,
                pointsAwarded: msg.pointsAwarded,
                scoreTotal: msg.scoreTotal,
                rank: msg.rank,
              });
              setSnap((prev) =>
                prev.me
                  ? {
                      ...prev,
                      me: {
                        ...prev.me,
                        scoreTotal: msg.scoreTotal,
                        rank: msg.rank,
                        correctCount: prev.me.correctCount + (msg.isCorrect ? 1 : 0),
                      },
                    }
                  : prev,
              );
            } else if (msg.t === "finalized") {
              setSnap((prev) => ({ ...prev, status: "FINALIZED", leaderboard: msg.leaderboard }));
              router.refresh();
            }
          } catch {
            // ignore non-JSON frame
          }
        };

        ws.onclose = (ev) => {
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          if (cancelled) return;
          if (ev.code === 4003) {
            setRemovedReason("You were removed from this quiz room by the host.");
            setConnMode("closed");
            return;
          }
          startPoll();
          const backoff = Math.min(15_000, 900 * 2 ** Math.min(attempt, 4)) + Math.round(Math.random() * 500);
          attempt += 1;
          retryTimer = setTimeout(() => void connect(), backoff);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        startPoll();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      clearTimers();
      wsRef.current?.close(1000, "Player left arena");
      wsRef.current = null;
    };
  }, [sessionId, isTerminal, pollSnapshot, router]);

  useEffect(() => {
    if (snap.status !== "QUESTION" || !snap.questionEndsAt) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [snap.status, snap.questionEndsAt]);

  const currentQ = snap.question;
  const alreadyAnswered = Boolean(snap.me?.answeredCurrent) || (ackState?.qIdx === snap.currentQuestionIdx && ackState.ok);
  const canAnswer = snap.status === "QUESTION" && Boolean(currentQ) && !alreadyAnswered && !submitting;

  const toggleOption = useCallback(
    (optId: string) => {
      if (!canAnswer || !currentQ) return;
      if (currentQ.kind === "MULTI_SELECT") {
        setSelectedIds((prev) => (prev.includes(optId) ? prev.filter((x) => x !== optId) : [...prev, optId]));
      } else {
        setSelectedIds([optId]);
      }
    },
    [canAnswer, currentQ],
  );

  const submitAnswer = useCallback(() => {
    if (!canAnswer || !selectedIds.length) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setAckState({
        qIdx: snap.currentQuestionIdx,
        ok: false,
        text: "Connection is re-establishing — please tap Submit again in a moment.",
      });
      return;
    }
    setSubmitting(true);
    setAckState(null);
    ws.send(JSON.stringify({ t: "answer", qIdx: snap.currentQuestionIdx, selected: selectedIds }));
  }, [canAnswer, selectedIds, snap.currentQuestionIdx]);

  useEffect(() => {
    if (!canAnswer || !currentQ || reportOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = Number(e.key);
      if (num >= 1 && num <= currentQ.options.length) {
        const opt = currentQ.options[num - 1];
        if (opt) toggleOption(opt.id);
      } else if (e.key === "Enter" && selectedIds.length > 0) {
        e.preventDefault();
        submitAnswer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAnswer, currentQ, reportOpen, selectedIds.length, submitAnswer, toggleOption]);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportText.trim().length < 5) return;
    setReportBusy(true);
    setReportFeedback(null);
    try {
      const res = await fetch("/api/quiz/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQ?.id,
          kind: reportKind,
          reason: reportText.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setReportFeedback({ ok: false, msg: data.error ?? "Unable to submit report right now." });
      } else {
        setReportFeedback({ ok: true, msg: "Report sent to the host moderator." });
        setReportText("");
        setTimeout(() => {
          setReportOpen(false);
          setReportFeedback(null);
        }, 1200);
      }
    } catch {
      setReportFeedback({ ok: false, msg: "Network error submitting report." });
    } finally {
      setReportBusy(false);
    }
  };

  const endsMs = snap.questionEndsAt ? Date.parse(snap.questionEndsAt) : null;
  const startsMs = snap.questionStartedAt ? Date.parse(snap.questionStartedAt) : null;
  const totalQuestionMs = currentQ ? Math.max(1000, currentQ.timeLimitSec * 1000) : endsMs && startsMs ? Math.max(1000, endsMs - startsMs) : 20_000;
  const remainingMs = endsMs ? Math.max(0, endsMs - nowMs) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const timerPct = snap.status === "QUESTION" && endsMs ? Math.min(100, Math.max(0, (remainingMs / totalQuestionMs) * 100)) : 0;

  const totalVotes = useMemo(() => {
    if (!snap.optionCounts) return 0;
    return Object.values(snap.optionCounts).reduce((sum, n) => sum + n, 0);
  }, [snap.optionCounts]);

  if (removedReason) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-destructive/40 bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
        <h1 className="text-xl font-bold">Disconnected from Room</h1>
        <p className="text-sm text-muted-foreground">{removedReason}</p>
        <Button asChild variant="outline">
          <Link href={`/quizzes/${encodeURIComponent(slug)}`}>Back to quiz page</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Player HUD Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm"
        style={{ borderColor: theme.accentColor ? `${theme.accentColor}55` : undefined }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold sm:text-lg">{snap.title}</h1>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold tracking-wider">#{snap.joinCode}</span>
            </div>
            {snap.me && (
              <p className="text-xs text-muted-foreground">
                Playing as <strong className="text-foreground">{snap.me.displayName}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {snap.me && (
            <div className="inline-flex items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-1.5 font-mono text-xs">
              <span>
                Score: <strong className="text-sm text-foreground">{snap.me.scoreTotal}</strong>
              </span>
              {snap.me.rank !== null && (
                <span>
                  Rank: <strong className="text-sm text-primary">#{snap.me.rank}</strong>
                </span>
              )}
            </div>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
            {connMode === "live" ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                <span className="text-emerald-700 dark:text-emerald-400">Live</span>
              </>
            ) : connMode === "closed" ? (
              <span className="text-muted-foreground">Ended</span>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                <span className="text-amber-700 dark:text-amber-400">{connMode === "connecting" ? "Syncing…" : "Poll"}</span>
              </>
            )}
          </span>

          <Button type="button" variant="ghost" size="sm" onClick={() => setReportOpen(true)} className="h-8 gap-1 px-2.5 text-xs">
            <Flag className="h-3.5 w-3.5" aria-hidden />
            Report
          </Button>
        </div>
      </div>

      {/* Main Arena Stage */}
      {snap.status === "LOBBY" && (
        <section className="space-y-4 rounded-3xl border bg-card p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Waiting in Lobby
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Get Ready!</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            You&apos;re in! Stay on this screen — the first question will appear automatically as soon as the host launches the quiz.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2 text-xs text-muted-foreground">
            <span>{snap.totalQuestions} questions total</span>
            <span>·</span>
            <span>{snap.participantCount} contestants waiting</span>
          </div>
        </section>
      )}

      {snap.status === "PAUSED" && (
        <section className="space-y-3 rounded-3xl border border-amber-500/40 bg-amber-500/5 p-8 text-center">
          <PauseCircle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
          <h2 className="text-xl font-bold">Session Paused by Host</h2>
          <p className="text-sm text-muted-foreground">Hold tight — the timer will resume momentarily.</p>
        </section>
      )}

      {snap.status === "FINALIZED" && (
        <section className="space-y-5 rounded-3xl border border-emerald-500/30 bg-card p-8 text-center shadow-sm">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold sm:text-3xl">Quiz Finished!</h2>
            <p className="text-sm text-muted-foreground">
              Final scores and question-by-question answer explanations are now saved.
            </p>
          </div>
          {snap.me && (
            <div className="mx-auto flex max-w-sm justify-around rounded-2xl border bg-muted/40 p-4">
              <div>
                <div className="text-xs text-muted-foreground">Final Score</div>
                <div className="font-mono text-2xl font-extrabold">{snap.me.scoreTotal}</div>
              </div>
              <div className="w-px bg-border" aria-hidden />
              <div>
                <div className="text-xs text-muted-foreground">Rank</div>
                <div className="font-mono text-2xl font-extrabold text-primary">#{snap.me.rank ?? "—"}</div>
              </div>
            </div>
          )}
          <Button asChild size="lg" className="gap-2 rounded-xl">
            <Link href={`/quizzes/${encodeURIComponent(slug)}/results?session=${encodeURIComponent(sessionId)}`}>
              <Award className="h-4 w-4" aria-hidden />
              Open Full Leaderboard & Review
            </Link>
          </Button>
        </section>
      )}

      {(snap.status === "QUESTION" || snap.status === "REVEAL") && currentQ && (
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
          <section className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Question {snap.currentQuestionIdx + 1} of {snap.totalQuestions} · {currentQ.kind === "MULTI_SELECT" ? "Select all that apply" : currentQ.kind.replace("_", " ")} · {currentQ.points} pts
              </span>
              {theme.showCountdown && snap.status === "QUESTION" && snap.questionEndsAt && (
                <span className={`inline-flex items-center gap-1.5 font-mono text-base font-bold ${remainingSec <= 5 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                  <Clock className="h-4 w-4" aria-hidden />
                  {remainingSec}s
                </span>
              )}
            </div>

            {theme.showCountdown && snap.status === "QUESTION" && snap.questionEndsAt && (
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-label="Time remaining">
                <div
                  className={`h-full transition-[width] duration-200 ${remainingSec <= 5 ? "bg-rose-500" : "bg-primary"}`}
                  style={{ width: `${timerPct}%` }}
                />
              </div>
            )}

            <h2 className="whitespace-pre-wrap text-xl font-bold leading-snug sm:text-2xl">
              {currentQ.promptMarkdown}
            </h2>

            {currentQ.mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentQ.mediaUrl}
                alt={`Question ${snap.currentQuestionIdx + 1} media`}
                className="max-h-72 rounded-xl border object-contain"
              />
            )}

            {/* Answer Score Feedback Banner on Reveal */}
            {snap.status === "REVEAL" && scoreFeedback && scoreFeedback.qIdx === snap.currentQuestionIdx && (
              <div
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                  scoreFeedback.isCorrect
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {scoreFeedback.isCorrect ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
                  {scoreFeedback.isCorrect
                    ? `Correct! +${scoreFeedback.pointsAwarded} points`
                    : scoreFeedback.pointsAwarded < 0
                      ? `Incorrect (${scoreFeedback.pointsAwarded} points)`
                      : scoreFeedback.pointsAwarded > 0
                        ? `Partial credit! +${scoreFeedback.pointsAwarded} points`
                        : "Incorrect answer"}
                </span>
                <span className="font-mono text-xs">Rank #{scoreFeedback.rank}</span>
              </div>
            )}

            {/* Options Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {currentQ.options.map((opt, idx) => {
                const picked = selectedIds.includes(opt.id);
                const isCorrect = snap.answerKey?.includes(opt.id) ?? false;
                const revealMode = snap.status === "REVEAL";
                const count = snap.optionCounts?.[opt.id] ?? 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

                let cardStyle = "border-border bg-background hover:border-primary/60";
                if (revealMode) {
                  if (isCorrect) cardStyle = "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40";
                  else if (picked && !isCorrect) cardStyle = "border-rose-500 bg-rose-500/10";
                  else cardStyle = "border-border bg-background opacity-75";
                } else if (picked) {
                  cardStyle = "border-primary bg-primary/10 ring-2 ring-primary/30";
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!canAnswer}
                    onClick={() => toggleOption(opt.id)}
                    aria-pressed={picked}
                    className={`relative flex min-h-14 w-full items-center justify-between gap-3 overflow-hidden rounded-xl border p-4 text-left transition-all ${cardStyle} disabled:cursor-default`}
                  >
                    {revealMode && snap.optionCounts && (
                      <div
                        className={`pointer-events-none absolute inset-y-0 left-0 opacity-15 transition-all ${
                          isCorrect ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <div className="relative flex min-w-0 items-center gap-3">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
                          picked && !revealMode
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm font-semibold sm:text-base">{opt.text}</span>
                    </div>
                    <div className="relative flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                      {revealMode && isCorrect && <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />}
                      {revealMode && picked && !isCorrect && <XCircle className="h-5 w-5 text-rose-600" aria-hidden />}
                      {revealMode && snap.optionCounts && <span className="tabular-nums text-muted-foreground">{pct}%</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Submit Bar / Ack */}
            {snap.status === "QUESTION" && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs text-muted-foreground">
                  {alreadyAnswered ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      {ackState?.text ?? "Answer submitted! Waiting for timer / reveal."}
                    </span>
                  ) : ackState && !ackState.ok ? (
                    <span className="font-medium text-destructive">{ackState.text}</span>
                  ) : (
                    <span>
                      {currentQ.kind === "MULTI_SELECT"
                        ? "Select one or more options, then submit."
                        : "Tap an option (or press 1–4) and submit."}
                    </span>
                  )}
                </div>

                {!alreadyAnswered && (
                  <Button
                    type="button"
                    size="lg"
                    disabled={!canAnswer || selectedIds.length === 0}
                    onClick={submitAnswer}
                    className="ml-auto gap-2 rounded-xl px-6"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                    Lock Answer
                  </Button>
                )}
              </div>
            )}

            {snap.status === "REVEAL" && snap.explanationMarkdown && (
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                <span className="font-semibold">Explanation: </span>
                <span className="whitespace-pre-wrap text-muted-foreground">{snap.explanationMarkdown}</span>
              </div>
            )}
          </section>

          {/* Side Leaderboard Panel */}
          {theme.showLiveLeaderboard && (
            <aside className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
                  Top Leaderboard
                </h3>
                <span className="text-xs text-muted-foreground">{snap.participantCount} playing</span>
              </div>
              {snap.leaderboard.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Standings reveal after each question closes.
                </p>
              ) : (
                <ol className="divide-y">
                  {snap.leaderboard.slice(0, 15).map((entry) => {
                    const isMe = snap.me?.participantId === entry.participantId;
                    return (
                      <li
                        key={entry.participantId}
                        className={`flex items-center justify-between gap-2 py-2.5 text-sm ${
                          isMe ? "font-bold text-primary" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold">
                            {entry.rank}
                          </span>
                          <span className="truncate">{entry.displayName}{isMe ? " (You)" : ""}</span>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold">{entry.scoreTotal} pts</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Incident Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Question Issue or Dispute</DialogTitle>
            <DialogDescription>
              Flag a typo, wrong option, display issue, or conduct concern directly to the session moderator.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReportSubmit} className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Category</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={reportKind}
                onChange={(e) => setReportKind(e.target.value as QuizIncidentKind)}
              >
                <option value="DISPUTE">Answer / Scoring Dispute</option>
                <option value="BUG">Question Typo / Display Bug</option>
                <option value="MISCONDUCT">Misconduct Report</option>
                <option value="APPEAL">Disconnection / Technical Appeal</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Details *</span>
              <textarea
                rows={4}
                required
                minLength={5}
                maxLength={1000}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Describe what happened cleanly (minimum 5 characters)…"
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </label>
            {reportFeedback && (
              <p role="alert" className={`text-xs font-medium ${reportFeedback.ok ? "text-emerald-600" : "text-destructive"}`}>
                {reportFeedback.msg}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={reportBusy || reportText.trim().length < 5}>
                {reportBusy ? "Sending…" : "Submit Report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
