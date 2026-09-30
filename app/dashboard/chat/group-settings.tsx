"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crown, Loader2, LogOut, MoreVertical, Search, ShieldCheck, ShieldOff, Trash2, UserMinus, UserPlus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { BadgePill } from "@/components/chat/badge-pill";
import { GroupPhotoField } from "@/components/chat/group-photo-field";
import { PeopleBrowser } from "@/components/chat/people-browser";
import { activeLabel, usePresence } from "@/lib/api/presence";
import type { DirectoryPerson } from "@/lib/server/services/messaging";
import { addGroupMembersAction, deleteGroupAction, leaveGroupAction, removeGroupMemberAction, setGroupRoleAction, transferGroupAction, updateGroupAction, type Thread } from "./actions";
import { useDirectory } from "./use-directory";

type Group = NonNullable<Thread["group"]>;

/**
 * A group's details: its photo, name and description (changed by the owner, admins and the club's
 * senior leaders), the members with their roles and club badges, making admins and handing the
 * group over (the owner), adding and removing people, leaving, and deleting the group.
 */
export function GroupSettings({ conversationId, group, me, open, onOpenChange, onChanged, say }: {
  conversationId: string;
  group: Group;
  me: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
  say: (text: string, error?: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [photo, setPhoto] = useState<{ mediaId: string | null; url: string | null; changed: boolean }>({ mediaId: null, url: group.avatarUrl, changed: false });
  const [adding, setAdding] = useState<DirectoryPerson[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();
  const [find, setFind] = useState("");
  const online = usePresence();
  const { data } = useDirectory(open && adding !== null);

  useEffect(() => {
    if (!open) return;
    setName(group.name); setDescription(group.description ?? ""); setPhoto({ mediaId: null, url: group.avatarUrl, changed: false }); setAdding(null);
  }, [open, group.name, group.description, group.avatarUrl]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => {
    setBusy(key);
    const r: { ok: boolean; error?: string; message?: string } = await fn().catch(() => ({ ok: false, error: "Something went wrong. Check your connection and try again." }));
    setBusy(null);
    if (!r.ok) return say(r.error ?? "Something went wrong.", true);
    if (r.message) say(r.message);
    onChanged();
    after?.();
  };

  const dirty = name.trim() !== group.name || description.trim() !== (group.description ?? "") || photo.changed;
  const save = () => run("save", () => updateGroupAction(conversationId, {
    ...(name.trim() !== group.name ? { name: name.trim() } : {}),
    ...(description.trim() !== (group.description ?? "") ? { description: description.trim() } : {}),
    ...(photo.changed ? { photoMediaId: photo.mediaId } : {}),
  }), () => setPhoto((p) => ({ ...p, changed: false })));

  async function remove(id: string, who: string) {
    if (await confirm({ title: `Remove ${who}?`, description: "They stop getting this group's messages. Their earlier messages stay.", confirmLabel: "Remove", destructive: true })) {
      await run(`remove:${id}`, () => removeGroupMemberAction(conversationId, id));
    }
  }
  async function makeOwner(id: string, who: string) {
    if (await confirm({ title: `Make ${who} the owner?`, description: "They can then change roles and delete the group. You stay on as an admin.", confirmLabel: "Make owner" })) {
      await run(`role:${id}`, () => transferGroupAction(conversationId, id));
    }
  }
  async function leave() {
    const owner = group.ownerId === me;
    if (await confirm({ title: "Leave this group?", description: owner ? "You own it: an admin (or else the member who joined first) becomes the owner." : "You'll stop getting its messages. Someone can add you again later.", confirmLabel: "Leave", destructive: true })) {
      await run("leave", () => leaveGroupAction(conversationId), () => { onOpenChange(false); router.push("/dashboard/chat"); });
    }
  }
  async function remove_group() {
    if (await confirm({ title: `Delete “${group.name}”?`, description: "The group closes for everyone and its messages are deleted after 30 days. This can't be undone.", confirmLabel: "Delete group", destructive: true })) {
      await run("delete", () => deleteGroupAction(conversationId), () => { onOpenChange(false); router.push("/dashboard/chat"); });
    }
  }

  const room = group.maxMembers - group.members.length;
  const needle = find.trim().toLowerCase();
  const shown = needle ? group.members.filter((m) => `${m.name} ${m.badge.label} ${m.badge.short}`.toLowerCase().includes(needle)) : group.members;
  const admins = group.members.filter((m) => m.role === "ADMIN").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {dialog}
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-4 rounded-none p-4 sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {adding && <button type="button" onClick={() => setAdding(null)} className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>}
            {adding ? "Add people" : "Group details"}
          </DialogTitle>
          <DialogDescription>{adding ? `There's room for ${room} more.` : `${group.members.length} people`}</DialogDescription>
        </DialogHeader>

        {adding ? (
          <>
            {data ? (
              <PeopleBrowser people={data.people} multi autoFocus selected={adding.map((p) => p.user_id)} exclude={group.members.map((m) => m.id)}
                onToggle={(p) => setAdding((l) => (l!.some((x) => x.user_id === p.user_id) ? l!.filter((x) => x.user_id !== p.user_id) : l!.length >= room ? l : [...l!, p]))} />
            ) : <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading people…</p>}
            <Button type="button" className="min-h-11" disabled={!adding.length || busy === "add"}
              onClick={() => run("add", () => addGroupMembersAction(conversationId, adding.map((p) => p.user_id)), () => setAdding(null))}>
              {busy === "add" ? "Adding…" : adding.length ? `Add ${adding.length} ${adding.length === 1 ? "person" : "people"}` : "Choose people to add"}
            </Button>
          </>
        ) : (
          <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1">
            {group.canManage ? (
              <section className="space-y-3" aria-label="Name and photo">
                <GroupPhotoField url={photo.url} onChange={(v) => setPhoto({ ...v, changed: true })} disabled={Boolean(busy)} />
                <div className="grid gap-1.5">
                  <label htmlFor="g-name" className="text-sm font-medium">Name</label>
                  <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                    className="h-11 rounded-md border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="g-desc" className="text-sm font-medium">Description</label>
                  <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className="resize-none text-base md:text-sm" />
                </div>
                <Button type="button" onClick={save} disabled={!dirty || !name.trim() || busy === "save"} className="min-h-10">{busy === "save" ? "Saving…" : "Save changes"}</Button>
              </section>
            ) : (
              <section className="flex items-center gap-3">
                <PersonAvatar name={group.name} url={group.avatarUrl} size="lg" group />
                <div className="min-w-0">
                  <p className="font-semibold">{group.name}</p>
                  {group.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{group.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">The owner, admins and the club&apos;s senior leaders can change the name and photo.</p>
                </div>
              </section>
            )}

            <section aria-label="Members">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Members <span className="font-normal text-muted-foreground">· {group.members.length}{admins ? ` · ${admins} admin${admins === 1 ? "" : "s"}` : ""}</span></h3>
                {group.canManage && room > 0 && (
                  <Button type="button" variant="outline" size="sm" className="min-h-9 gap-1.5" onClick={() => setAdding([])}><UserPlus className="h-4 w-4" aria-hidden />Add people</Button>
                )}
              </div>
              {group.members.length > 8 && (
                <label className="relative mb-2 block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a member" aria-label="Find a member"
                    className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" />
                </label>
              )}
              <ul className="divide-y rounded-lg border">
                {shown.map((m) => {
                  const status = activeLabel(online(m.id), m.lastActiveAt);
                  const self = m.id === me;
                  // What I may do to this person.
                  const canPromote = group.canManage && !self && m.role === "MEMBER";
                  const canDemote = !self && m.role === "ADMIN" && group.canGovern;
                  const canStepDown = self && m.role === "ADMIN";
                  const canTransfer = group.canGovern && !self && m.role !== "OWNER";
                  const canRemove = !self && m.role !== "OWNER" && group.canManage && (m.role === "MEMBER" || group.canGovern);
                  const any = canPromote || canDemote || canStepDown || canTransfer || canRemove;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <PersonAvatar name={m.name} url={m.avatarUrl} size="md" online={self ? undefined : online(m.id)} href={m.handle ? `/members/${m.handle}` : null} />
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{m.handle ? <Link prefetch={false} href={`/members/${m.handle}`} className="hover:underline">{m.name}</Link> : m.name}{self ? " (you)" : ""}</span>
                          {m.role === "OWNER" && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold leading-4 text-amber-700 dark:text-amber-300"><Crown className="h-3 w-3" aria-hidden />Owner</span>}
                          {m.role === "ADMIN" && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold leading-4 text-primary"><ShieldCheck className="h-3 w-3" aria-hidden />Admin</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <BadgePill badge={m.badge} />
                          {!self && status && <span>{status}</span>}
                        </div>
                      </div>
                      {any && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" disabled={Boolean(busy)} aria-label={`Options for ${m.name}`}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {busy === `role:${m.id}` || busy === `remove:${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canPromote && <DropdownMenuItem onSelect={() => void run(`role:${m.id}`, () => setGroupRoleAction(conversationId, m.id, "ADMIN"))}><ShieldCheck className="mr-2 h-4 w-4" />Make admin</DropdownMenuItem>}
                            {canDemote && <DropdownMenuItem onSelect={() => void run(`role:${m.id}`, () => setGroupRoleAction(conversationId, m.id, "MEMBER"))}><ShieldOff className="mr-2 h-4 w-4" />Remove as admin</DropdownMenuItem>}
                            {canStepDown && <DropdownMenuItem onSelect={() => void run(`role:${m.id}`, () => setGroupRoleAction(conversationId, m.id, "MEMBER"))}><ShieldOff className="mr-2 h-4 w-4" />Step down as admin</DropdownMenuItem>}
                            {canTransfer && <DropdownMenuItem onSelect={() => void makeOwner(m.id, m.name)}><Crown className="mr-2 h-4 w-4" />Make owner</DropdownMenuItem>}
                            {canRemove && (
                              <>
                                {(canPromote || canDemote || canTransfer) && <DropdownMenuSeparator />}
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void remove(m.id, m.name)}><UserMinus className="mr-2 h-4 w-4" />Remove from group</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody matches “{find.trim()}”.</li>}
              </ul>
            </section>

            <section className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={leave} disabled={Boolean(busy)} className="min-h-10 gap-1.5 text-destructive hover:text-destructive"><LogOut className="h-4 w-4" aria-hidden />Leave group</Button>
              {group.canGovern && (
                <Button type="button" variant="ghost" onClick={remove_group} disabled={Boolean(busy)} className="min-h-10 gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden />Delete group</Button>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
