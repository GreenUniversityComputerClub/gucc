import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, HelpCircle, Radio, Trophy, Users } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicQuizzes } from "@/lib/public/data";
import { breadcrumbSchema, collectionPageSchema, graph, itemListSchema } from "@/lib/seo/schema";
import { JoinCodeForm } from "./join-code-form";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Quiz Arena",
  description:
    "Live hosted interactive quizzes, programming trivia battles, and club competitions by Green University Computer Club (GUCC).",
};

const ACCESS_LABEL: Record<string, string> = {
  GUEST: "Open to students & guests",
  REGISTERED: "Event registrants",
  MEMBERS_ONLY: "GUCC members",
};

export default async function QuizzesPage() {
  const quizzes = await getPublicQuizzes(60);
  const liveQuizzes = quizzes.filter((q) => q.activeSession !== null);
  const otherQuizzes = quizzes.filter((q) => q.activeSession === null);

  const structuredData = graph(
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Quiz Arena", path: "/quizzes" },
    ]),
    collectionPageSchema({
      name: "GUCC Quiz Arena",
      description:
        "Live interactive quizzes and technical trivia hosted by Green University Computer Club.",
      path: "/quizzes",
      list: itemListSchema(
        "GUCC Quiz Arena competitions",
        quizzes.map((q) => ({ name: q.title, path: `/quizzes/${q.slug}`, image: q.bannerUrl ?? undefined })),
      ),
    }),
  );

  return (
    <>
      <JsonLd id="quizzes-schema" data={structuredData} />
      <main id="main-content" className="container py-10 sm:py-14">
        {/* Hero + Join Code Launcher */}
        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary backdrop-blur">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                GUCC Quiz Arena
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
                Compete Live. Think Fast. Climb the Leaderboard.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Real-time moderator-paced quizzes for Green University students and visiting contestants across workshops,
                CSE Carnival, and club nights.
              </p>
            </div>

            <div className="rounded-2xl border bg-card/90 p-5 shadow-lg backdrop-blur sm:p-6">
              <h2 className="text-base font-semibold">Have a Room Code?</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Enter the 6-character code projected on screen or scan the host QR code to jump right in.
              </p>
              <JoinCodeForm />
            </div>
          </div>
        </section>

        {/* Active Live Rooms */}
        {liveQuizzes.length > 0 && (
          <section className="mt-12 space-y-4" aria-labelledby="live-rooms-heading">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              <h2 id="live-rooms-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
                Happening Live Now
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {liveQuizzes.map((q) => {
                const s = q.activeSession!;
                return (
                  <article
                    key={q.id}
                    className="flex flex-col justify-between overflow-hidden rounded-2xl border border-emerald-500/30 bg-card shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div>
                      {q.bannerUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.bannerUrl} alt={q.title} className="h-40 w-full object-cover" />
                      )}
                      <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <Radio className="h-3 w-3" aria-hidden />
                            {s.status === "LOBBY" ? "Lobby Open" : "Live in Progress"}
                          </span>
                          <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">
                            #{s.joinCode}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold leading-snug">{q.title}</h3>
                        {q.description && <p className="line-clamp-2 text-sm text-muted-foreground">{q.description}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                            {q.questionCount} questions
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" aria-hidden />
                            {s.participantCount} / {s.maxParticipants} joined
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3.5">
                      <span className="text-xs text-muted-foreground">{ACCESS_LABEL[q.accessMode] ?? q.accessMode}</span>
                      <Link
                        href={`/q/${s.joinCode}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Enter Room
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* All Published Quizzes & Past Standings */}
        <section className="mt-12 space-y-4" aria-labelledby="all-quizzes-heading">
          <h2 id="all-quizzes-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
            {liveQuizzes.length > 0 ? "Quizzes & Past Results" : "Published Quizzes"}
          </h2>

          {otherQuizzes.length === 0 && liveQuizzes.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden />
              <p className="font-medium">No public quizzes are published yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If you have a live session code from an organizer, enter it in the box above.
              </p>
            </div>
          ) : otherQuizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">All published quizzes are currently live above.</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {otherQuizzes.map((q) => (
                <article key={q.id} className="flex flex-col justify-between overflow-hidden rounded-2xl border bg-card">
                  <div>
                    {q.bannerUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.bannerUrl} alt={q.title} className="h-36 w-full object-cover" />
                    )}
                    <div className="space-y-2.5 p-5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {q.topic && <span className="rounded-md bg-muted px-2 py-0.5 font-medium uppercase">{q.topic}</span>}
                        {q.event && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                            {q.event.title}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold leading-snug">{q.title}</h3>
                      {q.description && <p className="line-clamp-2 text-sm text-muted-foreground">{q.description}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                          {q.questionCount} questions
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {q.defaultTimeLimitSec}s / question
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
                    <Link href={`/quizzes/${q.slug}`} className="text-xs font-semibold text-primary hover:underline">
                      Quiz details
                    </Link>
                    {q.latestFinalizedSession && (
                      <Link
                        href={`/quizzes/${q.slug}/results?session=${encodeURIComponent(q.latestFinalizedSession.id)}`}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
                      >
                        <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                        Standings
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
