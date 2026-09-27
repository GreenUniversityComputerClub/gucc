"use server";

import { runAction } from "@/lib/api/session";

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
});

export async function scheduleMeetingAction(fd: Fd) {
  return runAction<{ id: string; message: string }>("meetings.schedule", fields(fd));
}

export async function updateMeetingAction(id: string, fd: Fd) {
  return runAction("meetings.update", { id, ...fields(fd) });
}

export async function meetingNotesAction(id: string, fd: Fd) {
  return runAction("meetings.notes", { id, notes: s(fd, "notes") ?? "" }, { message: "Notes saved." });
}

export async function cancelMeetingAction(id: string, fd: Fd) {
  return runAction("meetings.cancel", { id, reason: s(fd, "reason") }, { message: "Meeting cancelled. Participants were notified in the dashboard." });
}

export async function respondMeetingAction(id: string, response: string, _fd: Fd) {
  return runAction("meetings.respond", { id, response }, { message: "Reply saved." });
}
