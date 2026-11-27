import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, HelpCircle, Radio, Trophy } from "lucide-react";
import { quizParticipantCookie } from "@/lib/api/cookies";
import { getSession } from "@/lib/api/session";
import { getPublicQuizByCode } from "@/lib/public/data";
import { JoinCodeForm } from "@/app/quizzes/join-code-form";
import { QuizJoinGate } from "@/app/quizzes/join-gate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Join Quiz ${code.toUpperCase()}`,
    description: "Enter a live GUCC Quiz Arena session using its room join code.",
  };
}

export default async function JoinByCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  const data = await getPublicQuizByCode(code);

  if (!data) {
    return (
      <main id="main-content" className="container max-w-xl py-16">
        <div className="space-y-5 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold">Room Code Not Found</h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a published quiz session for code <strong className="font-mono text-foreground">{code}</strong>. Double-check the screen or ask your host.
            </p>
          </div>
          <JoinCodeForm initialCode={code} />
          <div className="pt-2">
            <Link href="/quizzes" className="text-xs font-medium text-primary hover:underline">
              Browse all Quiz Arena competitions
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { quiz, session } = data;
  if (session.status === "FINALIZED") {
    redirect(`/quizzes/${encodeURIComponent(quiz.slug)}/results?session=${encodeURIComponent(session.id)}`);
  }
  if (session.status === "CANCELLED") {
    return (
      <main id="main-content" className="container max-w-xl py-16">
        <div className="space-y-4 rounded-2xl border bg-card p-6 text-center sm:p-8">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <p className="text-sm text-muted-foreground">Session #{session.joinCode} has been cancelled by the host.</p>
          <Link href="/quizzes" className="inline-block text-sm font-medium text-primary hover:underline">
            Return to Quiz Arena
          </Link>
        </div>
      </main>
    );
  }

  const [jar, actor] = await Promise.all([cookies(), getSession()]);
  const hasCookie = Boolean(jar.get(quizParticipantCookie(session.id))?.value);
  const signedInUser =
    actor && actor.user.status === "ACTIVE"
      ? { name: actor.profile?.name ?? actor.user.email.split("@")[0] ?? "Member", email: actor.user.email }
      : null;

  return (
    <main id="main-content" className="container max-w-3xl py-10 sm:py-14">
      <div className="mb-6 space-y-3">
        <Link href="/quizzes" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          ← All Quiz Arena sessions
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            {session.status === "LOBBY" ? "Lobby Open" : "Live Room"}
          </span>
          <span className="rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-widest">
            #{session.joinCode}
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{quiz.title}</h1>
        {quiz.description && <p className="text-sm text-muted-foreground sm:text-base">{quiz.description}</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            {quiz.questionCount} questions · {quiz.defaultTimeLimitSec}s each
          </span>
          {quiz.event && (
            <Link href={`/events/${quiz.event.slug}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {quiz.event.title}
            </Link>
          )}
        </div>
      </div>

      <QuizJoinGate
        quiz={quiz}
        session={session}
        signedInUser={signedInUser}
        hasParticipantCookie={hasCookie}
        returnPath={`/q/${encodeURIComponent(session.joinCode)}`}
      />
    </main>
  );
}
