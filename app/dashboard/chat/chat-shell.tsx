"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./conversations";
import { NewConversation } from "./new-conversation";
import type { ChatHome } from "./actions";

type Mode = "direct" | "group";
const openers = new Set<(m: Mode) => void>();
/** Open the new-message dialog from anywhere on the page. */
export const openNewConversation = (mode: Mode) => openers.forEach((f) => f(mode));

/**
 * The conversation list with its "New" button, and the dialog for a new message or group. Used
 * on the Messages page (list and a welcome pane) and next to an open conversation.
 */
export function ChatShell({ home, meId, selected, archived, startOpen, context }: {
  home: ChatHome;
  meId: string;
  selected?: string;
  archived?: boolean;
  /** Open the dialog at once ("Message" from a profile or post). */
  startOpen?: boolean;
  context?: { type: string; id: string } | null;
}) {
  const [open, setOpen] = useState<null | Mode>(startOpen ? "direct" : null);
  useEffect(() => {
    const f = (m: Mode) => setOpen(m);
    openers.add(f);
    return () => void openers.delete(f);
  }, []);
  const canWrite = !home.restrictedUntil;
  const existing = useMemo(() => Object.fromEntries(home.conversations.filter((c) => !c.isGroup && c.other_id).map((c) => [c.other_id!, c.id])), [home.conversations]);
  return (
    <>
      <ConversationList items={home.conversations} selected={selected} meId={meId} archived={archived} watch={home.watch}
        header={canWrite ? (
          <Button type="button" size="sm" className="min-h-9 gap-1.5 rounded-full" onClick={() => setOpen("direct")}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden />New
          </Button>
        ) : null} />
      <NewConversation open={open !== null} onOpenChange={(o) => setOpen(o ? open ?? "direct" : null)} initialMode={open ?? "direct"}
        canCreateGroups={home.canCreateGroups} maxGroupMembers={home.maxGroupMembers} existing={existing} to={startOpen ? home.to : null} context={context} />
    </>
  );
}

/** "New message" / "New group" buttons for the welcome pane (they open the shell's dialog). */
export function StartButtons({ canCreateGroups }: { canCreateGroups: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" className="min-h-11 gap-2" onClick={() => openNewConversation("direct")}><MessageSquarePlus className="h-4 w-4" aria-hidden />New message</Button>
      {canCreateGroups && <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => openNewConversation("group")}><Users className="h-4 w-4" aria-hidden />New group</Button>}
    </div>
  );
}
