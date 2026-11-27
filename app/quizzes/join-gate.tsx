"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, LogIn, ShieldCheck, UserCheck } from "lucide-react";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import type { PublicQuizSummary } from "@/lib/public/quiz";
import type { QuizParticipantType } from "@/lib/quiz/types";

interface JoinGateProps {
  quiz: PublicQuizSummary;
  session: NonNullable<PublicQuizSummary["activeSession"]>;
  signedInUser: { name: string; email: string } | null;
  hasParticipantCookie: boolean;
  returnPath: string;
}

export function QuizJoinGate({
  quiz,
  session,
  signedInUser,
  hasParticipantCookie,
  returnPath,
}: JoinGateProps) {
  const router = useRouter();
  const [participantType, setParticipantType] = useState<QuizParticipantType>("STUDENT");
  const [displayName, setDisplayName] = useState(signedInUser?.name ?? "");
  const [email, setEmail] = useState(signedInUser?.email ?? "");
  const [studentId, setStudentId] = useState("");
  const [department, setDepartment] = useState("");
  const [institution, setInstitution] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptRules, setAcceptRules] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const onToken = useCallback((t: string | null) => setTurnstileToken(t), []);
  const liveHref = `/quizzes/${encodeURIComponent(quiz.slug)}/live?session=${encodeURIComponent(session.id)}`;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});

    try {
      const payload: Record<string, unknown> = {
        action: "join",
        sessionId: session.id,
        joinCode: session.joinCode,
        participantType: signedInUser ? "STUDENT" : participantType,
        acceptRules,
      };
      if (signedInUser) {
        if (displayName.trim()) payload.displayName = displayName.trim();
      } else {
        payload.displayName = displayName.trim();
        payload.email = email.trim();
        if (participantType === "STUDENT") {
          payload.studentId = studentId.trim();
          if (department.trim()) payload.department = department.trim();
        } else {
          payload.institution = institution.trim();
          if (phone.trim()) payload.phone = phone.trim();
        }
        if (turnstileToken) payload.turnstileToken = turnstileToken;
      }

      const res = await fetch("/api/quiz/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        fields?: Record<string, string>;
        sessionId?: string;
        slug?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Unable to join this quiz room right now.");
        if (data.fields) setFields(data.fields);
        setTurnstileReset((n) => n + 1);
        setSubmitting(false);
        return;
      }

      router.push(`/quizzes/${encodeURIComponent(data.slug ?? quiz.slug)}/live?session=${encodeURIComponent(data.sessionId ?? session.id)}`);
    } catch {
      setError("Network error while joining room. Please check your connection and try again.");
      setTurnstileReset((n) => n + 1);
      setSubmitting(false);
    }
  };

  if (hasParticipantCookie) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <h2 className="text-lg font-bold">You are registered in room #{session.joinCode}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Your device holds an active participant seat for this session. Jump straight into the live arena.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2 rounded-xl">
            <Link href={liveHref}>
              Enter Live Arena
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (quiz.accessMode === "MEMBERS_ONLY" && !signedInUser) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          <h2 className="text-lg font-bold">GUCC Members Only</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          This quiz requires an active Green University Computer Club member account to participate.
        </p>
        <Button asChild size="lg" className="gap-2 rounded-xl">
          <Link href={`/auth/login?next=${encodeURIComponent(returnPath)}`}>
            <LogIn className="h-4 w-4" aria-hidden />
            Sign in to Join Quiz
          </Link>
        </Button>
      </div>
    );
  }

  const fieldCls =
    "h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={handleJoin} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Join Room #{session.joinCode}</h2>
          <p className="text-xs text-muted-foreground">
            {session.participantCount} / {session.maxParticipants} seats filled
            {quiz.accessMode === "REGISTERED" && quiz.event ? ` · Registered attendees of ${quiz.event.title}` : ""}
          </p>
        </div>
        {!signedInUser && quiz.accessMode !== "MEMBERS_ONLY" && (
          <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Participant category">
            {(
              [
                ["STUDENT", "GUB Student"],
                ["GUEST", "Guest / Other Univ."],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={participantType === val}
                onClick={() => {
                  setParticipantType(val);
                  setFields({});
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  participantType === val ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {signedInUser ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold">Joining as {signedInUser.name}</p>
              <p className="text-xs text-muted-foreground">{signedInUser.email} · Linked directly to your GUCC profile</p>
            </div>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Leaderboard display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              required
              className={fieldCls}
            />
            {fields.displayName && <span className="block text-xs text-destructive">{fields.displayName}</span>}
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Full name *</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ayesha Rahman"
              maxLength={80}
              required
              className={fieldCls}
            />
            {fields.displayName && <span className="block text-xs text-destructive">{fields.displayName}</span>}
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Email address *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={quiz.accessMode === "REGISTERED" ? "Registration email" : "you@example.com"}
              required
              className={fieldCls}
            />
            {fields.email && <span className="block text-xs text-destructive">{fields.email}</span>}
          </label>

          {participantType === "STUDENT" ? (
            <>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">9-digit Student ID *</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g. 232002011"
                  maxLength={12}
                  required
                  className={fieldCls}
                />
                {fields.studentId && <span className="block text-xs text-destructive">{fields.studentId}</span>}
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Department (optional)</span>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. CSE"
                  maxLength={100}
                  className={fieldCls}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">University / Institution *</span>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Green University / DU / BUET"
                  maxLength={120}
                  required
                  className={fieldCls}
                />
                {fields.institution && <span className="block text-xs text-destructive">{fields.institution}</span>}
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Phone (optional)</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  maxLength={30}
                  className={fieldCls}
                />
              </label>
            </>
          )}
        </div>
      )}

      {!signedInUser && <Turnstile onToken={onToken} resetKey={turnstileReset} />}

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={acceptRules}
          onChange={(e) => setAcceptRules(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded"
          required
        />
        <span className="text-muted-foreground">
          I agree to follow GUCC competition rules and answer fairly without scripts or unauthorized collaboration.
        </span>
      </label>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {!signedInUser && quiz.accessMode !== "MEMBERS_ONLY" && (
          <Link href={`/auth/login?next=${encodeURIComponent(returnPath)}`} className="text-xs font-medium text-primary hover:underline">
            Have a GUCC account? Sign in for 1-click join
          </Link>
        )}
        <Button type="submit" size="lg" disabled={submitting} className="ml-auto gap-2 rounded-xl px-6">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {submitting ? "Joining…" : "Join & Enter Arena"}
        </Button>
      </div>
    </form>
  );
}
