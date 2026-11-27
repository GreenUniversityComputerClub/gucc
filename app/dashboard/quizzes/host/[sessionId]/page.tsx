import { view } from "@/lib/api/session";
import type { quizHostView } from "@/lib/server/views/admin";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { HostConsole } from "./host-console";

type HostView = Awaited<ReturnType<typeof quizHostView>>;

export default async function QuizHostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const data = await view<HostView>("views.quizHost", { sessionId }, `/dashboard/quizzes/host/${sessionId}`);
  const quizId = String(data.session?.quiz_id ?? data.quiz?.id ?? "");
  const title = String(data.quiz?.title ?? "Quiz Host Console");
  const status = String(data.session?.status ?? "LOBBY");
  const joinCode = String(data.session?.join_code ?? "");

  return (
    <>
      <PageHeader
        back={{ href: quizId ? `/dashboard/quizzes/${quizId}` : "/dashboard/quizzes", label: "Quiz overview" }}
        title={`Host Console: ${title}`}
        description={`Session ${joinCode} · ${data.questions.length} question${data.questions.length === 1 ? "" : "s"}`}
        actions={<StatusBadge status={status} />}
      />
      <HostConsole initial={data} />
    </>
  );
}
