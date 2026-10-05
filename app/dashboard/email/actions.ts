"use server";

/** Announcement emails: thin adapters over the API (which authorizes, validates and audits). */
import { rpc, runAction } from "@/lib/api/session";

type Fd = FormData;
const s = (fd: Fd, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** The audience chosen in the compose form. */
function audienceOf(fd: Fd) {
  const kind = s(fd, "audienceKind") || "members";
  if (kind === "batch") return { kind, value: s(fd, "batch") };
  if (kind === "department") return { kind, value: s(fd, "department") };
  if (kind === "event") return { kind, eventId: s(fd, "eventId"), statuses: fd.getAll("statuses").map(String), guests: s(fd, "guests") === "on" };
  return { kind };
}

const draftOf = (fd: Fd) => ({
  subject: s(fd, "subject"), preheader: s(fd, "preheader"), body: s(fd, "body"), buttonLabel: s(fd, "buttonLabel"), buttonPath: s(fd, "buttonPath"), notBefore: s(fd, "notBefore"),
  audience: audienceOf(fd),
});

export async function createCampaignAction(fd: Fd) {
  const r = await runAction<{ id: string; total: number }>("campaigns.create", { input: draftOf(fd) });
  return r.ok ? { ...r, data: { id: r.data!.id, message: `Queued for ${r.data!.total.toLocaleString("en-US")} people. The first emails go now.` } } : r;
}

export async function sendTestCampaignAction(fd: Fd) {
  return runAction<{ message: string }>("campaigns.sendTest", { input: draftOf(fd) });
}

export async function countAudienceAction(fd: Fd): Promise<{ count: number; capped: boolean } | null> {
  const r = await rpc<{ count: number; capped: boolean }>("campaigns.recipients", { audience: audienceOf(fd) });
  return r.ok ? r.data : null;
}

export async function setCampaignStatusAction(id: string, action: "pause" | "resume" | "cancel", _fd: Fd) {
  const words = { pause: "Paused.", resume: "Resumed: the next emails go now.", cancel: "Cancelled. Nobody else gets it." } as const;
  return runAction("campaigns.setStatus", { id, action }, { message: words[action] });
}

/** "Email this announcement" on a post. */
export async function postEmailAction(postId: string, fd: Fd) {
  const r = await runAction<{ message: string }>("posts.email", { id: postId, on: s(fd, "on") === "on", audience: audienceOf(fd) });
  return r.ok ? { ...r, data: { message: r.data?.message } } : r;
}
