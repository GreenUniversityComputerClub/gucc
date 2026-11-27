import { redirect } from "next/navigation";
import { requireSignedIn, rpc } from "@/lib/api/session";
import { ActionForm, PageHeader } from "@/components/admin/ui";
import { createQuizAction } from "../actions";
import { QuizFields } from "../quiz-form";

export default async function NewQuizPage() {
  const session = await requireSignedIn("/dashboard/quizzes/new");
  if (!session.caps["quizzes.create"]) redirect("/dashboard/denied?from=/dashboard/quizzes/new");
  const opts = await rpc<{ events: Array<{ id: string; title: string }>; committees: Array<{ id: string; name: string }> }>("quizzes.options", {});

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/quizzes", label: "Quiz Arena" }}
        title="New quiz"
        description="Configure settings, scoring rules, and theme branding first. On the next screen, add your question bank and launch live sessions."
      />
      <ActionForm action={createQuizAction} submitLabel="Create quiz draft" redirectTo="/dashboard/quizzes/{id}" sticky>
        <QuizFields options={opts.ok ? opts.data : { events: [], committees: [] }} />
      </ActionForm>
    </>
  );
}
