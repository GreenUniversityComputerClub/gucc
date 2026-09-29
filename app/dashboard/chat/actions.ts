"use server";

import { redirect } from "next/navigation";
import { rpc, runAction } from "@/lib/api/session";
import type { chatHome, myConversations, thread } from "@/lib/server/services/messaging";

export type Thread = Awaited<ReturnType<typeof thread>>;
export type Conversations = Awaited<ReturnType<typeof myConversations>>;
export type ChatHome = Awaited<ReturnType<typeof chatHome>>;

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
export async function sendChatAction(conversationId: string, body: string, clientId: string) {
  return runAction<{ id: string; at: string }>("chat.send", { conversationId, body, clientId });
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
  return runAction("chat.privacy", { privacy: String(fd.get("privacy") ?? ""), readReceipts: fd.get("readReceipts") === "on" }, { message: "Message settings saved." });
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
