"use server";

import { rpc } from "@/lib/api/session";

type ContactFormInput = { name: string; email: string; message: string; website?: string; turnstileToken?: string | null };
type ContactFormResult = { success: true; message: string } | { success: false; error: string; fields?: Record<string, string> };

/** Stored in the club's inbox (and emailed when configured). Provider errors never reach the visitor. */
export async function submitContactForm(input: ContactFormInput): Promise<ContactFormResult> {
  const r = await rpc<{ message: string }>("contact.submit", { ...input, turnstileToken: input.turnstileToken ?? undefined });
  return r.ok ? { success: true, message: r.data.message } : { success: false, error: r.error, fields: r.fields };
}
