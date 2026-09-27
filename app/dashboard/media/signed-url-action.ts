"use server";

import { mediaHref } from "@/lib/api/config";
import { rpc } from "@/lib/api/session";

export async function signedUrlAction(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await rpc<string>("media.signedUrl", { id });
  return r.ok ? { ok: true, url: mediaHref(r.data) } : { ok: false, error: r.error };
}
