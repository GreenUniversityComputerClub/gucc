"use server";

import { redirect } from "next/navigation";
import { rpc, runAction } from "@/lib/api/session";
import type { chatDirectory, chatHome, myConversations, thread } from "@/lib/server/services/messaging";
import type { ReactionKey } from "@/lib/chat/reactions";

export type Thread = Awaited<ReturnType<typeof thread>>;
export type Conversations = Awaited<ReturnType<typeof myConversations>>;
export type ChatHome = Awaited<ReturnType<typeof chatHome>>;
export type Directory = Awaited<ReturnType<typeof chatDirectory>>;

type Plain<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; code?: string };

/** Start a conversation (or continue the existing one) and open it. */
export async function startChatAction(fd: FormData) {
  const r = await runAction<{ conversationId: string }>("chat.start", {
    userId: String(fd.get("userId") ?? ""),
    body: String(fd.get("body") ?? ""),
    contextType: fd.get("contextType") || undefined,
    contextId: fd.get("contextId") || undefined,
  });
  if (!r.ok) return r;
  redirect(`/dashboard/chat/${r.data!.conversationId}`);
}

export async function loadThreadAction(conversationId: string, before?: string): Promise<Plain<Thread>> {
  const r = await rpc<Thread>("chat.thread", { conversationId, before });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

/** "Anything new?" for an open conversation: a fingerprint that changes when something does. */
export async function pulseAction(conversationId: string): Promise<Plain<{ sig: string }>> {
  const r = await rpc<{ sig: string }>("chat.pulse", { conversationId });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

export async function loadConversationsAction(archived = false): Promise<Plain<Conversations>> {
  const r = await rpc<Conversations>("chat.list", { archived });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

/** Send; `clientId` makes a double send or a retry store the message once. */
export async function sendChatAction(conversationId: string, body: string, clientId: string, replyTo?: string | null) {
  return runAction<{ id: string; at: string }>("chat.send", { conversationId, body, clientId, replyTo: replyTo ?? undefined });
}

/** Read up to the newest message (after messages arrived live while the conversation was open). */
export async function markReadAction(conversationId: string): Promise<boolean> {
  const r = await rpc("chat.read", { conversationId });
  return r.ok;
}

/** Everyone I can start a conversation with (with their club badge), for the picker. */
export async function directoryAction(): Promise<Plain<Directory>> {
  const r = await rpc<Directory>("chat.directory", {});
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

/** Set, change or (null) remove my reaction. */
export async function reactAction(id: string, emoji: ReactionKey | null) {
  return runAction<{ emoji: ReactionKey | null }>("chat.react", { id, emoji });
}

export async function startDirectAction(userId: string, body: string, context?: { type: string; id: string } | null): Promise<Plain<{ conversationId: string }>> {
  const r = await runAction<{ conversationId: string }>("chat.start", { userId, body, contextType: context?.type, contextId: context?.id });
  return r.ok ? { ok: true, data: r.data! } : { ok: false, error: r.error, code: r.code };
}

export async function createGroupAction(input: { name: string; description?: string; memberIds: string[]; photoMediaId?: string | null }): Promise<Plain<{ conversationId: string }>> {
  const r = await runAction<{ conversationId: string }>("chat.groupCreate", input);
  return r.ok ? { ok: true, data: r.data! } : { ok: false, error: r.error, code: r.code };
}

export async function updateGroupAction(conversationId: string, input: { name?: string; description?: string; photoMediaId?: string | null }) {
  return runAction("chat.groupUpdate", { conversationId, ...input }, { message: "Group updated." });
}

export async function addGroupMembersAction(conversationId: string, memberIds: string[]) {
  const r = await runAction<{ added: number }>("chat.groupAdd", { conversationId, memberIds });
  return r.ok ? { ...r, message: `Added ${r.data?.added ?? 0} ${r.data?.added === 1 ? "person" : "people"}.` } : r;
}

export async function setGroupRoleAction(conversationId: string, userId: string, role: "ADMIN" | "MEMBER") {
  return runAction("chat.groupRole", { conversationId, userId, role }, { message: role === "ADMIN" ? "Made an admin." : "No longer an admin." });
}

export async function transferGroupAction(conversationId: string, userId: string) {
  return runAction("chat.groupTransfer", { conversationId, userId }, { message: "Ownership handed over." });
}

export async function removeGroupMemberAction(conversationId: string, userId: string) {
  return runAction("chat.groupRemove", { conversationId, userId }, { message: "Removed from the group." });
}

export async function leaveGroupAction(conversationId: string) {
  return runAction("chat.groupLeave", { conversationId }, { message: "You left the group." });
}

export async function deleteGroupAction(conversationId: string) {
  return runAction("chat.groupDelete", { conversationId }, { message: "Group deleted." });
}

export async function editChatAction(id: string, body: string) {
  return runAction("chat.edit", { id, body }, { message: "Message edited." });
}

export async function deleteChatAction(id: string) {
  return runAction("chat.delete", { id }, { message: "Message deleted." });
}

export interface ReportInput {
  category: "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "SCAM" | "OTHER";
  details: string;
  includeContext: boolean;
  block: boolean;
}

export async function reportChatAction(id: string, input: ReportInput) {
  const r = await runAction<{ already: boolean; blocked: boolean }>("chat.report", { id, ...input });
  if (!r.ok) return r;
  const blocked = r.data?.blocked ? " You also blocked this person." : "";
  return {
    ...r,
    message: r.data?.already
      ? `You already reported this message; moderators have it.${blocked}`
      : `Report sent. A moderator will review it and you'll be told the outcome.${blocked}`,
  };
}

export async function chatStateAction(conversationId: string, state: { muted?: boolean; archived?: boolean }) {
  const message = state.archived === true ? "Conversation archived. It comes back when either of you writes."
    : state.archived === false ? "Conversation moved back to your inbox."
      : state.muted === true ? "Muted: no notifications from this conversation."
        : state.muted === false ? "Unmuted." : undefined;
  return runAction("chat.state", { conversationId, ...state }, { message });
}

export async function blockAction(userId: string, block: boolean) {
  return runAction("chat.block", { userId, block }, { message: block ? "Blocked. They can't message you or find you, and they aren't told." : "Unblocked. You can message each other again." });
}

export async function chatPrivacyAction(fd: FormData) {
  return runAction("chat.privacy", { privacy: String(fd.get("privacy") ?? ""), readReceipts: fd.get("readReceipts") === "on", showActive: fd.get("showActive") === "on" }, { message: "Message settings saved." });
}

export async function resolveReportAction(id: string, outcome: "DISMISSED" | "ACTIONED", remove: boolean, fd: FormData) {
  const warn = fd.get("warn") === "on";
  const restrictDays = Number(fd.get("restrictDays") ?? 0) || null;
  const done = !remove ? "Report closed." : restrictDays ? `Removed, and their messaging is paused for ${restrictDays} day${restrictDays === 1 ? "" : "s"}.` : warn ? "Removed and the sender warned." : "Removed and closed.";
  return runAction("reports.resolve", { id, outcome, remove, warn, restrictDays, note: String(fd.get("note") ?? "") || null }, { message: done });
}

export async function liftRestrictionAction(userId: string, _fd: FormData) {
  return runAction("chat.unrestrict", { userId }, { message: "Messaging restored." });
}
