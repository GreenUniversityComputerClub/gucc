import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, Clock, HelpCircle, Radio, ShieldCheck, Trophy, Users } from "lucide-react";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { getSession } from "@/lib/api/session";
import { getPublicQuizBySlug } from "@/lib/public/data";
import { Button } from "@/components/ui/button";
import { QuizJoinGate } from "../join-gate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const quiz = await getPublicQuizBySlug(slug);
  if (!quiz) return { title: "Quiz Not Found" };
  return {
    title: quiz.title,
    description: quiz.description ?? `${quiz.questionCount}-question live interactive competition in GUCC Quiz Arena.`,
  };
}

export default async function QuizDetailPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quiz = await getPublicQuizBySlug(slug);
  if (!quiz) notFound();

  const session = quiz.activeSession;
  const finalized = quiz.latestFinalizedSession;
  const [jar, actor] = await Promise.all([cookies(), getSession()]);
  const hasCookie = session ? Boolean(jar.get(quizParticipantCookie(session.id))?.value) : false;
  const signedInUser =
    actor && actor.user.status === "ACTIVE"
      ? { name: actor.profile?.name ?? actor.user.email.split("@")[0] ?? "Member", email: actor.user.email }
      : null;

  return (
    <main id="main-content" className="container max-w-4xl py-10 sm:py-14">
      <div className="mb-6">
        <Link href="/quizzes" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          ← Quiz Arena
        </Link>
      </div>

      {/* Branded Hero Card */}
      <section
        className="overflow-hidden rounded-3xl border bg-card shadow-sm"
        style={{ borderColor: quiz.themeConfig.accentColor ? `${quiz.themeConfig.accentColor}44` : undefined }}
      >
        {quiz.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={quiz.bannerUrl} alt={quiz.title} className="max-h-64 w-full object-cover" />
        )}
        <div className="space-y-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            {quiz.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quiz.logoUrl} alt="" className="h-12 w-12 rounded-xl border bg-background object-contain p-1" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {quiz.topic && (
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  {quiz.topic}
                </span>
              )}
              {session && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <Radio className="h-3.5 w-3.5" aria-hidden />
                  Live Room #{session.joinCode}
                </span>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{quiz.title}</h1>
          {quiz.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground sm:text-base">{quiz.description}</p>}

          <div className="grid gap-3 pt-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
              <HelpCircle className="h-4 w-4 text-primary" aria-hidden />
              <span>{quiz.questionCount} questions</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
              <Clock className="h-4 w-4 text-primary" aria-hidden />
              <span>{quiz.defaultTimeLimitSec}s default timer</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
              <Award className="h-4 w-4 text-primary" aria-hidden />
              <span>{quiz.scoringMode === "SPEED_BONUS" ? "Speed + accuracy scoring" : "Fixed points scoring"}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              <span>
                {quiz.accessMode === "GUEST"
                  ? "Students & guests"
                  : quiz.accessMode === "REGISTERED"
                    ? "Event registrants"
                    : "GUCC members"}
              </span>
            </div>
          </div>

          {quiz.event && (
            <div className="pt-1 text-xs">
              Linked event:{" "}
              <Link href={`/events/${quiz.event.slug}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {quiz.event.title}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Active Session Join Gate OR Latest Standings / Waiting Notice */}
      <section className="mt-8">
        {session ? (
          <QuizJoinGate
            quiz={quiz}
            session={session}
            signedInUser={signedInUser}
            hasParticipantCookie={hasCookie}
            returnPath={`/quizzes/${encodeURIComponent(quiz.slug)}`}
          />
        ) : finalized ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <Trophy className="h-4 w-4" aria-hidden />
                Session Concluded & Results Published
              </div>
              <p className="text-sm text-muted-foreground">
                {finalized.participantCount} participant{finalized.participantCount === 1 ? "" : "s"} · Room #{finalized.joinCode}
              </p>
            </div>
            <Button asChild size="lg" className="gap-2 rounded-xl">
              <Link href={`/quizzes/${encodeURIComponent(quiz.slug)}/results?session=${encodeURIComponent(finalized.id)}`}>
                <Trophy className="h-4 w-4" aria-hidden />
                View Official Standings & Answers
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" aria-hidden />
            <h2 className="text-base font-semibold">Waiting for Host to Open Room</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The competition host has not started a live room yet. Check back right before start time or use a QR join code when announced.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
