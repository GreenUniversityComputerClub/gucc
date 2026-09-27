"use server";

import { redirect } from "next/navigation";
import { rpc, runAction } from "@/lib/api/session";
import type { thread } from "@/lib/server/services/messaging";

export type Thread = Awaited<ReturnType<typeof thread>>;

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

export async function loadThreadAction(conversationId: string, before?: string) {
  const r = await rpc<Thread>("chat.thread", { conversationId, before });
  return r.ok ? { ok: true as const, data: r.data } : { ok: false as const, error: r.error };
}

export async function sendChatAction(conversationId: string, body: string) {
  return runAction("chat.send", { conversationId, body });
}

export async function editChatAction(id: string, body: string) {
  return runAction("chat.edit", { id, body });
}

export async function deleteChatAction(id: string) {
  return runAction("chat.delete", { id });
}

export async function reportChatAction(id: string, reason: string) {
  return runAction("chat.report", { id, reason }, { message: "Reported. A moderator will look at this message." });
}

export async function chatStateAction(conversationId: string, state: { muted?: boolean; archived?: boolean }) {
  return runAction("chat.state", { conversationId, ...state });
}

export async function blockAction(userId: string, block: boolean) {
  return runAction("chat.block", { userId, block }, { message: block ? "Blocked. They can't message you." : "Unblocked." });
}

export async function chatPrivacyAction(fd: FormData) {
  return runAction("chat.privacy", { privacy: String(fd.get("privacy") ?? ""), readReceipts: fd.get("readReceipts") === "on" }, { message: "Message settings saved." });
}

export async function resolveReportAction(id: string, outcome: "DISMISSED" | "ACTIONED", remove: boolean, fd: FormData) {
  return runAction("reports.resolve", { id, outcome, remove, note: String(fd.get("note") ?? "") || null }, { message: remove ? "Removed and closed." : "Report closed." });
}
