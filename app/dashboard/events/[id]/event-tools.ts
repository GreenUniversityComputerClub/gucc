"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/lib/api/session";

type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export async function checkInAction(eventId: string, code: string): Promise<Result<{ name: string; already: boolean }>> {
  const r = await runAction<{ name: string; already: boolean }>("events.checkIn", { eventId, code });
  return r.ok ? { ok: true, data: r.data! } : { ok: false, error: r.error };
}

export async function agendaAction(eventId: string, items: Array<{ title: string; speaker?: string; description?: string; startsAt?: string; endsAt?: string }>): Promise<Result> {
  const r = await runAction("events.agenda", { id: eventId, items }, { message: "Programme saved. The event page shows it within a minute." });
  return r.ok ? { ok: true, data: undefined, message: r.message } : { ok: false, error: r.error };
}

export async function duplicateEventAction(eventId: string, _fd: FormData) {
  const r = await runAction<{ id: string }>("events.duplicate", { id: eventId });
  if (!r.ok) return r;
  redirect(`/dashboard/events/${r.data!.id}`);
}
