"use server";

import { runAction } from "@/lib/api/session";

/** "Confirm it's you": the password (or a current two-factor code) opens a short window for sensitive actions. */
export async function reauthAction(secret: string) {
  const code = /^\d{6}$/.test(secret.replace(/\s/g, "")) ? secret.replace(/\s/g, "") : undefined;
  return runAction("account.reauth", code ? { code, password: secret } : { password: secret });
}
