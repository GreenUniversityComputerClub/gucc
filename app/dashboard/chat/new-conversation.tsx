"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MessageSquarePlus, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { PeopleBrowser } from "@/components/chat/people-browser";
import { GroupPhotoField } from "@/components/chat/group-photo-field";
import { activeLabel, usePresence } from "@/lib/api/presence";
import type { DirectoryPerson } from "@/lib/server/services/messaging";
import { cn } from "@/lib/utils";
import { createGroupAction, startDirectAction } from "./actions";
import { useDirectory } from "./use-directory";

const MAX = 2000;

/**
 * Start a conversation: browse or search everyone who accepts messages from you (with their
 * club badge and who is active now), pick one person and write, or pick several and make a
 * group with a name and an optional photo. An existing conversation with the person opens
 * instead of starting a second one.
 */
export function NewConversation({ open, onOpenChange, initialMode = "direct", canCreateGroups, maxGroupMembers, existing, to, context }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialMode?: "direct" | "group";
  canCreateGroups: boolean;
  maxGroupMembers: number;
  /** Conversations I already have, by the other person's account id. */
  existing: Record<string, string>;
  /** Someone chosen already ("Message" on a profile or a post). */
  to?: { id: string; name: string; avatarUrl: string | null } | null;
  context?: { type: string; id: string } | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"direct" | "group">(initialMode);
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [members, setMembers] = useState<DirectoryPerson[]>([]);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ mediaId: string | null; url: string | null }>({ mediaId: null, url: null });
  const [step, setStep] = useState<"people" | "details">("people");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError } = useDirectory(open);
  const online = usePresence();

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPerson(null); setMembers([]); setBody(""); setName(""); setDescription(""); setPhoto({ mediaId: null, url: null }); setStep("people"); setError(null);
  }, [open, initialMode]);

  // "Message" from a profile or a post: that person is already chosen.
  const preset = useMemo<DirectoryPerson | null>(() => {
    if (!to) return null;
    return data?.people.find((p) => p.user_id === to.id) ?? {
      user_id: to.id, id: to.id, full_name: to.name, handle: null, avatarUrl: to.avatarUrl, badge: { label: "Member", short: "Member", tier: "member", rank: 1000 }, department: null, batch: null, lastActiveAt: null,
    };
  }, [to, data]);
  const chosen = person ?? (mode === "direct" ? preset : null);

  async function sendDirect(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chosen || busy) return;
    const text = body.trim();
    if (!text) return setError("Write a message.");
    if (text.length > MAX) return setError("Keep messages under 2,000 characters.");
    setBusy(true);
    setError(null);
    const r = await startDirectAction(chosen.user_id, text, context).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setError(r?.error ?? "Couldn't send. Check your connection and try again.");
    }
    onOpenChange(false);
    router.push(`/dashboard/chat/${r.data.conversationId}`);
  }

  async function createGroup(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Give the group a name.");
    setBusy(true);
    setError(null);
    const r = await createGroupAction({ name: name.trim(), description: description.trim() || undefined, memberIds: members.map((m) => m.user_id), photoMediaId: photo.mediaId }).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setError(r?.error ?? "Couldn't create the group. Check your connection and try again.");
    }
    onOpenChange(false);
    router.push(`/dashboard/chat/${r.data.conversationId}`);
  }

  const toggleMember = (p: DirectoryPerson) =>
    setMembers((list) => (list.some((m) => m.user_id === p.user_id) ? list.filter((m) => m.user_id !== p.user_id) : list.length + 1 >= maxGroupMembers ? list : [...list, p]));
  const title = mode === "group" ? (step === "details" ? "Name your group" : "New group") : chosen ? `Message ${chosen.full_name}` : "New message";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 rounded-none p-4 sm:h-[min(44rem,90dvh)] sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {(chosen && mode === "direct" && !preset) || (mode === "group" && step === "details") ? (
              <button type="button" onClick={() => (mode === "group" ? setStep("people") : setPerson(null))} className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">Choose who to write to.</DialogDescription>
        </DialogHeader>

        {canCreateGroups && !preset && !(mode === "direct" && chosen) && step === "people" && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Kind of conversation">
            {([["direct", "Message", MessageSquarePlus], ["group", "Group", Users]] as const).map(([m, label, Icon]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
                className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors", mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

        {mode === "direct" && chosen ? (
          <form onSubmit={sendDirect} className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
              <PersonAvatar name={chosen.full_name} url={chosen.avatarUrl} size="lg" online={online(chosen.user_id)} />
              <div className="min-w-0">
                <p className="truncate font-medium">{chosen.full_name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <BadgePill badge={chosen.badge} />
                  {activeLabel(online(chosen.user_id), chosen.lastActiveAt) && <span>{activeLabel(online(chosen.user_id), chosen.lastActiveAt)}</span>}
                </div>
                {context?.type === "lost_found_post" && <p className="mt-1 text-xs text-muted-foreground">About their lost &amp; found post</p>}
              </div>
            </div>
            {existing[chosen.user_id] && (
              <p className="text-sm text-muted-foreground">You already talk with {chosen.full_name.split(" ")[0]}. <Link prefetch={false} href={`/dashboard/chat/${existing[chosen.user_id]}`} className="font-medium text-primary underline" onClick={() => onOpenChange(false)}>Open the conversation</Link>, or write here.</p>
            )}
            <label className="sr-only" htmlFor="new-message-body">Message</label>
            <Textarea id="new-message-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={MAX} autoFocus placeholder={`Write to ${chosen.full_name.split(" ")[0]}…`}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendDirect(); } }}
              className="min-h-28 resize-none text-base md:text-sm" />
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{body.length > MAX - 200 ? `${MAX - body.length} characters left` : "Be kind: messages can be reported."}</span>
              <Button type="submit" disabled={busy || !body.trim()} className="min-h-11 gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}Send</Button>
            </div>
          </form>
        ) : mode === "group" && step === "details" ? (
          <form onSubmit={createGroup} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <GroupPhotoField url={photo.url} onChange={setPhoto} disabled={busy} />
            <div className="grid gap-1.5">
              <label htmlFor="group-name" className="text-sm font-medium">Group name <span className="text-destructive">*</span></label>
              <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus placeholder="e.g. Tech fest volunteers"
                className="h-11 rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="group-description" className="text-sm font-medium">What it&apos;s for <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea id="group-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className="resize-none text-base md:text-sm" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{members.length + 1} people, you included</p>
              <div className="flex -space-x-2">
                {members.slice(0, 12).map((m) => <PersonAvatar key={m.user_id} name={m.full_name} url={m.avatarUrl} size="sm" className="ring-2 ring-background" />)}
                {members.length > 12 && <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs ring-2 ring-background">+{members.length - 12}</span>}
              </div>
            </div>
            <Button type="submit" disabled={busy || !name.trim()} className="mt-auto min-h-11 gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}Create group</Button>
          </form>
        ) : (
          <>
            {mode === "group" && members.length > 0 && (
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" aria-label="Chosen">
                {members.map((m) => (
                  <span key={m.user_id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-0.5 text-xs text-primary">
                    <PersonAvatar name={m.full_name} url={m.avatarUrl} size="xs" />{m.full_name.split(" ")[0]}
                    <button type="button" onClick={() => toggleMember(m)} aria-label={`Remove ${m.full_name}`} className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-primary/20"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            {!data && !loadError && <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading people…</p>}
            {loadError && !data && <p role="alert" className="py-6 text-sm text-destructive">Couldn&apos;t load people. Close this and try again.</p>}
            {data && (
              <PeopleBrowser people={data.people} multi={mode === "group"} autoFocus
                selected={mode === "group" ? members.map((m) => m.user_id) : []}
                onToggle={(p) => (mode === "group" ? toggleMember(p) : setPerson(p))}
                disabled={mode === "group" ? (p) => (members.length + 1 >= maxGroupMembers && !members.some((m) => m.user_id === p.user_id) ? `A group can have up to ${maxGroupMembers} people` : null) : undefined} />
            )}
            {mode === "group" && (
              <Button type="button" className="min-h-11" disabled={members.length < 2} onClick={() => { setError(null); setStep("details"); }}>
                {members.length < 2 ? "Choose at least two people" : `Next: name the group (${members.length + 1} people)`}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
