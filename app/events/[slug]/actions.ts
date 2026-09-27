"use server";

import { runAction } from "@/lib/api/session";

export async function registerAction(slug: string, form: Record<string, string>) {
  return runAction<{ status: "REGISTERED" | "WAITLISTED"; message: string }>("events.register", { slug, form });
}
