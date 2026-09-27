"use server";

import { rpc } from "@/lib/api/session";

type Result = { ok: true; data: { id: string; message: string } } | { ok: false; error: string; code: string; fields?: Record<string, string> };

/** Submit an executive application (Turnstile, rate limits and validation happen in the API). */
export async function submitApplicationAction(input: Record<string, string | undefined>): Promise<Result> {
  const r = await rpc<{ id: string; message: string }>("recruitment.submit", input);
  if (!r.ok) return { ok: false, error: r.error, code: r.code, fields: r.fields };
  return { ok: true, data: r.data };
}
