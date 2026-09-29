"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, runAction } from "@/lib/api/session";

export async function updateProfileAction(input: Record<string, string>) {
  return runAction("account.updateProfile", input);
}

export async function setAvatarAction(mediaId: string | null) {
  return runAction("account.setAvatar", { mediaId }, { message: "Photo updated." });
}

export async function saveEmailPreferencesAction(fd: FormData) {
  const choices: Record<string, boolean> = {};
  for (const key of ["approvals", "roles", "work", "events", "messages"]) choices[key] = fd.get(key) === "on";
  return runAction("email.savePreferences", { choices });
}

export async function changeEmailAction(fd: FormData) {
  return runAction("account.changeEmail", { email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") });
}

export async function revokeSessionAction(ref: string, _fd: FormData) {
  return runAction("account.revokeSession", { ref }, { message: "Signed out on that device." });
}

export async function revokeOtherSessionsAction(_fd: FormData) {
  const r = await runAction<{ signedOut: number }>("account.revokeOthers", {});
  return r.ok ? { ...r, data: { message: `Signed out on ${r.data?.signedOut ?? 0} other device${r.data?.signedOut === 1 ? "" : "s"}.` } } : r;
}

/** Delete my account, then sign out here too. */
export async function deleteAccountAction(fd: FormData) {
  const r = await runAction("account.delete", { password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  if (!r.ok) return r;
  await clearSessionCookie();
  redirect("/?account=deleted");
}
