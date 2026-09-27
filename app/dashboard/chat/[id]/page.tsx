import type { Metadata } from "next";
import { requireSignedIn, view } from "@/lib/api/session";
import { ConversationList, type Conversations } from "../conversations";
import { ThreadView } from "../thread-view";
import type { Thread } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSignedIn(`/dashboard/chat/${id}`);
  const [items, thread] = await Promise.all([
    view<Conversations>("chat.list", {}, "/dashboard/chat"),
    view<Thread>("chat.thread", { conversationId: id }, `/dashboard/chat/${id}`),
  ]);
  const canSend = Boolean(session.caps["chat.send"]) && session.user.status === "ACTIVE";
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="hidden lg:block"><ConversationList items={items} selected={id} meId={session.user.id} /></div>
      <ThreadView conversationId={id} initial={thread} canSend={canSend} />
    </div>
  );
}
