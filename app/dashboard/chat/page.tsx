import type { Metadata } from "next";
import { requireSignedIn, view } from "@/lib/api/session";
import { ActionForm, Field, Section } from "@/components/admin/ui";
import { PersonPicker } from "@/components/admin/person-picker";
import { ConversationList, type Conversations } from "./conversations";
import { chatPrivacyAction, startChatAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSignedIn("/dashboard/chat");
  const sp = await searchParams;
  const items = await view<Conversations>("chat.list", { archived: sp.archived === "1" }, "/dashboard/chat");
  const canSend = Boolean(session.caps["chat.send"]) && session.user.status === "ACTIVE";

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <ConversationList items={items} meId={session.user.id} archived={sp.archived === "1"} />
      <div className="space-y-4">
        {canSend ? (
          <Section title="New message" description="Message any approved member. Be kind: messages can be reported to moderators.">
            <ActionForm action={startChatAction} submitLabel="Send">
              {sp.to && <input type="hidden" name="userId" value={sp.to} />}
              {sp.contextType && <input type="hidden" name="contextType" value={sp.contextType} />}
              {sp.contextId && <input type="hidden" name="contextId" value={sp.contextId} />}
              {!sp.to && <PersonPicker name="userId" label="To" valueKind="user" withAccount required source="recipients" placeholder="Search members by name" />}
              {sp.to && <p className="text-sm text-muted-foreground">{sp.contextType === "lost_found_post" ? "About a lost & found post." : "Writing to the member you chose."}</p>}
              <Field name="body" label="Message" type="textarea" rows={3} required />
            </ActionForm>
          </Section>
        ) : (
          <Section title="Messages"><p className="text-sm text-muted-foreground">Messaging opens once your membership is approved.</p></Section>
        )}
        <Section title="Message settings">
          <ActionForm action={chatPrivacyAction} submitLabel="Save settings">
            <Field name="privacy" label="Who can message me" type="select" options={[{ value: "EVERYONE", label: "Any approved member" }, { value: "EXECUTIVES", label: "Club executives only" }, { value: "NOBODY", label: "No one (existing conversations stay)" }]} />
            <Field name="readReceipts" label="Show when I've read messages (and see when others have)" type="checkbox" defaultValue />
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
