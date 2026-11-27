import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { rpc } from "@/lib/api/session";
import { getPublicQuizBySlug } from "@/lib/public/data";
import type { QuizStateSnapshot } from "@/lib/quiz/types";
import { PlayerArena } from "./player-arena";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const quiz = await getPublicQuizBySlug(slug);
  return {
    title: quiz ? `Live: ${quiz.title}` : "Live Quiz Arena",
    robots: { index: false, follow: false },
  };
}

export default async function QuizLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ slug }, sp, jar] = await Promise.all([params, searchParams, cookies()]);
  const quiz = await getPublicQuizBySlug(slug);
  if (!quiz) notFound();

  const sessionId = sp.session?.trim() || quiz.activeSession?.id || quiz.latestFinalizedSession?.id || "";
  if (!sessionId) redirect(`/quizzes/${encodeURIComponent(slug)}`);

  const participantToken = jar.get(quizParticipantCookie(sessionId))?.value ?? null;
  const stateRes = await rpc<QuizStateSnapshot>("quizzes.state", { sessionId, participantToken });

  if (!stateRes.ok) {
    redirect(`/quizzes/${encodeURIComponent(slug)}`);
  }

  const snap = stateRes.data;
  if (snap.status === "FINALIZED") {
    redirect(`/quizzes/${encodeURIComponent(slug)}/results?session=${encodeURIComponent(sessionId)}`);
  }

  if (!snap.me) {
    return (
      <main id="main-content" className="container max-w-lg py-16">
        <div className="space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-xl font-bold">{quiz.title}</h1>
          <p className="text-sm text-muted-foreground">
            Register for room <strong className="font-mono text-foreground">#{snap.joinCode}</strong> first to receive your live player seat.
          </p>
          <Link
            href={`/q/${encodeURIComponent(snap.joinCode)}`}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Join Room #{snap.joinCode}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="container max-w-5xl py-6 sm:py-10">
      <PlayerArena initial={snap} slug={quiz.slug} theme={quiz.themeConfig} />
    </main>
  );
}
