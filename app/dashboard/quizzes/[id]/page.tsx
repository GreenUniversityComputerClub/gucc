import Link from "next/link";
import { Play, Radio } from "lucide-react";
import { view } from "@/lib/api/session";
import type { quizView } from "@/lib/server/views/admin";
import { ActionForm, Field, PageHeader, Section, StatusBadge } from "@/components/admin/ui";
import {
  createQuizSessionAction,
  deleteQuizAction,
  publishQuizAction,
  resolveIncidentAction,
  saveQuestionsAction,
  setModeratorsAction,
  setQuizStatusAction,
  updateQuizAction,
} from "../actions";
import { QuizFields } from "../quiz-form";
import { JoinQrButton } from "./join-qr-button";
import { ModeratorPicker } from "./moderator-picker";
import { QuestionEditor } from "./question-editor";

type View = Awaited<ReturnType<typeof quizView>>;

export default async function QuizDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await view<View>("views.quiz", { id }, `/dashboard/quizzes/${id}`);
  const { quiz: q, questions, moderators, sessions, incidents, capabilities: cap, options } = data;
  const status = String(q.status);
  const isPublished = status === "PUBLISHED";

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/quizzes", label: "Quiz Arena" }}
        title={String(q.title)}
        description={`/${String(q.slug)} · ${questions.length} question${questions.length === 1 ? "" : "s"}`}
        actions={
          <>
            <StatusBadge status={status} content />
            {isPublished && (
              <Link prefetch={false} href={`/quizzes/${q.slug}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                Public page
              </Link>
            )}
          </>
        }
      />

      <Section title="Publishing & lifecycle" description="Publish once questions are ready so you can host live sessions.">
        <div className="flex flex-wrap items-center gap-2">
          {!isPublished && status !== "PENDING_APPROVAL" && (cap.publish || cap.edit) && (
            <ActionForm action={publishQuizAction.bind(null, id)} submitLabel={cap.publishOutcome === "ALLOW" ? "Publish quiz" : "Submit for approval"} inline />
          )}
          {status === "PENDING_APPROVAL" && <span className="text-sm text-muted-foreground">Waiting for club leadership approval.</span>}
          {isPublished && cap.publish && (
            <ActionForm action={setQuizStatusAction.bind(null, id, "DRAFT")} submitLabel="Move back to draft" variant="outline" inline confirm="Take this quiz offline for editing?" />
          )}
          {status !== "ARCHIVED" && cap.publish && (
            <ActionForm action={setQuizStatusAction.bind(null, id, "ARCHIVED")} submitLabel="Archive" variant="outline" inline />
          )}
          {cap.delete && (
            <ActionForm
              action={deleteQuizAction.bind(null, id)}
              submitLabel="Delete"
              variant="destructive"
              inline
              redirectTo="/dashboard/quizzes"
              confirm="Delete this quiz and cancel any active sessions?"
            />
          )}
        </div>
        {cap.publishOutcome !== "ALLOW" && <p className="mt-2 text-xs text-muted-foreground">{cap.publishExplanation}</p>}
      </Section>

      <Section
        title="Live sessions"
        description="Open a hosted session room with a 6-character join code and QR code for participants."
        className="mt-6"
      >
        {isPublished && cap.host && questions.length > 0 ? (
          <ActionForm
            action={createQuizSessionAction.bind(null, id)}
            submitLabel="Create & open host room"
            redirectTo="/dashboard/quizzes/host/{id}"
            className="mb-4 rounded-xl border bg-muted/30 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field name="maxParticipants" label="Capacity" type="number" defaultValue={600} />
              <Field name="scheduledStartAt" label="Scheduled start (optional)" type="datetime-local" />
              <Field name="registrationClosesAt" label="Registration closes (optional)" type="datetime-local" />
            </div>
            <Field name="resultsPublished" label="Publish standings & answers after finalization" type="checkbox" defaultValue={true} />
          </ActionForm>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">
            {!isPublished ? "Publish the quiz above before opening a live session." : questions.length === 0 ? "Add questions below before launching." : "You don't hold hosting permissions on this quiz."}
          </p>
        )}

        {sessions.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {sessions.map((s) => {
              const sid = String(s.id);
              const code = String(s.join_code);
              const sStatus = String(s.status);
              return (
                <li key={sid} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tracking-wider">{code}</span>
                      <StatusBadge status={sStatus} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Number(s.participant_count ?? 0)} / {Number(s.max_participants ?? 600)} joined ·{" "}
                      {new Date(String(s.created_at)).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <JoinQrButton joinCode={code} title={String(q.title)} />
                    {cap.host && (
                      <Link
                        prefetch={false}
                        href={`/dashboard/quizzes/host/${sid}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        {["LOBBY", "QUESTION", "REVEAL", "PAUSED"].includes(sStatus) ? <Radio className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        Host room
                      </Link>
                    )}
                    {sStatus === "FINALIZED" && (
                      <a href={`/api/admin/quizzes/${sid}/export`} className="inline-flex min-h-9 items-center rounded-md border px-2.5 text-xs hover:bg-muted">
                        Download CSV
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Question bank (${questions.length})`} description="Correct answer keys are stored server-only until question reveal." className="mt-6">
        {cap.edit ? (
          <ActionForm action={saveQuestionsAction.bind(null, id)} submitLabel="Save question bank" sticky>
            <QuestionEditor initial={questions} />
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can view quiz metadata, but only editors may modify the question bank.</p>
        )}
      </Section>

      {cap.edit && (
        <section className="mt-6" aria-labelledby="quiz-settings-h">
          <h2 id="quiz-settings-h" className="mb-3 text-lg font-semibold">Quiz settings & branding</h2>
          <ActionForm action={updateQuizAction.bind(null, id)} submitLabel="Save settings" sticky>
            <input type="hidden" name="expectedUpdatedAt" value={String(q.updated_at ?? "")} />
            <QuizFields quiz={q} options={options} />
          </ActionForm>
        </section>
      )}

      {cap.edit && (
        <Section title="Moderators & co-hosts" description="Grant other executives host/edit access scoped specifically to this competition." className="mt-6">
          <ActionForm action={setModeratorsAction.bind(null, id)} submitLabel="Save moderators">
            <ModeratorPicker initial={moderators} />
          </ActionForm>
        </Section>
      )}

      <Section title={`Incident & dispute queue (${incidents.length})`} description="Reports submitted by participants about questions or conduct." className="mt-6">
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents reported.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {incidents.map((inc) => {
              const incId = String(inc.id);
              const incStatus = String(inc.status);
              return (
                <li key={incId} className="space-y-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      [{String(inc.kind)}] {inc.participant_name ? String(inc.participant_name) : "Participant"} · Room {String(inc.join_code)}
                    </span>
                    <StatusBadge status={incStatus} />
                  </div>
                  <p className="text-sm text-muted-foreground">{String(inc.reason)}</p>
                  {inc.note ? <p className="text-xs text-muted-foreground">Resolution note: {String(inc.note)}</p> : null}
                  {incStatus === "OPEN" && (cap.host || cap.moderate) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <ActionForm action={resolveIncidentAction.bind(null, incId, "ACTIONED")} submitLabel="Mark actioned" variant="outline" inline>
                        <input name="note" placeholder="Optional note" className="h-9 rounded-md border px-2 text-xs" />
                      </ActionForm>
                      <ActionForm action={resolveIncidentAction.bind(null, incId, "DISMISSED")} submitLabel="Dismiss" variant="ghost" inline />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
