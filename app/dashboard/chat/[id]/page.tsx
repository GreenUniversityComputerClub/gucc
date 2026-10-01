import type { Metadata } from "next";
import { requireSignedIn, view } from "@/lib/api/session";
import { ChatFrame } from "../chat-frame";
import { ChatShell } from "../chat-shell";
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
    // Phones show the conversation alone, filling the screen; computers show the list beside it.
    <ChatFrame className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:h-[calc(100dvh-8rem)] lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="hidden min-h-0 lg:block"><ChatShell home={home} meId={session.user.id} selected={id} /></div>
      <ThreadView key={id} conversationId={id} initial={thread} canSend={canSend} restrictedUntil={home.restrictedUntil} />
    </ChatFrame>
  );
}
