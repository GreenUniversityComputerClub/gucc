import type { Metadata } from "next";
import { requireSignedIn, view } from "@/lib/api/session";
import { ConversationList } from "../conversations";
import { ThreadView } from "../thread-view";
import type { ChatHome, Thread } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSignedIn(`/dashboard/chat/${id}`);
  // The thread first (opening it marks it read), then the list, so this conversation isn't shown as unread.
  const thread = await view<Thread>("chat.thread", { conversationId: id }, `/dashboard/chat/${id}`);
  const home = await view<ChatHome>("chat.home", {}, "/dashboard/chat");
  const canSend = Boolean(session.caps["chat.send"]) && session.user.status === "ACTIVE";
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="hidden min-h-0 lg:block lg:h-[calc(100dvh-8rem)]"><ConversationList items={home.conversations} selected={id} meId={session.user.id} /></div>
      <ThreadView key={id} conversationId={id} initial={thread} canSend={canSend} restrictedUntil={home.restrictedUntil} />
    </div>
  );
}
