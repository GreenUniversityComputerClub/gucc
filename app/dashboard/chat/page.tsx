import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { requireSignedIn, view } from "@/lib/api/session";
import { ActionForm, Field, Section } from "@/components/admin/ui";
import { dhakaDateTime } from "@/lib/time";
import { redirect } from "next/navigation";
import { BlockedList } from "./blocked-list";
import { ChatFrame } from "./chat-frame";
import { ChatShell, StartButtons } from "./chat-shell";
import { chatPrivacyAction, type ChatHome } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/chat");
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const home = await view<ChatHome>("chat.home", { archived, to: sp.to }, "/dashboard/chat");
  const canSend = Boolean(session.caps["chat.send"]) && session.user.status === "ACTIVE" && !home.restrictedUntil;
  const context = sp.contextType === "lost_found_post" && sp.contextId ? { type: sp.contextType, id: sp.contextId } : null;
  // "Message" on someone you already talk with (from a profile or a group) opens that conversation.
  const existing = home.to && !context ? home.conversations.find((c) => !c.isGroup && c.other_id === home.to!.id) : null;
  if (existing) redirect(`/dashboard/chat/${existing.id}`);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <ChatFrame className="min-h-[60dvh] min-w-0 lg:h-[calc(100dvh-8rem)]">
        <ChatShell home={home} meId={session.user.id} archived={archived} startOpen={canSend && Boolean(home.to)} context={context} />
      </ChatFrame>
      <div className="space-y-4">
        {home.restrictedUntil && (
          <p role="status" className="rounded-xl border border-amber-400/60 bg-amber-500/5 p-3 text-sm">
            A moderator paused your messaging until {dhakaDateTime(home.restrictedUntil)} after a report. You can still read your messages.
          </p>
        )}
        <section className="hidden flex-col items-center justify-center gap-4 rounded-xl border bg-card px-6 py-12 text-center lg:flex">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><MessagesSquare className="h-8 w-8" aria-hidden /></span>
          <div>
            <h2 className="text-lg font-semibold">Your messages</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {canSend ? "Choose a conversation, or start one with any approved member. Groups keep a team in one place." : "Messaging opens once your membership is approved."}
            </p>
          </div>
          {canSend && <StartButtons canCreateGroups={home.canCreateGroups} />}
        </section>
        <Section title="Message settings" description="Who can start a conversation with you, and what you share with the people you talk to.">
          <ActionForm action={chatPrivacyAction} submitLabel="Save settings" successMessage="Message settings saved.">
            <Field name="privacy" label="Who can message me" type="select" defaultValue={home.settings.privacy}
              options={[{ value: "EVERYONE", label: "Any approved member" }, { value: "EXECUTIVES", label: "Club executives only" }, { value: "NOBODY", label: "No one (existing conversations stay)" }]} />
            <Field name="readReceipts" label="Show when I've read messages (and see when others have)" type="checkbox" defaultValue={home.settings.readReceipts} />
            <Field name="showActive" label="Show when I'm active (and see when others are)" type="checkbox" defaultValue={home.settings.showActive} />
          </ActionForm>
        </Section>
        <Section title="Blocked people" description="Blocked people can't message you or find you, and they aren't told.">
          <BlockedList people={home.blocked} />
        </Section>
      </div>
    </div>
  );
}
