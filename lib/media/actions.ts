"use server";

import { API_PUBLIC_BASE_URL } from "@/lib/api/config";
import { rpc, type ActionResult } from "@/lib/api/session";

/**
 * A short-lived capability to upload one file straight to the API Worker
 * (bypasses Vercel's 4.5 MB request limit). The Worker still authorizes the
 * upload against the signed-in user's permissions for this purpose/event.
 */
export async function uploadTokenAction(purpose: "library" | "event" | "lostfound" | "avatar", eventId?: string, replaceId?: string): Promise<ActionResult<{ token: string; url: string }>> {
  const r = await rpc<{ token: string }>("media.uploadToken", { purpose, eventId, replaceId });
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  return { ok: true, data: { token: r.data.token, url: `${API_PUBLIC_BASE_URL}/v1/upload` } };
}

export async function recruitmentUploadTokenAction(campaignId: string): Promise<ActionResult<{ token: string; url: string }>> {
  const r = await rpc<{ token: string }>("recruitment.uploadToken", { campaignId });
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  return { ok: true, data: { token: r.data.token, url: `${API_PUBLIC_BASE_URL}/v1/upload` } };
}
