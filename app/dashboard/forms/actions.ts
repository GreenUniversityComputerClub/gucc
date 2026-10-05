"use server";

/**
 * Forms in the dashboard. Looking at a form (where a short link leads, whether it needs a Google
 * account) happens here on the website's server, never in the API; saving goes through the API,
 * which authorizes, validates and audits.
 */
import { getSession, runAction } from "@/lib/api/session";
import { inspectForm, type FormInspection } from "@/lib/forms/inspect";

type Fd = FormData;
const obj = (fd: Fd): Record<string, string> => {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  });
  return o;
};

/** Look at a pasted link or embed code (for leaders who manage forms). */
export async function inspectFormAction(pasted: string): Promise<FormInspection> {
  const session = await getSession();
  if (!session?.caps["forms.manage"]) return { ok: false, error: "You can't manage forms." };
  if (typeof pasted !== "string" || pasted.length > 5000) return { ok: false, error: "Paste a form link or its embed code." };
  return inspectForm(pasted);
}

export async function saveFormAction(id: string | null, fd: Fd) {
  return runAction<{ id: string; slug: string }>("forms.save", { id, input: obj(fd) }, { message: id ? "Form saved." : "Form created." });
}

/** Look at a saved form again and store what was found. */
export async function recheckFormAction(id: string, url: string) {
  const seen = await inspectFormAction(url);
  if (!seen.ok) return { ok: false as const, error: seen.error, code: "INSPECTION_FAILED" };
  const r = await runAction("forms.recheck", {
    id,
    input: { openUrl: seen.openUrl, requiresSignIn: seen.requiresSignIn, questionCount: seen.questionCount ?? "", closed: seen.closed },
  });
  if (!r.ok) return r;
  const notes = [seen.requiresSignIn ? "needs a Google account" : "open to anyone", seen.questionCount != null ? `${seen.questionCount} questions` : null, seen.closed ? "no longer takes answers" : null].filter(Boolean);
  return { ok: true as const, message: `Checked: ${notes.join(", ")}.`, data: { closed: seen.closed } };
}

export async function archiveFormAction(id: string, _fd: Fd) {
  return runAction("forms.archive", { id }, { message: "Archived. Its page is offline; restore it any time." });
}
export async function restoreFormAction(id: string, _fd: Fd) {
  return runAction("forms.restore", { id }, { message: "Restored. Its page is back." });
}
export async function deleteFormAction(id: string, _fd: Fd) {
  return runAction("forms.delete", { id }, { message: "Deleted." });
}
export async function duplicateFormAction(id: string, _fd: Fd) {
  return runAction<{ id: string; slug: string }>("forms.duplicate", { id }, { message: "Copied. Edit the copy below." });
}
