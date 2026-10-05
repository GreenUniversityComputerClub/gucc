"use server";

import { rpc } from "@/lib/api/session";

export type UnsubscribeState = { ok: true; resubscribed: boolean; member: boolean } | { ok: false; error: string } | null;

/** The confirm button on the unsubscribe page (a link alone never unsubscribes: mail scanners open links). */
export async function unsubscribeAction(_prev: UnsubscribeState, fd: FormData): Promise<UnsubscribeState> {
  const token = String(fd.get("t") ?? "");
  const again = fd.get("resubscribe") === "1";
  const r = await rpc<{ member: boolean; resubscribed: boolean }>(again ? "email.resubscribe" : "email.unsubscribe", { token });
  return r.ok ? { ok: true, resubscribed: r.data.resubscribed, member: r.data.member } : { ok: false, error: r.error };
}
