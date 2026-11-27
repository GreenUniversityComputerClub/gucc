import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Medal, Trophy, Users } from "lucide-react";
import { getPublicQuizBySlug, getPublicQuizResults } from "@/lib/public/data";
import { PersonalBreakdown } from "./personal-breakdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const quiz = await getPublicQuizBySlug(slug);
  return {
    title: quiz ? `Results: ${quiz.title}` : "Quiz Results",
    description: "Official Quiz Arena standings and answer explanations.",
  };
}

export default async function QuizResultsPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const quiz = await getPublicQuizBySlug(slug);
  if (!quiz) notFound();

  const results = await getPublicQuizResults(sp.session?.trim() || slug);

  if (!results || results.slug !== quiz.slug) {
    return (
      <main id="main-content" className="container max-w-2xl py-16">
        <div className="space-y-4 rounded-2xl border bg-card p-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden />
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <p className="text-sm text-muted-foreground">
            Final standings for this quiz have not been published yet.
          </p>
          <Link href={`/quizzes/${encodeURIComponent(quiz.slug)}`} className="inline-block text-sm font-medium text-primary hover:underline">
            ← Back to quiz page
          </Link>
        </div>
      </main>
    );
  }

  const podium = results.leaderboard.slice(0, 3);

  return (
    <main id="main-content" className="container max-w-5xl space-y-8 py-10 sm:py-14">
      <div className="space-y-2">
        <Link href={`/quizzes/${encodeURIComponent(quiz.slug)}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          ← {quiz.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Official Results — {results.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:text-sm">
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden />
                {results.participantCount} participants
              </span>
              {results.finalizedAt && (
                <span>
                  Finalized{" "}
                  {new Date(results.finalizedAt).toLocaleDateString("en-GB", {
                    timeZone: "Asia/Dhaka",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </p>
          </div>
          <Link href="/quizzes" className="rounded-lg border px-3.5 py-2 text-xs font-medium hover:bg-muted">
            Browse Quiz Arena
          </Link>
        </div>
      </div>

      {/* Personalized Participant Breakdown (loaded on client from HttpOnly cookie / member session) */}
      <PersonalBreakdown sessionId={results.sessionId} questions={results.questions} />

      {/* Top 3 Winner Podium */}
      {podium.length > 0 && (
        <section aria-labelledby="podium-heading" className="space-y-3">
          <h2 id="podium-heading" className="text-lg font-bold">
            Top Performers
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {podium.map((entry, idx) => {
              const badgeStyle =
                idx === 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : idx === 1
                    ? "border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300"
                    : "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
              return (
                <div key={entry.participantId} className={`rounded-2xl border p-5 ${badgeStyle}`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold">
                      <Medal className="h-4 w-4" aria-hidden />
                      Rank #{entry.rank}
                    </span>
                    <span className="rounded bg-background/70 px-2 py-0.5 text-[10px] font-semibold uppercase">
                      {entry.participantType}
                    </span>
                  </div>
                  <div className="mt-3 truncate text-lg font-extrabold text-foreground">{entry.displayName}</div>
                  <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
                    <span>
                      <strong className="text-base text-foreground">{entry.scoreTotal}</strong> pts
                    </span>
                    <span>
                      {entry.correctCount}/{results.questions.length} · {(entry.avgResponseMs / 1000).toFixed(2)}s avg
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Full Public Leaderboard (privacy-safe: zero emails or IDs) */}
      <section aria-labelledby="leaderboard-heading" className="space-y-3">
        <h2 id="leaderboard-heading" className="text-lg font-bold">
          Leaderboard ({results.leaderboard.length})
        </h2>
        {results.leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No qualified finishers recorded in this session.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Participant</th>
                  <th className="px-4 py-3 font-medium">Correct</th>
                  <th className="px-4 py-3 font-medium">Avg Speed</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.leaderboard.map((row) => (
                  <tr key={row.participantId}>
                    <td className="px-4 py-3 font-mono font-bold">#{row.rank}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.displayName}
                      {row.participantType === "GUEST" && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Guest</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.correctCount}/{results.questions.length}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {(row.avgResponseMs / 1000).toFixed(2)}s
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{row.scoreTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Published Answer Key & Explanations */}
      <section aria-labelledby="answers-heading" className="space-y-4">
        <h2 id="answers-heading" className="text-lg font-bold">
          Questions & Official Explanations
        </h2>
        <div className="space-y-4">
          {results.questions.map((q, idx) => (
            <article key={q.id} className="space-y-3 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold uppercase">
                  Question {idx + 1} · {q.kind.replace("_", " ")}
                </span>
                <span className="font-mono">{q.points} pts</span>
              </div>
              <h3 className="whitespace-pre-wrap text-base font-semibold">{q.promptMarkdown}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, optIdx) => {
                  const isCorrect = q.answerKey.includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
                        isCorrect
                          ? "border-emerald-500/60 bg-emerald-500/10 font-medium text-emerald-900 dark:text-emerald-200"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      <span>
                        <strong className="mr-2 font-mono">{String.fromCharCode(65 + optIdx)}.</strong>
                        {opt.text}
                      </span>
                      {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
                    </div>
                  );
                })}
              </div>
              {q.explanationMarkdown && (
                <p className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">Explanation: </strong>
                  {q.explanationMarkdown}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
