import type { Metadata } from "next";
import { requireSignedIn, view } from "@/lib/api/session";
import { ActionForm, Field, Section } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { PersonAvatar } from "@/components/person-avatar";
import { dhakaDateTime } from "@/lib/time";
import { ConversationList } from "./conversations";
import { BlockedList } from "./blocked-list";
import { chatPrivacyAction, startChatAction, type ChatHome } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/chat");
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const home = await view<ChatHome>("chat.home", { archived, to: sp.to }, "/dashboard/chat");
  const canSend = Boolean(session.caps["chat.send"]) && session.user.status === "ACTIVE" && !home.restrictedUntil;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <ConversationList items={home.conversations} meId={session.user.id} archived={archived} />
      <div className="space-y-4">
        {home.restrictedUntil && (
          <p role="status" className="rounded-xl border border-amber-400/60 bg-amber-500/5 p-3 text-sm">
            A moderator paused your messaging until {dhakaDateTime(home.restrictedUntil)} after a report. You can still read your messages.
          </p>
        )}
        {canSend ? (
          <Section title="New message" description="Write to any approved member who accepts messages. Be kind: messages can be reported to the moderators.">
            <ActionForm action={startChatAction} submitLabel="Send">
              {sp.to && <input type="hidden" name="userId" value={sp.to} />}
              {sp.contextType && <input type="hidden" name="contextType" value={sp.contextType} />}
              {sp.contextId && <input type="hidden" name="contextId" value={sp.contextId} />}
              {!sp.to && <PersonPicker name="userId" label="To" valueKind="user" withAccount required source="recipients" placeholder="Search members by name" />}
              {sp.to && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                  <PersonAvatar name={home.to?.name ?? "Member"} url={home.to?.avatarUrl} size="md" />
                  <p className="min-w-0"><span className="text-muted-foreground">To </span><span className="font-medium">{home.to?.name ?? "the member you chose"}</span>
                    {sp.contextType === "lost_found_post" && <span className="block text-xs text-muted-foreground">About their lost & found post</span>}</p>
                </div>
              )}
              <Field name="body" label="Message" type="textarea" rows={3} required />
            </ActionForm>
          </Section>
        ) : !home.restrictedUntil ? (
          <Section title="Messages"><p className="text-sm text-muted-foreground">Messaging opens once your membership is approved.</p></Section>
        ) : null}
        <Section title="Message settings" description="Who can start a conversation with you, and whether you share read receipts.">
          <ActionForm action={chatPrivacyAction} submitLabel="Save settings" successMessage="Message settings saved.">
            <Field name="privacy" label="Who can message me" type="select" defaultValue={home.settings.privacy}
              options={[{ value: "EVERYONE", label: "Any approved member" }, { value: "EXECUTIVES", label: "Club executives only" }, { value: "NOBODY", label: "No one (existing conversations stay)" }]} />
            <Field name="readReceipts" label="Show when I've read messages (and see when others have)" type="checkbox" defaultValue={home.settings.readReceipts} />
          </ActionForm>
        </Section>
        <Section title="Blocked people" description="Blocked people can't message you or find you, and they aren't told.">
          <BlockedList people={home.blocked} />
        </Section>
      </div>
    </div>
  );
}
