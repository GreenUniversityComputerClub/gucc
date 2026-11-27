"use client";

import { useEffect, useState } from "react";
import { Award, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { PublicQuizResultView } from "@/lib/public/quiz";

interface PersonalResultPayload {
  me: {
    participantId: string;
    displayName: string;
    scoreTotal: number;
    correctCount: number;
    avgResponseMs: number;
    rank: number | null;
    answers: Array<{
      questionId: string;
      selected: string[];
      isCorrect: boolean;
      pointsAwarded: number;
      responseMs: number;
    }>;
  } | null;
}

export function PersonalBreakdown({
  sessionId,
  questions,
}: {
  sessionId: string;
  questions: PublicQuizResultView["questions"];
}) {
  const [me, setMe] = useState<PersonalResultPayload["me"]>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/quiz/${encodeURIComponent(sessionId)}/results`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; data?: PersonalResultPayload }>) : null))
      .then((body) => {
        if (active && body?.ok && body.data?.me) setMe(body.data.me);
      })
      .catch(() => {
        // visitor did not participate
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (!me) return null;

  const answerMap = new Map(me.answers.map((a) => [a.questionId, a]));

  return (
    <section className="space-y-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:p-6" aria-label="Your scorecard">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Award className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold">Your Performance — {me.displayName}</h2>
            <p className="text-xs text-muted-foreground">Personal breakdown synced via your session ticket</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 font-mono text-sm">
          <div className="rounded-xl border bg-background px-3.5 py-2 text-center">
            <div className="text-[11px] text-muted-foreground">RANK</div>
            <div className="text-lg font-extrabold text-primary">#{me.rank ?? "—"}</div>
          </div>
          <div className="rounded-xl border bg-background px-3.5 py-2 text-center">
            <div className="text-[11px] text-muted-foreground">SCORE</div>
            <div className="text-lg font-extrabold">{me.scoreTotal}</div>
          </div>
          <div className="rounded-xl border bg-background px-3.5 py-2 text-center">
            <div className="text-[11px] text-muted-foreground">CORRECT</div>
            <div className="text-lg font-extrabold">
              {me.correctCount}/{questions.length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {questions.map((q, idx) => {
          const a = answerMap.get(q.id);
          const pickedLabels = a
            ? q.options
                .filter((o) => a.selected.includes(o.id))
                .map((o) => o.text)
                .join(", ")
            : "No answer";
          return (
            <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl border bg-background p-3 text-xs">
              <div className="min-w-0 space-y-1">
                <div className="font-semibold">
                  Q{idx + 1}: <span className="font-normal text-muted-foreground">{q.promptMarkdown.slice(0, 72)}</span>
                </div>
                <div className="text-muted-foreground">Picked: {pickedLabels || "None"}</div>
              </div>
              <div className="shrink-0 text-right font-mono">
                {a ? (
                  <>
                    <div className={`inline-flex items-center gap-1 font-bold ${a.isCorrect ? "text-emerald-600" : "text-rose-600"}`}>
                      {a.isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
                      {a.pointsAwarded >= 0 ? `+${a.pointsAwarded}` : a.pointsAwarded}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden />
                      {(a.responseMs / 1000).toFixed(1)}s
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">Skipped (0)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
