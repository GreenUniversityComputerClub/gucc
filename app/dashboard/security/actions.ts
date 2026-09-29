"use server";

import QRCode from "qrcode";
import { rpc, runAction } from "@/lib/api/session";
import type { RpcResult } from "@/lib/api/client";

type SetupResult = { ok: true; secret: string; uri: string; svg: string } | { ok: false; error: string; code: string; fields?: Record<string, string> };

/** The QR code is drawn here, so the secret never goes to a third-party service. */
async function withQr(r: RpcResult<{ secret: string; uri: string }>): Promise<SetupResult> {
  if (!r.ok) return { ok: false, error: r.error, code: r.code, fields: r.fields };
  const svg = await QRCode.toString(r.data.uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { ok: true, secret: r.data.secret, uri: r.data.uri, svg };
}

export async function startMfaAction() {
  return withQr(await rpc<{ secret: string; uri: string }>("account.mfaStart"));
}

/** Moving to a new phone: password and a code from the old app (or a recovery code). */
export async function startMfaReplaceAction(password: string, code: string) {
  return withQr(await rpc<{ secret: string; uri: string }>("account.mfaReplaceStart", { password, code }));
}

export async function confirmMfaReplaceAction(code: string) {
  return runAction<{ recoveryCodes: string[] }>("account.mfaReplaceConfirm", { code });
}

export async function confirmMfaAction(code: string) {
  return runAction<{ recoveryCodes: string[] }>("account.mfaConfirm", { code });
}

export async function newRecoveryCodesAction(code: string) {
  return runAction<{ recoveryCodes: string[] }>("account.mfaRecoveryCodes", { code });
}

export async function disableMfaAction(fd: FormData) {
  return runAction("account.mfaDisable", { password: String(fd.get("password") ?? ""), code: String(fd.get("code") ?? "") }, { message: "Two-factor sign-in is off." });
}
