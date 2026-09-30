"use server";

import { rpc, runAction } from "@/lib/api/session";
import type { meetingDetail } from "@/lib/server/services/work";

export type MeetingDetail = Awaited<ReturnType<typeof meetingDetail>>;
type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; code?: string };

type Fd = FormData;
const s = (fd: Fd, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};
const fields = (fd: Fd) => ({
  title: s(fd, "title"),
  startsAt: s(fd, "startsAt"),
  endsAt: s(fd, "endsAt") ?? "",
  location: s(fd, "location") ?? "",
  meetUrl: s(fd, "meetUrl") ?? "",
  agenda: s(fd, "agenda") ?? "",
  participants: s(fd, "participants") ?? "",
  allExecutives: fd.get("allExecutives") === "on",
  expectedUpdatedAt: s(fd, "expectedUpdatedAt"),
});

export async function scheduleMeetingAction(fd: Fd) {
  return runAction<{ id: string; message: string }>("meetings.schedule", { ...fields(fd), repeatWeeks: Number(s(fd, "repeatWeeks") ?? 1) || 1, agendaItems: s(fd, "agendaItems") ?? "" });
}

export async function updateMeetingAction(id: string, fd: Fd) {
  return runAction("meetings.update", { id, ...fields(fd) });
}

export async function meetingNotesAction(id: string, fd: Fd) {
  return runAction("meetings.notes", { id, notes: s(fd, "notes") ?? "", decisions: s(fd, "decisions") ?? "" }, { message: "Notes and decisions saved." });
}

export async function cancelMeetingAction(id: string, fd: Fd) {
  return runAction("meetings.cancel", { id, reason: s(fd, "reason") }, { message: "Meeting cancelled. Participants were notified in the dashboard." });
}

export async function respondMeetingAction(id: string, response: string, _fd: Fd) {
  return runAction("meetings.respond", { id, response }, { message: "Reply saved." });
}

const plain = <T,>(r: { ok: true; data?: T; message?: string } | { ok: false; error: string; code: string }): Result<T> =>
  r.ok ? { ok: true, data: r.data as T, message: r.message } : { ok: false, error: r.error, code: r.code };

/** The meeting again (after a live change). */
export async function loadMeetingAction(id: string): Promise<Result<MeetingDetail>> {
  const r = await rpc<MeetingDetail>("meetings.get", { id });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
}

/** Reply without reloading the page (a toggle: never replayed). */
export async function rsvpAction(id: string, response: "YES" | "NO" | "MAYBE") {
  return plain(await runAction("meetings.respond", { id, response }));
}

export async function agendaAction(id: string, items: Array<{ title: string; notes?: string | null; ownerUserId?: string | null }>) {
  return plain(await runAction("meetings.agenda", { id, items }, { message: "Agenda saved." }));
}

export async function attendanceAction(id: string, attended: string[]) {
  return plain(await runAction<{ attended: number }>("meetings.attendance", { id, attended }, { message: "Attendance saved." }));
}

export async function actionItemsAction(id: string, items: Array<{ title: string; assigneeUserId: string; dueAt?: string }>) {
  const r = await runAction<{ created: number }>("meetings.actionItems", { id, items });
  if (!r.ok) return plain(r);
  return { ok: true as const, data: r.data!, message: `${r.data!.created} task${r.data!.created === 1 ? "" : "s"} created and given out.` };
}

/** People already busy then (another meeting overlapping). */
export async function conflictsAction(input: { startsAt: string; endsAt?: string; participants: string[]; exceptId?: string }): Promise<Array<{ name: string; title: string; starts_at: string }>> {
  const r = await rpc<{ conflicts: Array<{ name: string; title: string; starts_at: string }> }>("meetings.conflicts", input);
  return r.ok ? r.data.conflicts : [];
}
