"use server";

/** Certificates: thin adapters over the API, which authorizes, validates and audits. */
import { rpc, runAction } from "@/lib/api/session";
import type { RecipientDraft } from "@/lib/server/services/certificates";

type Plain<T> = { ok: true; data: T } | { ok: false; error: string };

export async function importPreviewAction(source: Record<string, unknown>): Promise<Plain<{ rows: RecipientDraft[]; capped: boolean }>> {
  const r = await rpc<{ rows: RecipientDraft[]; capped: boolean }>("certificates.importPreview", { source });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

export async function issueAction(input: Record<string, unknown>) {
  const r = await runAction<{ id: string; issued: number; emailed: number }>("certificates.issue", { input });
  return r.ok ? { ok: true as const, data: r.data! } : { ok: false as const, error: r.error, fields: r.fields };
}

export async function saveDesignAction(id: string | null, input: Record<string, unknown>) {
  const r = await runAction<{ id: string }>("certificateDesigns.save", { id, input });
  return r.ok ? { ok: true as const, data: r.data! } : { ok: false as const, error: r.error };
}

export async function deleteDesignAction(id: string, _fd: FormData) {
  return runAction("certificateDesigns.delete", { id }, { message: "Design deleted." });
}

export async function addRecipientsAction(batchId: string, recipients: RecipientDraft[]) {
  const r = await runAction<{ added: number }>("certificates.add", { batchId, recipients });
  return r.ok ? { ok: true as const, data: r.data! } : { ok: false as const, error: r.error };
}

export async function updateCertificateAction(id: string, fd: FormData) {
  return runAction("certificates.update", { id, input: { name: fd.get("name"), role: fd.get("role"), body: fd.get("body") } }, { message: "Corrected." });
}

export async function revokeCertificateAction(id: string, fd: FormData) {
  return runAction("certificates.revoke", { id, reason: fd.get("reason") }, { message: "Revoked. Its page now says so." });
}

export async function restoreCertificateAction(id: string, _fd: FormData) {
  return runAction("certificates.restore", { id }, { message: "Valid again." });
}

export async function certificateVisibilityAction(id: string, visibility: "PUBLIC" | "PRIVATE", _fd: FormData) {
  return runAction("certificates.visibility", { id, visibility }, { message: visibility === "PUBLIC" ? "Shown on your profile." : "Hidden from your profile (its link still works)." });
}
